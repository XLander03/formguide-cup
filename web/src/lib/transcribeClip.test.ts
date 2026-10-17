import { describe, expect, it } from 'vitest';
import { journeyMicMessage } from './transcribeClip';

describe('journeyMicMessage', () => {
  it('never shows a raw error code', () => {
    for (const code of ['rate_limited', 'transcribe_503', 'bad_wav', 'speak_failed', null]) {
      expect(journeyMicMessage(code)).not.toMatch(/_|rate_limited/);
    }
  });

  it('tells the user to wait when the network hit the limit', () => {
    expect(journeyMicMessage('rate_limited')).toMatch(/wait a minute/i);
  });
});
