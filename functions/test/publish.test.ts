import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { FieldRecord, FormVersion } from '../../shared/forms/types';
import { canPublish, handlePublish } from '../src/ingest/handlers';
import { memoryPublish, mockRes } from './support';

function field(partial: Partial<FieldRecord> & Pick<FieldRecord, 'id' | 'confidence' | 'checked'>): FieldRecord {
  return {
    label: partial.id,
    type: 'text',
    required: false,
    pii: true,
    order: 0,
    page: 1,
    box: { x: 0, y: 0, w: 10, h: 10 },
    ...partial,
  };
}

function version(fields: FieldRecord[], status: FormVersion['status'] = 'draft'): FormVersion {
  return {
    formId: 'hdfc_aof',
    version: 'v1',
    bankId: 'HDFC',
    journey: 'aof_kyc',
    status,
    source: 'ocr',
    pdfPath: 'forms/hdfc_aof/versions/v1/source.pdf',
    fields,
  };
}

describe('publishForm', () => {
  it('publishes only when every low-confidence field is checked', async () => {
    const low = field({ id: 'custom_colour', confidence: 0.42, checked: false });
    const high = field({ id: 'dob', confidence: 0.91, checked: false });
    assert.equal(canPublish([high]), true);
    assert.equal(canPublish([low, high]), false);

    const blockedDeps = memoryPublish([version([low, high])]);
    const blocked = mockRes();
    await handlePublish({ method: 'POST', body: { formId: 'hdfc_aof', version: 'v1' }, headers: { authorization: 'Bearer admin' } }, blocked, blockedDeps);
    assert.equal(blocked.statusCode, 400);
    assert.equal((blocked.body as { error: string }).error, 'unchecked_low_confidence');
    assert.equal(blockedDeps.docs.get('hdfc_aof/v1')?.status, 'draft');

    const ready = version([field({ id: 'custom_colour', confidence: 0.42, checked: true }), high]);
    const okDeps = memoryPublish([ready]);
    const ok = mockRes();
    await handlePublish({ method: 'POST', body: { formId: 'hdfc_aof', version: 'v1' }, headers: { authorization: 'Bearer admin' } }, ok, okDeps);
    assert.equal(ok.statusCode, 200);
    assert.equal((ok.body as { formVersion: FormVersion }).formVersion.status, 'published');
    assert.equal(okDeps.docs.get('hdfc_aof/v1')?.status, 'published');

    const highOnly = memoryPublish([version([high])]);
    const highRes = mockRes();
    await handlePublish({ method: 'POST', body: { formId: 'hdfc_aof', version: 'v1' }, headers: { authorization: 'Bearer admin' } }, highRes, highOnly);
    assert.equal(highRes.statusCode, 200);
    assert.equal(highOnly.docs.get('hdfc_aof/v1')?.status, 'published');
  });

  it('returns not_found for a missing version', async () => {
    const missing = mockRes();
    await handlePublish(
      { method: 'POST', body: { formId: 'missing', version: 'v9' }, headers: { authorization: 'Bearer admin' } },
      missing,
      memoryPublish(),
    );
    assert.equal(missing.statusCode, 404);
    assert.deepEqual(missing.body, { error: 'not_found' });
  });

  it('rejects non-admins and retired forms', async () => {
    const deps = memoryPublish([version([field({ id: 'dob', confidence: 1, checked: false })], 'retired')]);
    const forbidden = mockRes();
    await handlePublish({ method: 'POST', body: { formId: 'hdfc_aof', version: 'v1' }, headers: { authorization: 'Bearer nope' } }, forbidden, deps);
    assert.equal(forbidden.statusCode, 403);
    assert.equal(deps.docs.get('hdfc_aof/v1')?.status, 'retired');

    const retired = mockRes();
    await handlePublish({ method: 'POST', body: { formId: 'hdfc_aof', version: 'v1' }, headers: { authorization: 'Bearer admin' } }, retired, deps);
    assert.equal(retired.statusCode, 409);
  });

  it('treats confidence 0.8 as high enough to publish unchecked', async () => {
    const deps = memoryPublish([version([field({ id: 'email', confidence: 0.8, checked: false })])]);
    const res = mockRes();
    await handlePublish({ method: 'POST', body: { formId: 'hdfc_aof', version: 'v1' }, headers: { authorization: 'Bearer admin' } }, res, deps);
    assert.equal(res.statusCode, 200);
  });
});
