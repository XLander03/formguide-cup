import { describe, expect, it } from 'vitest';
import { buildTrail, sourceChip } from './agentTrail';
import type { ExtractResponse } from './types';

const label = (id: string) =>
  ({ applicant_full_name: 'Full name', dob: 'Date of birth', pan_number: 'PAN', mobile_registered: 'Mobile' })[id] ?? id;

function response(over: Partial<ExtractResponse>): ExtractResponse {
  return {
    field_updates: {},
    missing_required: [],
    next_ask: null,
    gates: { answers: {} },
    completeness: 'partial_core',
    refuse_live_submit: false,
    source: 'gemini',
    ...over,
  };
}

describe('sourceChip', () => {
  it('names where a value came from, with a score only when the model gave one', () => {
    expect(sourceChip('gemini', { confidence: 1, confirmed: false })?.text).toBe('✦ AI');
    expect(sourceChip('gemini', { confidence: 0.94, confirmed: false })).toEqual({ text: '✦ AI · 94%', tone: 'ai' });
    expect(sourceChip('gemini', { confidence: 0.6, confirmed: false })?.tone).toBe('unsure');
    expect(sourceChip('gemini', { confidence: 0.6, confirmed: true })?.text).toBe('✦ AI · you confirmed');
    expect(sourceChip('manual', undefined)?.text).toBe('⌨ typed');
    expect(sourceChip('heuristic-dev', undefined)?.text).toBe('≈ rules fill');
    expect(sourceChip(undefined, undefined)).toBeNull();
  });
});

describe('buildTrail', () => {
  it('walks through language, fields found, format checks, doubts and the next ask', () => {
    const steps = buildTrail({
      last: response({
        reply_lang: 'mixed',
        field_updates: { applicant_full_name: 'Ananya', dob: '1992-08-15', pan_number: 'ABCDE1234F', journey_mode: 'account_opening' },
      }),
      said: 'मेरा नाम Ananya',
      values: { applicant_full_name: 'Ananya', dob: '1992-08-15', pan_number: 'ABCDE1234F' },
      missing: ['addr_current_pin', 'mobile_registered'],
      confidence: { dob: { confidence: 0.6, confirmed: false } },
      label,
      nextLabel: 'PIN code',
    });
    expect(steps.map((s) => s.text)).toEqual([
      'Heard a Hindi + English mix',
      'Found Full name, Date of birth and PAN',
      'Date of birth and PAN format ✓',
      "Not fully sure about Date of birth, so I'll ask you to check",
      '2 required left → asking for PIN code next',
    ]);
  });

  it('reports a bad format and a finished draft', () => {
    const steps = buildTrail({
      last: response({ reply_lang: 'en', intent: 'correction', field_updates: { mobile_registered: '12345' } }),
      said: 'no, my mobile is 12345',
      values: { mobile_registered: '12345' },
      missing: [],
      confidence: {},
      label,
      nextLabel: null,
    });
    expect(steps.map((s) => s.key)).toEqual(['lang', 'intent', 'found', 'bad-mobile_registered', 'next']);
    expect(steps[steps.length - 1].text).toMatch(/ready to read it back/);
  });

  it('is empty before the first reply', () => {
    expect(buildTrail({ last: null, said: '', values: {}, missing: [], confidence: {}, label, nextLabel: null })).toEqual([]);
  });
});
