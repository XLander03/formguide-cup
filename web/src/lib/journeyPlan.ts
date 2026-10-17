import {
  MAX_PLAN_TEXT,
  parsePlanResponse,
  planJourneyInfo,
  type PlanResponse,
  type PlanStep,
  type PlanTraceEntry,
} from '../../../shared/journeyPlan';
import { formKey, isBundledForm } from '../forms/activeForm';
import { HDFC_V1 } from '../forms/hdfcV1';
import type { FormVersion } from '../forms/types';
import { isDebitJourney } from './debitReissue';
import { pickJourneyCard } from './journeyIntent';
import { appliesToJourney, listPublishedForms } from './publishedForms';
import { isFilled } from './schema';
import type { FormValues } from './types';

export type { PlanResponse, PlanStep, PlanTraceEntry };

/** A plan the customer is working through. `text` is what they said, used only for local prefill. */
export interface ActivePlan {
  steps: PlanStep[];
  reply: string;
  trace: PlanTraceEntry[];
  text: string;
}

export type PlanResult = { plan: PlanResponse; error: null } | { plan: null; error: string };

export type RequestPlan = (text: string, language: string) => Promise<PlanResult>;

/** Calls the planJourney function. Any failure comes back as an error code; the page then falls back. */
export const requestPlan: RequestPlan = async (text, language) => {
  const body = JSON.stringify({ text: text.trim().slice(0, MAX_PLAN_TEXT), language });
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch('/api/planJourney', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: ctrl.signal,
    });
    if (res.status === 429) return { plan: null, error: 'rate_limited' };
    if (!res.ok) return { plan: null, error: `plan_${res.status}` };
    const plan = parsePlanResponse(await res.json());
    return plan ? { plan, error: null } : { plan: null, error: 'bad_response' };
  } catch {
    return { plan: null, error: 'network_error' };
  } finally {
    window.clearTimeout(timer);
  }
};

export function stepTitle(step: Pick<PlanStep, 'journey'>, hindi = false): string {
  const info = planJourneyInfo(step.journey);
  return hindi ? info.titleHi : info.title;
}

/** Plain words for one tool call, e.g. "Looked up Re-KYC forms: HDFC, Axis". */
export function traceLabel(entry: PlanTraceEntry): string {
  if (entry.tool === 'list_journeys') return `Checked available journeys${entry.summary ? ` (${entry.summary})` : ''}`;
  if (entry.tool === 'list_bank_forms') {
    const journey = typeof entry.args.journey === 'string' ? entry.args.journey : '';
    const known = journey === 'account_opening' || journey === 'kyc_update' || journey === 'rekyc' || journey === 'debit_reissue';
    const name = known ? planJourneyInfo(journey).title : 'unknown journey';
    return `Looked up ${name} forms${entry.summary ? `: ${entry.summary}` : ''}`;
  }
  return entry.summary === 'No supported form' ? 'Found no supported form' : `Planned ${entry.summary || 'the forms'}`;
}

/** Card on the journey page for a planned step. Account opening picks the product the customer named. */
export function stepCardId(step: Pick<PlanStep, 'journey'>, text: string): string {
  if (step.journey !== 'account_opening') return step.journey;
  const pick = pickJourneyCard(text);
  if (pick.kind === 'card' && !['kyc_update', 'rekyc', 'debit_reissue'].includes(pick.cardId)) return pick.cardId;
  return 'regular_savings';
}

/**
 * The form a step fills: the bank form the planner matched (if it is still published),
 * else the current form when it covers this journey, else the bundled HDFC form.
 */
export async function resolveStepForm(
  step: PlanStep,
  current: FormVersion,
  load: (journey: string) => Promise<FormVersion[] | null> = listPublishedForms,
): Promise<FormVersion> {
  if (step.form) {
    if (step.form.formId === HDFC_V1.formId) return HDFC_V1;
    try {
      const forms = await load(step.journey);
      const wanted = formKey(step.form);
      const found = forms?.find((form) => formKey(form) === wanted);
      if (found) return found;
    } catch {
      // Catalog down: fall through to the bundled form.
    }
  }
  if (!isBundledForm(current) && appliesToJourney(current, step.journey)) return current;
  return HDFC_V1;
}

/**
 * Answers the customer already gave that the next form asks under another id.
 * Debit reissue keeps its own customer id and confirm-mobile boxes.
 */
const CARRY_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['mobile_registered', 'card_confirm_mobile'],
  ['customer_id_cif', 'card_customer_id'],
];

const CONFIRM_GATES = ['readback_confirmed', 'draft_only_ack', 'no_live_submit_ack', 'card_old_blocked_ack'];

/** Values for the next planned form: shared answers stay, gates reset, and paired ids are copied across. */
export function carryPlanAnswers(values: FormValues, to: PlanStep['journey'], text = ''): FormValues {
  const next: FormValues = { ...values };
  for (const gate of CONFIRM_GATES) next[gate] = null;
  const debit = isDebitJourney(to);
  for (const [kyc, card] of CARRY_PAIRS) {
    const [from, into] = debit ? [kyc, card] : [card, kyc];
    if (!isFilled(next[into]) && isFilled(next[from])) next[into] = next[from];
  }
  if (debit && !isFilled(next.card_reason)) {
    const reason = cardReasonFrom(text);
    if (reason) next.card_reason = reason;
  }
  return next;
}

/** What the customer already said about the card, so the reissue form does not ask again. */
export function cardReasonFrom(text: string): string | null {
  if (/\bstolen\b|\btheft\b|चोरी/i.test(text)) return 'stolen';
  if (/\bdamaged?\b|\bbroken\b|\bcracked\b|टूट|खराब|ख़राब/i.test(text)) return 'damaged';
  if (/\blost\b|\bmisplaced\b|खो\s*गया|गुम/i.test(text)) return 'lost_or_misplaced';
  return null;
}

export function planFromResponse(response: PlanResponse, text: string): ActivePlan | null {
  if (response.outcome !== 'planned' || response.steps.length === 0) return null;
  return { steps: response.steps, reply: response.reply, trace: response.trace, text: text.slice(0, MAX_PLAN_TEXT) };
}

/** Restores a saved plan. Anything malformed is dropped rather than half-used. */
export function parseStoredPlan(raw: unknown): { plan: ActivePlan; step: number } | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const parsed = parsePlanResponse({ ...data, outcome: 'planned' });
  if (!parsed || parsed.outcome !== 'planned') return null;
  const step = typeof data.step === 'number' && Number.isInteger(data.step) ? data.step : 0;
  if (step < 0 || step >= parsed.steps.length) return null;
  const text = typeof data.text === 'string' ? data.text.slice(0, MAX_PLAN_TEXT) : '';
  return { plan: { steps: parsed.steps, reply: parsed.reply, trace: parsed.trace, text }, step };
}
