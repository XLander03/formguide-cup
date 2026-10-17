import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  detectSpokenLanguage,
  isInLanguageScript,
  transcriptionLanguageCodes,
} from '../src/spokenLanguage';
import { fieldJson } from '../src/index';
import './support';

describe('detectSpokenLanguage', () => {
  it('reads the language from the transcript script, whatever the picker says', () => {
    assert.equal(detectSpokenLanguage('నా పేరు ప్రియ శర్మ', 'en-IN'), 'te-IN');
    assert.equal(detectSpokenLanguage('ನನ್ನ ಹೆಸರು ಪ್ರಿಯಾ', 'hi-IN'), 'kn-IN');
    assert.equal(detectSpokenLanguage('എന്റെ പേര് പ്രിയ', 'en-IN'), 'ml-IN');
    assert.equal(detectSpokenLanguage('મારું નામ પ્રિયા છે', 'en-IN'), 'gu-IN');
    assert.equal(detectSpokenLanguage('ମୋ ନାମ ପ୍ରିୟା', 'en-IN'), 'or-IN');
    assert.equal(detectSpokenLanguage('ਮੇਰਾ ਨਾਮ ਪ੍ਰਿਆ ਹੈ', 'en-IN'), 'pa-IN');
    assert.equal(detectSpokenLanguage('منهنجو نالو پريا آهي', 'en-IN'), 'sd-Arab-IN');
  });

  it('breaks the Devanagari and Bengali-script ties with the picker, then the model', () => {
    assert.equal(detectSpokenLanguage('माझं नाव प्रिया आहे', 'mr-IN'), 'mr-IN');
    assert.equal(detectSpokenLanguage('माझं नाव प्रिया आहे', 'en-IN', 'mr-IN'), 'mr-IN');
    assert.equal(detectSpokenLanguage('मेरा नाम प्रिया है', 'en-IN'), 'hi-IN');
    assert.equal(detectSpokenLanguage('আমার নাম প্রিয়া', 'as-IN'), 'as-IN');
    assert.equal(detectSpokenLanguage('আমার নাম প্রিয়া', 'en-IN'), 'bn-IN');
  });

  it('uses the script with the most letters in a code-mixed transcript', () => {
    assert.equal(detectSpokenLanguage('My PAN is ABCDE1234F, నా పేరు ప్రియ', 'en-IN'), 'te-IN');
  });

  it('keeps a Latin-only transcript English unless picker and model agree', () => {
    assert.equal(detectSpokenLanguage('My name is Priya Sharma', 'en-IN'), 'en-IN');
    assert.equal(detectSpokenLanguage('mera naam Priya hai', 'en-IN', 'hi-IN'), 'en-IN');
    assert.equal(detectSpokenLanguage('mera naam Priya hai', 'hi-IN', 'hi-IN'), 'hi-IN');
    assert.equal(detectSpokenLanguage('na peru Priya', 'te-IN', 'te-IN'), 'te-IN');
    assert.equal(detectSpokenLanguage('na peru Priya', 'te-IN', 'xx-IN'), 'en-IN');
  });
});

describe('isInLanguageScript', () => {
  it('allows Latin acronyms and digits inside a regional question', () => {
    assert.equal(isInLanguageScript('మీ PAN నంబర్ ఏమిటి?', 'te-IN'), true);
    assert.equal(isInLanguageScript('What is your PAN number?', 'te-IN'), false);
    assert.equal(isInLanguageScript('आपका पैन नंबर क्या है?', 'te-IN'), false);
    assert.equal(isInLanguageScript('What is your PAN number?', 'en-IN'), true);
    assert.equal(isInLanguageScript('आपका पैन नंबर क्या है?', 'en-IN'), false);
  });
});

describe('transcriptionLanguageCodes', () => {
  it('auto-detects for an English pick and keeps a regional hint', () => {
    assert.deepEqual(transcriptionLanguageCodes('en-IN'), []);
    assert.deepEqual(transcriptionLanguageCodes('te-IN'), ['te-IN']);
  });
});

describe('fieldJson answers in the spoken language', () => {
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

  it('Telugu on an English pick: Telugu question, Latin values, English copy for fallback', async () => {
    const prompts = stubModel({
      field_updates: { applicant_full_name: { value: 'Priya Sharma', confidence: 0.95 } },
      spoken_lang: 'te-IN',
      next_ask: 'మీ పుట్టిన తేదీ ఏమిటి? రోజు, నెల, సంవత్సరం చెప్పండి.',
      reply_lang: 'en',
      refuse_live_submit: false,
      assistant_message: 'మీ పేరు నింపాను. Fields vary by bank.',
    });
    const out = await fieldJson('k', 'నా పేరు ప్రియ శర్మ', 'en-IN', { journey_mode: 'account_opening' });
    assert.equal(out.spoken_lang, 'te-IN');
    assert.equal(out.next_ask_lang, 'te-IN');
    assert.match(String(out.next_ask), /పుట్టిన తేదీ/);
    assert.match(String(out.next_ask_en), /date of birth/);
    assert.match(out.assistant_message, /నింపాను/);
    assert.equal(out.field_updates.applicant_full_name, 'Priya Sharma');
    assert.match(prompts[0], /spoken_lang/);
    assert.match(prompts[0], /day, month and year/);
  });

  it('falls back to the English question when the model answered in the wrong script', async () => {
    stubModel({
      field_updates: {},
      spoken_lang: 'kn-IN',
      next_ask: 'What is your date of birth?',
      reply_lang: 'en',
      refuse_live_submit: false,
      assistant_message: 'Nothing new. Fields vary by bank.',
    });
    const out = await fieldJson('k', 'ನನ್ನ ಹೆಸರು ಪ್ರಿಯಾ', 'kn-IN', { journey_mode: 'account_opening' });
    assert.equal(out.spoken_lang, 'kn-IN');
    assert.equal(out.next_ask_lang, 'en-IN');
    assert.equal(out.next_ask, out.next_ask_en);
  });

  it('Hindi on an English pick uses the Hindi question table', async () => {
    stubModel({
      field_updates: {},
      spoken_lang: 'hi-IN',
      next_ask: null,
      reply_lang: 'hi',
      refuse_live_submit: false,
      assistant_message: 'Fields vary by bank.',
    });
    const out = await fieldJson('k', 'मैं खाता खोलना चाहती हूँ', 'en-IN', { journey_mode: 'account_opening' });
    assert.equal(out.spoken_lang, 'hi-IN');
    assert.equal(out.reply_lang, 'hi');
    assert.equal(out.next_ask_lang, 'hi-IN');
    assert.match(String(out.next_ask), /[ऀ-ॿ]/);
  });
});
