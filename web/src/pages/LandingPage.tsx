import { LandingDemo } from '../components/LandingDemo';
import { LANGUAGES } from '../lib/languages';
import { useRoute } from '../routing/router';
import { BTN_LG, BTN_OUTLINE, BTN_PRIMARY } from '../ui/buttons';
import {
  ArrowRightIcon,
  CheckIcon,
  CloseIcon,
  FileCheckIcon,
  LanguagesIcon,
  ListChecksIcon,
  LockIcon,
  MicIcon,
  SparkleIcon,
  UserCheckIcon,
  VolumeIcon,
} from '../ui/icons';

/** Languages that work but whose speech recognition is still less reliable. */
const PREVIEW_LANGUAGES = new Set(['ml', 'or', 'as', 'sd']);

const FACTS = [
  ['4', 'journeys today', 'Account opening, KYC update, Re-KYC, debit card reissue'],
  ['~45', 'fields, grouped', 'Identity, contact, address and proof of identity'],
  [String(LANGUAGES.length), 'Indian languages', 'Answer in yours, mix in English any time'],
  ['0', 'forms sent to a bank', 'Every result is a draft you check and keep'],
] as const;

const STEPS = [
  {
    icon: LanguagesIcon,
    title: 'Choose a language and a journey',
    body: `Pick from ${LANGUAGES.length} languages, including English and Hindi, then account opening, KYC update, Re-KYC or debit card reissue. FormGuide shows the bank's own form when one is published.`,
  },
  {
    icon: MicIcon,
    title: 'Speak. Fields fill.',
    body: 'Say several details in one go. About 45 fields stay grouped into identity, address and proof of identity, and FormGuide asks only for what is still missing.',
  },
  {
    icon: VolumeIcon,
    title: 'Hear it back. Save the draft.',
    body: 'Every detail is read back in your language. Correct anything by voice, confirm three clear checks, and keep a receipt and a filled PDF.',
  },
] as const;

const READY = [
  {
    journey: 'Account opening',
    items: [
      'Full name, exactly as on your ID',
      'Date of birth',
      '10-digit mobile number',
      'PAN card, or say you will fill Form 60 if you have none',
      'One ID proof and its number: Aadhaar, passport, driving licence, voter ID, NREGA job card or NPR letter',
      'Current address with its 6-digit PIN code',
      "Father's or spouse's full name, and your occupation",
    ],
  },
  {
    journey: 'KYC update or Re-KYC',
    items: [
      'Customer ID (CIF), if you have it: it is on your passbook or cheque book',
      'The ID proof you will show at the branch, and its number',
      'Your current address with PIN code, if it has changed',
      'Your registered mobile number',
    ],
  },
  {
    journey: 'Debit card reissue',
    items: [
      'Customer ID and the account number the card is linked to',
      'The last 4 digits of the card only',
      'What happened: lost, stolen, damaged or something else',
      'Block the old card with your bank first',
    ],
  },
] as const;

const NEVER = ['OTP', 'ATM or UPI PIN', 'CVV', 'Full card number', 'Passwords', 'Full Aadhaar number (only the last 4 digits are kept)'];

const WHY = [
  {
    icon: MicIcon,
    title: 'For people who would rather talk than type',
    body: 'Long bank forms in small English print stop many customers. FormGuide asks one plain question at a time, out loud, in their language.',
  },
  {
    icon: ListChecksIcon,
    title: 'Checks before it saves',
    body: 'Unclear answers are flagged for a second look, formats like PAN and PIN are checked, and nothing is saved until the customer hears it back and confirms.',
  },
  {
    icon: FileCheckIcon,
    title: "Fits each bank's own form",
    body: 'Banks upload their printed form once; FormGuide maps it and fills those exact boxes. Fields vary by bank, so it never invents a form of its own.',
  },
  {
    icon: UserCheckIcon,
    title: 'A clean handoff for staff',
    body: 'Each field comes with what the customer said and how sure FormGuide is, so branch staff know what to check instead of retyping everything.',
  },
] as const;

const LATER = ['Nomination', 'Personal loan', 'Fixed deposit', 'NEFT'];

function SectionLabel({ children }: { children: string }) {
  return <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">{children}</p>;
}

function Tick({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5 text-sm leading-relaxed">
      <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />
      <span>{children}</span>
    </li>
  );
}

export function LandingPage() {
  const { go } = useRoute();
  const start = () => go('/journey');
  return (
    <>
      <section className="grid min-h-[70vh] border-b-2 border-foreground lg:grid-cols-12">
        <div className="flex flex-col justify-center border-b-2 border-foreground px-5 py-12 sm:px-8 lg:col-span-7 lg:border-b-0 lg:border-r lg:px-12 lg:py-16">
          <SectionLabel>Voice-first bank forms for India</SectionLabel>
          <h1 className="mt-4 max-w-[15ch] text-balance font-display text-5xl leading-[.94] sm:text-7xl lg:text-8xl">
            Say it once. Watch the form fill itself.
          </h1>
          <p className="mt-6 max-w-[56ch] text-base leading-relaxed text-foreground/70 sm:text-lg">
            Speak naturally in English, Hindi or {LANGUAGES.length - 2} other Indian languages. FormGuide fills your
            bank form, asks only for what is missing, reads every detail back, and saves a draft you can take to the
            branch.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button type="button" className={`${BTN_PRIMARY} ${BTN_LG}`} onClick={start}>
              <MicIcon /> Start speaking <ArrowRightIcon />
            </button>
            <a href="#ready" className={`${BTN_OUTLINE} ${BTN_LG}`}>
              What to keep ready
            </a>
          </div>
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-foreground/70">
            <li className="flex items-center gap-2">
              <CheckIcon className="size-4 text-primary" /> About 5 minutes
            </li>
            <li className="flex items-center gap-2">
              <CheckIcon className="size-4 text-primary" /> No typing needed
            </li>
            <li className="flex items-center gap-2">
              <LockIcon className="size-4 text-primary" /> Nothing is sent to a bank
            </li>
          </ul>
        </div>
        <div className="bg-foreground px-6 py-8 text-background lg:col-span-5 lg:px-10">
          <LandingDemo />
        </div>
      </section>

      <section aria-label="FormGuide at a glance" className="grid border-b-2 border-foreground sm:grid-cols-2 lg:grid-cols-4">
        {FACTS.map(([value, label, detail]) => (
          <div
            key={label}
            className="border-b border-foreground/20 px-6 py-6 sm:odd:border-r lg:border-b-0 lg:border-r lg:last:border-r-0"
          >
            <p className="font-display text-5xl leading-none">{value}</p>
            <p className="mt-2 text-sm font-semibold">{label}</p>
            <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
          </div>
        ))}
      </section>

      <section id="how" className="scroll-mt-20 border-b-2 border-foreground px-5 py-14 sm:px-8 lg:px-12">
        <SectionLabel>How it works</SectionLabel>
        <h2 className="mt-3 max-w-[22ch] font-display text-4xl leading-tight sm:text-5xl">Three steps, all by voice.</h2>
        <ol className="mt-10 grid border-2 border-foreground md:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, body }, index) => (
            <li
              key={title}
              className="border-b border-foreground/20 p-6 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-primary">0{index + 1}</span>
                <Icon className="size-5 text-primary" />
              </div>
              <h3 className="mt-3 font-display text-2xl">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="ready" className="scroll-mt-20 border-b-2 border-foreground px-5 py-14 sm:px-8 lg:px-12">
        <SectionLabel>What you need</SectionLabel>
        <h2 className="mt-3 max-w-[24ch] font-display text-4xl leading-tight sm:text-5xl">Keep these ready before you start.</h2>
        <p className="mt-4 max-w-[60ch] text-base text-foreground/70">
          You only say the details. Have the documents in front of you so the numbers come out right, and keep the
          originals for the branch: the bank checks them when you visit.
        </p>
        <div className="mt-10 grid gap-px border-2 border-foreground bg-foreground lg:grid-cols-3">
          {READY.map(({ journey, items }) => (
            <div key={journey} className="bg-background p-6">
              <h3 className="font-display text-2xl">{journey}</h3>
              <ul className="mt-4 space-y-2.5">
                {items.map((item) => (
                  <Tick key={item}>{item}</Tick>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.3fr]">
          <div className="border-2 border-foreground p-6">
            <h3 className="font-display text-2xl">Before you speak</h3>
            <ul className="mt-4 space-y-2.5">
              <Tick>A quiet place and about five minutes</Tick>
              <Tick>Allow the microphone when your browser asks</Tick>
              <Tick>Say numbers digit by digit: "nine, eight, seven, six…"</Tick>
            </ul>
          </div>
          <div className="border-2 border-destructive/60 bg-destructive/5 p-6">
            <h3 className="font-display text-2xl">We will never ask for</h3>
            <ul className="mt-4 flex flex-wrap gap-2">
              {NEVER.map((item) => (
                <li
                  key={item}
                  className="flex items-center gap-1.5 border border-destructive/40 bg-background px-3 py-1.5 text-sm"
                >
                  <CloseIcon className="size-3.5 text-destructive" /> {item}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-foreground/70">If anyone asks you for these while using FormGuide, stop.</p>
          </div>
        </div>
      </section>

      <section id="languages" className="scroll-mt-20 border-b-2 border-foreground px-5 py-14 sm:px-8 lg:px-12">
        <SectionLabel>Languages</SectionLabel>
        <h2 className="mt-3 max-w-[24ch] font-display text-4xl leading-tight sm:text-5xl">
          Answer in your language. Hear it back in yours.
        </h2>
        <p className="mt-4 max-w-[60ch] text-base text-foreground/70">
          Choose your language on the first step. Questions and the read-back come in that language, and words like
          PAN, OTP and numbers can stay in English. The form itself is filled in English, as banks need.
        </p>
        <ul className="mt-8 flex flex-wrap gap-2">
          {LANGUAGES.map((lang) => (
            <li key={lang.id} className="flex items-baseline gap-2 border-2 border-foreground px-4 py-2">
              <span className="text-base font-semibold">{lang.pickerLabel}</span>
              {lang.pickerLabel !== lang.englishName ? (
                <span className="text-xs text-muted-foreground">{lang.englishName}</span>
              ) : null}
              {PREVIEW_LANGUAGES.has(lang.id) ? (
                <span className="text-[10px] font-semibold uppercase text-saffron">preview</span>
              ) : null}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-muted-foreground">
          Preview languages work, but speech recognition is less reliable for them today. Check those drafts closely.
        </p>
      </section>

      <section className="border-b-2 border-foreground px-5 py-14 sm:px-8 lg:px-12">
        <SectionLabel>Why FormGuide</SectionLabel>
        <h2 className="mt-3 max-w-[24ch] font-display text-4xl leading-tight sm:text-5xl">
          Built for customers who find forms hard, and the banks that serve them.
        </h2>
        <div className="mt-10 grid gap-px border-2 border-foreground bg-foreground sm:grid-cols-2 lg:grid-cols-4">
          {WHY.map(({ icon: Icon, title, body }) => (
            <div key={title} className="bg-background p-6">
              <Icon className="size-5 text-primary" />
              <h3 className="mt-3 font-display text-xl leading-snug">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-[1fr_1.4fr]">
          <div>
            <p className="text-[11px] font-semibold uppercase text-muted-foreground">Working today</p>
            <p className="mt-2 font-display text-2xl">Account opening · KYC update · Re-KYC · Debit card reissue</p>
          </div>
          <div>
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase text-saffron">
              <SparkleIcon className="size-3" /> Coming later
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {LATER.map((item) => (
                <span key={item} className="border border-foreground/25 px-3 py-1.5 text-xs text-muted-foreground">
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="trust" className="scroll-mt-20 grid lg:grid-cols-12">
        <div className="border-b-2 border-foreground px-5 py-14 sm:px-8 lg:col-span-7 lg:border-b-0 lg:border-r lg:px-12">
          <SectionLabel>Privacy and safety</SectionLabel>
          <h2 className="mt-3 max-w-[22ch] font-display text-4xl leading-tight sm:text-5xl">A draft, never a submission.</h2>
          <ul className="mt-8 space-y-4 text-base">
            <li className="flex gap-3">
              <LockIcon className="mt-1 size-5 shrink-0 text-primary" />
              <span>
                <strong>Nothing goes to a bank.</strong> FormGuide cannot submit anything. You keep the draft and take it
                to the branch.
              </span>
            </li>
            <li className="flex gap-3">
              <CheckIcon className="mt-1 size-5 shrink-0 text-primary" />
              <span>
                <strong>You confirm before anything is saved,</strong> after hearing every detail read back.
              </span>
            </li>
            <li className="flex gap-3">
              <CheckIcon className="mt-1 size-5 shrink-0 text-primary" />
              <span>
                <strong>Aadhaar stays masked:</strong> only the last 4 digits are ever kept, on screen or in the
                download.
              </span>
            </li>
            <li className="flex gap-3">
              <CheckIcon className="mt-1 size-5 shrink-0 text-primary" />
              <span>
                <strong>Your draft stays in this browser tab</strong> and is cleared when you close it.
              </span>
            </li>
          </ul>
        </div>
        <div className="flex flex-col justify-center bg-primary px-5 py-14 text-primary-foreground sm:px-8 lg:col-span-5 lg:px-12">
          <p className="font-display text-4xl leading-tight sm:text-5xl">Ready? It takes about five minutes.</p>
          <button
            type="button"
            className="mt-6 inline-flex h-12 w-fit items-center gap-2 border-2 border-background bg-background px-6 text-sm font-semibold text-foreground hover:bg-foreground hover:text-background"
            onClick={start}
          >
            <MicIcon className="size-4" /> Start speaking <ArrowRightIcon className="size-4" />
          </button>
          <p className="mt-4 text-sm text-primary-foreground/80">
            Fields vary by bank. Check the bank's own requirements before you visit.
          </p>
        </div>
      </section>
    </>
  );
}
