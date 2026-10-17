import { useEffect, useRef, useState } from 'react';
import { findCorrections, type Correction } from '../lib/corrections';
import { fieldLabel } from '../lib/schema';
import type { FormValues } from '../lib/types';
import { PencilIcon } from '../ui/icons';

/** How long a correction stays visible as a diff and a toast. */
export const CORRECTION_MS = 6000;

/** Recent spoken corrections, newest last, each kept for CORRECTION_MS. Keyed by field id. */
export function useVoiceCorrections(
  values: FormValues,
  fieldSource: Record<string, string>,
  said: Record<string, string>,
): Record<string, Correction> {
  const prev = useRef(values);
  const [recent, setRecent] = useState<Record<string, Correction>>({});
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  useEffect(() => {
    const found = findCorrections(prev.current, values, fieldSource, said);
    prev.current = values;
    if (found.length === 0) return;
    setRecent((cur) => ({ ...cur, ...Object.fromEntries(found.map((c) => [c.id, c])) }));
    // Not cleared on the next change: a second correction must not keep the first on screen forever.
    timers.current.push(
      window.setTimeout(() => {
        setRecent((cur) => {
          const next = { ...cur };
          for (const c of found) if (next[c.id]?.at === c.at) delete next[c.id];
          return next;
        });
      }, CORRECTION_MS),
    );
    // fieldSource and said change in the same batch as values; values is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values]);

  return recent;
}

/** Old value struck through, new value sliding in. */
export function CorrectionDiff({ correction, className = '' }: { correction: Correction; className?: string }) {
  return (
    <span className={`inline-flex min-w-0 flex-wrap items-center gap-1.5 ${className}`}>
      <span className="text-destructive/80 line-through decoration-2">{correction.from}</span>
      <span aria-hidden="true">→</span>
      <span className="fg-in font-semibold">{correction.to}</span>
    </span>
  );
}

/** Bottom toast for the latest spoken correction(s). */
export function CorrectionToast({
  corrections,
  label = fieldLabel,
}: {
  corrections: Record<string, Correction>;
  label?: (id: string) => string;
}) {
  const list = Object.values(corrections).sort((a, b) => a.at - b.at);
  if (list.length === 0) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-4 z-40 flex flex-col items-center gap-2 sm:inset-x-auto sm:right-6"
    >
      {list.slice(-3).map((c) => (
        <div
          key={`${c.id}-${c.at}`}
          className="fg-rise flex max-w-full items-center gap-3 border-2 border-foreground bg-background px-4 py-2 text-sm shadow-[4px_4px_0_var(--foreground)]"
        >
          <span className="grid size-6 shrink-0 place-items-center bg-primary text-primary-foreground">
            <PencilIcon className="size-3.5" />
          </span>
          <span className="min-w-0">
            <span className="block text-[10px] font-semibold uppercase text-primary">Corrected by voice</span>
            <span className="flex min-w-0 flex-wrap items-center gap-x-1.5">
              <span className="text-muted-foreground">{label(c.id)}:</span>
              <CorrectionDiff correction={c} />
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}
