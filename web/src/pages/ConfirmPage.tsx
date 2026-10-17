import { useState } from 'react';
import { bankOnlyFields, isBundledForm } from '../forms/activeForm';
import { OLD_CARD_BLOCKED_ACK } from '../lib/debitReissue';
import { resolveStepForm, stepTitle } from '../lib/journeyPlan';
import { BANK_VARIES_COPY, SCHEMA, fieldApplies, isFilled, journeyValues } from '../lib/schema';
import { buildDraftPdf } from '../lib/publishedPdfFill';
import type { SchemaField } from '../lib/types';
import { useRoute } from '../routing/router';
import { CONFIDENCE_FLAG_THRESHOLD, useFormSession, type FieldConfidence } from '../session/FormSession';
import { BTN, BTN_LG, BTN_MD, BTN_OUTLINE, BTN_PRIMARY } from '../ui/buttons';
import { displayValue } from '../ui/fields';
import { ArrowRightIcon, CheckIcon, DownloadIcon, FileCheckIcon, MicIcon, RotateIcon, StopIcon } from '../ui/icons';
import { useMic } from '../ui/useMic';

const GATES = [
  ['readback_confirmed', 'I reviewed the filled details and corrections.'],
  ['draft_only_ack', 'I understand this saves a draft only.'],
  ['no_live_submit_ack', 'I understand nothing is submitted to a bank.'],
] as const;

/**
 * Prefers the real, model-sourced confidence score when one exists (set by
 * the speak/extract response itself — see FormSession's `confidence`
 * state) and flags anything below threshold that the user hasn't
 * confirmed yet, same as the "Check this" treatment elsewhere in the app.
 * Falls back to a provenance-based label (HOW a value was captured) when
 * there's no per-field score — e.g. for the heuristic path, which doesn't
 * return one. Either way this is what a bank's integration team actually
 * needs: whether to auto-import a field or route it for human review.
 */
function confidenceLabel(
  source: string | undefined,
  modelConfidence: FieldConfidence | undefined,
): 'Needs review' | 'High' | 'Medium' | 'Confirmed' | 'Demo' | 'Unknown' {
  if (modelConfidence && !modelConfidence.confirmed && modelConfidence.confidence < CONFIDENCE_FLAG_THRESHOLD) {
    return 'Needs review';
  }
  switch (source) {
    case 'gemini':
      return 'High';
    case 'heuristic':
    case 'heuristic-dev':
      return 'Medium';
    case 'manual':
      return 'Confirmed';
    case 'priya_demo':
      return 'Demo';
    default:
      return 'Unknown';
  }
}

type ReceiptField = Pick<SchemaField, 'id' | 'label_en'>;

/** Filled shared fields, then filled boxes that only the selected bank's form has. A cleared checkbox is not filled. */
function filledFields(session: ReturnType<typeof useFormSession>): ReceiptField[] {
  const shared = SCHEMA.fields.filter(
    (field) =>
      field.group !== 'confirm_gates' &&
      fieldApplies(field, session.values) &&
      isFilled(session.values[field.id]),
  );
  const bank = bankOnlyFields(session.form)
    .filter((field) => isFilled(session.values[field.id]) && session.values[field.id] !== false)
    .map((field) => ({ id: field.id, label_en: field.label }));
  return [...shared, ...bank];
}

function handoffFields(session: ReturnType<typeof useFormSession>) {
  return filledFields(session).map((field) => ({
      id: field.id,
      value: session.values[field.id],
      source: session.fieldSource[field.id] ?? 'unknown',
      confidence: confidenceLabel(session.fieldSource[field.id], session.confidence[field.id]),
      model_confidence: session.confidence[field.id]?.confidence ?? null,
      said: session.said[field.id] ?? null,
    }));
}

function draftPayload(session: ReturnType<typeof useFormSession>) {
  return {
    schema_id: 'aof_kyc_demo_v1',
    demo_outcome: 'draft_ready_no_bank_submit',
    journey: session.journey,
    form: {
      form_id: session.form.formId,
      version: session.form.version,
      bank: session.form.bankId,
      journey: session.form.journey,
    },
    language: session.language,
    mic_lang: session.micLang,
    values: journeyValues(session.values),
    // Structured handoff shape: per-field value + provenance + confidence.
    // This is the part a bank's onboarding/core-banking system would
    // actually import — the flat `values` above is kept for simple
    // consumers that just want the data.
    fields: handoffFields(session),
  };
}

export function ConfirmPage() {
  const { go } = useRoute();
  const session = useFormSession();
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const plan = session.plan;
  const nextIndex = session.planStep + 1;
  const nextStep = plan && nextIndex < plan.steps.length ? plan.steps[nextIndex] : null;

  /** Move to the next planned form. Shared answers stay in the session; gates reset. */
  const goNext = async () => {
    if (!plan || !nextStep) return;
    setAdvancing(true);
    try {
      const form = await resolveStepForm(nextStep, session.form);
      session.beginPlanStep(plan, nextIndex, form);
      go('/speak');
    } finally {
      setAdvancing(false);
    }
  };
  const mic = useMic(session.micLang, (utterance) => {
    void session.onSubmitUtterance(utterance);
  });

  const downloadPdf = async () => {
    setPdfBusy(true);
    setPdfError(null);
    try {
      const blob = await buildDraftPdf(session.form, journeyValues(session.values));
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = isBundledForm(session.form)
        ? 'formguide-hdfc-kyc-draft.pdf'
        : `formguide-${session.form.bankId.toLowerCase()}-${session.form.journey}-draft.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setPdfError('Could not generate the PDF. The JSON draft above still has everything captured.');
    } finally {
      setPdfBusy(false);
    }
  };
  const rows = filledFields(session);
  const pdfLabel = isBundledForm(session.form) ? 'HDFC KYC' : `${session.form.bankId} form`;
  // No bank card-reissue form is in the corpus. Printing a card request onto the KYC
  // application would hand the bank an empty KYC form, so this journey offers JSON only.
  const pdfAvailable = session.journey !== 'debit_reissue';
  const gates =
    session.journey === 'debit_reissue'
      ? ([['card_old_blocked_ack', OLD_CARD_BLOCKED_ACK], ...GATES] as const)
      : GATES;

  if (session.draftReady) {
    return (
      <div className="min-h-[calc(100vh-150px)]">
        <section className="grid border-b-2 border-foreground lg:grid-cols-12">
          <div className="flex flex-col justify-start border-b-2 border-foreground bg-primary px-5 py-10 text-primary-foreground lg:col-span-5 lg:border-b-0 lg:border-r lg:px-8">
            <FileCheckIcon className="size-10" />
            <p className="mt-5 text-[10px] uppercase text-primary-foreground/70">Draft saved on this device</p>
            <h1 className="mt-2 font-display text-6xl leading-none">Your draft is ready.</h1>
            <p className="mt-4 max-w-sm text-sm text-primary-foreground/80">
              It was not submitted to a bank. Take this receipt when checking the bank’s own form.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                className={`${BTN} ${BTN_MD} border-2 border-background bg-background text-foreground hover:bg-foreground hover:text-background`}
                onClick={() => {
                  const blob = new Blob([JSON.stringify(draftPayload(session), null, 2)], {
                    type: 'application/json',
                  });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = 'formguide-draft.json';
                  link.click();
                  URL.revokeObjectURL(url);
                }}
              >
                <DownloadIcon /> Download JSON
              </button>
              {pdfAvailable ? (
                <button
                  type="button"
                  className={`${BTN} ${BTN_MD} border-2 border-background bg-background text-foreground hover:bg-foreground hover:text-background`}
                  disabled={pdfBusy}
                  onClick={() => void downloadPdf()}
                >
                  <DownloadIcon /> {pdfBusy ? 'Generating PDF…' : `Download PDF (${pdfLabel})`}
                </button>
              ) : null}
              <button
                type="button"
                className={`${BTN_OUTLINE} ${BTN_MD} border-background text-background hover:bg-background hover:text-foreground`}
                onClick={() => {
                  session.onClear();
                  session.clearPlan();
                  go('/');
                }}
              >
                <RotateIcon /> New draft
              </button>
            </div>
            {pdfAvailable ? null : (
              <p className="mt-3 max-w-sm text-xs text-primary-foreground/80">
                No bank PDF for a card reissue yet. The JSON draft has every field, with the card's last 4 only.
              </p>
            )}
            {pdfError ? <p className="mt-3 max-w-sm text-xs text-saffron">{pdfError}</p> : null}
            {nextStep && plan ? (
              <div className="mt-8 border-2 border-background p-4">
                <p className="text-[10px] uppercase text-primary-foreground/70">
                  Form {session.planStep + 1} of {plan.steps.length} saved · download it before moving on
                </p>
                <button
                  type="button"
                  disabled={advancing}
                  className={`${BTN} ${BTN_LG} mt-3 w-full border-2 border-background bg-background text-foreground hover:bg-foreground hover:text-background`}
                  onClick={() => void goNext()}
                >
                  Next: {stepTitle(nextStep)} <ArrowRightIcon />
                </button>
                <p className="mt-2 text-xs text-primary-foreground/80">{nextStep.reason}</p>
                <p className="mt-1 text-xs text-primary-foreground/80">
                  Your shared answers carry over. You only answer what is new.
                </p>
              </div>
            ) : plan && plan.steps.length > 1 ? (
              <p className="mt-8 border-2 border-background p-4 text-sm">
                All {plan.steps.length} forms in your plan are drafted.
              </p>
            ) : null}
          </div>
          <Receipt rows={rows} session={session} />
        </section>
        {session.refuseMsg ? (
          <p className="border-b-2 border-saffron bg-saffron/10 px-5 py-4 text-sm">{session.refuseMsg}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid min-h-[calc(100vh-150px)] lg:grid-cols-12">
      <section className="border-b-2 border-foreground px-5 py-8 lg:col-span-5 lg:border-b-0 lg:border-r lg:px-8">
        <p className="text-[10px] uppercase text-primary">05 · Confirm draft</p>
        <h1 className="mt-3 max-w-[9ch] font-display text-5xl leading-none">
          {session.journey === 'debit_reissue' ? 'Block the old card. Then three gates.' : 'Three gates. No bank submit.'}
        </h1>
        <p className="mt-4 max-w-md text-sm text-muted-foreground">
          Each gate must be clear before FormGuide saves anything. This action stores a draft in this demo only.
        </p>
        <div className="mt-7 space-y-3">
          {gates.map(([id, label], index) => {
            const on = session.values[id] === true;
            return (
              <label
                key={id}
                className={`flex cursor-pointer gap-3 border-2 p-4 ${on ? 'border-primary bg-primary/10' : 'border-foreground'}`}
                onClick={() => session.onChange(id, on ? false : true)}
              >
                <span
                  role="checkbox"
                  aria-checked={on}
                  className={`mt-0.5 grid size-5 place-content-center border border-primary ${
                    on ? 'bg-primary text-primary-foreground' : ''
                  }`}
                >
                  {on ? <CheckIcon className="size-4" /> : null}
                </span>
                <span>
                  <span className="block text-[10px] uppercase text-muted-foreground">Gate 0{index + 1}</span>
                  <span className="mt-1 block font-semibold">{label}</span>
                </span>
              </label>
            );
          })}
        </div>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            className={`${BTN_OUTLINE} ${BTN_MD}`}
            disabled={!mic.supported || session.busy}
            onClick={() => (mic.listening ? mic.stop() : mic.start())}
          >
            {mic.listening ? <StopIcon /> : <MicIcon />}
            {mic.listening ? 'Listening…' : 'Or say the confirmation'}
          </button>
        </div>
        {mic.live ? <p className="mt-2 text-xs text-muted-foreground">“{mic.live}”</p> : null}
        <button
          type="button"
          className={`${BTN_PRIMARY} ${BTN_LG} mt-6 w-full`}
          disabled={!session.canReadback || !session.confirmGatesOk}
          onClick={session.emitDraft}
        >
          <CheckIcon /> Save draft only
        </button>
        <p className="mt-3 text-center text-[11px] text-saffron">
          No Aadhaar OTP · no core-banking submit · no live CKYC
        </p>
        {session.refuseMsg ? (
          <p className="mt-4 border-2 border-saffron bg-saffron/10 p-4 text-xs">{session.refuseMsg}</p>
        ) : null}
      </section>
      <Receipt rows={rows} session={session} />
    </div>
  );
}

function Receipt({
  rows,
  session,
}: {
  rows: ReceiptField[];
  session: ReturnType<typeof useFormSession>;
}) {
  const { go } = useRoute();
  const name = String(session.values.applicant_full_name || '');
  return (
    <section className="px-5 py-8 lg:col-span-7 lg:px-8">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] uppercase text-primary">Bank handoff preview</p>
          <h2 className="mt-2 font-display text-4xl">Said, filled, and confidence</h2>
          <p className="mt-2 max-w-md text-xs text-muted-foreground">
            What a bank’s onboarding system would import per field — not just the value, but
            where it came from and how much to trust it before auto-filing it.
          </p>
        </div>
        <span className="border border-foreground px-2 py-1 text-[10px]">FAKE DEMO</span>
      </div>
      <div className="mt-6 border-2 border-foreground">
        <div className="grid grid-cols-[.6fr_1.1fr_.9fr_.6fr] bg-foreground px-3 py-2 text-[10px] uppercase text-background">
          <span>Field</span>
          <span>Said</span>
          <span>Filled</span>
          <span>Confidence</span>
        </div>
        {rows.length === 0 ? (
          <p className="px-3 py-3 text-xs text-muted-foreground">Nothing filled yet.</p>
        ) : (
          rows.map((field) => {
            const confidence = confidenceLabel(session.fieldSource[field.id], session.confidence[field.id]);
            return (
              <div
                key={field.id}
                className="grid grid-cols-[.6fr_1.1fr_.9fr_.6fr] border-t border-foreground/20 px-3 py-3 text-xs"
              >
                <span className="font-semibold">{field.label_en}</span>
                <span className="pr-3 text-muted-foreground">“{session.said[field.id] || '—'}”</span>
                <span className="text-primary">
                  {field.id === 'applicant_full_name' && name
                    ? name
                    : displayValue(field.id, session.values[field.id], session.language === 'hi')}{' '}
                  ✓
                </span>
                <span>
                  <span
                    className={`border px-1.5 py-0.5 text-[10px] ${
                      confidence === 'Needs review'
                        ? 'border-saffron bg-saffron/10 text-saffron'
                        : confidence === 'High'
                          ? 'border-primary text-primary'
                          : confidence === 'Confirmed'
                            ? 'border-foreground text-foreground'
                            : 'border-muted-foreground text-muted-foreground'
                    }`}
                  >
                    {confidence}
                  </span>
                </span>
              </div>
            );
          })
        )}
      </div>
      <div className="mt-5 flex items-start gap-3 border-2 border-saffron bg-saffron/10 p-4 text-xs">
        <FileCheckIcon className="size-5 shrink-0 text-saffron" />
        <p>
          <strong>Draft receipt, not a bank acknowledgement.</strong>
          <br />
          {BANK_VARIES_COPY} Check the chosen bank’s latest requirements before using this draft.
        </p>
      </div>
      {session.draftReady ? (
        <pre className="mt-4 overflow-auto border-2 border-foreground p-3 text-[11px]">
          {JSON.stringify(draftPayload(session), null, 2)}
        </pre>
      ) : null}
      <button type="button" className={`${BTN_OUTLINE} ${BTN_MD} mt-5`} onClick={() => go('/review')}>
        Back to review
      </button>
    </section>
  );
}
