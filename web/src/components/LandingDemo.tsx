import { useEffect, useState } from 'react';
import { CheckIcon, SparkleIcon } from '../ui/icons';

/**
 * Auto-playing landing demo: a sample Hindi utterance types out, each field fills the moment its phrase is
 * heard, FormGuide asks for the one thing missing, and the draft reaches 100%. Synthetic data only.
 */

interface DemoField {
  label: string;
  value: string;
}

interface Segment {
  text: string;
  field?: DemoField;
}

const TURN_ONE: Segment[] = [
  { text: 'मेरा नाम अनन्या राव है, ', field: { label: 'Name', value: 'Ananya Rao' } },
  { text: 'जन्म तारीख बारह मार्च 1994, ', field: { label: 'Date of birth', value: '12 Mar 1994' } },
  { text: 'मोबाइल 98765 43210, ', field: { label: 'Mobile', value: '98765 43210' } },
  { text: 'पिन कोड 560034', field: { label: 'PIN code', value: '560034' } },
];
const ASK = 'Got it. Which proof of identity will you use: Aadhaar or passport?';
const TURN_TWO: Segment[] = [{ text: 'आधार कार्ड', field: { label: 'Proof of identity', value: 'Aadhaar' } }];

export const DEMO_FIELDS: DemoField[] = [...TURN_ONE, ...TURN_TWO].flatMap((s) => (s.field ? [s.field] : []));

/** Split into what a reader sees as characters, so Devanagari never shows a dangling matra or half conjunct. */
function clusters(text: string): string[] {
  return text.match(/[^\p{M}](?:्[^\p{M}]|\p{M})*/gu) ?? [];
}

interface Turn {
  chars: string[];
  /** Cluster count at which each segment's field is filled. */
  fillAt: { field: DemoField; at: number; start: number }[];
}

function buildTurn(segments: Segment[]): Turn {
  const chars: string[] = [];
  const fillAt: Turn['fillAt'] = [];
  for (const seg of segments) {
    const start = chars.length;
    chars.push(...clusters(seg.text));
    if (seg.field) fillAt.push({ field: seg.field, at: chars.length, start });
  }
  return { chars, fillAt };
}

const ONE = buildTurn(TURN_ONE);
const TWO = buildTurn(TURN_TWO);
const ASK_CHARS = clusters(ASK);

const CHAR_MS = 48;
const ASK_CHAR_MS = 22;
const T_ONE = 500;
const T_ONE_END = T_ONE + ONE.chars.length * CHAR_MS;
const T_ASK = T_ONE_END + 700;
const T_ASK_END = T_ASK + ASK_CHARS.length * ASK_CHAR_MS;
const T_TWO = T_ASK_END + 600;
const T_TWO_END = T_TWO + TWO.chars.length * 70;
const T_DONE = T_TWO_END + 500;
const T_FADE = T_DONE + 3200;
export const DEMO_LOOP_MS = T_FADE + 500;

export type DemoPhase = 'listening' | 'thinking' | 'asking' | 'answering' | 'done';

export interface DemoFrame {
  phase: DemoPhase;
  /** What the person has said so far in the current turn. */
  heard: string;
  /** Indexes into `heard` of the phrase that filled the latest field, for highlighting. */
  highlight: [number, number] | null;
  ask: string;
  filled: number;
  /** Index of the field that just filled (drives the flash), or -1. */
  justFilled: number;
  fading: boolean;
}

function typed(turn: Turn, elapsed: number, perChar: number) {
  const n = Math.max(0, Math.min(turn.chars.length, Math.floor(elapsed / perChar)));
  const done = turn.fillAt.filter((f) => f.at <= n);
  const last = done[done.length - 1];
  const prefix = (count: number) => turn.chars.slice(0, count).join('').length;
  return {
    heard: turn.chars.slice(0, n).join(''),
    filled: done.length,
    highlight: last ? ([prefix(last.start), prefix(last.at)] as [number, number]) : null,
    lastAt: last ? last.at * perChar : -Infinity,
  };
}

/** The demo's state at `t` ms into the loop. Pure, so the timeline is testable without timers. */
export function demoFrame(t: number): DemoFrame {
  t = ((t % DEMO_LOOP_MS) + DEMO_LOOP_MS) % DEMO_LOOP_MS;
  const fading = t >= T_FADE;
  if (t < T_ASK) {
    const one = typed(ONE, t - T_ONE, CHAR_MS);
    return {
      phase: t < T_ONE_END ? 'listening' : 'thinking',
      heard: one.heard,
      highlight: one.highlight,
      ask: '',
      filled: one.filled,
      justFilled: t - T_ONE - one.lastAt < 450 ? one.filled - 1 : -1,
      fading,
    };
  }
  const askN = Math.min(ASK_CHARS.length, Math.floor((t - T_ASK) / ASK_CHAR_MS));
  const ask = ASK_CHARS.slice(0, askN).join('');
  if (t < T_TWO) {
    const heard = ONE.chars.join('');
    return { phase: 'asking', heard, highlight: null, ask, filled: ONE.fillAt.length, justFilled: -1, fading };
  }
  const two = typed(TWO, t - T_TWO, 70);
  const filled = ONE.fillAt.length + two.filled;
  return {
    phase: t < T_DONE ? 'answering' : 'done',
    heard: two.heard,
    highlight: two.highlight,
    ask,
    filled,
    justFilled: t - T_TWO - two.lastAt < 450 ? filled - 1 : -1,
    fading,
  };
}

const PHASE_LABEL: Record<DemoPhase, string> = {
  listening: 'Listening',
  thinking: 'Filling fields',
  asking: 'Asking what’s missing',
  answering: 'Listening',
  done: 'Draft ready',
};

const FINAL_FRAME = demoFrame(T_DONE + 100);

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
  );
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return reduced;
}

function useDemoClock(enabled: boolean) {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let last = performance.now();
    let elapsed = 0;
    const id = window.setInterval(() => {
      const now = performance.now();
      // Hold still while the tab is hidden instead of jumping ahead on return.
      if (!document.hidden) elapsed += Math.min(now - last, 1000);
      last = now;
      setT(elapsed);
    }, 40);
    return () => window.clearInterval(id);
  }, [enabled]);
  return t;
}

function Ring({ value }: { value: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative size-16 shrink-0">
      <svg viewBox="0 0 64 64" className="size-16 -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="5" className="stroke-background/15" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          strokeWidth="5"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - value)}
          className="stroke-primary transition-[stroke-dashoffset] duration-500 ease-out"
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-sm font-bold tabular-nums">
        {Math.round(value * 100)}%
      </span>
    </div>
  );
}

function MiniWave({ active }: { active: boolean }) {
  return (
    <span className="flex h-4 items-center gap-0.5" aria-hidden="true">
      {[6, 12, 9, 15, 7].map((h, i) => (
        <span
          key={i}
          className={`w-0.5 bg-primary ${active ? 'fg-wave' : ''}`}
          style={{ height: `${active ? h : 3}px`, animationDelay: `${i * 90}ms` }}
        />
      ))}
    </span>
  );
}

export function LandingDemo() {
  const reduced = usePrefersReducedMotion();
  const t = useDemoClock(!reduced);
  const f = reduced ? FINAL_FRAME : demoFrame(t);
  const speaking = f.phase === 'listening' || f.phase === 'answering';
  const [hs, he] = f.highlight ?? [0, 0];

  return (
    <div className="flex h-full min-h-72 flex-col gap-5">
      <p className="sr-only">
        Demo: a sample Hindi sentence fills name, date of birth, mobile and PIN code; FormGuide asks for proof of
        identity, the answer “Aadhaar” completes the draft.
      </p>
      <div
        aria-hidden="true"
        className={`flex flex-1 flex-col gap-5 transition-opacity duration-500 ${f.fading ? 'opacity-0' : 'opacity-100'}`}
      >
        <div className="flex items-center justify-between text-[10px] uppercase text-background/60">
          <span className="flex items-center gap-2">
            {f.phase === 'done' ? (
              <CheckIcon className="size-3 text-primary" />
            ) : (
              <span className={`size-2 rounded-full bg-primary ${speaking ? 'fg-blink' : ''}`} />
            )}
            {PHASE_LABEL[f.phase]}
          </span>
          <span>Sample voice · not live</span>
        </div>

        <div className="min-h-[5.5rem]">
          <p className="flex items-center gap-2 text-[10px] uppercase text-background/50">
            <MiniWave active={speaking} /> Heard
          </p>
          <p className="mt-1 font-display text-2xl leading-snug sm:text-3xl">
            {f.heard ? (
              <>
                “{f.heard.slice(0, hs)}
                <span className="text-primary underline decoration-primary/60 underline-offset-4">
                  {f.heard.slice(hs, he)}
                </span>
                {f.heard.slice(he)}
                {speaking ? <span className="fg-blink ml-0.5 inline-block w-[2px] bg-background">&nbsp;</span> : null}”
              </>
            ) : (
              <span className="text-background/30">…</span>
            )}
          </p>
        </div>

        <div className="border border-background/25">
          <div className="flex items-center gap-4 border-b border-background/25 px-4 py-3">
            <Ring value={f.filled / DEMO_FIELDS.length} />
            <div>
              <p className="text-[10px] uppercase text-background/50">KYC draft</p>
              <p className="text-sm font-semibold">
                {f.filled}/{DEMO_FIELDS.length} required filled
              </p>
            </div>
          </div>
          <ul className="divide-y divide-background/10">
            {DEMO_FIELDS.map((field, i) => {
              const on = i < f.filled;
              return (
                <li
                  key={field.label}
                  className={`flex items-center justify-between gap-3 px-4 py-1.5 text-xs transition-colors duration-500 ${
                    i === f.justFilled ? 'bg-primary/30' : ''
                  }`}
                >
                  <span className="text-background/55">{field.label}</span>
                  {on ? (
                    <span className="fg-in flex items-center gap-1.5 font-semibold">
                      {field.value}
                      <CheckIcon className="size-3 text-primary" />
                    </span>
                  ) : (
                    <span className="h-2 w-16 bg-background/10" />
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <div
          className={`border-2 border-primary bg-primary/15 p-3 transition-opacity duration-300 ${
            f.ask || f.phase === 'thinking' ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <p className="flex items-center gap-1 text-[10px] uppercase text-primary">
            <SparkleIcon className="size-3" /> FormGuide
          </p>
          <p className="mt-1 min-h-[2.5rem] text-sm">
            {f.phase === 'done'
              ? 'All set. I’ll read every detail back before you save the draft.'
              : f.ask || (
                  <span className="inline-flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <span key={i} className="fg-blink size-1.5 rounded-full bg-primary" style={{ animationDelay: `${i * 150}ms` }} />
                    ))}
                  </span>
                )}
          </p>
        </div>
      </div>
    </div>
  );
}
