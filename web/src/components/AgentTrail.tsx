import { useEffect, useState } from 'react';
import type { TrailStep } from '../lib/agentTrail';
import { CheckIcon, ChevronDownIcon } from '../ui/icons';

/** Gap between steps appearing after each turn. */
export const TRAIL_STEP_MS = 260;

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

const TONE: Record<TrailStep['tone'], string> = {
  ok: 'bg-primary text-primary-foreground',
  warn: 'bg-saffron text-foreground',
  info: 'bg-background/20 text-background',
};

/**
 * "How I got this": the steps behind FormGuide's last reply, under the companion bubble. Each new
 * turn replays them one by one (a spinner, then its mark). Collapsible.
 */
export function AgentTrail({ steps, turn }: { steps: TrailStep[]; turn: number }) {
  const [open, setOpen] = useState(true);
  const [shown, setShown] = useState(() => (reducedMotion() ? Number.POSITIVE_INFINITY : 0));

  useEffect(() => {
    if (!reducedMotion()) setShown(0);
  }, [turn]);

  useEffect(() => {
    if (shown >= steps.length) return;
    const id = window.setTimeout(() => setShown((n) => n + 1), TRAIL_STEP_MS);
    return () => window.clearTimeout(id);
  }, [shown, steps.length]);

  if (steps.length === 0) return null;
  const working = shown < steps.length;
  return (
    <div className="border-t border-primary/40 pt-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-[10px] uppercase text-background/60 hover:text-background"
      >
        <span>{working ? 'Thinking it through…' : `How I got this · ${steps.length} steps`}</span>
        <ChevronDownIcon className={`size-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? (
        <ol className="mt-1.5 space-y-1">
          {steps.map((step, i) => {
            if (i > shown) return null;
            const running = i === shown;
            return (
              <li key={`${turn}-${step.key}`} className="fg-in flex items-start gap-2 text-xs">
                {running ? (
                  <span className="mt-0.5 size-3.5 shrink-0 animate-spin rounded-full border-2 border-background/20 border-t-primary" />
                ) : (
                  <span className={`mt-0.5 grid size-3.5 shrink-0 place-items-center text-[9px] font-bold ${TONE[step.tone]}`}>
                    {step.tone === 'warn' ? '!' : step.tone === 'ok' ? <CheckIcon className="size-2.5" /> : '·'}
                  </span>
                )}
                <span className={running ? 'text-background/50' : 'text-background/85'}>{step.text}</span>
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}
