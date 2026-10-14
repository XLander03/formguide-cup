import { useEffect, useState } from 'react';
import { SCHEMA, fieldLabel, getNextAsk, isFilled } from '../lib/schema';
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
  if (!field.id) return '';
  const raw = values[field.id];
  return typeof raw === 'string' ? raw : '';
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
      if (result.error === 'fields_bad_json') {
        setMicNote('Heard you, but could not fill the fields. Try again in shorter parts.');
      } else if (result.error) setMicNote(result.error);
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

  const requiredFields = FIELDS.filter((field) => field.required && field.id);
  const requiredFilled = requiredFields.filter((field) => field.id && isFilled(session.values[field.id])).length;
  // Derive ask-next from live session.missing / values — never fall back to FIELDS[0] when done.
  const askComplete =
    session.missing.length === 0 ||
    session.completeness === 'demo_ready' ||
    session.completeness === 'full_bank_packet';
  const asked =
    (!askComplete && FIELDS.find((field) => field.id && field.id === session.missing[0])) ||
    (!askComplete &&
      requiredFields.find((field) => field.id && !isFilled(session.values[field.id]))) ||
    null;
  const askNextLabel = askComplete
    ? session.language === 'hi'
      ? 'ज़रूरी जानकारी पूरी'
      : 'Required details complete'
    : asked?.label || (session.language === 'hi' ? 'अगला ज़रूरी फ़ील्ड' : 'Next required field');
  const askNextHint = askComplete
    ? session.language === 'hi'
      ? 'रीड-बैक के लिए तैयार · Fields vary by bank.'
      : 'Ready for read-back · Fields vary by bank.'
    : asked?.hint || '';
  const flagged = session.flaggedIds;
  const flagCount = flagged.length;
  const panelIds = new Set(FIELDS.map((field) => field.id).filter(Boolean) as string[]);
  const offPanelFlagged = flagged.filter((id) => !panelIds.has(id));
  const flagLine =
    flagCount > 0
      ? session.language === 'hi'
        ? `जाँचने के लिए ${flagCount} फ़ील्ड · रीड-बैक उसके बाद`
        : `${flagCount} field${flagCount === 1 ? '' : 's'} to check · read-back after`
      : null;
  const active = pinned ?? asked?.section ?? 'Identity';
  const started =
    turns > 0 ||
    Boolean(session.last) ||
    FIELDS.some((field) => field.id && isFilled(session.values[field.id]));
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

  const sectionStats = SECTIONS.map((name) => {
    const rows = FIELDS.filter((field) => field.section === name);
    const done = rows.filter((field) => field.id && isFilled(session.values[field.id])).length;
    return { name, total: rows.length, done };
  });

  return (
    <div className="grid min-h-[calc(100vh-150px)] lg:h-[calc(100vh-150px)] lg:grid-cols-12">
      <section className="flex flex-col border-b-2 border-foreground bg-foreground text-background lg:col-span-4 lg:border-b-0 lg:border-r-2">
        <div className="flex items-center justify-between border-b border-background/15 px-5 py-3 text-[10px] uppercase tracking-wide text-background/70">
          <span className="flex items-center gap-2">
            <span className={`size-2 bg-primary ${listening ? 'bg-saffron' : ''}`} />
            Voice companion · {session.language === 'hi' ? 'हिन्दी' : 'English'}
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
            <div className={`border p-3 ${askComplete && !flagLine ? 'border-primary' : 'border-saffron'}`}>
              <p className={`text-[10px] uppercase ${askComplete && !flagLine ? 'text-primary' : 'text-saffron'}`}>
                {askComplete
                  ? flagLine
                    ? 'Asks next · check flagged'
                    : 'Asks next · none missing'
                  : 'Asks next · missing required (one dump can fill many)'}
              </p>
              {session.readingBack ? (
                <div className="mt-1 flex items-center justify-between gap-2">
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
              ) : null}
              {session.readingBack ? null : askComplete && flagLine ? (
                <p className="mt-1 text-sm font-semibold">
                  {flagLine}
                  <span className="font-normal text-background/60">
                    {' '}
                    · {flagged.map((id) => FIELDS.find((f) => f.id === id)?.label ?? fieldLabel(id)).join(', ')}
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
                const text = SAMPLE_LINES[sampleStep % SAMPLE_LINES.length];
                setSampleStep((step) => step + 1);
                if (listening) mic.cancel();
                setSaid(text);
                setSaidIsSample(true);
                setMicNote(null);
                setTurns((count) => count + 1);
                void session.onSubmitUtterance(text);
              }}
            >
              Try a sample phrase ({(sampleStep % SAMPLE_LINES.length) + 1}/3)
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
                Fake prefill
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
              FAKE PREFILL DEMO · not CKYC or DigiLocker data
            </p>
          </div>
        </div>
      </section>

      <nav className="border-b-2 border-foreground px-4 py-4 lg:col-span-2 lg:border-b-0 lg:border-r-2 lg:overflow-y-auto">
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
              Fields vary by bank. Nothing is sent to a bank.
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
        <div className="fg-scroll min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5" style={{ maxHeight: 'calc(100vh - 230px)' }}>
          {SECTIONS.map((name, index) => {
            const stat = sectionStats[index];
            const rows = FIELDS.filter((field) => field.section === name);
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
                    const conf = field.id ? session.confidence[field.id] : undefined;
                    const open = isFlagged && checking === field.id;
                    const inputId = field.id ? `speak-field-${field.id}` : undefined;
                    const status = filling ? '● filling' : filled ? '✓ heard' : asking ? 'asking' : 'missing';
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
                            <span className={filled ? 'text-primary' : asking ? 'font-bold text-saffron' : 'text-muted-foreground'}>
                              {status}
                            </span>
                          )}
                        </div>
                        {field.id && options ? (
                          <select
                            id={inputId}
                            onFocus={() => {
                              if (isFlagged) setChecking(field.id);
                            }}
                            aria-label={field.label}
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
                        ) : field.id ? (
                          <input
                            id={inputId}
                            onFocus={() => {
                              if (isFlagged) setChecking(field.id);
                            }}
                            aria-label={field.label}
                            value={raw}
                            placeholder={field.hint}
                            onChange={(event) => session.onChange(field.id as string, event.target.value)}
                            className={`mt-1 min-h-6 w-full bg-transparent font-semibold outline-none placeholder:font-normal placeholder:text-muted-foreground/60 ${
                              filling ? 'fg-rise' : ''
                            }`}
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
      </section>
      {preview ? (
        <FormPreview
          version={turns}
          title={label}
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
  values,
  flashIds,
  onClose,
}: {
  version: number;
  title: string;
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
          <div>
            <h2 id="form-preview-title" className="flex items-center gap-2 text-lg font-semibold">
              <FileTextIcon className="size-4" /> Form preview · version {version}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Sample based on HDFC's public KYC form · Fields vary by bank
            </p>
          </div>
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
              <p className="text-[9px]">Customer information sheet — individual</p>
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
          {SECTIONS.map((name, index) => {
            const rows = FIELDS.filter((field) => field.section === name);
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
