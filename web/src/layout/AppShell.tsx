import type { ReactNode } from 'react';
import { BANK_VARIES_COPY } from '../lib/schema';
import { STEPS, useRoute, type RoutePath } from '../routing/router';
import { useFormSession } from '../session/FormSession';
import { Wordmark } from './Wordmark';

export function AppShell({ children }: { children: ReactNode }) {
  const { path, go } = useRoute();
  const { journey, language } = useFormSession();

  return (
    <div className="shell">
      <a className="skip" href="#content">
        Skip to content
      </a>
      <header className="shell-bar">
        <Wordmark onNavigate={() => go('/')} />
        <nav className="steps" aria-label="Form progress">
          <ol>
            {STEPS.map((step, index) => {
              const current = path === step.path;
              return (
                <li key={step.path} aria-current={current ? 'step' : undefined}>
                  <button
                    type="button"
                    className={current ? 'on' : ''}
                    title={step.title}
                    onClick={() => go(step.path)}
                  >
                    <span className="step-index">{String(index + 1).padStart(2, '0')}</span>
                    {step.label}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
        <div className="shell-meta">
          <span className="chip">aof_kyc_demo_v1</span>
          <span className="chip ok">No live bank submit</span>
        </div>
      </header>
      <p className="varies-bar">
        <strong>{BANK_VARIES_COPY}</strong>
        {journey && language ? (
          <span className="varies-context">
            {language === 'hi' ? 'हिन्दी' : 'English'}
            {' · '}
            {journey.replace(/_/g, ' ')}
          </span>
        ) : null}
      </p>
      <main id="content" className="shell-main">
        {children}
      </main>
    </div>
  );
}

export function NeedJourney({ children }: { children: ReactNode }) {
  const { readyForFill } = useFormSession();
  const { go } = useRoute();
  if (readyForFill) return children;
  return (
    <section className="page narrow gate-empty">
      <p className="eyebrow">Before we listen</p>
      <h1>Choose a language and a journey.</h1>
      <p className="lede">
        Speak and fill starts after Hindi or English, and one account-opening or KYC journey
        from the schema.
      </p>
      <button type="button" className="btn primary lg" onClick={() => go('/journey')}>
        Go to language and journey
      </button>
    </section>
  );
}

export function pageTitle(path: RoutePath): string {
  const step = STEPS.find((item) => item.path === path);
  if (!step || path === '/') return 'FormGuide Cup';
  return `${step.title} — FormGuide Cup`;
}
