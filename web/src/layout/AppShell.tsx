import type { ReactNode } from 'react';
import { useRoute, type RoutePath } from '../routing/router';
import { useFormSession } from '../session/FormSession';
import { FileTextIcon, LockIcon } from '../ui/icons';

const STEPS: { to: RoutePath; number: string; label: string }[] = [
  { to: '/journey', number: '01', label: 'Language & journey' },
  { to: '/journey', number: '02', label: 'Preparation' },
  { to: '/speak', number: '03', label: 'Speak & fill' },
  { to: '/review', number: '04', label: 'Review' },
  { to: '/confirm', number: '05', label: 'Confirm draft' },
];

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
  const languageLabel = language === 'hi' ? 'हिन्दी' : 'English';

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex min-h-16 items-center justify-between border-b-2 border-foreground px-4 py-3 sm:px-6">
        <button
          type="button"
          className="flex items-center gap-3"
          aria-label="FormGuide home"
          onClick={() => go('/')}
        >
          <span className="grid size-9 place-items-center border-2 border-foreground bg-primary text-primary-foreground">
            <FileTextIcon className="size-4" />
          </span>
          <span className="font-display text-2xl leading-none">FormGuide</span>
          <span className="hidden text-[10px] uppercase text-muted-foreground sm:inline">
            voice drafting · draft only
          </span>
        </button>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="hidden border border-foreground/20 px-2 py-1 sm:inline">{languageLabel}</span>
          <span className="flex items-center gap-1 border border-saffron bg-saffron/10 px-2 py-1 font-semibold text-saffron">
            <LockIcon className="size-3" /> DRAFT ONLY
          </span>
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
      <main>{children}</main>
      <div className="flex flex-wrap justify-between gap-2 border-t-2 border-foreground bg-foreground px-4 py-3 text-[11px] text-background sm:px-6">
        <span>Fields vary by bank.</span>
        <span>Saved as a draft. Never submitted to a bank.</span>
        <span>No bank form IDs are generated.</span>
      </div>
    </div>
  );
}
