import { useState } from 'react';
import { SCHEMA, getNextAsk, isFilled } from '../lib/schema';
import { HINDI_SAMPLE, MIXED_SAMPLE } from '../lib/utteranceLang';
import { useRoute } from '../routing/router';
import { useFormSession } from '../session/FormSession';
import { BTN_LG, BTN_MD, BTN_OUTLINE, BTN_PRIMARY } from '../ui/buttons';
import { draftChoiceLabel } from '../ui/fields';
import { ArrowRightIcon, MicIcon, RotateIcon, SparkleIcon, StopIcon } from '../ui/icons';

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
  { id: 'father_or_spouse_name', label: "Father's / spouse's name", hint: 'Full name', required: true, section: 'Identity' },
  { id: 'dob', label: 'Date of birth', hint: 'DD Month YYYY', required: true, section: 'Identity' },
  { id: 'gender', label: 'Gender', hint: 'Female / Male / Other', required: true, section: 'Identity', enumRef: 'gender' },
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


const DOT_LINE =
  'h-7 bg-[length:5px_1.5px] bg-[position:left_bottom] bg-repeat-x bg-[radial-gradient(circle,#808996_0.65px,transparent_0.8px)]';

function shownValue(field: PreviewField, raw: string): string {
  if (!raw || !field.enumRef) return raw;
  const options = SCHEMA.enums[field.enumRef] ?? [];
  return options.includes(raw) ? pretty(raw) : raw;
}

function commitField(
  field: PreviewField,
  text: string,
  onChange: (id: string, value: string) => void,
) {
  if (!field.id) return;
  if (!field.enumRef) {
    onChange(field.id, text);
    return;
  }
  const options = SCHEMA.enums[field.enumRef] ?? [];
  const norm = text.trim().toLowerCase().replace(/[_]+/g, ' ').replace(/\s+/g, ' ');
  const match = options.find(
    (option) => pretty(option).toLowerCase() === norm || option.toLowerCase().replace(/_/g, ' ') === norm,
  );
  onChange(field.id, match ?? text);
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
  const [listening, setListening] = useState(false);
  const [said, setSaid] = useState('');
  const [saidIsSample, setSaidIsSample] = useState(false);
  const [turns, setTurns] = useState(0);
  const [sampleStep, setSampleStep] = useState(0);
  const [pinned, setPinned] = useState<string | null>(null);

  const requiredFields = FIELDS.filter((field) => field.required && field.id);
  const requiredFilled = requiredFields.filter((field) => field.id && isFilled(session.values[field.id])).length;
  const asked =
    requiredFields.find((field) => field.id && !isFilled(session.values[field.id])) ?? FIELDS[0];
  const active = pinned ?? asked.section;
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
            onClick={() => setListening((on) => !on)}
            className="grid size-40 place-items-center rounded-full bg-primary text-primary-foreground"
          >
            {listening ? <StopIcon className="size-10" /> : <MicIcon className="size-12" />}
          </button>
          <div className="text-center">
            <p className="text-[11px] font-semibold uppercase tracking-wide">
              {listening ? 'Listening · local only · not a transcript' : 'Tap and speak your details'}
            </p>
            <GreenDots />
          </div>

          <div className="w-full space-y-3">
            <div className="border border-background/25 p-3">
              <p className="text-[10px] uppercase text-background/50">
                {said ? (saidIsSample ? 'You said · sample' : 'You said') : 'You said'}
              </p>
              <p className="sr-only">Not a live transcript</p>
              <p className="mt-1 font-display text-xl leading-snug">{said ? `“${said}”` : '—'}</p>
            </div>
            <div className="border-2 border-primary bg-primary/15 p-3">
              <p className="flex items-center gap-1 text-[10px] uppercase text-primary">
                <SparkleIcon className="size-3" /> FormGuide
              </p>
              <p className="mt-1 text-sm">{companion}</p>
            </div>
            <div className="border border-saffron p-3">
              <p className="text-[10px] uppercase text-saffron">Asks next · missing required</p>
              <p className="mt-1 text-sm font-semibold">
                {asked.label} <span className="font-normal text-background/60">· {asked.hint}</span>
              </p>
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
                setSaid(text);
                setSaidIsSample(true);
                setTurns((count) => count + 1);
                setListening(false);
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
                onClick={() => session.onPriya()}
              >
                Fake prefill
              </button>
              <button
                type="button"
                className={lightBtn}
                disabled={!session.canReadback || session.busy || session.speaking}
                onClick={() => void session.onReadback()}
              >
                Read back
              </button>
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

      <section className="min-h-0 overflow-y-auto bg-background lg:col-span-6">
        <div className="px-3 py-4 sm:px-4">
          <article className="border border-[#112239] bg-[#fcfaf4] px-4 py-4 text-[#112239] shadow-[4px_4px_0_0_#d5d1c7] sm:px-5 sm:py-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#4f5b6a]">
                  Generic bank-style form · illustrative layout
                </p>
                <h1 className="mt-2 font-display text-4xl leading-none">{label}</h1>
                <p className="mt-1 text-sm text-[#4f5b6a]">Customer information sheet — individual</p>
              </div>
              <div
                aria-hidden="true"
                className="grid size-[4.5rem] shrink-0 place-items-center border border-dashed border-[#112239] text-center leading-tight"
              >
                <span>
                  <span className="block text-[10px] font-semibold tracking-wide">PHOTO</span>
                  <span className="block text-[9px]">affix here</span>
                </span>
              </div>
            </div>
            <div className="mt-3 h-px bg-[#112239]" />
            <p className="mt-3 bg-[#f2ddbd] px-2 py-1.5 text-center text-[11px] font-semibold">
              DRAFT · NOT SUBMITTED · Fields vary by bank
            </p>
            <div className="mt-4 space-y-4">
              {SECTIONS.map((name, index) => {
                const rows = FIELDS.filter((field) => field.section === name);
                return (
                  <section key={name} id={`speak-section-${index}`} className="scroll-mt-2">
                    <h2 className="bg-[#112239] px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#fcfaf4]">
                      {String.fromCharCode(65 + index)}. {name}
                    </h2>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4 px-1 py-3">
                      {rows.map((field) => {
                        const asking = asked.label === field.label && Boolean(field.id);
                        const raw = field.id && typeof session.values[field.id] === 'string' ? session.values[field.id] : '';
                        const value = typeof raw === 'string' ? raw : '';
                        return (
                          <div key={field.label} className={asking ? 'bg-saffron/20 px-1' : 'px-1'}>
                            <p className="text-[10px] font-medium uppercase tracking-wide text-[#3d4c5f]">
                              {field.label}
                              {field.required ? ' *' : ''}
                            </p>
                            {field.id ? (
                              <input
                                aria-label={field.label}
                                autoComplete="off"
                                spellCheck={false}
                                value={shownValue(field, value)}
                                onChange={(event) => commitField(field, event.target.value, session.onChange)}
                                className={`mt-1 w-full border-0 bg-transparent px-0 text-[13px] uppercase leading-none text-[#112239] outline-none ${DOT_LINE}`}
                              />
                            ) : (
                              <div className={`mt-1 ${DOT_LINE}`} />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
            <div className="mt-6 grid grid-cols-2 gap-x-8 px-1 pb-1">
              <div>
                <p className="text-sm">Signature of applicant</p>
                <div className="mt-5 h-px bg-[#112239]" />
              </div>
              <div>
                <p className="text-sm">Date</p>
                <div className="mt-5 h-px bg-[#112239]" />
              </div>
            </div>
          </article>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              className={`${BTN_OUTLINE} ${BTN_MD}`}
              onClick={() => {
                session.onClear();
                setSaid('');
                setSaidIsSample(false);
                setTurns(0);
                setSampleStep(0);
                setPinned(null);
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
    </div>
  );
}
