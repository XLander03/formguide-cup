import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  COPILOT_MAX_HISTORY,
  COPILOT_MAX_MESSAGE,
  type CopilotAction,
  type CopilotRequest,
  type CopilotResponse,
  type CopilotTurn,
} from '../../../shared/forms/copilot';
import { BTN_MD, BTN_OUTLINE, BTN_PRIMARY } from '../ui/buttons';
import { badgeLabel } from './consoleFormat';
import { groupTitle } from './consoleGroups';

export const COPILOT_SUGGESTIONS = [
  "Which live forms don't capture mobile?",
  'What did customers struggle with today?',
  'Find duplicate drafts',
] as const;

const VERB: Record<CopilotAction['type'], string> = { retire: 'Retire', unpublish: 'Unpublish', publish: 'Publish' };

/** What confirming does, in the console's own words. */
export function actionEffect(action: CopilotAction): string {
  if (action.type === 'publish') return 'Customers can pick it from the journey list right away.';
  if (action.type === 'unpublish') return 'It leaves the customer list and goes back to draft.';
  return 'It leaves the customer list for good and can never be published again.';
}

export function actionTitle(action: CopilotAction): string {
  return `${VERB[action.type]} ${groupTitle(action.bankId, action.journey)} · ${badgeLabel(action.from).toLowerCase()}`;
}

const key = (action: CopilotAction) => `${action.formId}@${action.version}`;

/** "**bold**" inside one line, as React nodes (never HTML). */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? <strong key={index}>{part.slice(2, -2)}</strong> : part,
  );
}

/** Markdown-lite: paragraphs and "- " bullets with **bold**. Anything else shows as plain text. */
export function AnswerText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length === 0) return;
    const items = bullets;
    blocks.push(
      <ul key={`ul${blocks.length}`} className="ml-5 list-disc space-y-1">
        {items.map((item, index) => (
          <li key={index}>{inline(item)}</li>
        ))}
      </ul>,
    );
    bullets = [];
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    if (bullet) {
      bullets.push(bullet[1]);
      continue;
    }
    flush();
    if (line) blocks.push(<p key={`p${blocks.length}`}>{inline(line.replace(/^#+\s*/, ''))}</p>);
  }
  flush();
  return <div className="space-y-2 text-sm leading-relaxed">{blocks}</div>;
}

type Phase = { state: 'idle' } | { state: 'asking'; question: string } | { state: 'error'; question: string; message: string };

export function CopilotPanel({
  ask,
  execute,
  disabled,
  initialOpen = false,
  initialQuestion,
}: {
  ask: (request: CopilotRequest) => Promise<CopilotResponse>;
  /** Runs the confirmed actions through the console's own actions, then refreshes the list. */
  execute: (actions: CopilotAction[]) => Promise<void>;
  /** Another console action is running. */
  disabled?: boolean;
  initialOpen?: boolean;
  /** Asked once on mount (a shareable link to a question). */
  initialQuestion?: string;
}) {
  const [open, setOpen] = useState(initialOpen || Boolean(initialQuestion));
  const [draft, setDraft] = useState('');
  const [phase, setPhase] = useState<Phase>({ state: 'idle' });
  const [last, setLast] = useState<{ question: string; reply: CopilotResponse } | null>(null);
  const [history, setHistory] = useState<CopilotTurn[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const seq = useRef(0);
  const panelId = useId();
  const inputId = useId();
  const asked = useRef(false);

  async function submit(question: string) {
    const message = question.trim().slice(0, COPILOT_MAX_MESSAGE);
    if (!message) return;
    const mine = ++seq.current;
    setPhase({ state: 'asking', question: message });
    setDraft('');
    try {
      const reply = await ask({ message, history: history.slice(-COPILOT_MAX_HISTORY) });
      if (mine !== seq.current) return;
      setLast({ question: message, reply });
      setSelected(new Set(reply.proposedActions.map(key)));
      setHistory((current) =>
        [...current, { role: 'user' as const, text: message }, { role: 'model' as const, text: reply.answer }].slice(-COPILOT_MAX_HISTORY),
      );
      setPhase({ state: 'idle' });
    } catch (error) {
      if (mine !== seq.current) return;
      setPhase({ state: 'error', question: message, message: error instanceof Error ? error.message : 'That did not work.' });
    }
  }

  useEffect(() => {
    if (initialQuestion && !asked.current) {
      asked.current = true;
      void submit(initialQuestion);
    }
    // Only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void submit(draft);
  }

  const proposals = last?.reply.proposedActions ?? [];
  const chosen = proposals.filter((action) => selected.has(key(action)));
  const asking = phase.state === 'asking';

  async function confirm() {
    if (chosen.length === 0) return;
    setRunning(true);
    try {
      await execute(chosen);
    } finally {
      setRunning(false);
      setLast((current) => (current ? { ...current, reply: { ...current.reply, proposedActions: [] } } : current));
    }
  }

  function dismiss() {
    setLast((current) => (current ? { ...current, reply: { ...current.reply, proposedActions: [] } } : current));
  }

  return (
    <section aria-label="Ask about your forms" className="mt-6 border-2 border-foreground bg-card">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold">Ask about your forms</span>
          <span className="block text-xs text-muted-foreground">
            Gemini reads your forms and anonymous voice usage. It can suggest changes; you confirm them.
          </span>
        </span>
        <span aria-hidden="true" className="shrink-0 text-xs">
          {open ? '▴' : '▾'}
        </span>
      </button>

      {open ? (
        <div id={panelId} className="border-t-2 border-foreground px-4 pb-4 pt-3">
          <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row">
            <label htmlFor={inputId} className="sr-only">
              Question
            </label>
            <input
              id={inputId}
              type="text"
              value={draft}
              maxLength={COPILOT_MAX_MESSAGE}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="e.g. Which drafts are ready to publish?"
              className="h-10 min-w-0 flex-1 border-2 border-foreground bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <button type="submit" className={`${BTN_PRIMARY} ${BTN_MD}`} disabled={asking || !draft.trim()}>
              Ask
            </button>
          </form>
          <div role="group" aria-label="Suggested questions" className="mt-2 flex flex-wrap gap-2">
            {COPILOT_SUGGESTIONS.map((question) => (
              <button
                key={question}
                type="button"
                disabled={asking}
                onClick={() => void submit(question)}
                className="cursor-pointer border-2 border-foreground/30 bg-background px-2.5 py-1 text-xs font-semibold hover:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                {question}
              </button>
            ))}
          </div>

          {phase.state === 'asking' ? (
            <p role="status" className="mt-4 text-sm text-muted-foreground">
              Looking into “{phase.question}”…
            </p>
          ) : null}
          {phase.state === 'error' ? (
            <p role="alert" className="mt-4 text-sm text-destructive">
              Could not answer “{phase.question}”. {phase.message}
            </p>
          ) : null}

          {last && phase.state !== 'asking' ? (
            <div className="mt-4">
              <p className="text-xs font-semibold text-muted-foreground">{last.question}</p>
              <div className="mt-1" aria-live="polite">
                <AnswerText text={last.reply.answer} />
              </div>

              {proposals.length > 0 ? (
                <fieldset className="mt-4 border-2 border-primary p-3">
                  <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-primary">
                    Suggested changes · nothing has changed yet
                  </legend>
                  <ul className="grid gap-2">
                    {proposals.map((action) => {
                      const id = key(action);
                      return (
                        <li key={id}>
                          <label className="flex cursor-pointer items-start gap-2 text-sm">
                            <input
                              type="checkbox"
                              className="mt-1 size-4 accent-[var(--color-primary)]"
                              checked={selected.has(id)}
                              disabled={running}
                              onChange={(event) =>
                                setSelected((current) => {
                                  const next = new Set(current);
                                  if (event.target.checked) next.add(id);
                                  else next.delete(id);
                                  return next;
                                })
                              }
                            />
                            <span className="min-w-0">
                              <span className="block font-semibold">{actionTitle(action)}</span>
                              <span className="block text-xs text-muted-foreground">
                                {action.formId} {action.version} · {badgeLabel(action.from)} → {badgeLabel(action.to)}.{' '}
                                {actionEffect(action)}
                              </span>
                              <span className="block text-xs">Why: {action.reason}</span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={`${BTN_PRIMARY} ${BTN_MD}`}
                      disabled={running || disabled || chosen.length === 0}
                      onClick={() => void confirm()}
                    >
                      {running ? 'Working…' : `Confirm ${chosen.length} change${chosen.length === 1 ? '' : 's'}`}
                    </button>
                    <button type="button" className={`${BTN_OUTLINE} ${BTN_MD}`} disabled={running} onClick={dismiss}>
                      Dismiss
                    </button>
                  </div>
                </fieldset>
              ) : null}

              {last.reply.trace.length > 0 ? (
                <details className="mt-3 text-xs text-muted-foreground">
                  <summary className="cursor-pointer font-semibold">
                    How I got this ({last.reply.trace.length} step{last.reply.trace.length === 1 ? '' : 's'})
                  </summary>
                  <ol className="ml-5 mt-1 list-decimal space-y-0.5">
                    {last.reply.trace.map((step, index) => (
                      <li key={index}>
                        <code className="break-all font-mono">
                          {step.tool}({Object.keys(step.args).length ? JSON.stringify(step.args) : ''})
                        </code>{' '}
                        → {step.summary}
                      </li>
                    ))}
                  </ol>
                </details>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
