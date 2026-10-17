import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkRateLimit, clientKey, SPEAK_PER_CLIENT, type CounterStore } from '../src/rateLimit';

function memoryStore(): CounterStore {
  const counts = new Map<string, number>();
  return async (key) => {
    const next = (counts.get(key) || 0) + 1;
    counts.set(key, next);
    return next;
  };
}

const rule = { limit: 2, windowMs: 60_000 };

describe('speak rate limit', () => {
  it('lets a client through up to the limit, then asks it to wait for the window', async () => {
    const store = memoryStore();
    const now = 60_000 * 10 + 15_000;
    assert.deepEqual(await checkRateLimit(store, 'a', now, rule), { ok: true });
    assert.deepEqual(await checkRateLimit(store, 'a', now, rule), { ok: true });
    assert.deepEqual(await checkRateLimit(store, 'a', now, rule), { ok: false, retryAfterSeconds: 45 });
    assert.deepEqual(await checkRateLimit(store, 'b', now, rule), { ok: true });
  });

  it('starts a fresh count in the next window', async () => {
    const store = memoryStore();
    for (let i = 0; i < 3; i += 1) await checkRateLimit(store, 'a', 1_000, rule);
    assert.deepEqual(await checkRateLimit(store, 'a', 61_000, rule), { ok: true });
  });

  it('never blocks one client because many others were busy', async () => {
    const store = memoryStore();
    for (let i = 0; i < 500; i += 1) await checkRateLimit(store, `forged_${i}`, 1_000, rule);
    assert.deepEqual(await checkRateLimit(store, 'judge', 1_000, rule), { ok: true });
  });

  it('lets the request through when the counter store fails', async () => {
    const failing: CounterStore = async () => {
      throw new Error('firestore down');
    };
    assert.deepEqual(await checkRateLimit(failing, 'a', 1_000, rule), { ok: true });
  });

  it('allows a room sharing one address to keep demoing', () => {
    assert.ok(SPEAK_PER_CLIENT.limit >= 100);
  });

  it('keys on the caller entry, not the proxy entries Google appends, and never stores the raw IP', () => {
    const key = clientKey('203.0.113.7, 130.211.0.1, 35.191.0.1', '10.0.0.1');
    assert.equal(key, clientKey('203.0.113.7, 130.211.9.9, 35.191.4.4', undefined));
    assert.notEqual(key, clientKey('198.51.100.2, 130.211.0.1, 35.191.0.1', undefined));
    assert.ok(!key.includes('203'));
    assert.match(key, /^[0-9a-f]{32}$/);
  });
});
