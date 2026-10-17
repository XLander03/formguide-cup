import { createHash } from 'node:crypto';

/**
 * Fixed-window request limits for the public `speak` function, which spends Gemini quota.
 * One window per client IP, plus one project-wide daily ceiling.
 * The store is injectable so tests never reach Firestore.
 */

export type RateLimitRule = { name: string; limit: number; windowMs: number };

export const SPEAK_PER_IP: RateLimitRule = { name: 'ip', limit: 30, windowMs: 10 * 60 * 1000 };
export const SPEAK_DAILY: RateLimitRule = { name: 'day', limit: 2000, windowMs: 24 * 60 * 60 * 1000 };

/** Adds one to the counter for `key` and returns the new count. */
export type CounterStore = (key: string, expiresAt: Date) => Promise<number>;

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

/** Hosting forwards the caller first in X-Forwarded-For. Hashed so no raw IP is stored. */
export function clientKey(forwardedFor: string | undefined, fallbackIp: string | undefined): string {
  const first = (forwardedFor || '').split(',')[0]?.trim();
  const ip = first || fallbackIp || 'unknown';
  return createHash('sha256').update(ip).digest('hex').slice(0, 32);
}

function windowStart(now: number, rule: RateLimitRule): number {
  return Math.floor(now / rule.windowMs) * rule.windowMs;
}

/**
 * Counts this request against each rule. A store failure lets the request through:
 * for the demo, an outage in the limiter must not take the voice flow down with it.
 */
export async function checkRateLimits(
  store: CounterStore,
  client: string,
  now: number = Date.now(),
  rules: { perClient: RateLimitRule; global: RateLimitRule } = { perClient: SPEAK_PER_IP, global: SPEAK_DAILY },
): Promise<RateLimitResult> {
  const checks = [
    { rule: rules.perClient, key: `${rules.perClient.name}_${client}` },
    { rule: rules.global, key: rules.global.name },
  ];
  try {
    for (const { rule, key } of checks) {
      const start = windowStart(now, rule);
      const end = start + rule.windowMs;
      const count = await store(`${key}_${start}`, new Date(end));
      if (count > rule.limit) {
        return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((end - now) / 1000)) };
      }
    }
  } catch (err) {
    console.error('rate_limit_store_failed', err instanceof Error ? err.message.slice(0, 80) : 'unknown');
  }
  return { ok: true };
}
