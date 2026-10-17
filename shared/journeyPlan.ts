/**
 * Contract between the `planJourney` function and the journey page.
 * The planner turns one free description ("my card was stolen and I moved house")
 * into an ordered list of the four demo journeys. Both sides validate with the
 * helpers here, so the client never trusts a malformed or stale response.
 */

export const PLAN_JOURNEY_IDS = ['account_opening', 'kyc_update', 'rekyc', 'debit_reissue'] as const;

export type PlanJourneyId = (typeof PLAN_JOURNEY_IDS)[number];

/** Longest customer description the planner accepts. */
export const MAX_PLAN_TEXT = 600;

/** A plan never asks a customer to fill more than this many forms in one sitting. */
export const MAX_PLAN_STEPS = 3;

export interface PlanJourneyInfo {
  id: PlanJourneyId;
  title: string;
  titleHi: string;
  /** What the form is for. Shown to the model by `list_journeys`. */
  covers: string;
  /** What filing it changes at the bank. */
  changes: string;
  /** Default step reason when the model's own reason is unusable. */
  reason: string;
  reasonHi: string;
}

export const PLAN_JOURNEYS: readonly PlanJourneyInfo[] = [
  {
    id: 'account_opening',
    title: 'Account opening',
    titleHi: 'खाता खोलना',
    covers:
      'Opening a new resident individual account: regular savings, salary, basic savings (BSBDA) or individual current. The bank issues a debit card with a new account.',
    changes: 'Creates a new account and customer record.',
    reason: 'You want a new account.',
    reasonHi: 'आप नया खाता खोलना चाहते हैं।',
  },
  {
    id: 'kyc_update',
    title: 'KYC update',
    titleHi: 'केवाईसी अपडेट',
    covers:
      'Changing details on an existing KYC record: new address after moving house, new mobile number or email, name change, or a new identity document.',
    changes: 'Updates the address, contact or identity details the bank holds.',
    reason: 'Your address or contact details changed.',
    reasonHi: 'आपका पता या संपर्क विवरण बदल गया है।',
  },
  {
    id: 'rekyc',
    title: 'Re-KYC',
    titleHi: 'री-केवाईसी',
    covers:
      'Periodic re-verification when the bank asks for it (letter, SMS or app notice saying KYC is due or the account may be frozen), with no details changing.',
    changes: 'Re-confirms the existing KYC so the account stays active.',
    reason: 'Your bank asked you to refresh your KYC.',
    reasonHi: 'आपके बैंक ने केवाईसी दोबारा करने को कहा है।',
  },
  {
    id: 'debit_reissue',
    title: 'Debit card reissue',
    titleHi: 'डेबिट कार्ड फिर से जारी',
    covers:
      'Replacing a debit card on an existing account that was lost, stolen or damaged. The old card is blocked permanently and the new card goes to the registered address.',
    changes: 'Blocks the old card and requests a replacement.',
    reason: 'Your debit card needs replacing.',
    reasonHi: 'आपका डेबिट कार्ड बदलना है।',
  },
];

export function isPlanJourneyId(value: unknown): value is PlanJourneyId {
  return typeof value === 'string' && (PLAN_JOURNEY_IDS as readonly string[]).includes(value);
}

export function planJourneyInfo(id: PlanJourneyId): PlanJourneyInfo {
  return PLAN_JOURNEYS.find((journey) => journey.id === id) as PlanJourneyInfo;
}

export interface PlanFormRef {
  formId: string;
  version: string;
  bank: string;
}

export interface PlanStep {
  journey: PlanJourneyId;
  reason: string;
  /** Bank the customer named, only when that bank has a published form for this journey. */
  bankHint?: string;
  form?: PlanFormRef;
}

export type PlanTool = 'list_journeys' | 'list_bank_forms' | 'submit_plan';

/** One tool call the agent made. Arguments are ids only, never the customer's words. */
export interface PlanTraceEntry {
  tool: PlanTool;
  args: Record<string, string | string[]>;
  /** Short result, e.g. "4 journeys" or "HDFC, Axis". */
  summary: string;
}

/**
 * `planned`: one or more steps. `unsupported`: nothing in scope (a loan, NEFT, …) — show the reply.
 * `no_plan`: the agent did not finish; the client falls back to its own single-card pick.
 */
export type PlanOutcome = 'planned' | 'unsupported' | 'no_plan';

export interface PlanResponse {
  steps: PlanStep[];
  reply: string;
  trace: PlanTraceEntry[];
  outcome: PlanOutcome;
  /** Short names of requests outside the four journeys, e.g. "personal loan". */
  unsupported?: string[];
}

const TOOLS: readonly PlanTool[] = ['list_journeys', 'list_bank_forms', 'submit_plan'];

function str(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/** Client-side check of a planner response. Null when it cannot be used. */
export function parsePlanResponse(raw: unknown): PlanResponse | null {
  if (!raw || typeof raw !== 'object') return null;
  const body = raw as Record<string, unknown>;
  const outcome = body.outcome;
  if (outcome !== 'planned' && outcome !== 'unsupported' && outcome !== 'no_plan') return null;
  const seen = new Set<string>();
  const steps: PlanStep[] = [];
  for (const entry of Array.isArray(body.steps) ? body.steps : []) {
    if (!entry || typeof entry !== 'object') continue;
    const step = entry as Record<string, unknown>;
    if (!isPlanJourneyId(step.journey) || seen.has(step.journey)) continue;
    seen.add(step.journey);
    const out: PlanStep = {
      journey: step.journey,
      reason: str(step.reason, 240) || planJourneyInfo(step.journey).reason,
    };
    const bankHint = str(step.bankHint, 40);
    if (bankHint) out.bankHint = bankHint;
    const form = step.form as Record<string, unknown> | undefined;
    if (form && typeof form === 'object') {
      const formId = str(form.formId, 80);
      const version = str(form.version, 40);
      if (formId && version) out.form = { formId, version, bank: str(form.bank, 40) };
    }
    steps.push(out);
    if (steps.length >= MAX_PLAN_STEPS) break;
  }
  const trace: PlanTraceEntry[] = [];
  for (const entry of Array.isArray(body.trace) ? body.trace : []) {
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as Record<string, unknown>;
    if (!TOOLS.includes(item.tool as PlanTool)) continue;
    const args: Record<string, string | string[]> = {};
    if (item.args && typeof item.args === 'object') {
      for (const [key, value] of Object.entries(item.args as Record<string, unknown>)) {
        if (typeof value === 'string') args[key] = value.slice(0, 40);
        else if (Array.isArray(value)) args[key] = value.filter((v): v is string => typeof v === 'string').slice(0, 5);
      }
    }
    trace.push({ tool: item.tool as PlanTool, args, summary: str(item.summary, 80) });
  }
  const unsupported = Array.isArray(body.unsupported)
    ? body.unsupported.map((item) => str(item, 40)).filter(Boolean).slice(0, 3)
    : [];
  const effective: PlanOutcome = outcome === 'planned' && steps.length === 0 ? 'no_plan' : outcome;
  return {
    steps: effective === 'planned' ? steps : [],
    reply: str(body.reply, 600),
    trace: trace.slice(0, 12),
    outcome: effective,
    ...(unsupported.length ? { unsupported } : {}),
  };
}
