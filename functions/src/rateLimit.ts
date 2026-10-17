import { createHash } from 'node:crypto';

/**
 * Fixed-window request limit for the public `speak` function, which spends Gemini quota.
 * The store is injectable so tests never reach Firestore.
 *
 * There is deliberately no project-wide ceiling. Callers can choose their own
 * X-Forwarded-For, so a shared daily budget could be drained with fake addresses and
 * would switch voice off for everyone. Total spend is bounded instead by the function's
 * own throughput (maxInstances × concurrency) and the project's budget alert.
 */

export type RateLimitRule = { limit: number; windowMs: number };

/** Generous enough for a room of judges sharing one venue address. */
export const SPEAK_PER_CLIENT: RateLimitRule = { limit: 150, windowMs: 10 * 60 * 1000 };

/** Adds one to the counter for `key` and returns the new count. */
export type CounterStore = (key: string, expiresAt: Date) => Promise<number>;

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

/**
 * The first X-Forwarded-For entry. For an ordinary browser that is its real address,
 * so two honest users never share a count. The entries Google's proxies append after it
 * are shared, rotating proxy addresses, so keying on those would put every user in one
 * bucket. A caller that forges this header only escapes its own limit. Hashed so no raw
 * address is stored.
 */
export function clientKey(forwardedFor: string | undefined, fallbackIp: string | undefined): string {
  const first = (forwardedFor || '').split(',')[0]?.trim();
  const ip = first || fallbackIp || 'unknown';
  return createHash('sha256').update(ip).digest('hex').slice(0, 32);
}

/**
 * Counts this request against the caller's window. A store failure lets the request
 * through: an outage in the limiter must not take the voice flow down with it.
 */
export async function checkRateLimit(
  store: CounterStore,
  client: string,
  now: number = Date.now(),
  rule: RateLimitRule = SPEAK_PER_CLIENT,
): Promise<RateLimitResult> {
  const start = Math.floor(now / rule.windowMs) * rule.windowMs;
  const end = start + rule.windowMs;
  try {
    const count = await store(`ip_${client}_${start}`, new Date(end));
    if (count > rule.limit) {
      return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((end - now) / 1000)) };
    }
  } catch (err) {
    console.error('rate_limit_store_failed', err instanceof Error ? err.message.slice(0, 80) : 'unknown');
  }
  return { ok: true };
}
