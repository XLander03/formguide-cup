import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AdminFormsResponse } from '../../shared/forms/admin';
import type { FieldRecord, FormVersion } from '../../shared/forms/types';
import {
  handleAdminForm,
  handleAdminFormPdf,
  handleAdminForms,
  handleSetFormStatus,
  parentStatusFor,
  type AdminPdfRes,
  type AdminReq,
} from '../src/ingest/admin';
import { handlePublish } from '../src/ingest/handlers';
import { updatedAtFromDoc, versionDocForWrite, versionDocWithTime } from '../src/ingest/versionDoc';
import { memoryForms, mockRes } from './support';

function field(partial: Partial<FieldRecord> & Pick<FieldRecord, 'id'>): FieldRecord {
  return {
    label: partial.id,
    type: 'text',
    required: false,
    pii: true,
    order: 0,
    page: 1,
    box: { x: 0, y: 0, w: 10, h: 10 },
    confidence: 0.95,
    checked: false,
    ...partial,
  };
}

function version(formId: string, v: string, status: FormVersion['status'], fields: FieldRecord[]): FormVersion {
  return {
    formId,
    version: v,
    bankId: 'HDFC',
    journey: 'aof_kyc',
    status,
    source: 'ocr',
    pdfPath: `forms/${formId}/versions/${v}/source.pdf`,
    fields,
  };
}

const PUBLISHED = version('hdfc_aof', 'v1', 'published', [field({ id: 'dob' }), field({ id: 'custom_colour' })]);
const DRAFT = version('axis_aof', 'v1', 'draft', [
  field({ id: 'pan_number', confidence: 0.4 }),
  field({ id: 'custom_x', confidence: 0.5 }),
  field({ id: 'custom_y', confidence: 0.5, checked: true }),
  field({ id: 'email' }),
]);

function get(path: string, query: Record<string, unknown> = {}, authorization = 'Bearer admin'): AdminReq {
  return { method: 'GET', headers: authorization ? { authorization } : {}, query, body: undefined };
}

function post(body: unknown, authorization = 'Bearer admin'): AdminReq {
  return { method: 'POST', headers: { authorization, 'content-type': 'application/json' }, body };
}

function pdfRes(): AdminPdfRes & { statusCode: number; body: unknown; headers: Record<string, string> } {
  const headers: Record<string, string> = {};
  const res = Object.assign(mockRes(), {
    headers,
    set(name: string, value: string) {
      headers[name] = value;
      return res;
    },
    send(body: Buffer) {
      res.body = body;
      return res;
    },
  });
  return res;
}

function seeded() {
  return memoryForms([
    { doc: versionDocWithTime(PUBLISHED, '2026-10-16T10:00:00.000Z') as unknown as Record<string, unknown> },
    { doc: versionDocWithTime(DRAFT, '2026-10-17T09:00:00.000Z') as unknown as Record<string, unknown> },
  ]);
}

describe('admin endpoints', () => {
  it('reject callers without an admin token on every endpoint', async () => {
    const deps = seeded();
    const q = { formId: 'hdfc_aof', version: 'v1' };
    for (const [auth, code] of [['', 401], ['Bearer someone', 403]] as const) {
      const list = mockRes();
      await handleAdminForms(get('', {}, auth), list, deps);
      assert.equal(list.statusCode, code);
      const one = mockRes();
      await handleAdminForm(get('', q, auth), one, deps);
      assert.equal(one.statusCode, code);
      const pdf = pdfRes();
      await handleAdminFormPdf(get('', q, auth), pdf, deps);
      assert.equal(pdf.statusCode, code);
      assert.equal(Buffer.isBuffer(pdf.body), false);
      const status = mockRes();
      await handleSetFormStatus(post({ ...q, status: 'draft' }, auth || 'Basic x'), status, deps);
      assert.equal(status.statusCode, code);
    }
    assert.equal(deps.parents.get('hdfc_aof')?.status, 'published');
  });

  it('lists the newest version of every form, drafts included, newest first with stats', async () => {
    const deps = seeded();
    // An older v1 and a newer v2 of the same form: only v2 is listed, even though v1 was touched later.
    deps.docs.set('axis_aof/v2', versionDocWithTime({ ...DRAFT, version: 'v2', fields: [field({ id: 'dob' })] }, '2026-10-17T08:00:00.000Z') as unknown as Record<string, unknown>);
    // A legacy doc with no updatedAt sorts last.
    deps.docs.set('old_form/v1', versionDocForWrite(version('old_form', 'v1', 'retired', [])) as unknown as Record<string, unknown>);
    deps.voice = 42;
    const res = mockRes();
    await handleAdminForms(get(''), res, deps);
    assert.equal(res.statusCode, 200);
    const body = res.body as AdminFormsResponse;
    assert.deepEqual(body.forms.map((row) => `${row.formId}/${row.version}`), ['axis_aof/v2', 'hdfc_aof/v1', 'old_form/v1']);
    const [axis, hdfc, old] = body.forms;
    assert.equal(axis.status, 'draft');
    assert.equal(axis.needsReview, 0);
    assert.equal(axis.updatedAt, '2026-10-17T08:00:00.000Z');
    assert.equal(hdfc.status, 'published');
    assert.equal(hdfc.fieldCount, 2);
    assert.equal(hdfc.sharedCount, 1);
    assert.equal(hdfc.needsReview, 0);
    assert.equal(old.updatedAt, null);
    assert.deepEqual(body.stats, { publishedForms: 1, draftForms: 1, fieldsAwaitingReview: 0, voiceRequests24h: 42 });
  });

  it('counts fields needing review on a draft and reports null voice counts when unreadable', async () => {
    const deps = seeded();
    deps.voice = new Error('index missing');
    const res = mockRes();
    await handleAdminForms(get(''), res, deps);
    const body = res.body as AdminFormsResponse;
    const axis = body.forms.find((row) => row.formId === 'axis_aof');
    assert.equal(axis?.fieldCount, 4);
    assert.equal(axis?.sharedCount, 2);
    assert.equal(axis?.needsReview, 2);
    assert.equal(body.stats.fieldsAwaitingReview, 2);
    assert.equal(body.stats.voiceRequests24h, null);
  });

  it('reads a draft whose doc kept only the payload copy', async () => {
    const deps = seeded();
    const slim = versionDocWithTime(DRAFT, '2026-10-17T09:00:00.000Z') as unknown as Record<string, unknown>;
    delete slim.fields;
    deps.docs.set('axis_aof/v1', slim);
    const res = mockRes();
    await handleAdminForm(get('', { formId: 'axis_aof', version: 'v1' }), res, deps);
    assert.equal(res.statusCode, 200);
    const { formVersion } = res.body as { formVersion: FormVersion & { updatedAt?: unknown; payload?: unknown } };
    assert.equal(formVersion.status, 'draft');
    assert.equal(formVersion.fields.length, 4);
    assert.equal(formVersion.fields[0].id, 'pan_number');
    assert.equal('payload' in formVersion, false);
    assert.equal('updatedAt' in formVersion, false);

    const missing = mockRes();
    await handleAdminForm(get('', { formId: 'axis_aof', version: 'v9' }), missing, deps);
    assert.equal(missing.statusCode, 404);
  });

  it('serves the source PDF of a draft, privately', async () => {
    const deps = seeded();
    deps.files.set(DRAFT.pdfPath, Buffer.from('%PDF-1.7 draft'));
    const res = pdfRes();
    await handleAdminFormPdf(get('', { formId: 'axis_aof', version: 'v1' }), res, deps);
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['Content-Type'], 'application/pdf');
    assert.equal(res.headers['Cache-Control'], 'private, no-store');
    assert.equal(String(res.body), '%PDF-1.7 draft');

    const noFile = pdfRes();
    await handleAdminFormPdf(get('', { formId: 'hdfc_aof', version: 'v1' }), noFile, deps);
    assert.equal(noFile.statusCode, 404);
  });

  it('unpublishes to draft, drops the form from the catalog, and lets it be published again', async () => {
    const deps = seeded();
    assert.deepEqual(deps.listPublished().map((form) => form.formId), ['hdfc_aof']);

    const res = mockRes();
    await handleSetFormStatus(post({ formId: 'hdfc_aof', version: 'v1', status: 'draft' }), res, deps);
    assert.equal(res.statusCode, 200);
    assert.equal((res.body as { formVersion: FormVersion }).formVersion.status, 'draft');
    assert.equal(deps.parents.get('hdfc_aof')?.status, 'draft');
    assert.equal(JSON.parse(String(deps.docs.get('hdfc_aof/v1')?.payload)).status, 'draft');
    assert.notEqual(updatedAtFromDoc(deps.docs.get('hdfc_aof/v1')), '2026-10-16T10:00:00.000Z');
    assert.deepEqual(deps.listPublished(), []);

    const again = mockRes();
    await handlePublish(post({ formId: 'hdfc_aof', version: 'v1' }), again, deps);
    assert.equal(again.statusCode, 200);
    assert.equal(deps.parents.get('hdfc_aof')?.status, 'published');
    assert.deepEqual(deps.listPublished().map((form) => form.formId), ['hdfc_aof']);
  });

  it('keeps the parent published while another version is still live', async () => {
    const deps = seeded();
    deps.docs.set('hdfc_aof/v2', versionDocWithTime({ ...PUBLISHED, version: 'v2' }, '2026-10-17T10:00:00.000Z') as unknown as Record<string, unknown>);
    const res = mockRes();
    await handleSetFormStatus(post({ formId: 'hdfc_aof', version: 'v2', status: 'retired' }), res, deps);
    assert.equal(res.statusCode, 200);
    assert.equal(deps.parents.get('hdfc_aof')?.status, 'published');
    assert.deepEqual(deps.listPublished().map((form) => `${form.formId}/${form.version}`), ['hdfc_aof/v1']);
  });

  it('retires a form for good: publish and unpublish are both refused', async () => {
    const deps = seeded();
    const res = mockRes();
    await handleSetFormStatus(post({ formId: 'hdfc_aof', version: 'v1', status: 'retired' }), res, deps);
    assert.equal(res.statusCode, 200);
    assert.equal(deps.parents.get('hdfc_aof')?.status, 'retired');
    assert.deepEqual(deps.listPublished(), []);

    const publish = mockRes();
    await handlePublish(post({ formId: 'hdfc_aof', version: 'v1' }), publish, deps);
    assert.equal(publish.statusCode, 409);
    const back = mockRes();
    await handleSetFormStatus(post({ formId: 'hdfc_aof', version: 'v1', status: 'draft' }), back, deps);
    assert.equal(back.statusCode, 409);
    assert.equal(deps.parents.get('hdfc_aof')?.status, 'retired');
  });

  it('rejects bad input with 400 and missing versions with 404', async () => {
    const deps = seeded();
    const bodies: unknown[] = [
      undefined,
      [],
      { formId: 'hdfc_aof', version: 'v1' },
      { formId: 'hdfc_aof', version: 'v1', status: 'published' },
      { formId: '../x', version: 'v1', status: 'draft' },
      { formId: 'hdfc_aof', version: 7, status: 'draft' },
    ];
    for (const body of bodies) {
      const res = mockRes();
      await handleSetFormStatus(post(body), res, deps);
      assert.equal(res.statusCode, 400, JSON.stringify(body));
    }
    for (const query of [{}, { formId: 'hdfc_aof' }, { formId: 'a b', version: 'v1' }, { formId: 'x'.repeat(81), version: 'v1' }]) {
      const one = mockRes();
      await handleAdminForm(get('', query), one, deps);
      assert.equal(one.statusCode, 400);
      const pdf = pdfRes();
      await handleAdminFormPdf(get('', query), pdf, deps);
      assert.equal(pdf.statusCode, 400);
    }
    const missing = mockRes();
    await handleSetFormStatus(post({ formId: 'hdfc_aof', version: 'v9', status: 'draft' }), missing, deps);
    assert.equal(missing.statusCode, 404);
    const wrongMethod = mockRes();
    await handleAdminForms({ method: 'POST', headers: { authorization: 'Bearer admin' } }, wrongMethod, deps);
    assert.equal(wrongMethod.statusCode, 405);
    assert.equal(deps.parents.get('hdfc_aof')?.status, 'published');
  });

  it('derives the parent status from all versions', () => {
    assert.equal(parentStatusFor(['retired', 'published', 'draft']), 'published');
    assert.equal(parentStatusFor(['retired', 'draft']), 'draft');
    assert.equal(parentStatusFor(['retired']), 'retired');
  });

  it('reads updatedAt from an ISO string or a Firestore timestamp', () => {
    assert.equal(updatedAtFromDoc({ updatedAt: '2026-10-17T09:00:00Z' }), '2026-10-17T09:00:00.000Z');
    assert.equal(updatedAtFromDoc({ updatedAt: { toDate: () => new Date('2026-10-17T09:00:00Z') } }), '2026-10-17T09:00:00.000Z');
    assert.equal(updatedAtFromDoc({}), null);
    assert.equal(updatedAtFromDoc({ updatedAt: 'nonsense' }), null);
  });
});
