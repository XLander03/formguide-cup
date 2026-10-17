import { MAX_PLAN_TEXT } from '../../../shared/journeyPlan';
import { checkRateLimit, clientKey, type CounterStore } from '../rateLimit';
import { PlannerModelError } from './gemini';
import { runPlanner, type PlannerDeps } from './plan';

export interface PlanReq {
  method: string;
  body?: unknown;
  ip?: string;
  header(name: string): string | undefined;
}

export interface PlanRes {
  status(code: number): PlanRes;
  json(payload: unknown): unknown;
  set?(name: string, value: string): unknown;
}

export interface PlanHttpDeps {
  /** Same per-caller counter as the speak function: planner calls share its window. */
  counter: CounterStore;
  /** Built per request so a missing key fails only this call. */
  planner: () => PlannerDeps;
}

const LANGUAGE = /^[a-z]{2}(-[A-Za-z]{2,4}){0,2}$/;

function readBody(body: unknown): Record<string, unknown> | null {
  if (Buffer.isBuffer(body)) body = body.toString('utf8');
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return null;
    }
  }
  return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
}

/** POST { text, language } → { steps, reply, trace, outcome }. Never logs the customer's text. */
export async function handlePlanJourney(req: PlanReq, res: PlanRes, deps: PlanHttpDeps): Promise<void> {
  if (req.method === 'OPTIONS') {
    res.status(204).json({});
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  const body = readBody(req.body);
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  if (!text) {
    res.status(400).json({ error: 'text_required' });
    return;
  }
  if (text.length > MAX_PLAN_TEXT) {
    res.status(400).json({ error: 'text_too_long' });
    return;
  }
  const language = typeof body?.language === 'string' && LANGUAGE.test(body.language) ? body.language : 'en';

  // Counted only once the request is valid, like speak.
  const limit = await checkRateLimit(deps.counter, clientKey(req.header('x-forwarded-for'), req.ip));
  if (!limit.ok) {
    res.set?.('Retry-After', String(limit.retryAfterSeconds));
    res.status(429).json({ error: 'rate_limited' });
    return;
  }

  try {
    const plan = await runPlanner(text, language, deps.planner());
    console.info('plan_done', plan.outcome, plan.steps.map((step) => step.journey).join(','), plan.trace.length);
    res.status(200).json(plan);
  } catch (err) {
    const fail = err instanceof PlannerModelError ? err : new PlannerModelError('planner_failed', 502);
    if (!(err instanceof PlannerModelError)) {
      console.error('plan_failed', err instanceof Error ? err.message.slice(0, 80) : 'unknown');
    }
    res.status(fail.httpStatus).json({ error: fail.code });
  }
}
