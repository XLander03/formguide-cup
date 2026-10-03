import type { JourneyId } from '../lib/journeys';
import { useRoute } from '../routing/router';
import { useFormSession } from '../session/FormSession';
import { BTN_LG, BTN_MD, BTN_OUTLINE, BTN_PRIMARY } from '../ui/buttons';
import { ArrowRightIcon, CheckIcon, FileTextIcon, LanguagesIcon } from '../ui/icons';

const CHOICES: {
  label: string;
  journey: JourneyId;
  product: string | null;
  detail: string;
}[] = [
  { label: 'Regular savings', journey: 'account_opening', product: 'regular_savings', detail: 'Account opening draft' },
  { label: 'Salary account', journey: 'account_opening', product: 'salary_savings', detail: 'Account opening draft' },
  { label: 'Basic savings', journey: 'account_opening', product: 'bsbda', detail: 'Account opening draft' },
  { label: 'Individual current', journey: 'account_opening', product: 'individual_current', detail: 'Account opening draft' },
  { label: 'KYC update', journey: 'kyc_update', product: null, detail: 'Update identity and address details' },
  { label: 'Re-KYC', journey: 'rekyc', product: null, detail: 'Update identity and address details' },
];

const NEED = [
  'A mobile number you can access',
  'Your current address and PIN code',
  'One proof-of-identity document nearby',
];

export function JourneyPage() {
  const { go } = useRoute();
  const { language, journey, values, selectLanguage, selectDraft } = useFormSession();

  return (
    <div className="grid min-h-[calc(100vh-150px)] lg:grid-cols-12">
      <section className="border-b-2 border-foreground px-5 py-8 lg:col-span-5 lg:border-b-0 lg:border-r lg:px-8">
        <p className="text-[10px] uppercase text-primary">01 · Language and journey</p>
        <h1 className="mt-3 max-w-[10ch] font-display text-5xl leading-none sm:text-6xl">
          Tell us how you want to speak.
        </h1>
        <p className="mt-4 max-w-md text-sm text-muted-foreground">
          The mic listens in the language you choose. The draft is read back in that same language.
        </p>
        <div className="mt-8 grid grid-cols-2 gap-3">
          {(
            [
              ['en', 'English'],
              ['hi', 'हिन्दी'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`${language === id ? BTN_PRIMARY : BTN_OUTLINE} ${BTN_MD} h-16 justify-start`}
              onClick={() => selectLanguage(id)}
            >
              <LanguagesIcon /> {label}
            </button>
          ))}
        </div>
        <div className="mt-8 border-2 border-saffron bg-saffron/10 p-4">
          <p className="text-[10px] font-semibold uppercase text-saffron">Hindi number handling</p>
          <p className="mt-2 text-sm">
            Dates, cities, and numbers spoken as words are converted into reviewable fields — never silently
            submitted.
          </p>
        </div>
      </section>
      <section className="px-5 py-8 lg:col-span-7 lg:px-8">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[10px] uppercase text-primary">Choose a working journey</p>
            <h2 className="mt-2 font-display text-4xl">Which draft do you need?</h2>
          </div>
          <span className="hidden text-xs text-muted-foreground sm:block">Fields vary by bank.</span>
        </div>
        <div className="mt-6 grid gap-px border-2 border-foreground bg-foreground sm:grid-cols-2">
          {CHOICES.map((choice) => {
            const selected =
              journey === choice.journey &&
              (choice.product === null
                ? choice.journey !== 'account_opening'
                : values.account_product_intent === choice.product);
            return (
              <button
                key={choice.label}
                type="button"
                onClick={() => selectDraft(choice.journey, choice.product)}
                className={`min-h-20 bg-background p-4 text-left transition-colors ${
                  selected ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                }`}
              >
                <span className="flex items-center justify-between font-semibold">
                  {choice.label}
                  <span>{selected ? '✓' : '→'}</span>
                </span>
                <span className={`mt-1 block text-xs ${selected ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                  {choice.detail}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-8 border-t-2 border-foreground pt-5">
          <p className="flex items-center gap-2 text-[10px] uppercase text-primary">
            <FileTextIcon className="size-3" /> What you will need
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-3">
            {NEED.map((item) => (
              <li key={item} className="flex gap-2 border border-foreground/20 p-3 text-xs">
                <CheckIcon className="size-4 shrink-0 text-primary" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-7 flex items-center justify-between gap-4">
          <p className="max-w-sm text-xs text-muted-foreground">
            This is a fake guided demo. It does not connect to CKYC, DigiLocker, or any bank.
          </p>
          <button type="button" className={`${BTN_PRIMARY} ${BTN_LG}`} onClick={() => go('/speak')}>
            Continue to mic <ArrowRightIcon />
          </button>
        </div>
      </section>
    </div>
  );
}
