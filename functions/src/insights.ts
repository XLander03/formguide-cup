import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

/**
 * Anonymous usage insights for the admin copilot: one aggregate doc per day,
 * `insights/day_<YYYY-MM-DD>` (India time) in the formguide database.
 *
 * Only counters keyed by language, field id and form id are written: never a
 * transcript, a value, an IP or anything else about the caller. Recording is
 * fire-and-forget: it is bounded by a short timeout and a failure only logs, so a
 * speak response is never slowed down or failed by it.
 */

const DATABASE_ID = 'formguide';
export const INSIGHTS_COLLECTION = 'insights';
export const INSIGHT_TIMEOUT_MS = 1500;

/** Field ids, languages and form ids; anything else is dropped rather than written as a key. */
const KEY_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_KEYS = 150;

export interface SpeakTurnInsight {
  language: string;
  /** Required ids still missing after this turn. */
  missingRequired: readonly string[];
  /** Ids this turn filled by voice (non-empty updates only). */
  filled: readonly string[];
  /** Published form id, or a placeholder for the bundled form. */
  formKey: string;
}

export interface InsightCounts {
  turns: number;
  byLanguage: Record<string, number>;
  stillMissing: Record<string, number>;
  filledByVoice: Record<string, number>;
  byForm: Record<string, number>;
}

export type InsightWriter = (docId: string, counts: InsightCounts) => Promise<void>;

/** Day doc id in India time, where the customers are: `day_2026-10-17`. */
export function insightDayId(now: Date): string {
  const ist = new Date(now.getTime() + 330 * 60 * 1000);
  return `day_${ist.toISOString().slice(0, 10)}`;
}

/** Doc ids for the last `days` days, newest first. */
export function insightDayIds(now: Date, days: number): string[] {
  const out: string[] = [];
  for (let back = 0; back < days; back += 1) out.push(insightDayId(new Date(now.getTime() - back * 86_400_000)));
  return out;
}

function tally(keys: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of keys) {
    if (!KEY_RE.test(key) || key in out) continue;
    if (Object.keys(out).length >= MAX_KEYS) break;
    out[key] = 1;
  }
  return out;
}

/** The increments one speak turn contributes. Pure, so it is easy to test. */
export function insightIncrements(turn: SpeakTurnInsight): InsightCounts {
  return {
    turns: 1,
    byLanguage: tally([turn.language]),
    stillMissing: tally(turn.missingRequired),
    filledByVoice: tally(turn.filled),
    byForm: tally([turn.formKey]),
  };
}

/** Production writer: one merge-set of FieldValue.increment counters, no read needed. */
export function firestoreInsightWriter(): InsightWriter {
  return async (docId, counts) => {
    if (getApps().length === 0) initializeApp();
    const inc = (map: Record<string, number>) =>
      Object.fromEntries(Object.entries(map).map(([key, value]) => [key, FieldValue.increment(value)]));
    await getFirestore(DATABASE_ID)
      .collection(INSIGHTS_COLLECTION)
      .doc(docId)
      .set(
        {
          turns: FieldValue.increment(counts.turns),
          byLanguage: inc(counts.byLanguage),
          stillMissing: inc(counts.stillMissing),
          filledByVoice: inc(counts.filledByVoice),
          byForm: inc(counts.byForm),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
  };
}

/**
 * Records one speak turn. Never rejects and never takes longer than `timeoutMs`;
 * callers do not await it on the response path.
 */
export async function recordSpeakTurn(
  turn: SpeakTurnInsight,
  options: { write?: InsightWriter; now?: Date; timeoutMs?: number } = {},
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const write = options.write ?? firestoreInsightWriter();
    const work = write(insightDayId(options.now ?? new Date()), insightIncrements(turn));
    const timeout = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), options.timeoutMs ?? INSIGHT_TIMEOUT_MS);
      timer.unref?.();
    });
    // A late write may still land; it just no longer holds anything up.
    work.catch(() => undefined);
    if ((await Promise.race([work.then(() => 'ok' as const), timeout])) === 'timeout') {
      console.warn('insights_timeout');
    }
  } catch (err) {
    console.error('insights_failed', err instanceof Error ? err.message.slice(0, 80) : 'unknown');
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface InsightSummary {
  days: number;
  daysWithData: number;
  turns: number;
  byLanguage: Record<string, number>;
  stillMissing: Record<string, number>;
  filledByVoice: Record<string, number>;
  byForm: Record<string, number>;
}

function addMap(target: Record<string, number>, raw: unknown): void {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const count = Number(value);
    if (!KEY_RE.test(key) || !Number.isFinite(count) || count <= 0) continue;
    target[key] = (target[key] ?? 0) + count;
  }
}

/** Sums day docs (missing days are null). */
export function sumInsightDays(docs: ReadonlyArray<Record<string, unknown> | null>, days: number): InsightSummary {
  const out: InsightSummary = {
    days,
    daysWithData: 0,
    turns: 0,
    byLanguage: {},
    stillMissing: {},
    filledByVoice: {},
    byForm: {},
  };
  for (const doc of docs) {
    if (!doc) continue;
    out.daysWithData += 1;
    const turns = Number(doc.turns);
    if (Number.isFinite(turns) && turns > 0) out.turns += turns;
    addMap(out.byLanguage, doc.byLanguage);
    addMap(out.stillMissing, doc.stillMissing);
    addMap(out.filledByVoice, doc.filledByVoice);
    addMap(out.byForm, doc.byForm);
  }
  return out;
}
