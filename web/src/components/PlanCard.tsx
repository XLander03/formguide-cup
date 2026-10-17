import { useEffect, useRef } from 'react';
import type { PlanResponse } from '../lib/journeyPlan';
import { stepTitle, traceLabel } from '../lib/journeyPlan';
import { BTN_LG, BTN_PRIMARY } from '../ui/buttons';
import { ArrowRightIcon, SparkleIcon } from '../ui/icons';

/** "How I decided": the planner's tool calls, quiet and collapsed by default. */
function Trace({ trace }: { trace: PlanResponse['trace'] }) {
  if (trace.length === 0) return null;
  return (
    <details className="mt-4 text-xs">
      <summary className="cursor-pointer select-none text-muted-foreground hover:text-foreground">How I decided</summary>
      <ol aria-label="Planner steps" className="mt-2 space-y-1 border-l-2 border-primary/40 pl-3 text-muted-foreground">
        {trace.map((entry, index) => (
          <li key={index}>
            <span className="mr-1.5 font-mono text-[10px] text-primary">{entry.tool}</span>
            {traceLabel(entry)}
          </li>
        ))}
      </ol>
    </details>
  );
}

export function PlanCard({
  result,
  hindi,
  starting,
  onStart,
}: {
  result: PlanResponse;
  /** Show Hindi journey names beside the English ones. */
  hindi: boolean;
  starting: boolean;
  onStart: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  // On a phone the card lands below the mic; bring it into view. A no-op when already visible.
  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [result]);
  if (result.outcome !== 'planned') {
    return (
      <section ref={ref} aria-label="Your plan" className="mb-8 border-2 border-saffron bg-saffron/10 p-5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-saffron">Not covered here yet</p>
        {result.reply ? <p className="mt-2 text-sm leading-relaxed">{result.reply}</p> : null}
        {result.unsupported?.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {result.unsupported.map((item) => (
              <span key={item} className="border border-dashed border-foreground/30 px-3 py-1 text-xs text-muted-foreground">
                {item} · later
              </span>
            ))}
          </div>
        ) : null}
        <Trace trace={result.trace} />
      </section>
    );
  }

  const first = result.steps[0];
  const count = result.steps.length;
  return (
    <section ref={ref} aria-label="Your plan" className="mb-8 border-2 border-primary bg-primary/5 p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
          <SparkleIcon className="size-3.5" /> Your plan
        </p>
        <span className="text-[10px] uppercase text-muted-foreground">
          {count} form{count === 1 ? '' : 's'} · draft only
        </span>
      </div>
      <h2 className="mt-2 font-display text-3xl leading-none sm:text-4xl">
        {count === 1 ? 'One form for this.' : `${count} forms, in this order.`}
      </h2>
      {result.reply ? <p className="mt-3 max-w-xl text-sm leading-relaxed">{result.reply}</p> : null}
      <ol className="mt-4 grid gap-px border-2 border-foreground bg-foreground">
        {result.steps.map((step, index) => (
          <li key={step.journey} className="flex gap-3 bg-background p-3">
            <span
              className={`grid size-7 shrink-0 place-items-center text-xs font-bold ${
                index === 0 ? 'bg-primary text-primary-foreground' : 'bg-foreground text-background'
              }`}
            >
              {index + 1}
            </span>
            <span className="min-w-0">
              <span className="flex flex-wrap items-baseline gap-x-2 font-semibold">
                {stepTitle(step)}
                {hindi ? <span className="text-xs font-normal text-muted-foreground">{stepTitle(step, true)}</span> : null}
                {step.bankHint ? (
                  <span className="border border-primary px-1.5 text-[10px] font-semibold uppercase text-primary">
                    {step.bankHint}
                  </span>
                ) : null}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{step.reason}</span>
            </span>
          </li>
        ))}
      </ol>
      <Trace trace={result.trace} />
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" className={`${BTN_PRIMARY} ${BTN_LG}`} disabled={starting} onClick={onStart}>
          Start with step 1 · {stepTitle(first)} <ArrowRightIcon />
        </button>
        {count > 1 ? (
          <span className="max-w-xs text-xs text-muted-foreground">
            Your name, date of birth, mobile and address carry over. You only answer what is new.
          </span>
        ) : null}
      </div>
    </section>
  );
}
