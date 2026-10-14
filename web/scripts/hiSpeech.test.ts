/**
 * Hindi read-back words and TTS voice choice.
 * Run from web/: npm test
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { hindiDate, hindiDigits, hindiNumber, hindiYear } from '../src/lib/hiSpeech.ts';
import { pickVoice } from '../src/lib/tts.ts';

test('digits are read one by one', () => {
  assert.equal(hindiDigits('3210'), 'तीन दो एक शून्य');
  assert.equal(hindiDigits('98 76'), 'नौ आठ सात छह');
});

test('numbers 0–99 cover the table', () => {
  assert.equal(hindiNumber(0), 'शून्य');
  assert.equal(hindiNumber(12), 'बारह');
  assert.equal(hindiNumber(94), 'चौरानवे');
  assert.equal(hindiNumber(99), 'निन्यानवे');
  assert.equal(hindiNumber(100), '100');
});

test('years and dates read naturally', () => {
  assert.equal(hindiYear(1994), 'उन्नीस सौ चौरानवे');
  assert.equal(hindiYear(1900), 'उन्नीस सौ');
  assert.equal(hindiYear(2001), 'दो हज़ार एक');
  assert.equal(hindiYear(2000), 'दो हज़ार');
  assert.equal(hindiDate('1994-03-12'), 'बारह मार्च उन्नीस सौ चौरानवे');
  assert.equal(hindiDate('2001-01-05'), 'पाँच जनवरी दो हज़ार एक');
  assert.equal(hindiDate('12/03/1994'), null);
});

type FakeVoice = Pick<SpeechSynthesisVoice, 'lang' | 'name' | 'default'>;

function voices(list: FakeVoice[]): SpeechSynthesisVoice[] {
  return list as SpeechSynthesisVoice[];
}

test('pickVoice prefers the exact Hindi locale', () => {
  const list = voices([
    { lang: 'en-US', name: 'English', default: true },
    { lang: 'en-IN', name: 'English India', default: false },
    { lang: 'hi_IN', name: 'Hindi', default: false },
  ]);
  assert.equal(pickVoice(list, 'hi-IN')?.name, 'Hindi');
  assert.equal(pickVoice(list, 'en-IN')?.name, 'English India');
});

test('pickVoice falls back to the language family, else null', () => {
  assert.equal(pickVoice(voices([{ lang: 'hi', name: 'Hindi', default: false }]), 'hi-IN')?.name, 'Hindi');
  assert.equal(pickVoice(voices([{ lang: 'en-US', name: 'English', default: true }]), 'hi-IN'), null);
});
