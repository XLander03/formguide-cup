import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { AUTO_ACCEPT_ABOVE } from '../../shared/forms/review';
import type { FieldRecord, FormVersion } from '../../shared/forms/types';
import { draftFromPdf } from '../src/ingest/draft';
import type { OcrField } from '../src/ingest/geminiOcr';
import { handleIngest } from '../src/ingest/handlers';
import {
  buildVerifyPrompt,
  describeMove,
  drawMarks,
  MAX_MARKS_PER_PAGE,
  marksDataPart,
  parseVerdicts,
  pdfBoxToUnit,
  retryDelayFrom,
  runVerifyAgent,
  selectForCheck,
  verifyMarksWithGemini,
  VERIFY_FALLBACK_MODEL,
  VERIFY_MODEL,
  VERIFY_MODELS,
  type VerifyAskInput,
  type VerifyPageFn,
} from '../src/ingest/verifyAgent';
import { acroPdf, flatPdf, SENTINEL } from './pdfSamples';
import { memoryIngest, mockRes, pdfReq } from './support';

const PAGE = { width: 600, height: 800 };

function blankPng(width = 300, height = 400): Buffer {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  return canvas.toBuffer('image/png');
}

function field(id: string, box: FieldRecord['box'], extra: Partial<FieldRecord> = {}): FieldRecord {
  return {
    id,
    label: id.replace(/_/g, ' '),
    type: 'text',
    required: false,
    pii: true,
    order: 0,
    confidence: 0.95,
    checked: true,
    page: 1,
    box,
    ...extra,
  };
}


function agentInput(fields: FieldRecord[], ask: VerifyPageFn, extra: Partial<Parameters<typeof runVerifyAgent>[0]> = {}) {
  return {
    fields,
    pages: [{ page: 1, png: blankPng(), width: 300, height: 400 }],
    pageCount: 1,
    pageSize: () => PAGE,
    ask,
    ...extra,
  };
}

describe('ingest agent: observe', () => {
  it('draws a numbered, high-contrast rectangle per mark on the page image', async () => {
    const png = blankPng(300, 400);
    const out = await drawMarks(png, [{ n: 7, box: { x: 0.5, y: 0.5, w: 0.3, h: 0.05 } }]);
    assert.equal(out.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    const image = await loadImage(out);
    assert.equal(image.width, 300);
    assert.equal(image.height, 400);
    const canvas = createCanvas(300, 400);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    const pixel = (x: number, y: number) => [...ctx.getImageData(x, y, 1, 1).data.slice(0, 3)];
    // Top edge of the outline, mid-width: the first mark colour (#e0007a).
    assert.deepEqual(pixel(195, 200), [0xe0, 0x00, 0x7a]);
    // Inside the box stays the page.
    assert.deepEqual(pixel(195, 210), [255, 255, 255]);
    // The number tag sits just left of the box, on its line: coloured, with white strokes.
    const tag = [];
    for (let x = 135; x < 150; x += 1) tag.push(pixel(x, 210).join(','));
    assert.ok(tag.includes('224,0,122'), 'tag fill');
    assert.ok(tag.includes('255,255,255'), 'digit strokes');
    // Far from the mark nothing changed.
    assert.deepEqual(pixel(20, 20), [255, 255, 255]);
  });

  it('checks every shared id and required field, shared ids first, capped per page', () => {
    const fields = [
      field('custom_note', { x: 0, y: 0, w: 10, h: 10 }),
      field('custom_branch', { x: 0, y: 0, w: 10, h: 10 }, { required: true }),
      field('dob', { x: 0, y: 0, w: 10, h: 10 }),
      field('pan_number', { x: 0, y: 0, w: 10, h: 10 }, { page: 2 }),
      field('email', { x: 0, y: 0, w: 10, h: 10 }),
    ];
    assert.deepEqual(selectForCheck(fields, 1), [2, 4, 1]);
    assert.deepEqual(selectForCheck(fields, 2), [3]);
    const many = Array.from({ length: 60 }, (_, i) => field(i < 50 ? `custom_req_${i}` : `shared_${i}`, { x: 0, y: 0, w: 1, h: 1 }, { required: true }));
    const picked = selectForCheck(many, 1);
    assert.equal(picked.length, MAX_MARKS_PER_PAGE);
    assert.deepEqual(picked.slice(0, 10), [50, 51, 52, 53, 54, 55, 56, 57, 58, 59]);
  });

  it('keeps page text out of the instructions: labels travel as a cleaned JSON data part', () => {
    const prompt = buildVerifyPrompt(1, 2);
    assert.match(prompt, /untrusted data/);
    assert.match(prompt, /page 1 of 2/);
    const data = marksDataPart([{ n: 1, label: `${SENTINEL}\n\u0007${'x'.repeat(200)}`, fills: 'Date of birth' }]);
    assert.match(data, /^Marks \(untrusted data/);
    const rows = JSON.parse(data.slice(data.indexOf('\n') + 1)) as Array<{ n: number; label: string; fills: string }>;
    assert.equal(rows[0].label.length, 80);
    assert.equal(/[\u0000-\u001F]/.test(rows[0].label), false);
    assert.equal(rows[0].fills, 'Date of birth');
    assert.throws(() => buildVerifyPrompt(3, 2));
  });

  it('parses verdicts, dropping unknown, repeated and malformed rows and broken boxes', () => {
    const verdicts = parseVerdicts(JSON.stringify({
      checks: [
        { n: 1, ok: true, reason: 'On the input.' },
        { n: 1, ok: false, reason: 'duplicate' },
        { n: 2, ok: false, reason: 'One row low.', corrected_box_2d: [100, 200, 150, 600] },
        { n: 3, ok: false, reason: 'Broken box.', corrected_box_2d: [100, 200, 1500, 600] },
        { n: 9, ok: true, reason: 'not a mark' },
        { n: 4, reason: 'no ok' },
      ],
    }), new Set([1, 2, 3, 4]));
    assert.equal(verdicts.length, 3);
    assert.deepEqual(verdicts[0], { n: 1, ok: true, reason: 'On the input.' });
    assert.equal(verdicts[1].correctedBox?.y, 0.1);
    assert.equal(verdicts[1].correctedBox?.x, 0.2);
    assert.ok(Math.abs((verdicts[1].correctedBox?.w ?? 0) - 0.4) < 1e-9);
    // A repaired (out-of-range) correction is not trusted as a box.
    assert.equal(verdicts[2].correctedBox, undefined);
    assert.throws(() => parseVerdicts('not json', new Set([1])), /verify_bad_json/);
  });

  it('describes moves in plain words', () => {
    assert.equal(describeMove({ x: 100, y: 500, w: 200, h: 14 }, { x: 100, y: 514, w: 200, h: 14 }), 'Moved up 14pt.');
    assert.equal(describeMove({ x: 100, y: 500, w: 200, h: 14 }, { x: 140, y: 490, w: 200, h: 14 }), 'Moved down 10pt and right 40pt.');
    assert.equal(describeMove({ x: 100, y: 500, w: 200, h: 14 }, { x: 99, y: 499, w: 202, h: 16 }), 'Resized to fit the input.');
  });
});

describe('ingest agent: act and verify', () => {
  it('verifies right boxes, applies a confirmed correction, and holds an unfixable field', async () => {
    const fields = [
      field('dob', { x: 60, y: 700, w: 120, h: 16 }, { confidence: 0.7, checked: false }),
      field('addr_current_city', { x: 60, y: 600, w: 200, h: 16 }),
      field('addr_current_state', { x: 60, y: 560, w: 200, h: 16 }, { confidence: 0.97 }),
      field('custom_optional', { x: 60, y: 500, w: 200, h: 16 }),
    ];
    const calls: VerifyAskInput[] = [];
    // City sits one row low: the model points 20pt up (25 units of 1000 on an 800pt page).
    const cityFixed = { x: 0.1, y: 1 - (620 + 16) / 800, w: 200 / 600, h: 16 / 800 };
    const ask: VerifyPageFn = async (input) => {
      calls.push(input);
      if (input.round === 1) {
        return [
          { n: 1, ok: true, reason: 'On the date boxes.' },
          { n: 2, ok: false, reason: 'Sits one row low, on the State input.', correctedBox: cityFixed },
          { n: 3, ok: false, reason: 'Covers the printed label.' },
        ];
      }
      return [{ n: 1, ok: true, reason: 'On the City input.' }];
    };
    const result = await runVerifyAgent(agentInput(fields, ask));
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0].marks.map((mark) => mark.n), [1, 2, 3]);
    assert.equal(calls[0].marks[0].fills, 'Date of birth');
    assert.equal(calls[0].png.equals(calls[0].original), false, 'round 1 image carries the marks');
    // Round 2 re-checks only the corrected field, drawn at its new place.
    assert.deepEqual(calls[1].marks.map((mark) => mark.label), ['addr current city']);
    assert.equal(calls[1].round, 2);

    const [dob, city, state, optional] = result.fields;
    assert.equal(dob.agent?.status, 'verified');
    assert.equal(dob.checked, true, 'a verified field is accepted');
    assert.equal(dob.confidence, 0.7);
    assert.deepEqual(dob.box, fields[0].box);

    assert.equal(city.agent?.status, 'fixed');
    assert.equal(city.checked, true);
    assert.deepEqual(city.box, { x: 60, y: 620, w: 200, h: 16 });
    assert.match(city.agent?.note ?? '', /^Moved up 20pt\. Sits one row low, on the State input\.$/);

    assert.equal(state.agent?.status, 'unresolved');
    assert.equal(state.checked, false, 'never accepted when the agent did not confirm it');
    assert.equal(state.confidence, AUTO_ACCEPT_ABOVE);
    assert.deepEqual(state.box, fields[2].box);
    assert.match(state.agent?.note ?? '', /Covers the printed label\. Please place it\./);

    assert.equal(optional.agent, undefined, 'optional bank-only fields are not checked');
    assert.equal(optional.checked, true);
    assert.equal(result.summary.checked, 3);
    assert.equal(result.summary.fixed, 1);
    assert.equal(result.summary.unresolved, 1);
    assert.equal(result.summary.pages, 1);
    assert.equal(result.summary.pagesFailed, 0);
  });

  it('does not apply a correction the second look rejects, and holds the field', async () => {
    const fields = [field('addr_current_city', { x: 60, y: 600, w: 200, h: 16 })];
    const ask: VerifyPageFn = async (input) => input.round === 1
      ? [{ n: 1, ok: false, reason: 'On the Landmark input.', correctedBox: { x: 0.1, y: 0.2, w: 0.3, h: 0.02 } }]
      : [{ n: 1, ok: false, reason: 'Now on the State input.', correctedBox: { x: 0.5, y: 0.5, w: 0.3, h: 0.02 } }];
    const result = await runVerifyAgent(agentInput(fields, ask));
    const [city] = result.fields;
    assert.equal(city.agent?.status, 'unresolved');
    assert.equal(city.checked, false);
    assert.equal(city.confidence, AUTO_ACCEPT_ABOVE);
    assert.deepEqual(city.box, fields[0].box, 'an unconfirmed move is not applied');
    assert.match(city.agent?.note ?? '', /Tried moving it/);
  });

  it('settles a rejection that points at the same place with a second look, without moving the box', async () => {
    const fields = [
      field('dob', { x: 60, y: 600, w: 200, h: 16 }, { confidence: 0.7, checked: false }),
      field('email', { x: 60, y: 500, w: 200, h: 16 }),
    ];
    const same = (index: number) => {
      const box = pdfBoxToUnit(fields[index].box, PAGE.width, PAGE.height);
      return { ...box, x: box.x + 0.001 };
    };
    const calls: VerifyAskInput[] = [];
    const result = await runVerifyAgent(agentInput(fields, async (input) => {
      calls.push(input);
      if (input.round === 1) {
        return [
          { n: 1, ok: false, reason: 'On the City boxes.', correctedBox: same(0) },
          { n: 2, ok: false, reason: 'On the label.', correctedBox: same(1) },
        ];
      }
      return [{ n: 1, ok: true, reason: 'On the input.' }, { n: 2, ok: false, reason: 'Still on the label.' }];
    }));
    assert.equal(calls.length, 2);
    assert.equal(calls[1].marks.length, 2);
    const [dob, email] = result.fields;
    assert.equal(dob.agent?.status, 'verified');
    assert.equal(dob.checked, true);
    assert.deepEqual(dob.box, fields[0].box);
    assert.equal(email.agent?.status, 'unresolved');
    assert.equal(email.checked, false);
    assert.deepEqual(email.box, fields[1].box);
    assert.equal(/Tried/.test(email.agent?.note ?? ''), false);
  });

  it('holds a rejected field with no usable box after one call', async () => {
    const fields = [field('dob', { x: 60, y: 600, w: 200, h: 16 })];
    let calls = 0;
    const result = await runVerifyAgent(agentInput(fields, async () => {
      calls += 1;
      return [{ n: 1, ok: false, reason: 'Covers the label.', correctedBox: { x: 0, y: 0, w: 0.9, h: 0.9 } }];
    }));
    assert.equal(calls, 1);
    assert.equal(result.fields[0].agent?.status, 'unresolved');
    assert.equal(result.fields[0].confidence, AUTO_ACCEPT_ABOVE);
  });

  it('holds corrected fields when the re-check call fails', async () => {
    const fields = [field('dob', { x: 60, y: 600, w: 200, h: 16 })];
    const result = await runVerifyAgent(agentInput(fields, async (input) => {
      if (input.round === 2) throw new Error('503');
      return [{ n: 1, ok: false, reason: 'One row low.', correctedBox: { x: 0.1, y: 0.2, w: 0.3, h: 0.02 } }];
    }, { log: () => undefined }));
    assert.equal(result.fields[0].agent?.status, 'unresolved');
    assert.deepEqual(result.fields[0].box, fields[0].box);
    assert.match(result.fields[0].agent?.note ?? '', /re-check failed/);
  });

  it('leaves a page as placed when its check fails, and other pages still run', async () => {
    const fields = [
      field('dob', { x: 60, y: 600, w: 200, h: 16 }, { confidence: 0.6, checked: false }),
      field('email', { x: 60, y: 600, w: 200, h: 16 }, { page: 2 }),
    ];
    const events: string[] = [];
    const result = await runVerifyAgent({
      ...agentInput(fields, async (input) => {
        if (input.page === 1) throw new Error('HTTP 500');
        return [{ n: 1, ok: true, reason: 'ok' }];
      }),
      pages: [1, 2].map((page) => ({ page, png: blankPng(), width: 300, height: 400 })),
      pageCount: 2,
      log: (event) => events.push(event),
    });
    assert.equal(result.fields[0].agent, undefined);
    assert.equal(result.fields[0].checked, false, 'not accepted without a check');
    assert.equal(result.fields[0].confidence, 0.6);
    assert.equal(result.fields[1].agent?.status, 'verified');
    assert.equal(result.summary.pages, 1);
    assert.equal(result.summary.pagesFailed, 1);
    assert.deepEqual(events, ['agent_page_failed']);
  });

  it('skips pages once the time budget is spent', async () => {
    const fields = [field('dob', { x: 60, y: 600, w: 200, h: 16 })];
    let t = 0;
    let calls = 0;
    const result = await runVerifyAgent(agentInput(fields, async () => {
      calls += 1;
      return [];
    }, { budgetMs: 10, now: () => (t += 100), log: () => undefined }));
    assert.equal(calls, 0);
    assert.equal(result.fields[0].agent, undefined);
    assert.equal(result.summary.pagesFailed, 1);
  });
});

function ocrStub(page: number): OcrField[] {
  if (page === 1) {
    return [{
      label: 'Date of birth',
      type: 'text',
      required: false,
      box: { x: 0.1, y: 0.2, w: 0.4, h: 0.05 },
      labelBox: { x: 0.1, y: 0.1, w: 0.15, h: 0.02 },
      confidence: 0.91,
    }];
  }
  return [{ label: 'Favourite colour', type: 'text', required: true, box: { x: 0.2, y: 0.2, w: 0.3, h: 0.03 }, confidence: 0.42 }];
}

describe('ingest agent: wired into ingest', () => {
  it('runs after placement on OCR pages and returns a summary', async () => {
    const bytes = await flatPdf();
    const seen: VerifyAskInput[] = [];
    const draft = await draftFromPdf(bytes, async (input) => ocrStub(input.page), {
      async verifyPage(input) {
        seen.push(input);
        if (input.page === 1) return [{ n: 1, ok: false, reason: 'Covers the printed label.' }];
        return [{ n: 1, ok: true, reason: 'On the input.' }];
      },
    });
    assert.deepEqual(seen.map((input) => input.page).sort(), [1, 2]);
    assert.equal(JSON.stringify(seen.map((input) => input.marks)).includes(SENTINEL), false);
    const dob = draft.fields.find((item) => item.id === 'dob');
    assert.equal(dob?.agent?.status, 'unresolved');
    assert.equal(dob?.checked, false, 'auto-accept does not override the agent');
    assert.ok((dob?.confidence ?? 1) <= AUTO_ACCEPT_ABOVE);
    const colour = draft.fields.find((item) => item.id === 'custom_favourite_colour');
    assert.equal(colour?.agent?.status, 'verified');
    assert.equal(colour?.checked, true);
    assert.deepEqual(
      { checked: draft.agentSummary?.checked, fixed: draft.agentSummary?.fixed, unresolved: draft.agentSummary?.unresolved, pages: draft.agentSummary?.pages },
      { checked: 2, fixed: 0, unresolved: 1, pages: 2 },
    );
    assert.equal(typeof draft.agentSummary?.durationMs, 'number');
  });

  it('does not fail the ingest when every verify call fails', async () => {
    const bytes = await flatPdf();
    const plain = await draftFromPdf(bytes, async (input) => ocrStub(input.page));
    const draft = await draftFromPdf(bytes, async (input) => ocrStub(input.page), {
      verifyPage: async () => {
        throw new Error('gemini down');
      },
    });
    assert.deepEqual(draft.fields, plain.fields);
    assert.equal(draft.agentSummary?.checked, 0);
    assert.equal(draft.agentSummary?.pagesFailed, 2);
  });

  it('never runs on an AcroForm', async () => {
    const bytes = await acroPdf();
    let calls = 0;
    const draft = await draftFromPdf(bytes, async () => [], {
      verifyPage: async () => {
        calls += 1;
        return [];
      },
    });
    assert.equal(draft.source, 'acroform');
    assert.equal(calls, 0);
    assert.equal(draft.agentSummary, undefined);
    assert.equal(draft.fields.some((item) => item.agent), false);
  });

  it('returns the summary with the ingest response and stores it on the version', async () => {
    const bytes = await flatPdf();
    const deps = memoryIngest();
    deps.ocrPage = async (input) => ocrStub(input.page);
    deps.verifyPage = async () => [{ n: 1, ok: true, reason: 'On the input.' }];
    const res = mockRes();
    await handleIngest(pdfReq(bytes, 'Bearer admin', { 'x-form-id': 'agent_form', 'x-form-version': 'v1' }), res, deps);
    assert.equal(res.statusCode, 200);
    const body = res.body as { formVersion: FormVersion; agentSummary: FormVersion['agentSummary'] };
    assert.equal(body.agentSummary?.checked, 2);
    assert.deepEqual(body.formVersion.agentSummary, body.agentSummary);
    assert.deepEqual(deps.docs.get('agent_form/v1')?.agentSummary, body.agentSummary);
    assert.equal(deps.docs.get('agent_form/v1')?.fields.every((item) => item.agent?.status === 'verified'), true);
  });
});

describe('ingest agent: Gemini call', () => {
  type Init = { method?: string; headers?: Record<string, string>; body?: string };
  const reply = (checks: unknown[]) => ({
    ok: true,
    status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ checks }) }] } }] }),
  });
  const input = (): VerifyAskInput & { apiKey: string } => ({
    png: blankPng(),
    original: blankPng(),
    page: 1,
    pageCount: 1,
    marks: [{ n: 1, label: 'Zorblax code' }],
    round: 1,
    apiKey: 'test-key',
  });

  it('sends instructions, both images and the marks as separate parts, with a schema at temperature 0', async () => {
    const sent: Array<{ url: string; init?: Init }> = [];
    const verdicts = await verifyMarksWithGemini({
      ...input(),
      fetchImpl: async (url, init) => {
        sent.push({ url, init });
        return reply([{ n: 1, ok: true, reason: 'On the input.' }]);
      },
    });
    assert.deepEqual(verdicts, [{ n: 1, ok: true, reason: 'On the input.' }]);
    assert.equal(sent.length, 1);
    assert.match(sent[0].url, new RegExp(`/models/${VERIFY_MODEL}:generateContent$`));
    assert.equal(sent[0].init?.headers?.['x-goog-api-key'], 'test-key');
    const body = JSON.parse(sent[0].init?.body ?? '{}');
    const parts = body.contents[0].parts as Array<{ text?: string; inlineData?: { mimeType: string } }>;
    assert.equal(parts.filter((part) => part.inlineData?.mimeType === 'image/png').length, 2);
    assert.equal(parts[0].text?.includes('Zorblax'), false, 'labels never enter the instructions');
    assert.match(parts[parts.length - 1].text ?? '', /"label":"Zorblax code"/);
    assert.equal(body.generationConfig.temperature, 0);
    assert.equal(body.generationConfig.responseMimeType, 'application/json');
    assert.ok(body.generationConfig.responseJsonSchema.properties.checks);
  });

  it('tries each strong model, then the flag-only fallback, then gives up; does not retry a 400', async () => {
    let calls = 0;
    const urls: string[] = [];
    const unavailable = async (url: string) => {
      calls += 1;
      urls.push(url);
      return { ok: false, status: 503, json: async () => ({}) };
    };
    await assert.rejects(verifyMarksWithGemini({ ...input(), fetchImpl: unavailable, retryDelayMs: 0 }), /verify_failed/);
    assert.equal(calls, VERIFY_MODELS.length + 1);
    assert.deepEqual(urls.map((url) => /models\/([^:]+):/.exec(url)?.[1]), [...VERIFY_MODELS, VERIFY_FALLBACK_MODEL]);
    calls = 0;
    let recovered = 0;
    const flagged = await verifyMarksWithGemini({
      ...input(),
      marks: [{ n: 1, label: 'Zorblax code' }, { n: 2, label: 'Other' }],
      retryDelayMs: 0,
      fetchImpl: async () => {
        recovered += 1;
        return recovered <= VERIFY_MODELS.length
          ? { ok: false, status: 429, json: async () => ({}) }
          : reply([
            { n: 1, ok: true, reason: 'ok' },
            { n: 2, ok: false, reason: 'One row low.', corrected_box_2d: [100, 100, 120, 400] },
          ]);
      },
    });
    assert.equal(recovered, VERIFY_MODELS.length + 1);
    // Flag-only fallback: its "ok" is dropped (never accepts), its rejection kept without a box (never moves).
    assert.deepEqual(flagged, [{ n: 2, ok: false, reason: 'One row low.' }]);
    await assert.rejects(verifyMarksWithGemini({
      ...input(),
      retryDelayMs: 0,
      fetchImpl: async () => {
        calls += 1;
        return { ok: false, status: 400, json: async () => ({}) };
      },
    }), /verify_failed/);
    assert.equal(calls, 1);
  });


  it('waits out a short per-minute quota and asks the strong model again, inside the budget', async () => {
    const quota = { error: { details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '12.5s' }] } };
    assert.equal(retryDelayFrom(quota), 12500);
    assert.equal(retryDelayFrom({}), undefined);
    const urls: string[] = [];
    const verdicts = await verifyMarksWithGemini({
      ...input(),
      retryDelayMs: 0,
      deadline: Date.now() + 120_000,
      fetchImpl: async (url) => {
        urls.push(url);
        return urls.length === 1 ? { ok: false, status: 429, json: async () => quota } : reply([{ n: 1, ok: true, reason: 'ok' }]);
      },
    });
    assert.deepEqual(verdicts, [{ n: 1, ok: true, reason: 'ok' }]);
    assert.equal(urls.length, 2);
    assert.match(urls[1], new RegExp(`/models/${VERIFY_MODEL}:`));
    // No room left in the budget: straight to the flag-only fallback.
    urls.length = 0;
    const flagged = await verifyMarksWithGemini({
      ...input(),
      retryDelayMs: 0,
      deadline: Date.now() + 5_000,
      fetchImpl: async (url) => {
        urls.push(url);
        return urls.length <= VERIFY_MODELS.length ? { ok: false, status: 429, json: async () => quota } : reply([{ n: 1, ok: true, reason: 'ok' }]);
      },
    });
    assert.deepEqual(flagged, []);
    assert.match(urls[1], new RegExp(`/models/${VERIFY_MODELS[1]}:`));
    assert.match(urls[VERIFY_MODELS.length], new RegExp(`/models/${VERIFY_FALLBACK_MODEL}:`));
  });
});
