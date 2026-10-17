import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FIELD_MODEL, OCR_RESPONSE_SCHEMA, buildOcrPrompt, ocrPageWithGemini, parseOcrFields, retryDelayMs } from '../src/ingest/geminiOcr';
import './support';

describe('gemini ocr client', () => {
  it('builds a fixed prompt that does not accept form text', () => {
    const prompt = buildOcrPrompt(1, 2);
    assert.match(prompt, /untrusted data/);
    assert.match(prompt, /page 1 of 2/);
    assert.equal(prompt.includes('{{PAGE}}'), false);
    assert.throws(() => buildOcrPrompt(1.5, 2));
  });

  it('calls generateContent once with a response schema and never puts the key in the parsed result', async () => {
    const logs: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      logs.push(args);
    };
    const key = 'unit-test-key-not-real';
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    let calls = 0;
    try {
      const fields = await ocrPageWithGemini({
        apiKey: key,
        png,
        page: 2,
        pageCount: 2,
        width: 10,
        height: 10,
        fetchImpl: async (url, init) => {
          calls += 1;
          assert.equal(url, `https://generativelanguage.googleapis.com/v1beta/models/${FIELD_MODEL}:generateContent`);
          assert.equal(FIELD_MODEL, 'gemini-3.5-flash-lite');
          assert.equal(init?.headers?.['x-goog-api-key'], key);
          const body = JSON.parse(String(init?.body)) as {
            contents: Array<{ parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> }>;
            generationConfig: {
              responseMimeType: string;
              responseJsonSchema: unknown;
              temperature: number;
              maxOutputTokens: number;
              thinkingConfig: { thinkingLevel: string };
            };
          };
          assert.equal(body.generationConfig.responseMimeType, 'application/json');
          assert.deepEqual(body.generationConfig.responseJsonSchema, OCR_RESPONSE_SCHEMA);
          assert.equal(body.generationConfig.temperature, 0);
          assert.equal(body.generationConfig.maxOutputTokens, 65536);
          assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, 'low');
          assert.equal(body.contents[0].parts[0].text, buildOcrPrompt(2, 2));
          assert.equal(body.contents[0].parts[1].inlineData?.mimeType, 'image/png');
          assert.equal(body.contents[0].parts[1].inlineData?.data, png.toString('base64'));
          assert.equal(JSON.stringify(body).includes('unit-test-key-not-real'), false);
          const reply = {
            fields: [{ label: 'City', type: 'text', required: false, box_2d: [[100, 200, 120, 600]], confidence: 0.9 }],
          };
          return {
            ok: true,
            status: 200,
            async json() {
              return { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(reply) }] } }] };
            },
          };
        },
      });
      assert.equal(calls, 1);
      // A box wrapped as [[...]] (Gemini's multi-box style) still parses.
      assert.deepEqual(fields.map((f) => f.label), ['City']);
      assert.equal(JSON.stringify(logs).includes(key), false);
    } finally {
      console.error = original;
    }
  });

  it('parses fenced json and drops invalid boxes', () => {
    const fields = parseOcrFields('```json\n{"fields":[{"label":"City","type":"text","required":false,"box":{"x":0,"y":0,"w":0.2,"h":0.1},"confidence":0.4},{"label":"","type":"text"}]}\n```');
    assert.equal(fields.length, 1);
    assert.equal(fields[0].label, 'City');
    assert.equal(fields[0].confidence, 0.4);
  });

  it('normalizes pixel-coordinate boxes instead of letting every field collapse onto the same box', () => {
    // Reproduces a real failure: the model ignored the [0,1] instruction and
    // returned raw pixel coords (e.g. {"x":203,"y":782,...}) on a rendered
    // 1600x1200 page. Without normalization, normalisedTopLeftToPdfBox's
    // clamp01 would clamp every such value straight to 1, so every field
    // ended up with the identical full-page box.
    const pixelJson = JSON.stringify({
      fields: [
        { label: 'City', type: 'text', required: false, box: { x: 203, y: 782, w: 150, h: 20 }, confidence: 0.9 },
        { label: 'State', type: 'text', required: false, box: { x: 203, y: 850, w: 150, h: 20 }, confidence: 0.9 },
      ],
    });
    const fields = parseOcrFields(pixelJson, { width: 1600, height: 1200 });
    assert.equal(fields.length, 2);
    // Different source y pixels must stay distinguishable after normalizing.
    assert.notEqual(fields[0].box.y, fields[1].box.y);
    for (const field of fields) {
      for (const key of ['x', 'y', 'w', 'h'] as const) {
        assert.ok(field.box[key] >= 0 && field.box[key] <= 1, `${field.label}.${key} should be in [0,1], got ${field.box[key]}`);
      }
    }
  });

  it('leaves already-normalized boxes untouched when pixel dims are not given', () => {
    const fields = parseOcrFields(
      JSON.stringify({ fields: [{ label: 'City', type: 'text', required: false, box: { x: 0.1, y: 0.2, w: 0.3, h: 0.1 }, confidence: 0.9 }] }),
    );
    assert.deepEqual(fields[0].box, { x: 0.1, y: 0.2, w: 0.3, h: 0.1 });
  });
});

describe('gemini ocr rate limits', () => {
  const page = { apiKey: 'k', png: Buffer.from([1]), page: 1, pageCount: 1, width: 10, height: 10 };
  const ok = {
    ok: true,
    status: 200,
    async json() {
      return { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"fields":[]}' }] } }] };
    },
  };
  const limited = (retryDelay?: string) => ({
    ok: false,
    status: 429,
    async json() {
      return {
        error: {
          code: 429,
          message: 'Quota exceeded for metric: generate_content_free_tier_requests, limit: 15',
          details: retryDelay ? [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay }] : [],
        },
      };
    },
  });

  it('waits the delay Gemini asks for on a 429 and then succeeds', async () => {
    const waits: number[] = [];
    let calls = 0;
    const original = console.error;
    console.error = () => {};
    try {
      const fields = await ocrPageWithGemini({
        ...page,
        sleep: async (ms) => {
          waits.push(ms);
        },
        fetchImpl: async () => {
          calls += 1;
          return calls <= 2 ? limited('13s') : ok;
        },
      });
      assert.deepEqual(fields, []);
      assert.equal(calls, 3);
      assert.deepEqual(waits, [13000, 13000]);
    } finally {
      console.error = original;
    }
  });

  it('gives up once the per-page wait budget is spent', async () => {
    const waits: number[] = [];
    const original = console.error;
    console.error = () => {};
    try {
      await assert.rejects(
        ocrPageWithGemini({
          ...page,
          sleep: async (ms) => {
            waits.push(ms);
          },
          fetchImpl: async () => limited('45s'),
        }),
        (err: unknown) => err instanceof Error && (err as { code?: string }).code === 'ocr_failed',
      );
      // Each wait is capped at 30s and the page stops before passing 90s in total.
      assert.deepEqual(waits, [30000, 30000, 30000]);
    } finally {
      console.error = original;
    }
  });

  it('keeps a single immediate retry for errors that are not rate limits', async () => {
    let calls = 0;
    const waits: number[] = [];
    const original = console.error;
    console.error = () => {};
    try {
      await assert.rejects(
        ocrPageWithGemini({
          ...page,
          sleep: async (ms) => {
            waits.push(ms);
          },
          fetchImpl: async () => {
            calls += 1;
            return { ok: false, status: 400, async json() { return { error: { code: 400 } }; } };
          },
        }),
      );
      assert.equal(calls, 2);
      assert.deepEqual(waits, []);
    } finally {
      console.error = original;
    }
  });

  it('reads RetryInfo delays and falls back to 10s', () => {
    assert.equal(retryDelayMs({ error: { details: [{ retryDelay: '13.4s' }] } }), 13400);
    assert.equal(retryDelayMs({ error: { details: [] } }), 10000);
    assert.equal(retryDelayMs(null), 10000);
  });
});
