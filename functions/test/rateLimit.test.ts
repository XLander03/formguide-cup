import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkRateLimits, clientKey, type CounterStore } from '../src/rateLimit';

function memoryStore(): CounterStore {
  const counts = new Map<string, number>();
  return async (key) => {
    const next = (counts.get(key) || 0) + 1;
    counts.set(key, next);
    return next;
  };
}

const rules = {
  perClient: { name: 'ip', limit: 2, windowMs: 60_000 },
  global: { name: 'day', limit: 5, windowMs: 86_400_000 },
};

describe('speak rate limits', () => {
  it('lets a client through up to the limit, then asks it to wait for the window', async () => {
    const store = memoryStore();
    const now = 60_000 * 10 + 15_000;
    assert.deepEqual(await checkRateLimits(store, 'a', now, rules), { ok: true });
    assert.deepEqual(await checkRateLimits(store, 'a', now, rules), { ok: true });
    assert.deepEqual(await checkRateLimits(store, 'a', now, rules), { ok: false, retryAfterSeconds: 45 });
    assert.deepEqual(await checkRateLimits(store, 'b', now, rules), { ok: true });
  });

  it('starts a fresh count in the next window', async () => {
    const store = memoryStore();
    for (let i = 0; i < 3; i += 1) await checkRateLimits(store, 'a', 1_000, rules);
    assert.deepEqual(await checkRateLimits(store, 'a', 61_000, rules), { ok: true });
  });

  it('stops every client once the project-wide ceiling is reached', async () => {
    const store = memoryStore();
    for (const client of ['a', 'b', 'c', 'd', 'e']) {
      assert.deepEqual(await checkRateLimits(store, client, 1_000, rules), { ok: true });
    }
    assert.equal((await checkRateLimits(store, 'f', 1_000, rules)).ok, false);
  });

  it('lets the request through when the counter store fails', async () => {
    const failing: CounterStore = async () => {
      throw new Error('firestore down');
    };
    assert.deepEqual(await checkRateLimits(failing, 'a', 1_000, rules), { ok: true });
  });

  it('keys on the first forwarded address and never stores the raw IP', () => {
    const key = clientKey('203.0.113.7, 10.0.0.1', '10.0.0.1');
    assert.equal(key, clientKey('203.0.113.7', undefined));
    assert.notEqual(key, clientKey('198.51.100.2', undefined));
    assert.ok(!key.includes('203'));
    assert.match(key, /^[0-9a-f]{32}$/);
  });
});
