import type { ReactNode } from 'react';
import { PlanProgress } from '../components/PlanProgress';
import { languageLabel } from '../lib/languages';
import { useRoute, type RoutePath } from '../routing/router';
import { useFormSession } from '../session/FormSession';
import { BTN_PRIMARY } from '../ui/buttons';
import { ArrowRightIcon, FileTextIcon, LanguagesIcon, UserCheckIcon } from '../ui/icons';

const STEPS: { to: RoutePath; number: string; label: string }[] = [
  { to: '/journey', number: '01', label: 'Language & journey' },
  { to: '/journey', number: '02', label: 'Preparation' },
  { to: '/speak', number: '03', label: 'Speak & fill' },
  { to: '/review', number: '04', label: 'Review' },
  { to: '/confirm', number: '05', label: 'Confirm draft' },
];

/** In-page sections of the landing page, linked from the header there. */
const LANDING_LINKS = [
  ['#how', 'How it works'],
  ['#ready', 'What you need'],
  ['#languages', 'Languages'],
  ['#trust', 'Privacy'],
] as const;

const TITLES: Record<RoutePath, string> = {
  '/': 'FormGuide — Speak your bank form',
  '/journey': 'Choose language and journey — FormGuide',
  '/speak': 'Speak and fill — FormGuide',
  '/review': 'Review and hear your draft — FormGuide',
  '/confirm': 'Save draft and receipt — FormGuide',
};

export function pageTitle(path: RoutePath): string {
  return TITLES[path];
}

export function AppShell({ children }: { children: ReactNode }) {
  const { path, go } = useRoute();
  const { language } = useFormSession();
  const stepIndex = path === '/' ? 0 : path === '/journey' ? 1 : path === '/speak' ? 2 : path === '/review' ? 3 : 4;
  const shellLanguage = languageLabel(language);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 flex min-h-16 items-center justify-between gap-4 border-b-2 border-foreground bg-background/95 px-4 py-3 backdrop-blur sm:px-6">
        <button
          type="button"
          className="flex shrink-0 items-center gap-3"
          aria-label="FormGuide home"
          onClick={() => go('/')}
        >
          <span className="grid size-9 place-items-center border-2 border-foreground bg-primary text-primary-foreground">
            <FileTextIcon className="size-4" />
          </span>
          <span className="font-display text-2xl leading-none">FormGuide</span>
        </button>
        {path === '/' ? (
          <nav aria-label="On this page" className="hidden items-center gap-6 text-sm text-foreground/70 lg:flex">
            {LANDING_LINKS.map(([href, label]) => (
              <a key={href} href={href} className="hover:text-foreground">
                {label}
              </a>
            ))}
          </nav>
        ) : null}
        <div className="flex items-center gap-2 text-sm">
          <span
            className="hidden items-center gap-1.5 border border-foreground/20 px-2.5 py-1.5 text-xs sm:flex"
            title="Language for questions and read-back"
          >
            <LanguagesIcon className="size-3.5" /> {shellLanguage}
          </span>
          {/* The admin console is a separate app chosen by URL at load, so this is a real page load. */}
          <a
            href="/admin"
            className="flex items-center gap-1.5 border border-foreground/30 px-3 py-1.5 text-xs font-semibold hover:border-foreground hover:bg-foreground hover:text-background"
          >
            <UserCheckIcon className="size-3.5" />
            <span>Admin login</span>
          </a>
          {path === '/' ? (
            <button type="button" className={`${BTN_PRIMARY} hidden h-9 px-4 text-xs sm:inline-flex`} onClick={() => go('/journey')}>
              Start <ArrowRightIcon />
            </button>
          ) : null}
        </div>
      </header>
      {path !== '/' && (
        <nav aria-label="Form progress" className="grid grid-cols-5 border-b-2 border-foreground">
          {STEPS.map((step, index) => {
            const className = `min-w-0 border-r border-foreground/15 px-2 py-2 text-center text-[10px] last:border-r-0 sm:px-4 sm:text-left sm:text-[11px] ${
              stepIndex === index
                ? 'bg-primary font-semibold text-primary-foreground'
                : index < stepIndex
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground'
            }`;
            return (
              <button
                key={`${step.number}-${index}`}
                type="button"
                className={className}
                onClick={() => go(step.to)}
              >
                <span className="block sm:inline">{step.number}</span>
                <span className="hidden sm:inline"> · </span>
                <span className="hidden md:inline">{step.label}</span>
              </button>
            );
          })}
        </nav>
      )}
      {path === '/speak' || path === '/review' || path === '/confirm' ? <PlanProgress /> : null}
      <main>{children}</main>
    </div>
  );
}
