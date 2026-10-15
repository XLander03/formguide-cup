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
          assert.equal(body.generation_config.max_output_tokens, 8192);
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
});
