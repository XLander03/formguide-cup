import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { FieldRecord, FormVersion } from '../../shared/forms/types';
import { IngestError } from '../src/ingest/errors';
import { buildOcrPrompt } from '../src/ingest/geminiOcr';
import { mapPool } from '../src/ingest/pool';
import {
  VERSION_DOC_BUDGET,
  firestoreDocBytes,
  versionDocForWrite,
  versionDocPath,
  versionFromDoc,
} from '../src/ingest/versionDoc';
import './support';

function field(index: number): FieldRecord {
  return {
    id: `custom_applicant_detail_field_number_${index}`,
    label: `Applicant detail field number ${index} as printed on the bank form`,
    type: 'text',
    required: false,
    pii: true,
    section: 'Personal details of the applicant',
    order: index,
    confidence: 0.82,
    checked: false,
    page: 1 + (index % 18),
    box: { x: 123.45, y: 456.78, w: 210.5, h: 18.25 },
    maxChars: 40,
  };
}

function version(count: number): FormVersion {
  return {
    formId: 'axis_aof',
    version: 'v1',
    bankId: 'AXIS',
    journey: 'aof_kyc',
    status: 'draft',
    source: 'ocr',
    pdfPath: 'forms/axis_aof/versions/v1/source.pdf',
    fields: Array.from({ length: count }, (_, index) => field(index)),
  };
}

describe('version doc size', () => {
  it('keeps both fields and payload for a normal form', () => {
    const form = version(100);
    const doc = versionDocForWrite(form);
    assert.equal(doc.fields?.length, 100);
    assert.deepEqual(JSON.parse(doc.payload), form);
    assert.ok(firestoreDocBytes(doc, versionDocPath(form)) < VERSION_DOC_BUDGET);
    assert.deepEqual(versionFromDoc(doc as unknown as Record<string, unknown>), form);
  });

  it('drops the duplicate fields array when the doc would pass the budget, and still reads back', () => {
    const form = version(2000);
    const full = { ...form, payload: JSON.stringify(form) };
    assert.ok(firestoreDocBytes(full, versionDocPath(form)) > VERSION_DOC_BUDGET);
    const doc = versionDocForWrite(form);
    assert.equal('fields' in doc, false);
    assert.ok(firestoreDocBytes(doc as unknown as Record<string, unknown>, versionDocPath(form)) <= VERSION_DOC_BUDGET);
    // loadPublished reads only `payload`; the admin publish path reads via versionFromDoc.
    assert.equal(JSON.parse(doc.payload).fields.length, 2000);
    assert.deepEqual(versionFromDoc(doc as unknown as Record<string, unknown>), form);
  });

  it('fails with form_too_large when even the payload alone is over budget', () => {
    assert.throws(() => versionDocForWrite(version(50), 5_000), (err: unknown) => {
      return err instanceof IngestError && err.code === 'form_too_large' && err.httpStatus === 413;
    });
  });

  it('counts sizes the way Firestore documents them', () => {
    // name "a/b": 16 + 2 + 2; fields: "s"(2) + "hi"(3) + "n"(2) + 8 + "t"(2) + 1; plus 32.
    assert.equal(firestoreDocBytes({ s: 'hi', n: 1, t: true }, 'a/b'), 20 + 18 + 32);
  });
});

describe('mapPool', () => {
  it('keeps input order and never exceeds the limit', async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await mapPool([5, 1, 4, 2, 3, 0, 6], 3, async (delay) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, delay * 2));
      inFlight -= 1;
      return delay * 10;
    });
    assert.deepEqual(out, [50, 10, 40, 20, 30, 0, 60]);
    assert.equal(peak, 3);
  });

  it('handles an empty list', async () => {
    assert.deepEqual(await mapPool([], 4, async () => 1), []);
  });
});

describe('ocr prompt page cap', () => {
  it('accepts up to 20 pages', () => {
    assert.match(buildOcrPrompt(18, 20), /page 18 of 20/);
    assert.throws(() => buildOcrPrompt(1, 21));
  });
});
