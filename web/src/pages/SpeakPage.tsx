import { useEffect, useState } from 'react';
import { BankFields } from '../components/BankFields';
import { MissingFieldInputs } from '../components/MissingFieldInputs';
import { languageLabel } from '../lib/languages';
import {
  HELPLINE_COPY,
  OLD_CARD_BLOCKED_ACK,
  REGISTERED_ADDRESS_COPY,
  cardLast4,
} from '../lib/debitReissue';
import { SCHEMA, fieldLabel, getNextAsk, isFilled } from '../lib/schema';
import { fieldIssue } from '../lib/validate';
import { HINDI_SAMPLE, MIXED_SAMPLE } from '../lib/utteranceLang';
import { useRoute } from '../routing/router';
import { flagsDemoRequested, useFormSession } from '../session/FormSession';
import { BTN_LG, BTN_MD, BTN_OUTLINE, BTN_PRIMARY } from '../ui/buttons';
import { draftChoiceLabel } from '../ui/fields';
import { ArrowRightIcon, FileTextIcon, MicIcon, RotateIcon, SparkleIcon, StopIcon } from '../ui/icons';
import { useSpeakMic } from '../ui/useMic';

const EN_SAMPLE =
  'Hi, I want to open a savings account. My name is Ananya Reddy, DOB 15/08/1992, PAN ABCDE1234F, mobile 9876501234. I live at 22 MG Road, Bengaluru, Karnataka 560001.';

const SAMPLE_LINES = [HINDI_SAMPLE, MIXED_SAMPLE, EN_SAMPLE];

type PreviewField = {
  id: string | null;
  label: string;
  hint: string;
  required: boolean;
  section: string;
  enumRef?: string;
  input?: 'text' | 'boolean' | 'static';
};

/** Visual sections from the speak screen. Null ids are shown only — they are not schema fields. */
const FIELDS: PreviewField[] = [
  { id: 'applicant_full_name', label: 'Full name', hint: 'As on your ID', required: true, section: 'Identity' },
  { id: 'father_or_spouse_name', label: "Father's / spouse's name", hint: 'Full name', required: false, section: 'Identity' },
  { id: 'dob', label: 'Date of birth', hint: 'DD Month YYYY', required: true, section: 'Identity' },
  { id: 'gender', label: 'Gender', hint: 'Female / Male / Other', required: false, section: 'Identity', enumRef: 'gender' },
  { id: null, label: 'Marital status', hint: 'Single / Married', required: false, section: 'Identity' },
  { id: 'nationality', label: 'Nationality', hint: 'Indian', required: false, section: 'Identity' },
  { id: 'mobile_registered', label: 'Mobile number', hint: '10 digits', required: true, section: 'Contact' },
  { id: 'email', label: 'Email', hint: 'Optional', required: false, section: 'Contact' },
  { id: 'addr_current_line1', label: 'Residential address', hint: 'House, street, area', required: true, section: 'Address' },
  { id: 'addr_current_city', label: 'City', hint: 'City or town', required: true, section: 'Address' },
  { id: 'addr_current_state', label: 'State', hint: 'State', required: true, section: 'Address' },
  { id: 'addr_current_pin', label: 'PIN code', hint: '6 digits', required: true, section: 'Address' },
  { id: 'ovd_poi_type', label: 'Document type', hint: 'Passport, voter ID…', required: true, section: 'Proof of identity', enumRef: 'ovd_type' },
  { id: 'ovd_poi_number', label: 'Document number', hint: 'As printed', required: true, section: 'Proof of identity' },
  { id: 'ovd_poi_expiry', label: 'Expiry date', hint: 'If applicable', required: false, section: 'Proof of identity' },
  { id: 'pan_number', label: 'PAN', hint: '10 characters', required: true, section: 'Proof of identity' },
  { id: 'occupation_bucket', label: 'Occupation', hint: 'Salaried, self-employed…', required: true, section: 'Occupation', enumRef: 'occupation_bucket' },
  { id: null, label: 'Employer / business', hint: 'Name', required: false, section: 'Occupation' },
  { id: null, label: 'Annual income', hint: 'Range', required: false, section: 'Occupation' },
];

const SECTIONS = ['Identity', 'Contact', 'Address', 'Proof of identity', 'Occupation'];

const DEBIT_FIELDS: PreviewField[] = [
  { id: 'applicant_full_name', label: 'Customer full name', hint: 'As in the bank', required: true, section: 'Card' },
  { id: 'card_customer_id', label: 'Customer ID', hint: 'Customer ID or CIF', required: true, section: 'Card' },
  { id: 'card_account_number', label: 'Account number', hint: 'Account number', required: true, section: 'Card' },
  { id: 'card_last4', label: 'Card last 4 digits', hint: 'Last 4 only', required: true, section: 'Card' },
  { id: 'card_reason', label: 'Reason', hint: 'Lost, stolen, damaged, other', required: true, section: 'Card', enumRef: 'card_reason' },
  { id: 'card_reason_other', label: 'Other reason', hint: 'Short note', required: true, section: 'Card' },
  { id: 'card_reissue_new', label: 'Reissue a new card', hint: 'Yes or no', required: true, section: 'Card', input: 'boolean' },
  { id: 'card_charges_account', label: 'Charges debit account', hint: 'Defaults to same account', required: false, section: 'Card' },
  { id: 'card_remarks', label: 'Remarks', hint: 'Optional', required: false, section: 'Card' },
  { id: 'card_confirm_mobile', label: 'Mobile for confirmation', hint: 'Optional, 10 digits', required: false, section: 'Card' },
  { id: null, label: 'Delivery', hint: REGISTERED_ADDRESS_COPY, required: false, section: 'Delivery', input: 'static' },
];

const DEBIT_SECTIONS = ['Card', 'Delivery'];

const DEBIT_SAMPLE =
  'I need a debit card reissue. My name is Priya Sharma, customer ID CIF102938, account number 501002223334, card number 6521 8844 2291 4417. It was stolen. Please reissue a new card. Confirmation mobile 9876543210.';

const ENUM_LABEL: Record<string, string> = {
  female: 'Female',
  male: 'Male',
  other: 'Other',
  prefer_not_to_say: 'Prefer not to say',
  passport: 'Passport',
  driving_licence: 'Driving licence',
  proof_of_possession_of_aadhaar: 'Aadhaar',
  voter_id: 'Voter ID',
  nrega_job_card: 'NREGA job card',
  npr_letter: 'NPR letter',
  lost_or_misplaced: 'Lost or misplaced',
  stolen: 'Stolen',
  damaged: 'Damaged',
  yes: 'Yes',
  no: 'No',
  salaried: 'Salaried',
  self_employed: 'Self-employed',
  professional: 'Professional',
  student: 'Student',
  homemaker: 'Homemaker',
  retired: 'Retired',
};

function pretty(value: string): string {
  return ENUM_LABEL[value] ?? value.replace(/_/g, ' ');
}

function shownValue(field: PreviewField, raw: string): string {
  if (!raw || !field.enumRef) return raw;
  const options = SCHEMA.enums[field.enumRef] ?? [];
  return options.includes(raw) ? pretty(raw) : raw;
}

function fieldRaw(field: PreviewField, values: Record<string, string | boolean | null | undefined>): string {
  if (!field.id) return field.input === 'static' ? field.hint : '';
  const raw = values[field.id];
  if (typeof raw === 'boolean') return raw ? 'yes' : 'no';
  if (typeof raw !== 'string') return '';
  if (field.id === 'card_last4') return cardLast4(raw);
  return raw;
}

function GreenDots() {
  return (
    <div className="mt-3 flex items-center gap-1" aria-hidden="true">
      {Array.from({ length: 22 }, (_, index) => (
        <span key={index} className="size-1 rounded-full bg-primary" />
      ))}
    </div>
  );
}

export function SpeakPage() {
  const { go } = useRoute();
  const session = useFormSession();
  const [said, setSaid] = useState('');
  const [saidIsSample, setSaidIsSample] = useState(false);
  const [turns, setTurns] = useState(0);
  const [sampleStep, setSampleStep] = useState(0);
  const [preview, setPreview] = useState(false);
  const [pinned, setPinned] = useState<string | null>(null);
  const [micNote, setMicNote] = useState<string | null>(null);
  const [checking, setChecking] = useState<string | null>(null);
  const mic = useSpeakMic(session.micLang, (wav) => {
    setMicNote(null);
    setSaidIsSample(false);
    setTurns((count) => count + 1);
    void session.onSubmitSpeakClip(wav).then((result) => {
      if (result.transcript) setSaid(result.transcript);
      if (result.fallback) {
        setMicNote('The voice service was busy, so I filled what I could from what you said. Check the fields below.');
        return;
      }
      if (result.error === 'fields_bad_json') {
        setMicNote('Heard you, but could not fill the fields. Try again in shorter parts.');
      } else if (result.error === 'rate_limited') {
        // Refused before transcription, so nothing was heard.
        setMicNote('Too many tries from this network. Wait a minute, then tap the mic again, or type it into the field.');
      } else if (result.error && /_503|unavailable|_429/.test(result.error)) {
        setMicNote('Heard you, but the voice service is busy right now. Tap the mic and say it again, or type it into the field.');
      } else if (result.error === 'network_error') {
        setMicNote('Could not reach the voice service. Check your connection and try again.');
      } else if (result.error) setMicNote(`Could not fill the fields (${result.error}). Try again, or type it into the field.`);
      else if (!result.transcript) setMicNote('Could not transcribe that clip.');
    });
  });
  const listening = mic.listening;

  useEffect(() => {
    if (!preview) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPreview(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preview]);

  const debit = session.journey === 'debit_reissue';
  const sheetFields = debit
    ? DEBIT_FIELDS.filter((field) => field.id !== 'card_reason_other' || session.values.card_reason === 'other')
    : FIELDS;
  const sheetSections = debit ? DEBIT_SECTIONS : SECTIONS;
  const sampleLines = debit ? [DEBIT_SAMPLE] : SAMPLE_LINES;
  const requiredFields = sheetFields.filter((field) => field.required && field.id);
  const requiredFilled = requiredFields.filter((field) => field.id && isFilled(session.values[field.id])).length;
  // Derive ask-next from live session.missing / values — never fall back to FIELDS[0] when done.
  const askComplete =
    session.missing.length === 0 ||
    session.completeness === 'demo_ready' ||
    session.completeness === 'full_bank_packet';
  const asked =
    (!askComplete && sheetFields.find((field) => field.id && field.id === session.missing[0])) ||
    (!askComplete &&
      requiredFields.find((field) => field.id && !isFilled(session.values[field.id]))) ||
    null;
  const flagged = session.flaggedIds;
  const flagCount = flagged.length;
  const invalid = session.invalidIds;
  const formatCount = invalid.length;
  const panelIds = new Set(sheetFields.map((field) => field.id).filter(Boolean) as string[]);
  const offPanelFlagged = flagged.filter((id) => !panelIds.has(id));
  const flagLine =
    flagCount > 0
      ? session.language === 'hi'
        ? `जाँचने के लिए ${flagCount} फ़ील्ड · रीड-बैक उसके बाद`
        : `${flagCount} field${flagCount === 1 ? '' : 's'} to check · read-back after`
      : null;
  const formatLine =
    formatCount > 0
      ? formatCount === 1
        ? '1 field needs a valid format · read-back after'
        : `${formatCount} fields need a valid format · read-back after`
      : null;
  const askNextLabel = askComplete
    ? session.language === 'hi'
      ? 'ज़रूरी जानकारी पूरी'
      : 'Required details complete'
    : asked?.label ||
      (session.missing[0] ? fieldLabel(session.missing[0]) : null) ||
      (session.language === 'hi' ? 'अगला ज़रूरी फ़ील्ड' : 'Next required field');
  const askNextHint = askComplete
    ? formatLine
      ? 'Fix the format first · Fields vary by bank.'
      : session.language === 'hi'
        ? 'रीड-बैक के लिए तैयार · Fields vary by bank.'
        : 'Ready for read-back · Fields vary by bank.'
    : asked?.hint || '';
  const active = pinned ?? asked?.section ?? sheetSections[0];
  const started =
    turns > 0 ||
    Boolean(session.last) ||
    sheetFields.some((field) => field.id && isFilled(session.values[field.id]));
  const companion = !started
    ? session.language === 'hi'
      ? 'नमस्ते! अपना पूरा नाम बताइए।'
      : 'Hi! Start with your full name.'
    : session.last?.next_ask ||
      getNextAsk(session.missing, session.values, session.readbackLang) ||
      (session.language === 'hi'
        ? 'ज़रूरी जानकारी पूरी हो गई।'
        : 'All required details are in.');
  const label = draftChoiceLabel(session.journey, session.values.account_product_intent);
  const lightBtn = `${BTN_OUTLINE} ${BTN_MD} border-background/40 bg-transparent text-background hover:bg-background hover:text-foreground`;

  const sectionStats = sheetSections.map((name) => {
    const rows = sheetFields.filter((field) => field.section === name);
    const done = rows.filter(
      (field) => field.id && isFilled(session.values[field.id]) && !invalid.includes(field.id),
    ).length;
    return { name, total: rows.length, done };
  });

  return (
    <div className="grid min-h-[calc(100vh-150px)] lg:h-[calc(100vh-10.5rem)] lg:grid-cols-12 lg:overflow-hidden">
      <section className="flex min-h-0 flex-col border-b-2 border-foreground bg-foreground text-background lg:col-span-4 lg:overflow-hidden lg:border-b-0 lg:border-r-2">
        <div className="flex items-center justify-between border-b border-background/15 px-5 py-3 text-[10px] uppercase tracking-wide text-background/70">
          <span className="flex items-center gap-2">
            <span className={`size-2 bg-primary ${listening ? 'bg-saffron' : ''}`} />
            Voice companion · {languageLabel(session.language)}
          </span>
          <span>Turn {turns}</span>
        </div>
        <div className="flex flex-1 flex-col items-center gap-5 overflow-y-auto px-5 py-6">
          <button
            type="button"
            aria-label="Tap and speak your details"
            aria-pressed={listening}
            onClick={() => {
              if (listening) mic.stop();
              else if (!session.busy) {
                setMicNote(null);
                void mic.start();
              }
            }}
            disabled={session.busy && !listening}
            className="grid size-40 place-items-center rounded-full bg-primary text-primary-foreground"
          >
            {listening ? <StopIcon className="size-10" /> : <MicIcon className="size-12" />}
          </button>
          <div className="text-center">
            <p className="text-[11px] font-semibold uppercase tracking-wide">
              {listening ? 'Recording · tap stop · 45 seconds max' : 'Tap and speak your details'}
            </p>
            <GreenDots />
          </div>

          <div className="w-full space-y-3">
            <div className="border border-background/25 p-3">
              <p className="text-[10px] uppercase text-background/50">
                {said ? (saidIsSample ? 'You said · sample' : 'You said') : 'You said'}
              </p>
              <p className="mt-1 font-display text-xl leading-snug">{said ? `“${said}”` : '—'}</p>
              {micNote ? <p className="mt-1 text-xs text-saffron">{micNote}</p> : null}
              {mic.error ? <p className="mt-1 text-xs text-saffron">{mic.error}</p> : null}
            </div>
            <div className="border-2 border-primary bg-primary/15 p-3">
              <p className="flex items-center gap-1 text-[10px] uppercase text-primary">
                <SparkleIcon className="size-3" /> FormGuide
              </p>
              <p className="mt-1 text-sm">{companion}</p>
            </div>
            <div className={`border p-3 ${askComplete && !flagLine && !formatLine ? 'border-primary' : 'border-saffron'}`}>
              <p className={`text-[10px] uppercase ${askComplete && !flagLine && !formatLine ? 'text-primary' : 'text-saffron'}`}>
                {askComplete
                  ? formatLine
                    ? 'Asks next · fix format'
                    : flagLine
                      ? 'Asks next · check flagged'
                      : 'Asks next · none missing'
                  : 'Asks next · still required'}
              </p>
              {session.readingBack ? (
                <div className="mt-1">
                  <div className="flex items-center justify-between gap-2">
                    <p role="status" aria-live="polite">
                      <span className="inline-block bg-primary px-1.5 py-0.5 text-[10px] font-bold uppercase text-primary-foreground">
                        ● {session.readbackLang === 'hi' ? 'पढ़कर सुना रहे हैं…' : 'Reading back…'}
                      </span>
                    </p>
                    <button
                      type="button"
                      className="shrink-0 border-2 border-background bg-background px-3 py-1 text-[11px] font-bold uppercase text-foreground hover:bg-primary hover:text-primary-foreground"
                      onClick={() => session.onStopReadback()}
                    >
                      Stop
                    </button>
                  </div>
                  {session.readbackInEnglish ? (
                    <p className="mt-1 text-[11px] font-normal normal-case text-background/60">
                      Read-back in English on this device
                    </p>
                  ) : null}
                </div>
              ) : null}
              {session.readingBack ? null : askComplete && flagLine ? (
                <p className="mt-1 text-sm font-semibold">
                  {flagLine}
                  <span className="font-normal text-background/60">
                    {' '}
                    · {flagged.map((id) => sheetFields.find((f) => f.id === id)?.label ?? fieldLabel(id)).join(', ')}
                  </span>
                </p>
              ) : (
                <p className="mt-1 text-sm font-semibold">
                  {askNextLabel}
                  {askNextHint ? (
                    <span className="font-normal text-background/60"> · {askNextHint}</span>
                  ) : null}
                </p>
              )}
              {!askComplete && flagLine ? (
                <p className="mt-1 text-xs font-semibold text-saffron">{flagLine}</p>
              ) : null}
              {formatLine ? (
                <p className="mt-1 text-xs font-semibold text-saffron">
                  {formatLine}
                  <span className="font-normal text-background/60">
                    {' '}
                    · {invalid.map((id) => FIELDS.find((field) => field.id === id)?.label ?? fieldLabel(id)).join(', ')}
                  </span>
                </p>
              ) : null}
              {offPanelFlagged.map((id) => (
                <div key={id} className="mt-2 flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate">
                    {fieldLabel(id)}: <span className="font-semibold">{String(session.values[id] ?? '')}</span>
                  </span>
                  <button
                    type="button"
                    className="shrink-0 border border-background/40 px-2 py-0.5 text-[10px] uppercase hover:bg-background hover:text-foreground"
                    onClick={() => session.confirmField(id)}
                  >
                    Looks right
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-auto grid w-full gap-2">
            <button
              type="button"
              className={lightBtn}
              disabled={session.busy}
              onClick={() => {
                const text = sampleLines[sampleStep % sampleLines.length];
                setSampleStep((step) => step + 1);
                if (listening) mic.cancel();
                setSaid(text);
                setSaidIsSample(true);
                setMicNote(null);
                setTurns((count) => count + 1);
                void session.onSubmitUtterance(text);
              }}
            >
              Try a sample phrase ({(sampleStep % sampleLines.length) + 1}/{sampleLines.length})
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className={lightBtn}
                disabled={session.busy}
                onClick={(event) => {
                  const demoFlags = event.shiftKey || event.altKey || flagsDemoRequested();
                  session.onPriya(demoFlags);
                }}
              >
                Load sample draft
              </button>
              {session.readingBack ? (
                <button type="button" className={lightBtn} onClick={() => session.onStopReadback()}>
                  <StopIcon /> Stop
                </button>
              ) : (
                <button
                  type="button"
                  className={lightBtn}
                  disabled={!session.canReadback || session.busy || session.speaking}
                  onClick={() => void session.onReadback()}
                >
                  Read back
                </button>
              )}
            </div>
            <p className="text-center text-[10px] font-semibold text-saffron">
              Sample person · not from a bank
            </p>
            {debit && session.missing.length === 0 && session.values.card_old_blocked_ack !== true ? (
              <p className="text-center text-[10px]">
                Tick that the old card is permanently blocked before read-back.
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <nav className="border-b-2 border-foreground px-4 py-4 lg:col-span-2 lg:min-h-0 lg:overflow-y-auto lg:border-b-0 lg:border-r-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">{label}</p>
        <p className="mt-1 font-display text-5xl leading-none">
          {requiredFilled}/{requiredFields.length}
        </p>
        <p className="text-[11px] text-muted-foreground">required filled</p>
        <div className="mt-2 h-2 border border-foreground">
          <div
            className="h-full bg-primary"
            style={{ width: `${requiredFields.length === 0 ? 0 : (requiredFilled / requiredFields.length) * 100}%` }}
          />
        </div>
        <ol className="mt-4 flex gap-2 overflow-x-auto lg:block lg:space-y-1">
          {sectionStats.map((section, index) => {
            const on = active === section.name;
            return (
              <li key={section.name} className="shrink-0 lg:shrink">
                <button
                  type="button"
                  onClick={() => {
                    setPinned(section.name);
                    document.getElementById(`speak-section-${index}`)?.scrollIntoView({ block: 'start' });
                  }}
                  className={`flex w-full items-center gap-2 border-2 px-2 py-2 text-left text-xs ${
                    on ? 'border-foreground bg-accent' : 'border-transparent hover:border-foreground/30'
                  }`}
                >
                  <span className="grid size-6 shrink-0 place-items-center border-2 border-foreground text-[10px] font-bold">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{section.name}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {section.done}/{section.total}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <section className="flex min-h-0 flex-col lg:col-span-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-foreground px-5 py-3">
          <div>
            <h1 className="font-display text-3xl leading-none">Draft filling live</h1>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Filling the {session.form.bankId} form. Fields vary by bank. Nothing is sent to a bank.
            </p>
          </div>
          <button
            type="button"
            className={`${BTN_OUTLINE} ${BTN_MD} border-2 border-foreground`}
            onClick={() => setPreview(true)}
          >
            <FileTextIcon /> Preview form{' '}
            <span className="ml-1 bg-foreground px-1.5 text-[10px] text-background">v{turns}</span>
          </button>
        </div>
        <div className="fg-scroll min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {debit ? (
            <p className="border-2 border-foreground px-3 py-2 text-xs">{HELPLINE_COPY}</p>
          ) : null}
          <MissingFieldInputs
            missing={session.missing}
            invalid={session.invalidIds}
            shownIds={panelIds}
            values={session.values}
            onChange={session.onChange}
          />
          {sheetSections.map((name, index) => {
            const stat = sectionStats[index];
            const rows = sheetFields.filter((field) => field.section === name);
            const activeSection = active === name;
            return (
              <section
                key={name}
                id={`speak-section-${index}`}
                className={`border-2 border-foreground transition-shadow ${activeSection ? 'shadow-[6px_6px_0_var(--foreground)]' : ''}`}
              >
                <header className="flex items-center justify-between border-b-2 border-foreground bg-primary px-4 py-2 text-primary-foreground">
                  <h2 className="text-sm font-bold uppercase tracking-wide">
                    {String(index + 1).padStart(2, '0')} · {name}
                  </h2>
                  <span className="text-[10px]">
                    {stat.done}/{stat.total}
                  </span>
                </header>
                <div className="grid sm:grid-cols-2">
                  {rows.map((field) => {
                    const asking = Boolean(asked && asked.label === field.label && field.id);
                    const raw = fieldRaw(field, session.values);
                    const filled = Boolean(field.id && isFilled(session.values[field.id]));
                    const filling = Boolean(field.id && session.flashIds.has(field.id));
                    const heard = field.id ? session.said[field.id] : '';
                    const options = field.enumRef ? SCHEMA.enums[field.enumRef] ?? [] : null;
                    const isFlagged = Boolean(field.id && flagged.includes(field.id));
                    const issue = field.id ? fieldIssue(field.id, session.values[field.id]) : null;
                    const conf = field.id ? session.confidence[field.id] : undefined;
                    const open = isFlagged && checking === field.id;
                    const inputId = field.id ? `speak-field-${field.id}` : undefined;
                    const status = issue
                      ? 'fix format'
                      : filling
                        ? '● filling'
                        : filled
                          ? '✓ heard'
                          : asking
                            ? 'asking'
                            : 'missing';
                    return (
                      <div
                        key={field.label}
                        onClick={
                          isFlagged
                            ? (event) => {
                                // Inline edit controls never toggle the row.
                                const target = event.target as HTMLElement;
                                if (target.closest('input, select, textarea, button, a, label')) return;
                                setChecking(open ? null : field.id);
                              }
                            : undefined
                        }
                        className={`${isFlagged ? 'cursor-pointer ' : ''}border-b border-r border-foreground/15 px-4 py-3 transition-colors duration-700 ${
                          filling ? 'bg-saffron/30' : asking ? 'bg-primary/10' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between text-[10px] uppercase">
                          <span className="text-muted-foreground">
                            {field.label}
                            {field.required ? <span className="text-destructive"> *</span> : ''}
                          </span>
                          {isFlagged ? (
                            <button
                              type="button"
                              aria-expanded={open}
                              aria-label={`${field.label}: check this value`}
                              onClick={(event) => {
                                event.stopPropagation();
                                if (open) {
                                  setChecking(null);
                                  return;
                                }
                                setChecking(field.id);
                                window.setTimeout(() => {
                                  const el = inputId ? document.getElementById(inputId) : null;
                                  if (el) (el as HTMLInputElement).focus();
                                }, 0);
                              }}
                              className="ml-2 shrink-0 rounded-full bg-saffron/30 px-2 font-bold normal-case text-saffron"
                            >
                              Check this
                            </button>
                          ) : (
                            <span
                              className={
                                issue
                                  ? 'font-bold text-destructive'
                                  : filled
                                    ? 'text-primary'
                                    : asking
                                      ? 'font-bold text-saffron'
                                      : 'text-muted-foreground'
                              }
                            >
                              {status}
                            </span>
                          )}
                        </div>
                        {field.input === 'static' ? (
                          <p className="mt-1 min-h-6 font-semibold">{field.hint}</p>
                        ) : field.id && options ? (
                          <select
                            id={inputId}
                            onFocus={() => {
                              if (isFlagged) setChecking(field.id);
                            }}
                            aria-label={field.label}
                            aria-invalid={issue ? true : undefined}
                            value={raw}
                            onChange={(event) => session.onChange(field.id as string, event.target.value)}
                            className={`mt-1 min-h-6 w-full bg-transparent font-semibold outline-none ${raw ? '' : 'text-muted-foreground/60'}`}
                          >
                            <option value="">{field.hint}</option>
                            {options.map((option) => (
                              <option key={option} value={option}>
                                {pretty(option)}
                              </option>
                            ))}
                          </select>
                        ) : field.input === 'boolean' && field.id ? (
                          <select
                            id={inputId}
                            aria-label={field.label}
                            value={raw === 'no' ? 'no' : 'yes'}
                            onChange={(event) => session.onChange(field.id as string, event.target.value === 'yes')}
                            className="mt-1 min-h-6 w-full bg-transparent font-semibold outline-none"
                          >
                            <option value="yes">Yes</option>
                            <option value="no">No</option>
                          </select>
                        ) : field.id ? (
                          <input
                            id={inputId}
                            onFocus={() => {
                              if (isFlagged) setChecking(field.id);
                            }}
                            aria-label={field.label}
                            aria-invalid={issue ? true : undefined}
                            autoCapitalize={field.id === 'pan_number' ? 'characters' : undefined}
                            inputMode={
                              field.id === 'mobile_registered' || field.id === 'addr_current_pin' ? 'numeric' : undefined
                            }
                            spellCheck={false}
                            value={raw}
                            placeholder={field.hint}
                            onChange={(event) => session.onChange(field.id as string, event.target.value)}
                            className={`mt-1 min-h-6 w-full bg-transparent font-semibold outline-none placeholder:font-normal placeholder:text-muted-foreground/60 ${
                              field.id === 'pan_number' ? 'uppercase ' : ''
                            }${filling ? 'fg-rise' : ''}`}
                          />
                        ) : (
                          <p className="mt-1 min-h-6 text-muted-foreground/60">{field.hint}</p>
                        )}
                        {open ? (
                          <div className="mt-1 flex items-center justify-between gap-2 text-[10px]">
                            <span className="text-muted-foreground">
                              {conf?.reason ? `Unsure: ${conf.reason}` : 'Unsure — edit above or confirm'}
                              {conf ? ` · ${Math.round(conf.confidence * 100)}%` : ''}
                            </span>
                            <button
                              type="button"
                              className="shrink-0 border border-primary px-2 py-0.5 font-bold uppercase text-primary hover:bg-primary hover:text-primary-foreground"
                              onClick={() => {
                                if (field.id) session.confirmField(field.id);
                                setChecking(null);
                              }}
                            >
                              ✓ Looks right
                            </button>
                          </div>
                        ) : null}
                        {issue ? <p className="mt-1 text-[10px] font-semibold text-destructive">{issue}</p> : null}
                        {heard ? (
                          <p className="mt-0.5 truncate text-[10px] italic text-muted-foreground">“{heard}”</p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
          <BankFields
            form={session.form}
            values={session.values}
            onChange={session.onChange}
            flashIds={session.flashIds}
            said={session.said}
            fieldSource={session.fieldSource}
          />
          {debit ? (
            <label className="flex cursor-pointer gap-3 border-2 border-foreground p-4">
              <input
                type="checkbox"
                className="mt-1 size-4 accent-primary"
                checked={session.values.card_old_blocked_ack === true}
                onChange={(event) => session.onChange('card_old_blocked_ack', event.target.checked)}
              />
              <span>
                <span className="block text-[10px] uppercase text-muted-foreground">Before read-back</span>
                <span className="mt-1 block text-sm font-semibold">{OLD_CARD_BLOCKED_ACK}</span>
              </span>
            </label>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-foreground pt-4">
            <button
              type="button"
              className={`${BTN_OUTLINE} ${BTN_MD}`}
              onClick={() => {
                if (listening) mic.cancel();
                session.onClear();
                setSaid('');
                setSaidIsSample(false);
                setMicNote(null);
                setTurns(0);
                setSampleStep(0);
                setPinned(null);
                setPreview(false);
              }}
            >
              <RotateIcon /> Clear draft
            </button>
            <div className="flex flex-col items-end gap-2">
              {formatLine ? (
                <p className="text-xs text-destructive">Fix the highlighted fields before review.</p>
              ) : null}
              <button
                type="button"
                className={`${BTN_PRIMARY} ${BTN_LG}`}
                disabled={!session.canReadback}
                onClick={() => go('/review')}
              >
                Review draft <ArrowRightIcon />
              </button>
            </div>
          </div>
        </div>
      </section>
      {preview ? (
        <FormPreview
          version={turns}
          title={label}
          subtitle={debit ? 'Debit card reissue request' : 'Customer information sheet — individual'}
          footnote={debit ? HELPLINE_COPY : null}
          fields={sheetFields}
          sections={sheetSections}
          values={session.values}
          flashIds={session.flashIds}
          onClose={() => setPreview(false)}
        />
      ) : null}
    </div>
  );
}

/** Export the existing paper sheet via the browser's print → Save as PDF (print CSS in app.css). */
function downloadSheetPdf() {
  const root = document.documentElement;
  const prevTitle = document.title;
  const stamp = new Date().toISOString().slice(0, 10);
  document.title = `FormGuide-draft-NOT-SUBMITTED-${stamp}`;
  root.classList.add('fg-printing');
  const done = () => {
    root.classList.remove('fg-printing');
    document.title = prevTitle;
    window.removeEventListener('afterprint', done);
    window.removeEventListener('pointerdown', done);
    window.removeEventListener('keydown', done);
  };
  window.addEventListener('afterprint', done);
  window.print();
  // Firefox/Safari return from print() while the dialog is still open, so no timer here.
  // iOS may never fire afterprint; the next interaction with the page means the dialog is gone.
  window.addEventListener('pointerdown', done);
  window.addEventListener('keydown', done);
}

function FormPreview({
  version,
  title,
  subtitle,
  footnote,
  fields,
  sections,
  values,
  flashIds,
  onClose,
}: {
  version: number;
  title: string;
  subtitle: string;
  footnote: string | null;
  fields: PreviewField[];
  sections: string[];
  values: Record<string, string | boolean | null | undefined>;
  flashIds: Set<string>;
  onClose: () => void;
}) {
  return (
    <div className="fg-print-host fixed inset-0 z-50">
      <button type="button" aria-label="Close form preview" className="absolute inset-0 bg-black/80" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="form-preview-title"
        className="absolute inset-y-0 right-0 h-full w-full overflow-y-auto border-l border-foreground bg-background shadow-lg sm:max-w-xl"
      >
        <div className="flex items-center justify-between gap-3 p-6 pb-4">
          <h2 id="form-preview-title" className="flex items-center gap-2 text-lg font-semibold">
            <FileTextIcon className="size-4" /> Form preview · version {version}
          </h2>
          <div className="flex items-center gap-2">
          <button
            type="button"
            className={`${BTN_OUTLINE} ${BTN_MD} border-2 border-foreground`}
            onClick={downloadSheetPdf}
          >
            <FileTextIcon /> Download PDF
          </button>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid size-8 place-items-center border border-foreground/30 hover:bg-foreground hover:text-background"
          >
            <span aria-hidden="true" className="text-lg leading-none">
              ×
            </span>
          </button>
          </div>
        </div>
        <div id="fg-print-sheet" className="relative mx-4 mb-6 border border-foreground bg-card p-5 font-mono text-[11px] text-card-foreground shadow-[4px_4px_0_var(--foreground)]">
          <div className="flex items-start justify-between border-b-2 border-foreground pb-3">
            <div>
              <p className="text-[9px] uppercase">Generic bank-style form · illustrative layout</p>
              <p className="mt-1 font-display text-2xl not-italic">{title}</p>
              <p className="text-[9px]">{subtitle}</p>
            </div>
            <div
              aria-hidden="true"
              className="grid size-16 place-items-center border border-dashed border-foreground text-center text-[8px]"
            >
              PHOTO
              <br />
              affix here
            </div>
          </div>
          <p className="mt-2 bg-saffron/25 px-2 py-1 text-[9px] font-bold">
            DRAFT · NOT SUBMITTED · Fields vary by bank
          </p>
          {sections.map((name, index) => {
            const rows = fields.filter((field) => field.section === name);
            return (
              <div key={name} className="mt-4">
                <p className="bg-foreground px-2 py-0.5 text-[10px] font-bold uppercase text-background">
                  {String.fromCharCode(65 + index)}. {name}
                </p>
                <div className="grid grid-cols-2 gap-x-3">
                  {rows.map((field) => {
                    const raw = fieldRaw(field, values);
                    const fresh = Boolean(field.id && flashIds.has(field.id));
                    const text = raw ? shownValue(field, raw).toUpperCase() : '';
                    return (
                      <div key={field.label} className="mt-2">
                        <p className="text-[8px] uppercase text-muted-foreground">
                          {field.label}
                          {field.required ? ' *' : ''}
                        </p>
                        <p
                          className={`min-h-5 border-b border-dotted border-foreground px-1 transition-colors duration-700 ${
                            fresh ? 'bg-saffron/40' : ''
                          }`}
                        >
                          {text}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {footnote ? <p className="mt-4 text-[10px]">{footnote}</p> : null}
          <div aria-hidden="true" className="fg-print-watermark">
            DRAFT · NOT SUBMITTED
          </div>
          <div className="mt-6 grid grid-cols-2 gap-4 text-[9px]">
            <div className="h-12 border-b border-foreground">Signature of applicant</div>
            <div className="h-12 border-b border-foreground">Date</div>
          </div>
        </div>
      </aside>
    </div>
  );
}
