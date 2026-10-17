import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { matchVoiceCommand, normalizeUtterance } from '../../shared/voiceCommands';
import { mergeFieldUpdates } from '../src/merge';
import { readSpeakRequest } from '../src/wav';
import { fieldJson } from '../src/index';
import './support';

describe('matchVoiceCommand', () => {
  const cases: Array<[string, string | null]> = [
    ['Read it again.', 'read_again'],
    ['Okay, please read it back', 'read_again'],
    ['repeat that', 'read_again'],
    ['फिर से पढ़ो', 'read_again'],
    ['Go back', 'go_back'],
    ['वापस जाओ।', 'go_back'],
    ['Download my form', 'download'],
    ['download the PDF please', 'download'],
    ['फॉर्म डाउनलोड करो', 'download'],
    ['Start the next form', 'next_form'],
    // Real transcripts of spoken commands (Gemini transcription of en-IN / hi-IN clips).
    ['Download my forum.', 'download'],
    ['Start the next forum.', 'next_form'],
    ['हां, सही है।', 'yes'],
    ['मेरा फॉर्म डाउनलोड करो.', 'download'],
    ['अगला फॉर्म शुरू करो', 'next_form'],
    ['Save my draft', 'save_draft'],
    ['Continue', 'continue'],
    ['Yes', 'yes'],
    ["Yes, that's correct.", 'yes'],
    ['हाँ, सही है', 'yes'],
    ['No.', 'no'],
    ['नहीं', 'no'],
    // Carries a value or a question: the field model handles it.
    ['No, my PIN is 560037', null],
    ['Change the mobile to 9876501234', null],
    ['What is CKYC?', null],
    ['Yes I have a PAN card', null],
    ['My name is Priya Sharma', null],
    ['', null],
  ];
  for (const [said, want] of cases) {
    it(`${JSON.stringify(said)} → ${want}`, () => {
      assert.equal(matchVoiceCommand(said), want);
    });
  }

  it('strips punctuation and filler', () => {
    assert.equal(normalizeUtterance('  Okay, PLEASE go back now! '), 'go back');
  });
});

describe('readSpeakRequest context', () => {
  function wav(): Buffer {
    const data = Buffer.alloc(3200);
    const head = Buffer.alloc(44);
    head.write('RIFF', 0, 'ascii');
    head.writeUInt32LE(36 + data.length, 4);
    head.write('WAVE', 8, 'ascii');
    head.write('fmt ', 12, 'ascii');
    head.writeUInt32LE(16, 16);
    head.writeUInt16LE(1, 20);
    head.writeUInt16LE(1, 22);
    head.writeUInt32LE(16000, 24);
    head.writeUInt32LE(32000, 28);
    head.writeUInt16LE(2, 32);
    head.writeUInt16LE(16, 34);
    head.write('data', 36, 'ascii');
    head.writeUInt32LE(data.length, 40);
    return Buffer.concat([head, data]);
  }

  function body(context?: string): { raw: Buffer; type: string } {
    const b = 'XyZboundary';
    const part = (name: string, content: string | Buffer, extra = '') =>
      Buffer.concat([
        Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${name}"${extra}\r\n\r\n`),
        Buffer.isBuffer(content) ? content : Buffer.from(content),
        Buffer.from('\r\n'),
      ]);
    const parts = [part('language', 'en-IN'), part('current_values', '{}')];
    if (context !== undefined) parts.push(part('context', context));
    parts.push(part('audio', wav(), '; filename="clip.wav"'));
    parts.push(Buffer.from(`--${b}--\r\n`));
    return { raw: Buffer.concat(parts), type: `multipart/form-data; boundary=${b}` };
  }

  it('reads a known context', () => {
    const { raw, type } = body('review');
    const read = readSpeakRequest(raw, type);
    assert.ok(read.ok);
    if (read.ok) assert.equal(read.parts.context, 'review');
  });

  it('defaults to fill when missing or unknown', () => {
    for (const context of [undefined, 'admin']) {
      const { raw, type } = body(context);
      const read = readSpeakRequest(raw, type);
      assert.ok(read.ok);
      if (read.ok) assert.equal(read.parts.context, 'fill');
    }
  });
});

describe('mergeFieldUpdates correction', () => {
  const current = { applicant_full_name: 'Priya Sharma', father_or_spouse_name: '' };

  it('without the flag a bare second name goes to the father', () => {
    assert.deepEqual(mergeFieldUpdates(current, { applicant_full_name: 'Priya Verma' }, 'change the name to Priya Verma'), {
      father_or_spouse_name: 'Priya Verma',
    });
  });

  it('a correction replaces the applicant name', () => {
    assert.deepEqual(
      mergeFieldUpdates(current, { applicant_full_name: 'Priya Verma' }, 'change the name to Priya Verma', {
        correction: true,
      }),
      { applicant_full_name: 'Priya Verma' },
    );
  });
});

describe('fieldJson turn intent', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  function stubModel(reply: unknown): string[] {
    const prompts: string[] = [];
    globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
      prompts.push((JSON.parse(String(init?.body)) as { input: string }).input);
      return new Response(JSON.stringify({ output_text: JSON.stringify(reply) }), { status: 200 });
    }) as typeof fetch;
    return prompts;
  }

  const base = { reply_lang: 'en', next_ask: null, refuse_live_submit: false, assistant_message: 'Ok. Fields vary by bank.' };

  it('sends the context and the form labels', async () => {
    const prompts = stubModel({ ...base, intent: 'answer', field_updates: {} });
    await fieldJson('k', 'hello', 'en-IN', {}, undefined, 'review');
    assert.match(prompts[0], /Where the customer is: review/);
    assert.match(prompts[0], /FORM LABELS \(id: label\):\n[\s\S]*father_or_spouse_name: /);
  });

  it('a question returns the answer as reply and fills nothing', async () => {
    stubModel({
      ...base,
      intent: 'question',
      reply: 'CKYC is a central record of your KYC, so you do not repeat it at every bank.',
      field_updates: {},
    });
    const out = await fieldJson('k', 'What is CKYC?', 'en-IN', {});
    assert.equal(out.intent, 'question');
    assert.match(String(out.reply), /central record/);
    assert.deepEqual(out.field_updates, {});
  });

  it('a correction overwrites the filled value and says so', async () => {
    stubModel({
      ...base,
      intent: 'correction',
      reply: 'Changed your PIN code to 560037.',
      field_updates: { addr_current_pin: { value: '560037', confidence: 0.95 } },
    });
    const out = await fieldJson('k', 'No, my PIN is 560037', 'en-IN', { addr_current_pin: '560001' });
    assert.equal(out.intent, 'correction');
    assert.equal(out.reply, 'Changed your PIN code to 560037.');
    assert.equal(out.field_updates.addr_current_pin, '560037');
  });

  it('a correction of the name is not moved to the father', async () => {
    stubModel({
      ...base,
      intent: 'correction',
      reply: 'Changed your name to Priya Verma.',
      field_updates: { applicant_full_name: { value: 'Priya Verma', confidence: 0.9 } },
    });
    const out = await fieldJson('k', 'Change the name to Priya Verma', 'en-IN', { applicant_full_name: 'Priya Sharma' });
    assert.equal(out.field_updates.applicant_full_name, 'Priya Verma');
    assert.equal(out.field_updates.father_or_spouse_name, undefined);
  });

  it('no intent from the model: an overwrite counts as a correction, new details as an answer', async () => {
    stubModel({ ...base, field_updates: { mobile_registered: { value: '9876501234', confidence: 1 } } });
    const changed = await fieldJson('k', 'mobile is 9876501234', 'en-IN', { mobile_registered: '9876543210' });
    assert.equal(changed.intent, 'correction');
    const fresh = await fieldJson('k', 'mobile is 9876501234', 'en-IN', {});
    assert.equal(fresh.intent, 'answer');
  });

  it('an answer never carries a spoken reply', async () => {
    stubModel({ ...base, intent: 'answer', reply: 'Great, thanks!', field_updates: { dob: { value: '1992-08-15', confidence: 1 } } });
    const out = await fieldJson('k', 'born 15 August 1992', 'en-IN', {});
    assert.equal(out.reply, null);
  });

  it('never returns a bare field id as the next question', async () => {
    stubModel({ ...base, intent: 'answer', next_ask: 'addr_permanent_same_as_current', field_updates: {} });
    const out = await fieldJson('k', 'hello', 'en-IN', { applicant_full_name: 'Priya Sharma' });
    assert.doesNotMatch(String(out.next_ask), /^[a-z_]+$/);
  });

  it('drops the on-screen bank disclaimer from a spoken answer', async () => {
    stubModel({ ...base, intent: 'question', reply: 'Banks need it for KYC records. Fields vary by bank.', field_updates: {} });
    const out = await fieldJson('k', 'Why the father name?', 'en-IN', {});
    assert.equal(out.reply, 'Banks need it for KYC records.');
  });
});
