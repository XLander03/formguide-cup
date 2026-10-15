import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FIELD_MODEL, buildOcrPrompt, ocrPageWithGemini, parseOcrFields } from '../src/ingest/geminiOcr';
import './support';

describe('gemini ocr client', () => {
  it('builds a fixed prompt that does not accept form text', () => {
    const prompt = buildOcrPrompt(1, 2);
    assert.match(prompt, /untrusted data/);
    assert.match(prompt, /page 1 of 2/);
    assert.equal(prompt.includes('{{PAGE}}'), false);
    assert.throws(() => buildOcrPrompt(1.5, 2));
  });

  it('calls interactions once and never puts the key in the parsed result', async () => {
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
          assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/interactions');
          assert.equal(init?.headers?.['x-goog-api-key'], key);
          const body = JSON.parse(String(init?.body)) as {
            model: string;
            input: Array<{ type: string; text?: string; mime_type?: string; data?: string }>;
            generation_config: { thinking_level: string; max_output_tokens: number };
            response_format: { type: string; mime_type: string };
          };
          assert.equal(body.model, FIELD_MODEL);
          assert.equal(body.model, 'gemini-3.5-flash-lite');
          assert.equal(body.generation_config.thinking_level, 'low');
          assert.equal(body.generation_config.max_output_tokens, 32768);
          assert.deepEqual(body.response_format, { type: 'text', mime_type: 'application/json' });
          assert.equal(body.input[0].text, buildOcrPrompt(2, 2));
          assert.equal(body.input[1].mime_type, 'image/png');
          assert.equal(body.input[1].data, png.toString('base64'));
          assert.equal(JSON.stringify(body).includes('unit-test-key-not-real'), false);
          return {
            ok: true,
            status: 200,
            async json() {
              return { output_text: JSON.stringify({ fields: [] }) };
            },
          };
        },
      });
      assert.equal(calls, 1);
      assert.deepEqual(fields, []);
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
