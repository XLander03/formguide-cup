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
import {
  COPILOT_MAX_HISTORY,
  COPILOT_MAX_MESSAGE,
  type CopilotAction,
  type CopilotRequest,
  type CopilotResponse,
  type CopilotTraceStep,
  type CopilotTurn,
} from '../../../shared/forms/copilot';
import { BTN, BTN_MD, BTN_OUTLINE, BTN_PRIMARY } from '../ui/buttons';
import {
  AgentIcon,
  AlertIcon,
  ChartIcon,
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  EyeIcon,
  FileCheckIcon,
  LightbulbIcon,
  ListChecksIcon,
  ListIcon,
  MessageIcon,
  NewChatIcon,
  RotateIcon,
  SendIcon,
  UserCheckIcon,
} from '../ui/icons';
import { badgeLabel } from './consoleFormat';
import { groupTitle } from './consoleGroups';

type Icon = ComponentType<{ className?: string }>;

/** Starter questions, with what the admin learns from each. */
export const COPILOT_PROMPTS: readonly { question: string; learn: string; Icon: Icon }[] = [
  {
    question: "Which live forms don't capture mobile?",
    learn: 'Live forms where customers still type their mobile number.',
    Icon: ListChecksIcon,
  },
  {
    question: 'What did customers struggle with today?',
    learn: 'Fields people repeat most, from anonymous voice usage.',
    Icon: ChartIcon,
  },
  { question: 'Find duplicate drafts', learn: 'Repeat uploads of one PDF you can retire.', Icon: CopyIcon },
  {
    question: 'Which drafts are ready to publish?',
    learn: 'Drafts with every field checked, ready to go live.',
    Icon: FileCheckIcon,
  },
];

export const COPILOT_SUGGESTIONS = COPILOT_PROMPTS.map((prompt) => prompt.question);

/** The read-only tools the server gives Gemini, in friendly words. */
const TOOLS: Record<string, { verb: string; Icon: Icon }> = {
  list_forms: { verb: 'Listed forms', Icon: ListIcon },
  form_coverage: { verb: 'Checked field coverage', Icon: ListChecksIcon },
  usage_insights: { verb: 'Read anonymous voice usage', Icon: ChartIcon },
  find_duplicates: { verb: 'Looked for duplicates', Icon: CopyIcon },
  propose_actions: { verb: 'Drafted suggestions', Icon: LightbulbIcon },
};

export function toolVerb(tool: string): string {
  const known = TOOLS[tool];
  if (known) return known.verb;
  const words = tool.replace(/[_-]+/g, ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : 'Used a tool';
}

const VERB: Record<CopilotAction['type'], string> = { retire: 'Retire', unpublish: 'Unpublish', publish: 'Publish' };
const DONE_VERB: Record<CopilotAction['type'], string> = { retire: 'Retired', unpublish: 'Unpublished', publish: 'Published' };

/** What confirming does, in the console's own words. */
export function actionEffect(action: CopilotAction): string {
  if (action.type === 'publish') return 'Customers can pick it from the journey list right away.';
  if (action.type === 'unpublish') return 'It leaves the customer list and goes back to draft.';
  return 'It leaves the customer list for good and can never be published again.';
}

export function actionTitle(action: CopilotAction): string {
  return `${VERB[action.type]} ${groupTitle(action.bankId, action.journey)} · ${badgeLabel(action.from).toLowerCase()}`;
}

/** "ICICI · Re-KYC · draft v1" */
export function actionForm(action: CopilotAction): string {
  return `${groupTitle(action.bankId, action.journey)} · ${badgeLabel(action.from).toLowerCase()} ${action.version}`;
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
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [thinking, setThinking] = useState<string | null>(null);
  const [history, setHistory] = useState<CopilotTurn[]>([]);
  const seq = useRef(0);
  const nextId = useRef(0);
  const asked = useRef(false);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const panelId = useId();
  const inputId = useId();
  const hintId = useId();

  function toggle() {
    setOpen((value) => {
      try {
        window.sessionStorage.setItem(OPEN_KEY, value ? '0' : '1');
      } catch {
        // Private mode: the default is fine.
      }
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

  useEffect(() => {
    if (initialQuestion && !asked.current) {
      asked.current = true;
      void submit(initialQuestion);
    }
    // Only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the newest turn in view inside the thread: while thinking, the bottom; once the
  // reply lands, the question it answers, so the tool steps and answer read top-down.
  useEffect(() => {
    const log = logRef.current;
    if (!log) return;
    const questions = log.querySelectorAll<HTMLElement>('[data-turn="user"]');
    const question = questions[questions.length - 1];
    log.scrollTop = thinking || !question ? log.scrollHeight : question.offsetTop - 8;
  }, [messages, thinking]);

  // The composer grows with its text, up to three lines.
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = 'auto';
    if (input.scrollHeight > 0) input.style.height = `${Math.min(input.scrollHeight, 88)}px`;
  }, [draft, open]);

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

  const empty = messages.length === 0 && !thinking;

  return (
    <section aria-label="Ask about your forms" className="mt-6 border-2 border-foreground bg-card shadow-[4px_4px_0_0_var(--color-foreground)]">
      <div className="flex items-stretch">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={toggle}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:gap-4"
        >
          <Avatar size="lg" />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-display text-xl leading-none sm:text-2xl">Forms copilot</span>
              <span className="inline-flex items-center gap-1 border border-saffron bg-accent/30 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground">
                <EyeIcon className="size-3" />
                Read-only · Gemini
              </span>
            </span>
            <span className="mt-1 block text-xs text-muted-foreground sm:text-sm">
              Gemini checks your forms with read-only tools. It suggests changes — you confirm them.
            </span>
          </span>
          <ChevronDownIcon className={`size-5 shrink-0 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && !empty ? (
          <button
            type="button"
            onClick={clear}
            aria-label="New conversation"
            className={`${BTN} m-2 h-9 self-center border-foreground/30 bg-background px-2.5 text-xs text-foreground hover:border-foreground sm:px-3`}
          >
            <NewChatIcon />
            <span className="hidden sm:inline">New conversation</span>
          </button>
        ) : null}
      </div>

      {open ? (
        <div id={panelId} className="border-t-2 border-foreground">
          {empty ? (
            <EmptyState onAsk={(question) => void submit(question)} />
          ) : null}

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
                    <div className="border-2 border-destructive bg-background px-3 py-2.5">
                      <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
                        <AlertIcon className="size-4 shrink-0" />
                        I could not answer that.
                      </p>
                      <p className="mt-1 text-sm">{item.text}</p>
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
                <AssistantRow key={item.id}>
                  {item.reply.trace.length > 0 ? <Timeline trace={item.reply.trace} /> : null}
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

          <form onSubmit={onSubmit} className="border-t-2 border-foreground bg-background/60 px-3 py-3 sm:px-5">
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
                aria-describedby={hintId}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={onKeyDown}
                placeholder={empty ? 'Ask anything about your forms…' : 'Ask a follow-up…'}
                className="block min-h-10 min-w-0 flex-1 resize-none border-2 border-foreground bg-card px-3 py-2 text-sm leading-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <button
                type="submit"
                aria-label="Send"
                className={`${BTN_PRIMARY} h-10 w-10 shrink-0 px-0 sm:w-auto sm:px-4`}
                disabled={Boolean(thinking) || !draft.trim()}
              >
                <SendIcon />
                <span className="hidden sm:inline" aria-hidden="true">
                  Send
                </span>
              </button>
            </div>
            <p id={hintId} className="mt-1.5 text-[11px] text-muted-foreground">
              <span className="hidden sm:inline">Enter to send · Shift+Enter for a new line · </span>
              Nothing changes until you confirm.
            </p>
          </form>
        </div>
      ) : null}
    </section>
  );
}

function Avatar({ size = 'md', tone = 'ok', busy = false }: { size?: 'md' | 'lg'; tone?: 'ok' | 'error'; busy?: boolean }) {
  const box = size === 'lg' ? 'size-11' : 'size-8';
  const icon = size === 'lg' ? 'size-6' : 'size-4';
  const color = tone === 'error' ? 'border-destructive bg-destructive text-primary-foreground' : 'border-foreground bg-primary text-primary-foreground';
  return (
    <span aria-hidden="true" className={`relative grid shrink-0 place-items-center border-2 ${box} ${color}`}>
      <AgentIcon className={`${icon} ${busy ? 'fg-blink' : ''}`} />
      <span className="absolute -right-1 -top-1 size-2.5 border border-foreground bg-saffron" />
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

function AssistantRow({ children, tone = 'ok' }: { children: ReactNode; tone?: 'ok' | 'error' }) {
  return (
    <div className="fg-in flex items-start gap-2.5 sm:gap-3">
      <Avatar tone={tone} />
      <div className="min-w-0 max-w-3xl flex-1 space-y-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Forms copilot</p>
        {children}
      </div>
    </div>
  );
}

function Thinking() {
  return (
    <div role="status" className="fg-in flex items-start gap-2.5 sm:gap-3">
      <Avatar busy />
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Forms copilot</p>
        <div className="inline-flex flex-wrap items-center gap-3 border-2 border-dashed border-foreground/40 bg-background px-3 py-2 text-sm">
          <span className="font-semibold">
            Thinking
            <span aria-hidden="true">
              {[0, 1, 2].map((dot) => (
                <span key={dot} className="fg-blink inline-block" style={{ animationDelay: `${dot * 160}ms` }}>
                  .
                </span>
              ))}
            </span>
          </span>
          <span className="text-muted-foreground">Looking at your forms…</span>
          <span aria-hidden="true" className="flex items-center gap-1.5 text-primary">
            {[ListIcon, ListChecksIcon, ChartIcon, CopyIcon].map((Tool, index) => (
              <span key={index} className="fg-blink grid size-6 place-items-center border border-foreground/20 bg-card" style={{ animationDelay: `${index * 220}ms` }}>
                <Tool className="size-3.5" />
              </span>
            ))}
          </span>
        </div>
      </div>
    </div>
  );
}

/** What the agent looked up, one row per tool call. */
function Timeline({ trace }: { trace: readonly CopilotTraceStep[] }) {
  return (
    <div className="border-2 border-foreground/15 bg-muted/50 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Checked with {trace.length} tool{trace.length === 1 ? '' : 's'}
      </p>
      <ol aria-label="Steps the copilot took" className="mt-1.5">
        {trace.map((step, index) => {
          const Tool = TOOLS[step.tool]?.Icon ?? AgentIcon;
          const last = index === trace.length - 1;
          return (
            <li key={index} className="relative flex gap-2.5 pb-1.5 last:pb-0">
              {!last ? <span aria-hidden="true" className="absolute bottom-0 left-[11px] top-6 w-0.5 bg-primary/30" /> : null}
              <span aria-hidden="true" className="relative grid size-6 shrink-0 place-items-center border-2 border-primary bg-card text-primary">
                <Tool className="size-3.5" />
              </span>
              <span className="min-w-0 pt-0.5 text-xs leading-5">
                <span className="font-semibold">{toolVerb(step.tool)}</span>
                {step.summary ? <span className="text-muted-foreground"> · {step.summary}</span> : null}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

const CHIP: Record<CopilotAction['type'], string> = {
  retire: 'border-destructive bg-destructive/10 text-destructive',
  unpublish: 'border-saffron bg-accent/40 text-foreground',
  publish: 'border-primary bg-primary/10 text-primary',
};

const PILL: Record<CopilotAction['from'], string> = {
  draft: 'border-foreground/40 bg-card',
  published: 'border-primary bg-primary text-primary-foreground',
  retired: 'border-foreground/40 bg-muted text-muted-foreground',
};

function StatusPill({ status }: { status: CopilotAction['from'] }) {
  return <span className={`border px-1.5 py-px text-[11px] font-semibold ${PILL[status]}`}>{badgeLabel(status)}</span>;
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
          <div role="alert" className="border-2 border-destructive bg-background px-3 py-2.5">
            <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
              <AlertIcon className="size-4 shrink-0" />
              {failed.length === 1 ? 'One change did not go through' : `${failed.length} changes did not go through`}
            </p>
            <ul className="mt-1 space-y-0.5 pl-6 text-xs">
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
    <section aria-labelledby={headingId} className="border-2 border-saffron bg-card shadow-[3px_3px_0_0_var(--color-saffron)]">
      <header className="flex flex-wrap items-center gap-x-2 gap-y-0.5 border-b-2 border-saffron bg-accent/30 px-3 py-2">
        <LightbulbIcon className="size-4 shrink-0" />
        <h3 id={headingId} className="text-sm font-semibold">
          Suggested changes
        </h3>
        <span className="text-xs text-muted-foreground">· nothing has changed yet</span>
      </header>
      <ul className="divide-y-2 divide-foreground/10">
        {actions.map((action) => {
          const id = key(action);
          return (
            <li key={id}>
              <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-muted/40">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 shrink-0 cursor-pointer accent-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  checked={state.selected.has(id)}
                  disabled={applying}
                  onChange={(event) => onToggle(id, event.target.checked)}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={`border px-1.5 py-px text-[11px] font-bold uppercase tracking-wide ${CHIP[action.type]}`}>
                      {VERB[action.type]}
                    </span>
                    <span className="text-sm font-semibold">{actionForm(action)}</span>
                    <span className="inline-flex items-center gap-1" aria-label={`${badgeLabel(action.from)} to ${badgeLabel(action.to)}`}>
                      <StatusPill status={action.from} />
                      <span aria-hidden="true" className="text-xs">
                        →
                      </span>
                      <StatusPill status={action.to} />
                    </span>
                  </span>
                  <span className="mt-1 block text-xs">
                    <span className="font-semibold">Why:</span> {action.reason}
                  </span>
                  <span className="block text-xs text-muted-foreground">{actionEffect(action)}</span>
                  <span className="mt-0.5 block break-all font-mono text-[11px] text-muted-foreground">{action.formId}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-2 border-t-2 border-foreground/10 px-3 py-2.5">
        <button
          type="button"
          className={`${BTN_PRIMARY} ${BTN_MD}`}
          disabled={applying || blocked || chosen.length === 0}
          onClick={() => onApply(chosen)}
        >
          {applying ? 'Applying…' : `Apply ${chosen.length} change${chosen.length === 1 ? '' : 's'}`}
        </button>
        <button type="button" className={`${BTN_OUTLINE} ${BTN_MD}`} disabled={applying} onClick={onDismiss}>
          Dismiss
        </button>
        <span className="text-xs text-muted-foreground">Runs the same actions as the buttons on each form.</span>
      </div>
    </section>
  );
}

const STEPS: { title: string; body: string; Icon: Icon; tools?: boolean; tone?: string }[] = [
  { title: 'Ask a question', body: 'In your own words.', Icon: MessageIcon },
  { title: 'Gemini looks things up', body: 'Read-only tools:', Icon: AgentIcon, tools: true },
  { title: 'It suggests changes', body: 'Retire, unpublish or publish.', Icon: LightbulbIcon, tone: 'saffron' },
  { title: 'You confirm', body: 'Nothing changes until you do.', Icon: UserCheckIcon, tone: 'primary' },
];

const STEP_TOOLS: { label: string; Icon: Icon }[] = [
  { label: 'Forms', Icon: ListIcon },
  { label: 'Coverage', Icon: ListChecksIcon },
  { label: 'Usage', Icon: ChartIcon },
  { label: 'Duplicates', Icon: CopyIcon },
];

function EmptyState({ onAsk }: { onAsk: (question: string) => void }) {
  const ids = useId();
  return (
    <div className="px-3 pb-1 pt-4 sm:px-5">
      <ol aria-label="How the copilot works" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step, index) => {
          const accent =
            step.tone === 'saffron' ? 'border-saffron bg-accent/25' : step.tone === 'primary' ? 'border-primary bg-primary/10' : 'border-foreground/20 bg-background';
          return (
            <li key={step.title} className={`relative flex items-start gap-2.5 border-2 px-3 py-2 ${accent}`}>
              <span
                aria-hidden="true"
                className="grid size-6 shrink-0 place-items-center bg-foreground font-display text-sm leading-none text-background"
              >
                {index + 1}
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  <step.Icon className="size-4 shrink-0" />
                  {step.title}
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  {step.body}
                  {step.tools ? (
                    <span className="flex items-center gap-1 text-primary">
                      {STEP_TOOLS.map(({ label, Icon: Tool }) => (
                        <span key={label} title={label} className="grid size-5 place-items-center border border-primary/40 bg-card">
                          <Tool className="size-3" />
                          <span className="sr-only">{label}</span>
                        </span>
                      ))}
                    </span>
                  ) : null}
                </span>
              </span>
            </li>
          );
        })}
      </ol>

      <h3 className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Try asking</h3>
      <div role="group" aria-label="Suggested questions" className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {COPILOT_PROMPTS.map(({ question, learn, Icon: PromptIcon }, index) => (
          <button
            key={question}
            type="button"
            onClick={() => onAsk(question)}
            aria-labelledby={`${ids}q${index}`}
            aria-describedby={`${ids}l${index}`}
            className={`group flex cursor-pointer items-start gap-3 border-2 border-foreground bg-card px-3 py-2.5 text-left transition-[transform,box-shadow] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[3px_3px_0_0_var(--color-primary)] motion-reduce:transition-none motion-reduce:hover:translate-x-0 motion-reduce:hover:translate-y-0 ${FOCUS}`}
          >
            <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground">
              <PromptIcon className="size-4" />
            </span>
            <span className="min-w-0">
              <span id={`${ids}q${index}`} className="block text-sm font-semibold leading-snug">
                {question}
              </span>
              <span id={`${ids}l${index}`} className="mt-0.5 block text-xs text-muted-foreground">
                {learn}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
