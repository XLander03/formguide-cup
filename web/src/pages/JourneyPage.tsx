import { useRef, useState } from 'react';
import { MAX_PLAN_TEXT } from '../../../shared/journeyPlan';
import { CompanionPanel, type HeardSource } from '../components/CompanionPanel';
import { PlanCard } from '../components/PlanCard';
import { PublishedFormRows } from '../components/PublishedFormRows';
import { formKey } from '../forms/activeForm';
import { HDFC_V1 } from '../forms/hdfcV1';
import type { FormVersion } from '../forms/types';
import type { JourneyId } from '../lib/journeys';
import { pickJourneyCard } from '../lib/journeyIntent';
import { detectScriptLanguage, languageByBcp47, type MicLang } from '../lib/languages';
import { PREP_LIST } from '../lib/prepList';
import {
  planFromResponse,
  requestPlan,
  resolveStepForm,
  stepCardId,
  type PlanResponse,
  type RequestPlan,
} from '../lib/journeyPlan';
import { appliesToJourney } from '../lib/publishedForms';
import { useRoute } from '../routing/router';
import { useFormSession } from '../session/FormSession';
import { BTN_LG, BTN_PRIMARY } from '../ui/buttons';
import { ArrowRightIcon, CheckIcon } from '../ui/icons';

type OpenCard = {
  id: string;
  kind: string;
  name: string;
  blurb: string;
  journey: JourneyId;
  /** Existing account_product_intent value, or null for KYC journeys. */
  product: string | null;
};

const OPEN_CARDS: OpenCard[] = [
  {
    id: 'regular_savings',
    kind: 'Account opening',
    name: 'Regular savings',
    blurb: 'Everyday savings account for individuals',
    journey: 'account_opening',
    product: 'regular_savings',
  },
  {
    id: 'salary_savings',
    kind: 'Account opening',
    name: 'Salary account',
    blurb: 'Zero-balance account linked to your employer',
    journey: 'account_opening',
    product: 'salary_savings',
  },
  {
    id: 'bsbda',
    kind: 'Account opening',
    name: 'Basic savings',
    blurb: 'Simple no-frills savings account',
    journey: 'account_opening',
    product: 'bsbda',
  },
  {
    id: 'individual_current',
    kind: 'Account opening',
    name: 'Individual current',
    blurb: 'Current account for business transactions',
    journey: 'account_opening',
    product: 'individual_current',
  },
  {
    id: 'kyc_update',
    kind: 'KYC',
    name: 'KYC update',
    blurb: 'Change address, mobile, or identity details',
    journey: 'kyc_update',
    product: null,
  },
  {
    id: 'rekyc',
    kind: 'KYC',
    name: 'Re-KYC',
    blurb: 'Periodic re-verification your bank asked for',
    journey: 'rekyc',
    product: null,
  },
  {
    id: 'debit_reissue',
    kind: 'Service request',
    name: 'Debit card reissue',
    blurb: 'Replace a lost, stolen, or damaged debit card',
    journey: 'debit_reissue',
    product: null,
  },
];

const LATER = ['Nomination', 'Personal loan', 'Fixed deposit', 'NEFT transfer'];

/** Planner failed or did not finish: keep the single-card pick, say so gently. */
function fallbackNote(error: string | null): string {
  if (error === 'rate_limited') return 'Too many tries from this network. I picked the closest form below instead.';
  return 'I could not plan this just now, so I picked the closest form below. You can change it.';
}

export function JourneyPage({ plan: planRequest = requestPlan }: { plan?: RequestPlan } = {}) {
  const { go } = useRoute();
  const {
    language,
    micLang,
    selectLanguage,
    selectJourney,
    selectDraft,
    form,
    selectForm,
    onSubmitUtterance,
    beginPlanStep,
    clearPlan,
  } = useFormSession();
  const [selectedId, setSelectedId] = useState('regular_savings');
  const [heard, setHeard] = useState('');
  const [said, setSaid] = useState<{ text: string; source: HeardSource } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [planning, setPlanning] = useState(false);
  const [planResult, setPlanResult] = useState<{ result: PlanResponse; text: string } | null>(null);
  const [starting, setStarting] = useState(false);
  const planSeq = useRef(0);
  const selected = OPEN_CARDS.find((card) => card.id === selectedId) ?? OPEN_CARDS[0];
  const [pickedForm, setPickedForm] = useState<FormVersion>(form);
  // A form published for another journey cannot be filled for this one.
  const chosenForm = appliesToJourney(pickedForm, selected.journey) ? pickedForm : HDFC_V1;

  function applyHeuristic(text: string) {
    const pick = pickJourneyCard(text);
    if (pick.kind === 'card') {
      setSelectedId(pick.cardId);
      setNote(null);
      return;
    }
    setNote(
      pick.kind === 'later'
        ? 'That journey comes later. Choose account opening or KYC here.'
        : 'Name the account or the KYC you need.',
    );
  }

  /** Picks one card at once (as before), then asks the planner for the full multi-form plan. */
  async function applyUtterance(text: string, source: HeardSource, heard?: MicLang | null) {
    const clean = text.trim().slice(0, MAX_PLAN_TEXT);
    setHeard(clean);
    if (!clean) return;
    setSaid({ text: clean, source });
    applyHeuristic(clean);
    // The language the customer used becomes the session's, so nobody has to pick one: the
    // one detected in a live clip, else the script of what was typed (Latin keeps the pick).
    const spoken = languageByBcp47(heard ?? detectScriptLanguage(clean, micLang));
    if (spoken && spoken.id !== language) selectLanguage(spoken.id);
    const seq = ++planSeq.current;
    setPlanning(true);
    setPlanResult(null);
    const { plan, error } = await planRequest(clean, spoken?.id ?? language ?? 'en');
    if (seq !== planSeq.current) return;
    setPlanning(false);
    if (plan && plan.outcome !== 'no_plan') {
      setPlanResult({ result: plan, text: clean });
      setNote(null);
      if (plan.outcome === 'planned') setSelectedId(stepCardId(plan.steps[0], clean));
      return;
    }
    setNote(fallbackNote(error));
  }

  async function startPlan() {
    const active = planResult ? planFromResponse(planResult.result, planResult.text) : null;
    if (!active) return;
    setStarting(true);
    try {
      if (language === null) selectLanguage('en');
      const target = await resolveStepForm(active.steps[0], form);
      beginPlanStep(active, 0, target);
      go('/speak');
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="grid min-h-[calc(100vh-150px)] grid-cols-1 lg:grid-cols-12">
      <CompanionPanel
        language={language}
        micLang={micLang}
        selectLanguage={selectLanguage}
        draft={heard}
        onDraftChange={setHeard}
        said={said}
        planning={planning}
        note={note}
        onNote={setNote}
        onUtterance={(text, source, heard) => void applyUtterance(text, source, heard)}
      />

      <section className="px-5 py-8 lg:col-span-7 lg:px-8">
        {planning ? (
          <div role="status" className="mb-8 border-2 border-dashed border-primary/50 p-5 text-sm text-muted-foreground">
            Planning your forms — checking journeys and bank forms…
          </div>
        ) : planResult ? (
          <PlanCard
            result={planResult.result}
            hindi={/[\u0900-\u097F]/.test(planResult.text)}
            starting={starting}
            onStart={() => void startPlan()}
          />
        ) : null}
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">Supported forms</p>
            <h2 className="mt-2 font-display text-4xl leading-none sm:text-5xl">Or pick one yourself.</h2>
          </div>
          <span className="hidden text-xs text-muted-foreground sm:block">Fields vary by bank.</span>
        </div>

        <PublishedFormRows
          journey={selected.journey}
          selected={formKey(chosenForm)}
          onSelect={setPickedForm}
        />

        <div className="mt-6 grid gap-px border-2 border-foreground bg-foreground sm:grid-cols-2">
          {OPEN_CARDS.map((card, index) => {
            const on = card.id === selected.id;
            // The grid lines are the dark background showing through 1px gaps, so an odd card
            // out would leave a solid dark cell beside it. Let it span both columns instead.
            const spanRow = OPEN_CARDS.length % 2 === 1 && index === OPEN_CARDS.length - 1;
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => setSelectedId(card.id)}
                className={`min-h-28 p-4 text-left ${spanRow ? 'sm:col-span-2 ' : ''}${
                  on ? 'bg-primary text-primary-foreground' : 'bg-background text-foreground hover:bg-muted'
                }`}
              >
                <span className={`text-[10px] font-semibold uppercase ${on ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                  {card.kind}
                </span>
                <span className="mt-1 flex items-center justify-between gap-3 font-semibold">
                  {card.name}
                  {on ? <CheckIcon className="size-4" /> : <ArrowRightIcon className="size-4" />}
                </span>
                <span className={`mt-1 block text-xs ${on ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                  {card.blurb}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {LATER.map((name) => (
            <span
              key={name}
              className="border border-dashed border-foreground/30 px-3 py-1.5 text-xs text-muted-foreground"
            >
              {name} · later
            </span>
          ))}
        </div>

        <div className="mt-8 border-t-2 border-foreground pt-5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">
            02 · Before you start · {selected.name}
          </p>
          <h3 className="mt-2 font-display text-2xl">Keep these in front of you.</h3>
          <p className="mt-1 max-w-[60ch] text-sm text-muted-foreground">
            You only say these details; nothing is uploaded. Having the cards in hand gets the numbers right first
            time. Take the originals to the branch, where the bank checks them.
          </p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {PREP_LIST[selected.journey].map((need) => (
              <li key={need} className="flex items-start gap-2 border border-foreground/20 p-3 text-sm">
                <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />
                {need}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Never say an OTP, PIN, CVV or full card number. FormGuide will not ask for them.
          </p>
        </div>

        <div className="mt-7 flex flex-wrap items-center justify-between gap-4">
          <p className="max-w-sm text-xs text-muted-foreground">
            Draft only. FormGuide does not connect to CKYC, DigiLocker, or any bank.
          </p>
          <button
            type="button"
            className={`${BTN_PRIMARY} ${BTN_LG}`}
            onClick={() => {
              if (language === null) selectLanguage('en');
              // Picking a card by hand fills that one form; any planner suggestion is set aside.
              clearPlan();
              if (selected.product) selectDraft(selected.journey, selected.product);
              selectJourney(selected.journey);
              selectForm(chosenForm);
              if (heard) void onSubmitUtterance(heard);
              go('/speak');
            }}
          >
            Start filling {selected.name}
            {chosenForm.bankId ? ` · ${chosenForm.bankId}` : ''} <ArrowRightIcon />
          </button>
        </div>
      </section>
    </div>
  );
}
