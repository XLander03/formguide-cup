import { describe, expect, it } from 'vitest';
import { DEMO_FIELDS, DEMO_LOOP_MS, demoFrame } from './LandingDemo';

describe('landing demo timeline', () => {
  it('starts empty and listening', () => {
    const f = demoFrame(0);
    expect(f.phase).toBe('listening');
    expect(f.heard).toBe('');
    expect(f.filled).toBe(0);
  });

  it('fills each field only once its phrase has been heard', () => {
    let lastFilled = 0;
    for (let t = 0; t < DEMO_LOOP_MS; t += 20) {
      const f = demoFrame(t);
      expect(f.filled).toBeGreaterThanOrEqual(lastFilled);
      if (f.filled === 1 && f.phase === 'listening') expect(f.heard).toContain('अनन्या राव');
      lastFilled = f.filled;
    }
    expect(lastFilled).toBe(DEMO_FIELDS.length);
  });

  it('asks for proof of identity, then completes the draft', () => {
    const phases = new Set<string>();
    for (let t = 0; t < DEMO_LOOP_MS; t += 50) phases.add(demoFrame(t).phase);
    expect([...phases]).toEqual(['listening', 'thinking', 'asking', 'answering', 'done']);
    const done = demoFrame(DEMO_LOOP_MS - 600);
    expect(done.ask).toMatch(/Aadhaar or passport/);
    expect(done.filled).toBe(DEMO_FIELDS.length);
  });

  it('never shows a dangling Devanagari mark at the end of the typed text', () => {
    for (let t = 0; t < DEMO_LOOP_MS; t += 10) {
      expect(demoFrame(t).heard).not.toMatch(/्$/);
    }
  });

  it('loops', () => {
    expect(demoFrame(DEMO_LOOP_MS + 1)).toEqual(demoFrame(1));
  });
});
