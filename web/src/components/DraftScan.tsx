import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { runDraftChecks, type DraftCheck } from '../lib/draftChecks';
import type { FormValues } from '../lib/types';
import { CheckIcon, SparkleIcon } from '../ui/icons';

/** Time each check takes to appear on first open, so the customer can follow the pass. */
export const SCAN_STEP_MS = 420;

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/** Reveals `total` items one by one on mount; later changes show at once. */
function useReveal(total: number): number {
  const [shown, setShown] = useState(() => (reducedMotion() ? Number.POSITIVE_INFINITY : 0));
  useEffect(() => {
    if (shown >= total) return;
    const id = window.setTimeout(() => setShown((n) => n + 1), SCAN_STEP_MS);
    return () => window.clearTimeout(id);
  }, [shown, total]);
  return shown;
}

const LEVEL_STYLE: Record<DraftCheck['level'], string> = {
  pass: 'bg-primary text-primary-foreground',
  warn: 'bg-saffron text-foreground',
  note: 'bg-accent text-accent-foreground',
};

function Mark({ level }: { level: DraftCheck['level'] }) {
  return (
    <span className={`grid size-5 shrink-0 place-items-center text-[11px] font-bold ${LEVEL_STYLE[level]}`}>
      {level === 'pass' ? <CheckIcon className="size-3" /> : level === 'warn' ? '!' : 'i'}
    </span>
  );
}

/**
 * "Spot the problems" pass on Review: cross-field checks over the draft, revealed one by one, with
 * a scan line over the draft while they run. Warnings never block; the customer fixes or dismisses.
 */
export function DraftScan({
  values,
  onFix,
  children,
}: {
  values: FormValues;
  onFix: (field: string) => void;
  /** The draft being scanned; the scan line sweeps over it. */
  children: ReactNode;
}) {
  const checks = useMemo(() => runDraftChecks(values), [values]);
  const shown = useReveal(checks.length);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const scanning = shown < checks.length;
  const done = checks.slice(0, shown);
  const warns = done.filter((c) => c.level === 'warn' && !dismissed.has(c.id));
  const passed = done.filter((c) => c.level === 'pass').length;

  return (
    <>
      {checks.length > 0 ? (
        <section aria-label="Draft checks" className="mt-6 border-2 border-foreground">
          <header className="flex items-center justify-between gap-3 border-b-2 border-foreground bg-foreground px-4 py-2 text-background">
            <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide">
              <SparkleIcon className={`size-3.5 text-primary ${scanning ? 'fg-blink' : ''}`} />
              {scanning ? 'Checking your draft…' : 'Draft checked'}
            </p>
            <p role="status" aria-live="polite" className="text-[10px] uppercase text-background/70">
              {scanning
                ? `${shown}/${checks.length} checks`
                : `${passed} passed${warns.length ? ` · ${warns.length} worth a look` : ''}`}
            </p>
          </header>
          <ul className="divide-y divide-foreground/15">
            {checks.map((check, i) => {
              if (i > shown) return null;
              const running = i === shown;
              const gone = dismissed.has(check.id);
              return (
                <li key={check.id} className={`fg-in flex items-start gap-3 px-4 py-2.5 text-sm ${check.level === 'warn' && !running && !gone ? 'bg-saffron/10' : ''}`}>
                  {running ? (
                    <span className="mt-0.5 size-5 shrink-0 animate-spin rounded-full border-2 border-foreground/20 border-t-primary" />
                  ) : (
                    <span className="mt-0.5">
                      <Mark level={gone ? 'pass' : check.level} />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-[10px] font-semibold uppercase text-muted-foreground">{check.title}</span>
                    <span className={running ? 'text-muted-foreground' : ''}>
                      {running ? 'Checking…' : gone ? 'You confirmed this is right.' : check.detail}
                    </span>
                  </span>
                  {!running && !gone && check.level === 'warn' ? (
                    <span className="flex shrink-0 flex-col gap-1 sm:flex-row">
                      <button
                        type="button"
                        className="border-2 border-foreground px-2 py-0.5 text-[10px] font-bold uppercase hover:bg-foreground hover:text-background"
                        onClick={() => onFix(check.field)}
                      >
                        Fix it
                      </button>
                      <button
                        type="button"
                        className="border border-foreground/40 px-2 py-0.5 text-[10px] font-bold uppercase hover:border-primary hover:text-primary"
                        onClick={() => setDismissed((cur) => new Set(cur).add(check.id))}
                      >
                        It’s right
                      </button>
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <p className="border-t border-foreground/15 px-4 py-1.5 text-[10px] text-muted-foreground">
            Rule checks on this device. They never block your draft. Fields vary by bank.
          </p>
        </section>
      ) : null}
      <div className="relative mt-6">
        {scanning ? (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
            <div className="fg-scan absolute inset-x-0 h-16 border-b-2 border-primary bg-gradient-to-b from-transparent to-primary/15" />
          </div>
        ) : null}
        {children}
      </div>
    </>
  );
}
