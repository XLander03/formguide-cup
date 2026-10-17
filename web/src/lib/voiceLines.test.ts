import { describe, expect, it } from 'vitest';
import { voiceErrorLine, voiceLine } from './voiceLines';

describe('voice lines by conversation language', () => {
  it('English, Hindi (and the older true flag), and mixed', () => {
    expect(voiceLine('thanks', 'en')).toBe('Thank you.');
    expect(voiceLine('thanks', 'hi')).toBe('धन्यवाद।');
    expect(voiceLine('thanks', true)).toBe('धन्यवाद।');
    expect(voiceLine('thanks', 'mixed')).toBe('धन्यवाद।');
  });

  it('a regional conversation hears its own language, with placeholders filled', () => {
    expect(voiceLine('askConfirm', 'te')).toMatch(/\p{Script=Telugu}/u);
    expect(voiceLine('startingNext', 'kn', { title: 'KYC update' })).toContain('KYC update');
    expect(voiceLine('checkField', 'ta' as never, { label: 'PIN', value: '560037' })).toContain('560037');
  });

  it('every regional language has every line', () => {
    for (const lang of ['bn', 'mr', 'te', 'gu', 'kn', 'ml', 'or', 'pa', 'as', 'sd'] as const) {
      expect(voiceLine('gatesPrompt', lang)).not.toMatch(/^Please confirm three things/);
    }
  });

  it('error lines follow the conversation language', () => {
    expect(voiceErrorLine('speak_503_unavailable', 'te').line).toMatch(/\p{Script=Telugu}/u);
    expect(voiceErrorLine('rate_limited', 'en').stop).toBe(true);
  });
});
