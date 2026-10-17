import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  COPILOT_MAX_HISTORY,
  COPILOT_MAX_MESSAGE,
  type CopilotAction,
  type CopilotRequest,
  type CopilotResponse,
  type CopilotTraceStep,
  type CopilotTurn,
} from '../../../shared/forms/copilot';
import { BTN, BTN_OUTLINE, BTN_PRIMARY } from '../ui/buttons';
import {
  AgentIcon,
  ChartIcon,
  CheckIcon,
  ChevronDownIcon,
  CloseIcon,
  CopyIcon,
  LightbulbIcon,
  ListChecksIcon,
  ListIcon,
  NewChatIcon,
  RotateIcon,
  SendIcon,
} from '../ui/icons';
import { badgeLabel } from './consoleFormat';
import { groupTitle } from './consoleGroups';

type Icon = ComponentType<{ className?: string }>;

/** Short links under the empty composer, each standing for a full question. */
export const COPILOT_SUGGESTIONS: readonly { label: string; question: string }[] = [
  { label: 'Forms missing mobile', question: "Which live forms don't capture mobile?" },
  { label: 'Where customers struggle', question: 'What did customers struggle with today?' },
  { label: 'Duplicate drafts', question: 'Find duplicate drafts' },
];

/** Example questions in the "How it works" sheet. */
export const COPILOT_EXAMPLES: readonly string[] = [
  ...COPILOT_SUGGESTIONS.map((item) => item.question),
  'Which drafts are ready to publish?',
];

/** The read-only tools the server gives Gemini, in friendly words. */
const TOOLS: Record<string, { verb: string; label: string; Icon: Icon }> = {
  list_forms: { verb: 'Listed forms', label: 'Forms', Icon: ListIcon },
  form_coverage: { verb: 'Checked field coverage', label: 'Field coverage', Icon: ListChecksIcon },
  usage_insights: { verb: 'Read anonymous voice usage', label: 'Voice usage', Icon: ChartIcon },
  find_duplicates: { verb: 'Looked for duplicates', label: 'Duplicates', Icon: CopyIcon },
  propose_actions: { verb: 'Drafted suggestions', label: 'Suggestions', Icon: LightbulbIcon },
};

export function toolVerb(tool: string): string {
  const known = TOOLS[tool];
  if (known) return known.verb;
  const words = tool.replace(/[_-]+/g, ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : 'Used a tool';
}

const VERB: Record<CopilotAction['type'], string> = { retire: 'Retire', unpublish: 'Unpublish', publish: 'Publish' };
const DONE_VERB: Record<CopilotAction['type'], string> = { retire: 'Retired', unpublish: 'Unpublished', publish: 'Published' };

export function actionTitle(action: CopilotAction): string {
  return `${VERB[action.type]} ${groupTitle(action.bankId, action.journey)} · ${badgeLabel(action.from).toLowerCase()}`;
}

/** "ICICI · Re-KYC · draft v1" */
export function actionForm(action: CopilotAction): string {
  return `${groupTitle(action.bankId, action.journey)} · ${badgeLabel(action.from).toLowerCase()} ${action.version}`;
}

/** "Retire · ICICI · Re-KYC draft v1 (form_icici_rekyc_b)" */
export function actionLine(action: CopilotAction): string {
  return `${VERB[action.type]} · ${groupTitle(action.bankId, action.journey)} ${badgeLabel(action.from).toLowerCase()} ${action.version} (${action.formId})`;
}

/** What running confirmed proposals did, item by item. */
export interface CopilotApplyResult {
  done: CopilotAction[];
  failed: { action: CopilotAction; error: string }[];
}

const NOUN: Record<CopilotAction['from'], [string, string]> = {
  draft: ['draft', 'drafts'],
  published: ['live form', 'live forms'],
  retired: ['retired form', 'retired forms'],
};

/** "Retired 2 drafts" (and "· Published 1 draft" when mixed). */
export function resultHeadline(done: readonly CopilotAction[]): string {
  const counts = new Map<string, { action: CopilotAction; count: number }>();
  for (const action of done) {
    const id = `${action.type}|${action.from}`;
    const entry = counts.get(id);
    if (entry) entry.count += 1;
    else counts.set(id, { action, count: 1 });
  }
  return [...counts.values()]
    .map(({ action, count }) => `${DONE_VERB[action.type]} ${count} ${NOUN[action.from][count === 1 ? 0 : 1]}`)
    .join(' · ');
}

/** Turns transport errors into something an admin can act on. */
export function friendlyError(message: string): string {
  if (/rate_limited|HTTP 429|too many/i.test(message)) {
    return 'Gemini is getting a lot of questions right now. Wait a few seconds, then try again.';
  }
  if (/copilot_unavailable|HTTP 50\d|bad response/i.test(message)) {
    return 'Gemini could not answer just now. That is usually brief, so try again.';
  }
  if (/failed to fetch|networkerror|network|load failed/i.test(message)) {
    return 'Could not reach the server. Check your connection, then try again.';
  }
  return message.replace(/\s*\([a-z_]+\)\s*$/, '').trim() || 'That did not work. Try again.';
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
      <ul key={`ul${blocks.length}`} className="ml-5 list-disc space-y-1 marker:text-primary">
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

type ProposalState =
  | { state: 'open'; selected: Set<string> }
  | { state: 'applying'; selected: Set<string> }
  | { state: 'applied'; result: CopilotApplyResult }
  | { state: 'dismissed' };

type Message =
  | { id: number; kind: 'user'; text: string }
  | { id: number; kind: 'assistant'; reply: CopilotResponse; proposals: ProposalState }
  | { id: number; kind: 'error'; question: string; text: string };

const OPEN_KEY = 'formguide.copilot.open';

function rememberedOpen(): boolean | null {
  try {
    const value = window.sessionStorage.getItem(OPEN_KEY);
    return value === null ? null : value === '1';
  } catch {
    return null;
  }
}

function remember(open: boolean) {
  try {
    window.sessionStorage.setItem(OPEN_KEY, open ? '1' : '0');
  } catch {
    // Private mode: the default is fine.
  }
}

function initiallyOpen(initialOpen: boolean | undefined, initialQuestion: string | undefined): boolean {
  if (initialQuestion) return true;
  if (initialOpen !== undefined) return initialOpen;
  if (typeof window === 'undefined') return false;
  const remembered = rememberedOpen();
  if (remembered !== null) return remembered;
  // Open on desktop when there is no conversation yet; phones start folded.
  return typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 768px)').matches;
}

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';
const QUIET = `cursor-pointer text-sm font-semibold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline ${FOCUS}`;

export function CopilotPanel({
  ask,
  execute,
  disabled,
  initialOpen,
  initialQuestion,
}: {
  ask: (request: CopilotRequest) => Promise<CopilotResponse>;
  /** Runs the confirmed actions through the console's own actions, then refreshes the list. */
  execute: (actions: CopilotAction[]) => Promise<CopilotApplyResult | void>;
  /** Another console action is running. */
  disabled?: boolean;
  /** Overrides the default (open on desktop, remembered per session). */
  initialOpen?: boolean;
  /** Asked once on mount (a shareable link to a question). */
  initialQuestion?: string;
}) {
  const [open, setOpen] = useState(() => initiallyOpen(initialOpen, initialQuestion));
  const [guide, setGuide] = useState(false);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [thinking, setThinking] = useState<string | null>(null);
  const [history, setHistory] = useState<CopilotTurn[]>([]);
  const seq = useRef(0);
  const nextId = useRef(0);
  const asked = useRef(false);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const guideButton = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const inputId = useId();

  function toggle() {
    setOpen((value) => {
      remember(!value);
      return !value;
    });
  }

  async function submit(question: string) {
    const message = question.trim().slice(0, COPILOT_MAX_MESSAGE);
    if (!message || thinking) return;
    const mine = ++seq.current;
    setMessages((current) => [...current, { id: ++nextId.current, kind: 'user', text: message }]);
    setThinking(message);
    setDraft('');
    try {
      const reply = await ask({ message, history: history.slice(-COPILOT_MAX_HISTORY) });
      if (mine !== seq.current) return;
      setMessages((current) => [
        ...current,
        {
          id: ++nextId.current,
          kind: 'assistant',
          reply,
          proposals: { state: 'open', selected: new Set(reply.proposedActions.map(key)) },
        },
      ]);
      setHistory((current) =>
        [...current, { role: 'user' as const, text: message }, { role: 'model' as const, text: reply.answer }].slice(-COPILOT_MAX_HISTORY),
      );
    } catch (error) {
      if (mine !== seq.current) return;
      const text = friendlyError(error instanceof Error ? error.message : '');
      setMessages((current) => [...current, { id: ++nextId.current, kind: 'error', question: message, text }]);
    } finally {
      if (mine === seq.current) setThinking(null);
    }
  }

  /** Asks the failed question again, replacing the error row and its question bubble. */
  function retry(errorId: number, question: string) {
    setMessages((current) => {
      const index = current.findIndex((item) => item.id === errorId);
      if (index < 0) return current;
      const before = current[index - 1];
      const start = before?.kind === 'user' && before.text === question ? index - 1 : index;
      return [...current.slice(0, start), ...current.slice(index + 1)];
    });
    void submit(question);
  }

  function clear() {
    seq.current += 1;
    setMessages([]);
    setHistory([]);
    setThinking(null);
    setDraft('');
    inputRef.current?.focus();
  }

  function closeGuide() {
    setGuide(false);
    guideButton.current?.focus();
  }

  /** An example from the sheet: close it, open the panel and ask. */
  function askFromGuide(question: string) {
    closeGuide();
    if (!open) {
      remember(true);
      setOpen(true);
    }
    void submit(question);
  }

  useEffect(() => {
    if (initialQuestion && !asked.current) {
      asked.current = true;
      void submit(initialQuestion);
    }
    // Only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the newest turn in view inside the thread: while thinking, the bottom; once the
  // reply lands, the question it answers, so the answer reads top-down.
  useEffect(() => {
    const log = logRef.current;
    if (!log) return;
    const questions = log.querySelectorAll<HTMLElement>('[data-turn="user"]');
    const question = questions[questions.length - 1];
    log.scrollTop = thinking || !question ? log.scrollHeight : question.offsetTop - 8;
  }, [messages, thinking]);

  const empty = messages.length === 0 && !thinking;

  // The composer grows with its text, up to three lines.
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = 'auto';
    if (input.scrollHeight > 0) input.style.height = `${Math.min(input.scrollHeight, 96)}px`;
  }, [draft, open, empty]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void submit(draft);
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit(draft);
    }
  }

  function updateProposals(id: number, next: (current: ProposalState) => ProposalState) {
    setMessages((current) =>
      current.map((item) => (item.id === id && item.kind === 'assistant' ? { ...item, proposals: next(item.proposals) } : item)),
    );
  }

  async function apply(id: number, actions: CopilotAction[]) {
    if (actions.length === 0) return;
    updateProposals(id, (current) => (current.state === 'open' ? { state: 'applying', selected: current.selected } : current));
    let result: CopilotApplyResult;
    try {
      result = (await execute(actions)) ?? { done: actions, failed: [] };
    } catch (error) {
      const text = error instanceof Error ? error.message : 'That did not work.';
      result = { done: [], failed: actions.map((action) => ({ action, error: text })) };
    }
    updateProposals(id, () => ({ state: 'applied', result }));
  }

  const composer = (
    <form onSubmit={onSubmit} className={empty ? '' : 'border-t-2 border-foreground/15 px-3 py-3 sm:px-5'}>
      <label htmlFor={inputId} className="sr-only">
        Question
      </label>
      <div className="flex items-end gap-2">
        <textarea
          ref={inputRef}
          id={inputId}
          rows={1}
          value={draft}
          maxLength={COPILOT_MAX_MESSAGE}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={empty ? 'Ask about your forms…' : 'Ask a follow-up…'}
          className={`block min-w-0 flex-1 resize-none border-2 border-foreground bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            empty ? 'min-h-12 px-4 py-3 text-base leading-6' : 'min-h-10 px-3 py-2 text-sm leading-5'
          }`}
        />
        <button
          type="submit"
          aria-label="Send"
          className={`${BTN_PRIMARY} shrink-0 ${empty ? 'h-12 px-5 text-sm' : 'h-10 w-10 px-0 sm:w-auto sm:px-4 text-sm'}`}
          disabled={Boolean(thinking) || !draft.trim()}
        >
          <SendIcon />
          <span className={empty ? '' : 'hidden sm:inline'} aria-hidden="true">
            Send
          </span>
        </button>
      </div>
    </form>
  );

  return (
    <section aria-label="Ask about your forms" className="mt-6 border-2 border-foreground bg-card shadow-[4px_4px_0_0_var(--color-foreground)]">
      <div className="flex items-center gap-1 px-3 py-2.5 sm:gap-2 sm:px-5">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={toggle}
          className={`flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left ${FOCUS}`}
        >
          <Avatar />
          <span className="min-w-0 font-display text-xl leading-none">Forms copilot</span>
        </button>
        {open && !empty ? (
          <button type="button" onClick={clear} aria-label="New conversation" className={`${QUIET} inline-flex items-center gap-1.5 px-2 py-1.5`}>
            <NewChatIcon className="size-4" />
            <span className="hidden sm:inline">New conversation</span>
          </button>
        ) : null}
        <button ref={guideButton} type="button" onClick={() => setGuide(true)} className={`${QUIET} whitespace-nowrap px-2 py-1.5`}>
          How it works
        </button>
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={toggle}
          className="grid size-9 shrink-0 cursor-pointer place-items-center text-muted-foreground hover:text-foreground"
        >
          <ChevronDownIcon className={`size-5 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {open ? (
        <div id={panelId} className="border-t-2 border-foreground">
          <div
            ref={logRef}
            role="log"
            aria-live="polite"
            aria-label="Conversation with the forms copilot"
            className={empty ? '' : 'relative space-y-4 px-3 py-4 sm:max-h-[min(75vh,46rem)] sm:overflow-y-auto sm:px-5'}
          >
            {messages.map((item) => {
              if (item.kind === 'user') return <UserBubble key={item.id} text={item.text} />;
              if (item.kind === 'error') {
                return (
                  <AssistantRow key={item.id} tone="error">
                    <div className="border-2 border-destructive/60 bg-background px-3 py-2.5 text-sm">
                      <p className="font-semibold text-destructive">I could not answer that.</p>
                      <p className="mt-1">{item.text}</p>
                      <button
                        type="button"
                        className={`${BTN_OUTLINE} mt-2 h-8 px-3 text-xs`}
                        disabled={Boolean(thinking)}
                        onClick={() => retry(item.id, item.question)}
                      >
                        <RotateIcon />
                        Try again
                      </button>
                    </div>
                  </AssistantRow>
                );
              }
              return (
                <AssistantRow key={item.id} trace={item.reply.trace}>
                  <div className="border-2 border-foreground bg-background px-3 py-2.5">
                    <AnswerText text={item.reply.answer} />
                  </div>
                  {item.reply.proposedActions.length > 0 ? (
                    <Proposals
                      actions={item.reply.proposedActions}
                      state={item.proposals}
                      blocked={Boolean(disabled)}
                      onToggle={(id, checked) =>
                        updateProposals(item.id, (current) => {
                          if (current.state !== 'open') return current;
                          const selected = new Set(current.selected);
                          if (checked) selected.add(id);
                          else selected.delete(id);
                          return { state: 'open', selected };
                        })
                      }
                      onApply={(actions) => void apply(item.id, actions)}
                      onDismiss={() => updateProposals(item.id, () => ({ state: 'dismissed' }))}
                    />
                  ) : null}
                </AssistantRow>
              );
            })}
            {thinking ? <Thinking /> : null}
          </div>

          {empty ? (
            <div className="mx-auto max-w-3xl px-3 py-6 sm:px-5 sm:py-8">
              {composer}
              <div role="group" aria-label="Suggested questions" className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1.5 text-sm">
                <span className="text-muted-foreground">Try:</span>
                {COPILOT_SUGGESTIONS.map(({ label, question }) => (
                  <button
                    key={label}
                    type="button"
                    title={question}
                    onClick={() => void submit(question)}
                    className={`cursor-pointer font-semibold text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary ${FOCUS}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            composer
          )}
        </div>
      ) : null}

      {guide ? <HowItWorks onClose={closeGuide} onAsk={askFromGuide} /> : null}
    </section>
  );
}

function Avatar({ tone = 'ok', busy = false }: { tone?: 'ok' | 'error'; busy?: boolean }) {
  const color = tone === 'error' ? 'border-destructive bg-destructive text-primary-foreground' : 'border-foreground bg-primary text-primary-foreground';
  return (
    <span aria-hidden="true" className={`grid size-8 shrink-0 place-items-center border-2 ${color}`}>
      <AgentIcon className={`size-4 ${busy ? 'fg-blink' : ''}`} />
    </span>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div data-turn="user" className="fg-in flex justify-end">
      <div className="max-w-[85%] sm:max-w-[70%]">
        <p className="sr-only">You asked:</p>
        <p className="whitespace-pre-wrap break-words border-2 border-foreground bg-foreground px-3 py-2 text-sm text-background">{text}</p>
      </div>
    </div>
  );
}

function AssistantRow({
  children,
  tone = 'ok',
  trace = [],
}: {
  children: ReactNode;
  tone?: 'ok' | 'error';
  trace?: readonly CopilotTraceStep[];
}) {
  return (
    <div className="fg-in flex items-start gap-2.5 sm:gap-3">
      <Avatar tone={tone} />
      <div className="min-w-0 max-w-3xl flex-1 space-y-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Forms copilot</p>
          {trace.length > 0 ? <Trace trace={trace} /> : null}
        </div>
        {children}
      </div>
    </div>
  );
}

function Thinking() {
  return (
    <div role="status" className="fg-in flex items-start gap-2.5 sm:gap-3">
      <Avatar busy />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Forms copilot</p>
        <p className="mt-1 text-sm">
          <span className="font-semibold">
            Thinking
            <span aria-hidden="true">
              {[0, 1, 2].map((dot) => (
                <span key={dot} className="fg-blink inline-block" style={{ animationDelay: `${dot * 160}ms` }}>
                  .
                </span>
              ))}
            </span>
          </span>{' '}
          <span className="text-muted-foreground">Looking at your forms…</span>
        </p>
      </div>
    </div>
  );
}

/** What the agent looked up: one quiet line that opens to a step per tool call. */
function Trace({ trace }: { trace: readonly CopilotTraceStep[] }) {
  const [shown, setShown] = useState(false);
  const listId = useId();
  return (
    <div className="mt-0.5">
      <button
        type="button"
        aria-expanded={shown}
        aria-controls={listId}
        onClick={() => setShown((value) => !value)}
        className={`inline-flex cursor-pointer items-center gap-1 text-xs text-muted-foreground hover:text-foreground ${FOCUS}`}
      >
        Checked {trace.length} thing{trace.length === 1 ? '' : 's'}
        <ChevronDownIcon className={`size-3.5 transition-transform motion-reduce:transition-none ${shown ? '' : '-rotate-90'}`} />
      </button>
      {shown ? (
        <ol id={listId} aria-label="Steps the copilot took" className="mt-1.5 space-y-1 border-l-2 border-primary/30 pl-3">
          {trace.map((step, index) => {
            const Tool = TOOLS[step.tool]?.Icon ?? AgentIcon;
            return (
              <li key={index} className="flex items-start gap-2 text-xs leading-5">
                <Tool className="mt-0.5 size-3.5 shrink-0 text-primary" />
                <span className="min-w-0">
                  <span className="font-semibold">{toolVerb(step.tool)}</span>
                  {step.summary ? <span className="text-muted-foreground"> · {step.summary}</span> : null}
                </span>
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}

function Proposals({
  actions,
  state,
  blocked,
  onToggle,
  onApply,
  onDismiss,
}: {
  actions: readonly CopilotAction[];
  state: ProposalState;
  blocked: boolean;
  onToggle: (id: string, checked: boolean) => void;
  onApply: (actions: CopilotAction[]) => void;
  onDismiss: () => void;
}) {
  const headingId = useId();

  if (state.state === 'dismissed') {
    return <p className="text-xs text-muted-foreground">Suggestions dismissed. Nothing changed.</p>;
  }

  if (state.state === 'applied') {
    const { done, failed } = state.result;
    return (
      <div className="space-y-1.5">
        {done.length > 0 ? (
          <div className="border-2 border-primary bg-primary/10 px-3 py-2.5">
            <p className="flex items-center gap-2 text-sm font-semibold text-primary">
              <span aria-hidden="true" className="grid size-5 shrink-0 place-items-center bg-primary text-primary-foreground">
                <CheckIcon className="size-3.5" />
              </span>
              {resultHeadline(done)}
            </p>
            <ul className="mt-1 space-y-0.5 pl-7 text-xs">
              {done.map((action) => (
                <li key={key(action)} className="break-words">
                  {actionForm(action)} → {badgeLabel(action.to)}{' '}
                  <span className="break-all font-mono text-[11px] text-muted-foreground">{action.formId}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {failed.length > 0 ? (
          <div role="alert" className="border-2 border-destructive/60 bg-background px-3 py-2.5">
            <p className="text-sm font-semibold text-destructive">
              {failed.length === 1 ? 'One change did not go through' : `${failed.length} changes did not go through`}
            </p>
            <ul className="mt-1 space-y-0.5 text-xs">
              {failed.map(({ action, error }) => (
                <li key={key(action)}>
                  <span className="font-semibold">
                    {VERB[action.type]} {actionForm(action)}:
                  </span>{' '}
                  {error}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    );
  }

  const applying = state.state === 'applying';
  const chosen = actions.filter((action) => state.selected.has(key(action)));

  return (
    <section aria-labelledby={headingId} className="border-2 border-saffron bg-accent/15 px-3 py-2.5">
      <h3 id={headingId} className="text-sm font-semibold">
        Suggested changes <span className="font-normal text-muted-foreground">— nothing happens until you apply</span>
      </h3>
      <ul className="mt-2 space-y-2">
        {actions.map((action) => {
          const id = key(action);
          return (
            <li key={id}>
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 shrink-0 cursor-pointer accent-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  checked={state.selected.has(id)}
                  disabled={applying}
                  onChange={(event) => onToggle(id, event.target.checked)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm font-semibold">{actionLine(action)}</span>
                  <span className="block text-xs text-muted-foreground">
                    {action.reason} · {badgeLabel(action.from)} → {badgeLabel(action.to)}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={`${BTN_PRIMARY} h-9 px-4 text-sm`}
          disabled={applying || blocked || chosen.length === 0}
          onClick={() => onApply(chosen)}
        >
          {applying ? 'Applying…' : `Apply ${chosen.length}`}
        </button>
        <button type="button" className={`${BTN_OUTLINE} h-9 px-4 text-sm`} disabled={applying} onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </section>
  );
}

const GUIDE_TOOLS = ['list_forms', 'form_coverage', 'usage_insights', 'find_duplicates'] as const;

/** "How it works": a sheet on the right (full screen on phones), kept out of the chat. */
function HowItWorks({ onClose, onAsk }: { onClose: () => void; onAsk: (question: string) => void }) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const body = document.body;
    const overflow = body.style.overflow;
    body.style.overflow = 'hidden';
    return () => {
      body.style.overflow = overflow;
    };
  }, []);

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])');
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const steps: ReactNode[] = [
    <>
      <strong>Ask in your own words.</strong> Anything about your forms, drafts or how customers use them.
    </>,
    <>
      <strong>Gemini looks things up</strong> in your forms and anonymous voice usage, with read-only tools:
      <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {GUIDE_TOOLS.map((tool) => {
          const { label, Icon: Tool } = TOOLS[tool];
          return (
            <span key={tool} className="inline-flex items-center gap-1">
              <Tool className="size-3.5 text-primary" />
              {label}
            </span>
          );
        })}
      </span>
    </>,
    <>
      <strong>It may suggest changes</strong>: retiring, unpublishing or publishing forms.
    </>,
    <>
      <strong>Nothing changes until you press Apply.</strong> You pick which suggestions to run.
    </>,
  ];

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div aria-hidden="true" data-testid="copilot-guide-backdrop" className="absolute inset-0 bg-foreground/40" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        className="fg-sheet absolute inset-0 flex flex-col overflow-y-auto bg-card sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[26rem] sm:border-l-2 sm:border-foreground"
      >
        <div className="flex items-center justify-between gap-3 border-b-2 border-foreground px-5 py-4">
          <h2 id={titleId} className="font-display text-2xl leading-none">
            How the copilot works
          </h2>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close"
            onClick={onClose}
            className={`${BTN} size-9 border-transparent bg-transparent text-foreground hover:border-foreground`}
          >
            <CloseIcon />
          </button>
        </div>

        <div className="space-y-7 px-5 py-5 text-sm leading-relaxed">
          <ol className="space-y-4">
            {steps.map((step, index) => (
              <li key={index} className="flex gap-3">
                <span aria-hidden="true" className="w-4 shrink-0 font-display text-lg leading-6 text-primary">
                  {index + 1}
                </span>
                <span className="min-w-0">{step}</span>
              </li>
            ))}
          </ol>

          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Try asking</h3>
            <ul className="mt-2 space-y-1.5">
              {COPILOT_EXAMPLES.map((question) => (
                <li key={question}>
                  <button
                    type="button"
                    onClick={() => onAsk(question)}
                    className={`cursor-pointer text-left font-semibold text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary ${FOCUS}`}
                  >
                    {question}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">What it can't do</h3>
            <p className="mt-2">
              It never changes anything on its own, and it can't see what customers answered on their forms — only anonymous usage
              counts.
            </p>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
