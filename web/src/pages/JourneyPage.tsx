import { useState } from 'react';
import type { JourneyId } from '../lib/journeys';
import { LANGUAGES } from '../lib/languages';
import { useRoute } from '../routing/router';
import { useFormSession } from '../session/FormSession';
import { BTN_LG, BTN_PRIMARY } from '../ui/buttons';
import { ArrowRightIcon, CheckIcon, MicIcon, StopIcon } from '../ui/icons';

type OpenCard = {
  id: string;
  kind: string;
  name: string;
  blurb: string;
  journey: JourneyId;
  /** Existing account_product_intent value, or null for KYC journeys. */
  product: string | null;
  needs: string[];
};

const OPEN_CARDS: OpenCard[] = [
  {
    id: 'regular_savings',
    kind: 'Account opening',
    name: 'Regular savings',
    blurb: 'Everyday savings account for individuals',
    journey: 'account_opening',
    product: 'regular_savings',
    needs: [
      'Mobile number you can access',
      'Current address with PIN code',
      'One proof of identity (passport, voter ID, driving licence)',
      'PAN card number',
    ],
  },
  {
    id: 'salary_savings',
    kind: 'Account opening',
    name: 'Salary account',
    blurb: 'Zero-balance account linked to your employer',
    journey: 'account_opening',
    product: 'salary_savings',
    needs: [
      'Employer name',
      'Mobile number you can access',
      'Current address with PIN code',
      'PAN card number',
    ],
  },
  {
    id: 'bsbda',
    kind: 'Account opening',
    name: 'Basic savings',
    blurb: 'Simple no-frills savings account',
    journey: 'account_opening',
    product: 'bsbda',
    needs: ['Mobile number', 'Current address with PIN code', 'One proof of identity'],
  },
  {
    id: 'individual_current',
    kind: 'Account opening',
    name: 'Individual current',
    blurb: 'Current account for business transactions',
    journey: 'account_opening',
    product: 'individual_current',
    needs: [
      'PAN card number',
      'Business or trade name',
      'Address with PIN code',
      'One proof of identity',
    ],
  },
  {
    id: 'kyc_update',
    kind: 'KYC',
    name: 'KYC update',
    blurb: 'Change address, mobile, or identity details',
    journey: 'kyc_update',
    product: null,
    needs: [
      'One proof of identity (passport, voter ID, driving licence)',
      'Current address with PIN code',
      'Mobile number you can access',
    ],
  },
  {
    id: 'rekyc',
    kind: 'KYC',
    name: 'Re-KYC',
    blurb: 'Periodic re-verification your bank asked for',
    journey: 'rekyc',
    product: null,
    needs: [
      'One proof of identity (passport, voter ID, driving licence)',
      'Current address with PIN code',
      'Mobile number you can access',
    ],
  },
];

const LATER = [
  'Nomination',
  'Debit card reissue',
  'Personal loan',
  'Fixed deposit',
  'NEFT transfer',
];

const SAMPLES = [
  {
    text: 'मुझे अपनी सैलरी के लिए नया अकाउंट खुलवाना है',
    cardId: 'salary_savings',
  },
  {
    text: 'My bank sent a letter saying I need to redo my KYC',
    cardId: 'rekyc',
  },
] as const;

function WaveMark() {
  const bars = [6, 10, 14, 8, 12];
  return (
    <span className="flex h-4 items-end gap-0.5" aria-hidden="true">
      {bars.map((height, index) => (
        <span key={index} className="w-0.5 bg-current" style={{ height }} />
      ))}
    </span>
  );
}

function GreenDots() {
  return (
    <div className="mt-3 flex items-center gap-1" aria-hidden="true">
      {Array.from({ length: 28 }, (_, index) => (
        <span key={index} className="size-1 rounded-full bg-primary" />
      ))}
    </div>
  );
}

export function JourneyPage() {
  const { go } = useRoute();
  const { language, selectLanguage, selectJourney, selectDraft } = useFormSession();
  const [listening, setListening] = useState(false);
  const [selectedId, setSelectedId] = useState('regular_savings');
  const [heard, setHeard] = useState('');
  const selected = OPEN_CARDS.find((card) => card.id === selectedId) ?? OPEN_CARDS[0];

  return (
    <div className="grid min-h-[calc(100vh-150px)] lg:grid-cols-12">
      <section className="border-b-2 border-foreground bg-foreground px-5 py-8 text-background lg:col-span-5 lg:border-b-0 lg:border-r-2 lg:px-8">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">
          01 · Talk to your companion
        </p>
        <h1 className="mt-3 max-w-[11ch] font-display text-5xl leading-[0.95] sm:text-6xl">
          Just tell me what you need.
        </h1>
        <p className="mt-4 max-w-sm text-sm leading-relaxed text-background/80">
          Speak in your language, or mix in English. I'll detect your language and pick the right form.
        </p>

        <div className="mt-10 flex flex-col items-center">
          <button
            type="button"
            aria-label="Tap, say your need"
            aria-pressed={listening}
            onClick={() => setListening((on) => !on)}
            className="grid size-40 place-items-center rounded-full bg-primary text-primary-foreground"
          >
            {listening ? <StopIcon className="size-10" /> : <MicIcon className="size-12" />}
          </button>
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide">
            {listening ? 'Listening · local only · not a transcript' : 'Tap · say your need'}
          </p>
          <GreenDots />
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-[11px]" role="group" aria-label="Language">
            <span className="flex items-center gap-1.5 text-background/80">
              <WaveMark /> Language:
            </span>
            {LANGUAGES.map((option) => {
              const selectedLang = language === null ? option.id === 'en' : language === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={selectedLang}
                  aria-label={option.beta ? `${option.englishName}, Beta` : option.englishName}
                  onClick={() => selectLanguage(option.id)}
                  className={`whitespace-nowrap border px-3 py-1 font-semibold ${
                    selectedLang
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-background/40 bg-transparent text-background/80'
                  }`}
                >
                  {option.pickerLabel}
                  {option.beta ? (
                    <span className="ml-1.5 inline-block rounded-full border border-current px-1 py-px text-[9px] font-semibold uppercase leading-none">
                      Beta
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-center text-[11px] text-background/70">
            Tested in English and Hindi, more languages in Beta
          </p>
        </div>

        <div className="mt-8 border-t border-background/20 pt-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-background/50">
            No mic? Try a sample voice
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {SAMPLES.map((sample) => (
              <button
                key={sample.text}
                type="button"
                onClick={() => {
                  setListening(false);
                  setHeard(sample.text);
                  setSelectedId(sample.cardId);
                }}
                className="border border-background/30 px-3 py-2 text-left text-xs hover:border-primary"
              >
                ▶ {sample.text}
              </button>
            ))}
          </div>
          {heard ? (
            <p className="mt-3 border border-background/30 p-3 text-sm">
              <span className="block text-[10px] uppercase text-background/50">
                Sample · not a live transcript
              </span>
              “{heard}”
            </p>
          ) : null}
        </div>
      </section>

      <section className="px-5 py-8 lg:col-span-7 lg:px-8">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">Supported forms</p>
            <h2 className="mt-2 font-display text-4xl leading-none sm:text-5xl">Or pick one yourself.</h2>
          </div>
          <span className="hidden text-xs text-muted-foreground sm:block">Fields vary by bank.</span>
        </div>

        <div className="mt-6 grid gap-px border-2 border-foreground bg-foreground sm:grid-cols-2">
          {OPEN_CARDS.map((card) => {
            const on = card.id === selected.id;
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => setSelectedId(card.id)}
                className={`min-h-28 p-4 text-left ${
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
            02 · Keep these nearby for {selected.name}
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {selected.needs.map((need) => (
              <li key={need} className="flex items-start gap-2 border border-foreground/20 p-3 text-xs">
                <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />
                {need}
              </li>
            ))}
          </ul>
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
              if (selected.product) selectDraft(selected.journey, selected.product);
              selectJourney(selected.journey);
              go('/speak');
            }}
          >
            Start filling {selected.name} <ArrowRightIcon />
          </button>
        </div>
      </section>
    </div>
  );
}
