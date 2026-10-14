import { registeredJourneys } from '../journeys';
import { useRoute } from '../routing/router';
import { BTN_LG, BTN_PRIMARY } from '../ui/buttons';
import { ArrowRightIcon, LockIcon, MicIcon, SparkleIcon, Waveform } from '../ui/icons';

const JOURNEY_LINE = [
  'account opening',
  'KYC update',
  'Re-KYC',
  ...registeredJourneys().map((pack) => pack.title.toLowerCase()),
];

const STEPS = [
  ['Choose a journey', `Pick Hindi or English, then ${JOURNEY_LINE.join(', ')}.`],
  ['Speak. Fields fill.', 'About 45 fields stay grouped into identity, address, and proof of identity.'],
  ['Hear it back. Save draft.', 'Correct anything by voice, pass clear gates, and keep a receipt.'],
] as const;

const LATER = ['Nomination', 'Debit reissue', 'Personal loan', 'Fixed deposit', 'NEFT'].filter(
  (name) => !registeredJourneys().some((pack) => pack.hidesLater.includes(name)),
);

export function LandingPage() {
  const { go } = useRoute();
  return (
    <>
      <section className="grid min-h-[66vh] border-b-2 border-foreground lg:grid-cols-12">
        <div className="flex flex-col justify-center border-b-2 border-foreground px-5 py-12 sm:px-8 lg:col-span-7 lg:border-b-0 lg:border-r lg:px-12 lg:py-16">
          <p className="mb-4 text-[10px] font-semibold uppercase text-primary">A patient bank-form facilitator</p>
          <h1 className="max-w-[15ch] text-balance font-display text-5xl leading-[.94] sm:text-7xl lg:text-8xl">
            Say it once. Watch the form fill itself.
          </h1>
          <p className="mt-6 max-w-[52ch] text-base leading-relaxed text-foreground/65">
            Speak naturally in Hindi or English. FormGuide fills the draft, asks only what is missing, and reads
            every detail back before saving.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <button type="button" className={`${BTN_PRIMARY} ${BTN_LG}`} onClick={() => go('/journey')}>
              <MicIcon /> Start speaking <ArrowRightIcon />
            </button>
            <span className="text-xs text-muted-foreground">Fields vary by bank.</span>
          </div>
          <div className="mt-6 flex max-w-xl items-start gap-3 border-t border-foreground/20 pt-4 text-xs text-foreground/60">
            <LockIcon className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>Confirm saves a draft only. FormGuide cannot submit anything to a bank.</span>
          </div>
        </div>
        <div className="flex min-h-72 flex-col justify-between bg-foreground px-6 py-8 text-background lg:col-span-5 lg:px-10">
          <div className="flex items-center justify-between text-[10px] uppercase text-background/50">
            <span>Voice ready</span>
            <span>Hindi · English</span>
          </div>
          <div className="flex justify-center">
            <Waveform />
          </div>
          <p className="max-w-sm font-display text-3xl leading-tight">
            “मेरा नाम अनन्या राव है, जन्म तारीख बारह मार्च…”
          </p>
        </div>
      </section>
      <section className="grid border-b-2 border-foreground md:grid-cols-3">
        {STEPS.map(([title, body], index) => (
          <div
            key={title}
            className="border-b border-foreground/20 px-6 py-6 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0"
          >
            <span className="text-[10px] font-semibold text-primary">0{index + 1}</span>
            <h2 className="mt-2 font-display text-2xl">{title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{body}</p>
          </div>
        ))}
      </section>
      <section className="grid md:grid-cols-[1fr_1.4fr]">
        <div className="border-b border-foreground/20 px-6 py-6 md:border-b-0 md:border-r">
          <p className="text-[10px] uppercase text-muted-foreground">Working today</p>
          <p className="mt-2 font-display text-2xl">
            Account opening · KYC update · Re-KYC
            {registeredJourneys().map((pack) => ` · ${pack.title}`)}
          </p>
        </div>
        <div className="px-6 py-6">
          <p className="flex items-center gap-2 text-[10px] uppercase text-saffron">
            <SparkleIcon className="size-3" /> Later journeys
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {LATER.map((item) => (
              <span key={item} className="border border-foreground/25 px-3 py-1.5 text-xs text-muted-foreground">
                {item} · later
              </span>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
