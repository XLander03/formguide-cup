import { describe, expect, it } from 'vitest';
import { createSilenceDetector, rmsLevel } from './silence';

const FRAME = 85;

function feed(levels: number[]): { event: string | null; atMs: number } {
  const detector = createSilenceDetector();
  let atMs = 0;
  for (const level of levels) {
    atMs += FRAME;
    const event = detector.push(level, FRAME);
    if (event) return { event, atMs };
  }
  return { event: null, atMs };
}

const repeat = (level: number, ms: number) => Array.from({ length: Math.ceil(ms / FRAME) }, () => level);

describe('silence detector', () => {
  it('ends the turn after speech and then quiet', () => {
    const result = feed([...repeat(0.002, 600), ...repeat(0.08, 1500), ...repeat(0.003, 2000)]);
    expect(result.event).toBe('speech_end');
    // Quiet started at 2100ms; 1300ms of it ends the turn.
    expect(result.atMs).toBeGreaterThanOrEqual(3400);
    expect(result.atMs).toBeLessThan(3600);
  });

  it('a short pause between words does not end the turn', () => {
    const result = feed([...repeat(0.08, 800), ...repeat(0.003, 700), ...repeat(0.08, 800)]);
    expect(result.event).toBeNull();
  });

  it('reports no speech when nobody talks', () => {
    const result = feed(repeat(0.003, 9000));
    expect(result.event).toBe('no_speech');
    expect(result.atMs).toBeGreaterThanOrEqual(8000);
  });

  it('a single click is not speech', () => {
    const result = feed([...repeat(0.003, 500), 0.2, ...repeat(0.003, 9000)]);
    expect(result.event).toBe('no_speech');
  });

  it('a noisy room needs a louder voice', () => {
    // Fan noise at 0.02 sits above the fixed minimum but is learned as the floor.
    const result = feed(repeat(0.02, 9000));
    expect(result.event).toBe('no_speech');
  });

  it('someone answering the moment the mic opens is still heard, and the turn ends', () => {
    // Real Chrome levels: speech 0.06–0.27 from the very first frame, then digital quiet.
    const speech = [0.174, 0.156, 0.117, 0.129, 0.124, 0.087, 0.061, 0.188, 0.059, 0.026, 0.138, 0.174, 0.276];
    const result = feed([...speech, ...speech, ...repeat(0, 2000)]);
    expect(result.event).toBe('speech_end');
    expect(result.atMs).toBeLessThan(26 * FRAME + 1500);
  });

  it('measures RMS', () => {
    expect(rmsLevel(new Float32Array([0.5, -0.5, 0.5, -0.5]))).toBeCloseTo(0.5);
    expect(rmsLevel(new Float32Array(0))).toBe(0);
  });
});
