import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  insightDayId,
  insightDayIds,
  insightIncrements,
  recordSpeakTurn,
  sumInsightDays,
  type InsightCounts,
} from '../src/insights';
import { readSpeakRequest } from '../src/wav';

const TURN = {
  language: 'hi-IN',
  missingRequired: ['mobile_registered', 'pan_number'],
  filled: ['dob', 'applicant_full_name'],
  formKey: 'form_f31c3ba0',
};

describe('speak insights', () => {
  it('counts one turn: language, still-missing fields, voice-filled fields and the form', () => {
    assert.deepEqual(insightIncrements(TURN), {
      turns: 1,
      byLanguage: { 'hi-IN': 1 },
      stillMissing: { mobile_registered: 1, pan_number: 1 },
      filledByVoice: { dob: 1, applicant_full_name: 1 },
      byForm: { form_f31c3ba0: 1 },
    });
  });

  it('never turns a value-like or path-like string into a key', () => {
    const counts = insightIncrements({
      language: 'en-IN',
      missingRequired: ['a.b', 'ok_id', 'ok_id', 'x'.repeat(65)],
      filled: ['ABCDE1234F value', '__proto__x'],
      formKey: 'forms/../x',
    });
    assert.deepEqual(counts.stillMissing, { ok_id: 1 });
    assert.deepEqual(counts.filledByVoice, { __proto__x: 1 });
    assert.deepEqual(counts.byForm, {});
  });

  it('uses India-time day docs', () => {
    assert.equal(insightDayId(new Date('2026-10-16T19:00:00Z')), 'day_2026-10-17');
    assert.equal(insightDayId(new Date('2026-10-16T18:00:00Z')), 'day_2026-10-16');
    assert.deepEqual(insightDayIds(new Date('2026-10-17T06:00:00Z'), 3), ['day_2026-10-17', 'day_2026-10-16', 'day_2026-10-15']);
  });

  it('writes the increments to the day doc', async () => {
    const writes: Array<[string, InsightCounts]> = [];
    await recordSpeakTurn(TURN, {
      now: new Date('2026-10-17T06:00:00Z'),
      write: async (docId, counts) => {
        writes.push([docId, counts]);
      },
    });
    assert.equal(writes.length, 1);
    assert.equal(writes[0][0], 'day_2026-10-17');
    assert.equal(writes[0][1].turns, 1);
  });

  it('swallows a failing write', async () => {
    await assert.doesNotReject(
      recordSpeakTurn(TURN, {
        write: async () => {
          throw new Error('firestore down');
        },
      }),
    );
    await assert.doesNotReject(
      recordSpeakTurn(TURN, {
        write: () => {
          throw new Error('sync throw');
        },
      }),
    );
  });

  it('gives up on a slow write after the timeout', async () => {
    const started = Date.now();
    await recordSpeakTurn(TURN, { timeoutMs: 30, write: () => new Promise(() => undefined) });
    assert.ok(Date.now() - started < 500);
  });

  it('sums day docs and ignores junk', () => {
    const summary = sumInsightDays(
      [
        { turns: 3, byLanguage: { 'en-IN': 3 }, stillMissing: { mobile_registered: 2 } },
        null,
        { turns: 2, byLanguage: { 'en-IN': 1, 'hi-IN': 1 }, stillMissing: { mobile_registered: 1, 'bad key': 5 }, filledByVoice: 'x' },
      ],
      3,
    );
    assert.equal(summary.turns, 5);
    assert.equal(summary.daysWithData, 2);
    assert.deepEqual(summary.byLanguage, { 'en-IN': 4, 'hi-IN': 1 });
    assert.deepEqual(summary.stillMissing, { mobile_registered: 3 });
    assert.deepEqual(summary.filledByVoice, {});
  });
});

describe('speak form_id part', () => {
  function multipart(parts: Record<string, string | Buffer>): { raw: Buffer; type: string } {
    const boundary = 'b0undary';
    const chunks: Buffer[] = [];
    for (const [name, value] of Object.entries(parts)) {
      chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n`));
      chunks.push(Buffer.isBuffer(value) ? value : Buffer.from(value));
      chunks.push(Buffer.from('\r\n'));
    }
    chunks.push(Buffer.from(`--${boundary}--\r\n`));
    return { raw: Buffer.concat(chunks), type: `multipart/form-data; boundary=${boundary}` };
  }

  function wav(): Buffer {
    const data = Buffer.alloc(3200);
    const header = Buffer.alloc(44);
    header.write('RIFF', 0, 'ascii');
    header.writeUInt32LE(36 + data.length, 4);
    header.write('WAVE', 8, 'ascii');
    header.write('fmt ', 12, 'ascii');
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(16000, 24);
    header.writeUInt32LE(32000, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write('data', 36, 'ascii');
    header.writeUInt32LE(data.length, 40);
    return Buffer.concat([header, data]);
  }

  it('reads a safe form id and ignores a bad one', () => {
    const good = multipart({ language: 'en-IN', form_id: 'form_f31c3ba0', audio: wav() });
    const read = readSpeakRequest(good.raw, good.type);
    assert.ok(read.ok);
    assert.equal(read.ok && read.parts.formId, 'form_f31c3ba0');
    const bad = multipart({ language: 'en-IN', form_id: '../etc/passwd', audio: wav() });
    const readBad = readSpeakRequest(bad.raw, bad.type);
    assert.ok(readBad.ok);
    assert.equal(readBad.ok && readBad.parts.formId, undefined);
  });
});
