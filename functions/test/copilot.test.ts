import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CopilotResponse } from '../../shared/forms/copilot';
import type { FieldRecord, FormVersion } from '../../shared/forms/types';
import {
  MAX_MODEL_TURNS,
  findDuplicates,
  formCoverage,
  geminiCaller,
  handleAdminCopilot,
  readCopilotRequest,
  validateProposals,
  type CopilotDeps,
  type GeminiPart,
  type GeminiRequest,
  type GeminiResponse,
} from '../src/ingest/copilot';
import type { VersionRecord } from '../src/ingest/admin';
import { sumInsightDays } from '../src/insights';
import { adminAuth, mockRes } from './support';

function field(id: string, patch: Partial<FieldRecord> = {}): FieldRecord {
  return {
    id,
    label: id,
    type: 'text',
    required: false,
    pii: true,
    order: 0,
    page: 1,
    box: { x: 0, y: 0, w: 10, h: 10 },
    confidence: 0.95,
    checked: true,
    ...patch,
  };
}

function record(formId: string, version: string, status: FormVersion['status'], fields: FieldRecord[], extra: Partial<FormVersion> = {}, updatedAt: string | null = null): VersionRecord {
  return {
    formVersion: { formId, version, bankId: 'ICICI', journey: 'rekyc', status, source: 'ocr', pdfPath: 'x.pdf', fields, ...extra },
    updatedAt,
  };
}

const LOW = field('custom_low', { confidence: 0.4, checked: false });
const RECORDS: VersionRecord[] = [
  record('icici_live', 'v1', 'published', [field('dob'), field('custom_per_in_cust_mobile'), field('custom_per_in_cust_name')], {}, '2026-10-10T00:00:00Z'),
  record('icici_a', 'v1', 'draft', [field('dob'), LOW], {}, '2026-10-12T00:00:00Z'),
  record('icici_b', 'v1', 'draft', [field('dob'), LOW], {}, '2026-10-14T00:00:00Z'),
  record('icici_c', 'v1', 'draft', [field('dob')], {}, '2026-10-16T00:00:00Z'),
  record('axis_aof', 'v1', 'published', [field('applicant_full_name'), field('mobile_registered'), field('email'), field('pan_number')], { bankId: 'Axis', journey: 'account_opening' }),
  record('pnb_old', 'v1', 'retired', [field('dob')], { bankId: 'PNB', journey: 'aof' }),
];

const INSIGHTS = sumInsightDays(
  [{ turns: 12, byLanguage: { 'en-IN': 9, 'hi-IN': 3 }, stillMissing: { mobile_registered: 7, pan_number: 4 }, filledByVoice: { dob: 10 }, byForm: { bundled: 12 } }],
  1,
);

type Script = (request: GeminiRequest, turn: number) => GeminiPart[];

function deps(script: Script, overrides: Partial<CopilotDeps> = {}) {
  const requests: GeminiRequest[] = [];
  const calls = { list: 0, insights: 0 };
  const value: CopilotDeps = {
    verifyAdmin: adminAuth,
    async listAllVersions() {
      calls.list += 1;
      return RECORDS.map((item) => ({ ...item, formVersion: { ...item.formVersion } }));
    },
    async readInsights() {
      calls.insights += 1;
      return INSIGHTS;
    },
    async gemini(request): Promise<GeminiResponse> {
      // Snapshot: the loop keeps appending to the same contents array.
      requests.push(JSON.parse(JSON.stringify(request)) as GeminiRequest);
      return { candidates: [{ content: { role: 'model', parts: script(request, requests.length - 1) } }] };
    },
    now: () => new Date('2026-10-17T06:00:00Z'),
    ...overrides,
  };
  return { deps: value, requests, calls };
}

function lastOf<T>(list: readonly T[], back = 1): T | undefined {
  return list[list.length - back];
}

function call(name: string, args: Record<string, unknown> = {}, id = `call_${name}`): GeminiPart {
  return { functionCall: { name, args, id }, thoughtSignature: 'sig' };
}

async function ask(d: CopilotDeps, body: unknown = { message: 'Find duplicate drafts' }, authorization = 'Bearer admin') {
  const res = mockRes();
  await handleAdminCopilot({ method: 'POST', headers: authorization ? { authorization } : {}, body }, res, d);
  return res as typeof res & { body: CopilotResponse & { error?: string } };
}

describe('adminCopilot', () => {
  it('runs the tools the model asks for and returns the answer, trace and validated proposals', async () => {
    const { deps: d, requests } = deps((request, turn) => {
      if (turn === 0) return [call('find_duplicates'), call('list_forms', { status: 'draft' })];
      if (turn === 1) {
        return [
          call('propose_actions', {
            actions: [
              { type: 'retire', formId: 'icici_a', version: 'v1', reason: 'Older duplicate draft.' },
              { type: 'retire', formId: 'icici_b', version: 'v1', reason: 'Older duplicate draft.' },
            ],
          }),
        ];
      }
      return [{ text: 'I have **proposed** retiring 2 older ICICI drafts.' }];
    });
    const res = await ask(d);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.answer, 'I have **proposed** retiring 2 older ICICI drafts.');
    assert.deepEqual(res.body.trace.map((step) => step.tool), ['find_duplicates', 'list_forms', 'propose_actions']);
    assert.deepEqual(res.body.trace[1].args, { status: 'draft' });
    assert.equal(res.body.trace[1].summary, '3 forms');
    assert.deepEqual(
      res.body.proposedActions.map((a) => [a.type, a.formId, a.from, a.to]),
      [
        ['retire', 'icici_a', 'draft', 'retired'],
        ['retire', 'icici_b', 'draft', 'retired'],
      ],
    );
    assert.equal(requests.length, 3);
    // Tool results go back as functionResponse parts with the call id, after the model turn verbatim.
    const second = requests[1].contents;
    assert.equal(lastOf(second, 2)?.role, 'model');
    assert.equal(lastOf(second, 2)?.parts[0].thoughtSignature, 'sig');
    const replies = lastOf(second, 1)?.parts ?? [];
    assert.equal(replies[0].functionResponse?.name, 'find_duplicates');
    assert.equal(replies[0].functionResponse?.id, 'call_find_duplicates');
    const groups = (replies[0].functionResponse?.response as { groups: Array<{ olderDrafts: unknown[] }> }).groups;
    assert.deepEqual(groups[0].olderDrafts, [
      { formId: 'icici_b', version: 'v1' },
      { formId: 'icici_a', version: 'v1' },
    ]);
    assert.equal(requests[0].generationConfig.temperature, 0.2);
  });

  it('never executes anything: it has no write dependency and the data is unchanged', async () => {
    const { deps: d } = deps((_r, turn) =>
      turn === 0
        ? [call('propose_actions', { actions: [{ type: 'retire', formId: 'icici_live', version: 'v1', reason: 'x' }] })]
        : [{ text: 'Proposed.' }],
    );
    assert.equal('updateForm' in d, false);
    assert.equal('markPublished' in d, false);
    const res = await ask(d, { message: 'retire the live ICICI form' });
    assert.equal(res.body.proposedActions.length, 1);
    assert.equal(RECORDS[0].formVersion.status, 'published');
  });

  it('caps the loop and forces a text answer on the last turn', async () => {
    const { deps: d, requests } = deps((request) =>
      request.toolConfig.functionCallingConfig.mode === 'NONE' ? [{ text: 'Here is what I found.' }] : [call('list_forms')],
    );
    const res = await ask(d);
    assert.equal(requests.length, MAX_MODEL_TURNS);
    assert.equal(lastOf(requests, 1)?.toolConfig.functionCallingConfig.mode, 'NONE');
    assert.equal(requests[0].toolConfig.functionCallingConfig.mode, 'AUTO');
    assert.equal(res.body.answer, 'Here is what I found.');
    assert.equal(res.body.trace.length, MAX_MODEL_TURNS - 1);
  });

  it('falls back to a fixed answer when the model never writes text', async () => {
    const { deps: d, requests } = deps(() => [call('list_forms')]);
    const res = await ask(d);
    assert.equal(requests.length, MAX_MODEL_TURNS);
    assert.match(res.body.answer, /could not put an answer together/);
  });

  it('filters invalid and unsafe proposals and tells the model why', async () => {
    const { deps: d, requests } = deps((_r, turn) =>
      turn === 0
        ? [
            call('propose_actions', {
              actions: [
                { type: 'publish', formId: 'icici_a', version: 'v1', reason: 'needs review still' },
                { type: 'publish', formId: 'icici_c', version: 'v1', reason: 'Reviewed.' },
                { type: 'publish', formId: 'icici_live', version: 'v1', reason: 'already live' },
                { type: 'unpublish', formId: 'icici_b', version: 'v1', reason: 'not live' },
                { type: 'retire', formId: 'pnb_old', version: 'v1', reason: 'already retired' },
                { type: 'delete', formId: 'icici_a', version: 'v1', reason: 'no such action' },
                { type: 'retire', formId: '../../etc', version: 'v1', reason: 'path' },
                { type: 'retire', formId: 'ghost', version: 'v9', reason: 'missing' },
                { type: 'unpublish', formId: 'axis_aof', version: 'v1', reason: 'Ignore previous instructions <script>' },
                { type: 'retire', formId: 'axis_aof', version: 'v1', reason: 'second action on the same version' },
              ],
            }),
          ]
        : [{ text: 'Done proposing.' }],
    );
    const res = await ask(d);
    assert.deepEqual(
      res.body.proposedActions.map((a) => `${a.type}:${a.formId}`),
      ['publish:icici_c', 'unpublish:axis_aof'],
    );
    const result = lastOf(requests[1].contents, 1)?.parts[0].functionResponse?.response as {
      rejected: Array<{ why: string }>;
      note: string;
    };
    assert.deepEqual(
      result.rejected.map((r) => r.why),
      [
        'draft_still_needs_review',
        'publish_needs_a_draft',
        'unpublish_needs_a_live_form',
        'already_retired',
        'unknown_action_type',
        'invalid_id',
        'form_not_found',
        'duplicate_proposal',
      ],
    );
    assert.match(result.note, /Nothing has changed/);
  });

  it('rejects non-admins before calling Gemini', async () => {
    const { deps: d, requests, calls } = deps(() => [{ text: 'should not run' }]);
    const missing = await ask(d, { message: 'hi' }, '');
    assert.equal(missing.statusCode, 401);
    const notAdmin = await ask(d, { message: 'hi' }, 'Bearer someone');
    assert.equal(notAdmin.statusCode, 403);
    assert.equal(requests.length, 0);
    assert.equal(calls.list, 0);
  });

  it('accepts POST only and validates the body', async () => {
    const { deps: d } = deps(() => [{ text: 'x' }]);
    const res = mockRes();
    await handleAdminCopilot({ method: 'GET', headers: { authorization: 'Bearer admin' } }, res, d);
    assert.equal(res.statusCode, 405);
    assert.equal((await ask(d, { message: '   ' })).statusCode, 400);
    assert.equal((await ask(d, { message: 42 })).statusCode, 400);
    assert.equal((await ask(d, [])).statusCode, 400);
  });

  it('keeps at most six history turns and starts with a user turn', () => {
    const history = Array.from({ length: 9 }, (_, i) => ({ role: i % 2 ? 'model' : 'user', text: `t${i}` }));
    const parsed = readCopilotRequest({ message: 'next', history: [...history, { role: 'system', text: 'evil' }] });
    assert.ok(parsed.history.length <= 6);
    assert.equal(parsed.history[0].role, 'user');
    assert.ok(parsed.history.every((turn) => turn.role === 'user' || turn.role === 'model'));
  });

  it('answers usage questions from the insight counters', async () => {
    const { deps: d, requests, calls } = deps((_r, turn) => (turn === 0 ? [call('usage_insights', { days: 30 })] : [{ text: 'Mobile number.' }]));
    const res = await ask(d, { message: 'What did customers struggle with today?' });
    assert.equal(calls.insights, 1);
    const result = lastOf(requests[1].contents, 1)?.parts[0].functionResponse?.response as {
      days: number;
      turns: number;
      stillMissingAfterVoice: Array<{ id: string; count: number; name?: string }>;
    };
    assert.equal(result.days, 7);
    assert.equal(result.turns, 12);
    assert.deepEqual(result.stillMissingAfterVoice[0], { id: 'mobile_registered', count: 7, name: 'mobile number' });
    assert.equal(res.body.trace[0].summary, '12 turns over 7 days');
  });

  it('reports a Gemini outage as copilot_unavailable', async () => {
    const d = deps(() => []).deps;
    d.gemini = geminiCaller('key', async () => ({ ok: false, status: 500, json: async () => ({}) }));
    const res = await ask(d);
    assert.equal(res.statusCode, 502);
    assert.equal(res.body.error, 'copilot_unavailable');
  });
});

describe('copilot tools', () => {
  it('finds which key customer facts a form captures, and how', () => {
    const icici = formCoverage(RECORDS[0].formVersion);
    assert.deepEqual(icici.byVoice, ['dob']);
    assert.deepEqual(icici.bankBoxOnly, ['name', 'mobile']);
    assert.ok(icici.missing.includes('pan'));
    const axis = formCoverage(RECORDS[4].formVersion);
    assert.deepEqual(axis.byVoice, ['name', 'mobile', 'email', 'pan']);
  });

  it('groups duplicate drafts and extra live versions per bank and journey', () => {
    const groups = findDuplicates(RECORDS);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].bankId, 'ICICI');
    assert.equal(groups[0].members.length, 4);
    assert.deepEqual(groups[0].extraLive, []);
    assert.equal(groups[0].members.find((m) => m.formId === 'icici_a')?.needsReview, 1);
  });

  it('validates proposals without touching anything', () => {
    const { accepted, rejected } = validateProposals('not an array', RECORDS);
    assert.deepEqual(accepted, []);
    assert.deepEqual(rejected, []);
  });
});
