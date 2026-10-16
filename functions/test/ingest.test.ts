import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { FormVersion } from '../../shared/forms/types';
import { AUTO_ACCEPT_ABOVE } from '../../shared/forms/review';
import { draftFromPdf } from '../src/ingest/draft';
import { handleIngest } from '../src/ingest/handlers';
import { buildOcrPrompt, type OcrField } from '../src/ingest/geminiOcr';
import { acroPdf, flatPdf, manyPages, SENTINEL } from './pdfSamples';
import { jsonReq, memoryIngest, mockRes, pdfReq } from './support';

function ocrFor(page: number): OcrField[] {
  if (page === 1) {
    return [{
      label: 'Date of birth',
      type: 'text',
      required: false,
      box: { x: 0.1, y: 0.2, w: 0.4, h: 0.05 },
      confidence: 0.91,
    }];
  }
  return [{
    label: 'Favourite colour',
    type: 'text',
    required: true,
    box: { x: 0, y: 0, w: 0.2, h: 0.02 },
    confidence: 0.42,
  }];
}

describe('ingestForm', () => {
  it('reads an AcroForm without calling Gemini', async () => {
    const bytes = await acroPdf();
    let ocrCalls = 0;
    const draft = await draftFromPdf(bytes, async () => {
      ocrCalls += 1;
      throw new Error('gemini must not run for acroform');
    });
    assert.equal(ocrCalls, 0);
    assert.equal(draft.source, 'acroform');
    assert.equal(draft.pageCount, 2);
    assert.equal(draft.pages.length, 2);
    assert.equal(draft.pages[0].png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');

    const byId = new Map(draft.fields.map((field) => [field.id, field]));
    const name = byId.get('applicant_full_name');
    assert.ok(name);
    assert.equal(name?.type, 'text');
    assert.equal(name?.required, true);
    assert.equal(name?.pii, true);
    assert.equal(name?.confidence, 1);
    assert.equal(name?.checked, true, 'above AUTO_ACCEPT_ABOVE is accepted at ingest');
    assert.equal(name?.page, 1);
    assert.equal(name?.pdfField, 'applicant_full_name');
    assert.equal(name?.maxChars, 120);
    assert.deepEqual(name?.box, { x: 50, y: 700, w: 200, h: 18 });

    const mother = draft.fields.find((field) => field.id.startsWith('custom_'));
    assert.ok(mother);
    assert.equal(mother?.id, 'custom_mother_maiden_name');
    assert.equal(mother?.pii, true);
    assert.ok((mother?.confidence ?? 1) <= AUTO_ACCEPT_ABOVE);
    assert.equal(mother?.checked, false);

    assert.equal(byId.get('photo_consent')?.type, 'checkbox');
    assert.equal(byId.get('photo_consent')?.page, 1);
    assert.equal(byId.get('dob')?.type, 'date');
    assert.equal(byId.get('dob')?.page, 2);
    assert.deepEqual(byId.get('dob')?.box, { x: 40, y: 500, w: 120, h: 16 });
    assert.equal(byId.get('pep_declaration')?.type, 'checkbox');
    assert.equal(byId.get('pep_declaration')?.confidence, 0.97);
    assert.deepEqual(draft.fields.map((field) => field.order), [0, 1, 2, 3, 4]);
  });

  it('calls Gemini once per flat page and converts boxes', async () => {
    const bytes = await flatPdf();
    const calls: Array<{ page: number; prompt: string; png: Buffer }> = [];
    const draft = await draftFromPdf(bytes, async (input) => {
      calls.push({ page: input.page, prompt: buildOcrPrompt(input.page, input.pageCount), png: input.png });
      assert.equal(input.png[0], 0x89);
      assert.equal(input.png[1], 0x50);
      return ocrFor(input.page);
    });
    assert.equal(calls.length, 2);
    assert.deepEqual(calls.map((call) => call.page), [1, 2]);
    assert.equal(draft.source, 'ocr');
    const dob = draft.fields.find((field) => field.id === 'dob');
    assert.ok(dob);
    assert.equal(dob?.type, 'date');
    assert.equal(dob?.required, true);
    assert.equal(dob?.confidence, 0.91);
    assert.equal(dob?.checked, true);
    assert.equal(dob?.pii, true);
    assert.equal(dob?.page, 1);
    assert.deepEqual(dob?.box, { x: 61.2, y: 594, w: 244.8, h: 39.6 });
    const custom = draft.fields.find((field) => field.id === 'custom_favourite_colour');
    assert.ok(custom);
    assert.equal(custom?.pii, true);
    assert.equal(custom?.required, true);
    assert.equal(custom?.confidence, 0.42);
    assert.equal(custom?.checked, false);
    assert.equal(custom?.page, 2);
    assert.equal(JSON.stringify(calls).includes(SENTINEL), false);
  });

  it('saves a draft FormVersion and page pngs for an uploaded PDF', async () => {
    const bytes = await flatPdf();
    const deps = memoryIngest();
    const seen: string[] = [];
    deps.ocrPage = async (input) => {
      seen.push(buildOcrPrompt(input.page, input.pageCount));
      assert.equal(seen[seen.length - 1].includes(SENTINEL), false);
      return ocrFor(input.page);
    };
    const res = mockRes();
    await handleIngest(pdfReq(bytes, 'Bearer admin', {
      'x-form-id': 'hdfc_aof',
      'x-bank-id': 'HDFC',
      'x-journey': 'account_opening',
      'x-form-version': 'v3',
    }), res, deps);
    assert.equal(res.statusCode, 200);
    const body = res.body as { formVersion: FormVersion; pages: Array<{ page: number; storagePath: string; pngBase64: string }> };
    assert.equal(body.formVersion.status, 'draft');
    assert.equal(body.formVersion.source, 'ocr');
    assert.equal(body.formVersion.formId, 'hdfc_aof');
    assert.equal(body.formVersion.version, 'v3');
    assert.equal(body.formVersion.bankId, 'HDFC');
    assert.equal(body.formVersion.journey, 'account_opening');
    assert.equal(body.formVersion.pdfPath, 'forms/hdfc_aof/versions/v3/source.pdf');
    assert.equal(deps.docs.get('hdfc_aof/v3')?.status, 'draft');
    assert.equal(deps.files.get(body.formVersion.pdfPath)?.contentType, 'application/pdf');
    assert.equal(body.pages.length, 2);
    assert.equal(body.pages[0].storagePath, 'forms/hdfc_aof/versions/v3/pages/1.png');
    assert.equal(Buffer.from(body.pages[0].pngBase64, 'base64')[0], 0x89);
    assert.equal(deps.files.get(body.pages[1].storagePath)?.contentType, 'image/png');
    assert.equal(seen.length, 2);
  });

  it('reads a PDF already stored in Cloud Storage', async () => {
    const bytes = await acroPdf();
    const deps = memoryIngest();
    deps.files.set('uploads/aof.pdf', { bytes, contentType: 'application/pdf' });
    deps.ocrPage = async () => {
      throw new Error('gemini must not run for acroform');
    };
    const res = mockRes();
    await handleIngest(jsonReq({ storagePath: 'uploads/aof.pdf', formId: 'sbi_aof', version: 'v1' }), res, deps);
    assert.equal(res.statusCode, 200);
    const body = res.body as { formVersion: FormVersion };
    assert.equal(body.formVersion.source, 'acroform');
    assert.equal(body.formVersion.status, 'draft');
    assert.equal(deps.files.get('forms/sbi_aof/versions/v1/source.pdf')?.bytes.equals(bytes), true);
  });

  it('accepts a base64 upload and will not overwrite an existing version', async () => {
    const bytes = await acroPdf();
    const deps = memoryIngest();
    deps.ocrPage = async () => {
      throw new Error('gemini must not run for acroform');
    };
    const first = mockRes();
    await handleIngest(jsonReq({
      pdfBase64: bytes.toString('base64'),
      formId: 'sbi_aof',
      version: 'v1',
      bankId: 'SBI',
    }), first, deps);
    assert.equal(first.statusCode, 200);
    const saved = (first.body as { formVersion: FormVersion }).formVersion;
    assert.equal(saved.status, 'draft');
    assert.equal(saved.source, 'acroform');
    assert.equal(saved.bankId, 'SBI');

    const second = mockRes();
    await handleIngest(jsonReq({
      pdfBase64: bytes.toString('base64'),
      formId: 'sbi_aof',
      version: 'v1',
    }), second, deps);
    assert.equal(second.statusCode, 409);
    assert.deepEqual(second.body, { error: 'version_exists' });
    assert.equal(deps.docs.get('sbi_aof/v1')?.status, 'draft');
  });

  it('rejects non-admins, oversized PDFs, and more than four pages', async () => {
    const deps = memoryIngest();
    const unauth = mockRes();
    await handleIngest(jsonReq({ storagePath: 'uploads/a.pdf' }, ''), unauth, deps);
    assert.equal(unauth.statusCode, 401);
    assert.deepEqual(unauth.body, { error: 'unauthenticated' });

    const forbidden = mockRes();
    await handleIngest(jsonReq({ storagePath: 'uploads/a.pdf' }, 'Bearer user'), forbidden, deps);
    assert.equal(forbidden.statusCode, 403);

    const traversal = mockRes();
    await handleIngest(jsonReq({ storagePath: '../secrets/key' }), traversal, deps);
    assert.equal(traversal.statusCode, 400);
    assert.equal(deps.files.size, 0);

    const big = mockRes();
    await handleIngest(pdfReq(Buffer.alloc(10 * 1024 * 1024 + 1, 1)), big, deps);
    assert.equal(big.statusCode, 400);
    assert.deepEqual(big.body, { error: 'pdf_too_large' });

    const pages = mockRes();
    await handleIngest(pdfReq(await manyPages(5)), pages, deps);
    assert.equal(pages.statusCode, 400);
    assert.deepEqual(pages.body, { error: 'pdf_too_many_pages' });

    const garbage = mockRes();
    await handleIngest(pdfReq(Buffer.from('not a pdf')), garbage, deps);
    assert.equal(garbage.statusCode, 400);
    assert.deepEqual(garbage.body, { error: 'pdf_unreadable' });
    assert.equal(deps.docs.size, 0);
  });
});
