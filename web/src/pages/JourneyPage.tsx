import { useState } from 'react';
import { isJourneyId, type JourneyId } from '../lib/journeys';
import { BANK_VARIES_COPY } from '../lib/schema';
import { useRoute } from '../routing/router';
import { useFormSession, type ShellLanguage } from '../session/FormSession';

/** Legend only. Not a language chooser. */
const LANGUAGE_LEGEND = [
  { id: 'en', label: 'English' },
  { id: 'hi', label: 'हिन्दी' },
  { id: 'bn', label: 'বাংলা' },
  { id: 'ta', label: 'தமிழ்' },
  { id: 'te', label: 'తెలుగు' },
  { id: 'mr', label: 'मराठी' },
  { id: 'gu', label: 'ગુજરાતી' },
  { id: 'kn', label: 'ಕನ್ನಡ' },
] as const;

type LegendId = (typeof LANGUAGE_LEGEND)[number]['id'];

type FormFamily = {
  id: string;
  label: string;
  detail: string;
  card: string;
  keyElements: string[];
  fillReady: boolean;
};

const FORMS: readonly FormFamily[] = [
  {
    id: 'account_opening',
    label: 'Account opening',
    detail: `Resident individual savings / salary / current. Public AOF samples — ${BANK_VARIES_COPY}`,
    card: 'Resident individual savings / salary / current.',
    keyElements: ['Full name', 'DOB', 'PAN / OVD', 'Mobile', 'Address + PIN', 'Photo consent'],
    fillReady: true,
  },
  {
    id: 'kyc_update',
    label: 'KYC update',
    detail: 'Update identity, address, and contact on an existing KYC record.',
    card: 'Update identity, address, and contact.',
    keyElements: ['Identity proof', 'Address proof', 'Mobile', 'Email'],
    fillReady: true,
  },
  {
    id: 'rekyc',
    label: 'Re-KYC',
    detail: 'Periodic refresh when a bank asks for re-verification.',
    card: 'Periodic refresh · fill ready.',
    keyElements: ['Existing customer', 'OVD', 'Address', 'Photo'],
    fillReady: true,
  },
  {
    id: 'nomination',
    label: 'Nomination',
    detail: 'Add or change a nominee.',
    card: 'Add or change a nominee · fill later',
    keyElements: ['Nominee name', 'Relation', 'Share'],
    fillReady: false,
  },
  {
    id: 'fixed_deposit',
    label: 'Fixed deposit',
    detail: 'Term deposit request pack.',
    card: 'Term deposit · fill later',
    keyElements: ['Amount', 'Tenure', 'Interest payout'],
    fillReady: false,
  },
  {
    id: 'neft_rtgs',
    label: 'NEFT / RTGS',
    detail: 'Fund transfer instruction form.',
    card: 'Fund transfer · fill later',
    keyElements: ['Beneficiary', 'IFSC', 'Amount'],
    fillReady: false,
  },
];

/**
 * Sample line for review. This page does not call a speech API, and the line
 * is not a transcription.
 */
const PREVIEW_HEARD = 'I need to open a savings account in Bengaluru';

function heardId(language: ShellLanguage | null): LegendId {
  return language === 'hi' ? 'hi' : 'en';
}

function MicIcon() {
  return (
    <svg className="prep-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
      <path d="M19 11a7 7 0 0 1-14 0" />
      <path d="M12 18v3" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg className="prep-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="prep-icon prep-check" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12.5 9.2 17 19 7" />
    </svg>
  );
}

export function JourneyPage() {
  const { go } = useRoute();
  const { language, journey, selectLanguage, selectJourney } = useFormSession();
  const heard = heardId(language);
  const heardLabel = LANGUAGE_LEGEND.find((item) => item.id === heard)?.label ?? 'English';
  const [chosenId, setChosenId] = useState<string>(journey ?? 'account_opening');
  const [listening, setListening] = useState(false);
  const suggested = FORMS.find((form) => form.id === chosenId) ?? FORMS[0];

  function choose(form: FormFamily) {
    setChosenId(form.id);
    if (form.fillReady && isJourneyId(form.id)) selectJourney(form.id);
  }

  function goAhead() {
    if (!suggested.fillReady || !isJourneyId(suggested.id)) return;
    if (language === null) selectLanguage(heard === 'hi' ? 'hi' : 'en');
    selectJourney(suggested.id as JourneyId);
    go('/speak');
  }

  return (
    <div className="prep">
      <section className="prep-side" aria-label="Preparation">
        <div className="prep-copy">
          <header className="page-head">
            <p className="eyebrow">02 · Preparation</p>
            <h1>Say what you need.</h1>
            <p className="lede">
              The mic detects language. There is no language picker. We suggest one form from the
              corpus; you can take it or pick another card on this page.
            </p>
          </header>

          <p className="prep-kicker">Languages heard</p>
          <ul className="prep-legend" aria-label="Language legend">
            {LANGUAGE_LEGEND.map((item) => {
              const active = heard === item.id;
              return (
                <li key={item.id} className={active ? 'on' : undefined} aria-current={active ? 'true' : undefined}>
                  <span>{item.label}</span>
                  {active ? <span className="prep-hearing">hearing</span> : null}
                </li>
              );
            })}
          </ul>
          <p className="hint prep-legend-note">Legend only — not choosable.</p>
        </div>

        <div className="prep-mic">
          <div className="prep-mic-meta">
            <span>{listening ? 'Listening · design preview' : 'Mic ready · auto language'}</span>
            <span>{heardLabel}</span>
          </div>
          <p className="prep-heard-label">Heard</p>
          <p className="prep-heard" aria-live="polite">
            “{PREVIEW_HEARD}”
          </p>
          <p className="prep-preview-note">Design preview · not a live transcript.</p>
          <div className="prep-mic-actions">
            <button
              type="button"
              className="btn primary lg"
              aria-pressed={listening}
              onClick={() => setListening(true)}
            >
              <MicIcon /> Start listening
            </button>
            <button type="button" className="btn lg" onClick={() => setListening(false)}>
              <StopIcon /> Stop
            </button>
          </div>
        </div>
      </section>

      <section className="prep-main" aria-label="Suggested form">
        <div className="prep-suggest-head">
          <div>
            <p className="eyebrow">Suggested from what you said</p>
            <h2>{suggested.label}</h2>
          </div>
          <p className="prep-varies">{BANK_VARIES_COPY}</p>
        </div>
        <p className="prep-detail">{suggested.detail}</p>
        <ul className="prep-keys">
          {suggested.keyElements.map((element) => (
            <li key={element}>
              <CheckIcon />
              {element}
            </li>
          ))}
        </ul>

        <div className="prep-go">
          <p className="hint">
            {suggested.fillReady
              ? 'Go ahead opens speak and fill for this draft. Confirm still saves a draft only.'
              : 'This journey is listed for later. Pick a fill-ready form or keep speaking.'}
          </p>
          <button type="button" className="btn primary lg" disabled={!suggested.fillReady} onClick={goAhead}>
            Go ahead
          </button>
        </div>

        <p className="prep-kicker">All journeys on this page</p>
        <div className="prep-forms" role="group" aria-label="All journeys on this page">
          {FORMS.map((form) => {
            const selected = suggested.id === form.id;
            return (
              <button
                key={form.id}
                type="button"
                className={selected ? 'choice on' : 'choice'}
                aria-pressed={selected}
                onClick={() => choose(form)}
              >
                <span className="prep-form-title">
                  {form.label}
                  <span aria-hidden="true">{selected ? '✓' : form.fillReady ? '→' : '·'}</span>
                </span>
                <span className="prep-form-detail">{form.card}</span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
