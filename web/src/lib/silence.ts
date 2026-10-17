/**
 * End-of-speech detection for hands-free turns, fed one audio frame at a time.
 * Pure (no Web Audio) so it can be tested with made-up levels.
 */
export interface SilenceOptions {
  /** Quiet after speech that ends the turn. */
  endSilenceMs?: number;
  /** Give up when nobody starts talking within this long. */
  noSpeechMs?: number;
  /** Loud frames needed before it counts as speech (ignores a cough or a click). */
  minSpeechMs?: number;
  /** Lowest RMS treated as a voice, whatever the room noise. */
  minThreshold?: number;
  /** Opening stretch used only to learn the room noise (the question has just finished playing). */
  calibrationMs?: number;
  /** Highest room noise it will learn, so a voice is never mistaken for the room. */
  maxFloor?: number;
}

export type SilenceEvent = 'speech_end' | 'no_speech' | null;

export interface SilenceDetector {
  /** One frame: its RMS level (0–1) and its length in ms. */
  push(rms: number, frameMs: number): SilenceEvent;
  readonly heardSpeech: boolean;
}

export function rmsLevel(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

export function createSilenceDetector(options: SilenceOptions = {}): SilenceDetector {
  const endSilenceMs = options.endSilenceMs ?? 1300;
  const noSpeechMs = options.noSpeechMs ?? 8000;
  const minSpeechMs = options.minSpeechMs ?? 200;
  const minThreshold = options.minThreshold ?? 0.012;
  const calibrationMs = options.calibrationMs ?? 300;
  const maxFloor = options.maxFloor ?? 0.03;
  let elapsed = 0;
  let loudMs = 0;
  let quietMs = 0;
  let heard = false;
  // Room noise, learned from the quietest frames; a voice must stand well above it.
  let floor = -1;
  let done = false;

  return {
    get heardSpeech() {
      return heard;
    },
    push(rms: number, frameMs: number): SilenceEvent {
      if (done) return null;
      elapsed += frameMs;
      // The quietest calibration frame, capped: someone answering straight away must not
      // teach the detector that their voice is the room.
      if (floor < 0 || rms < floor) floor = Math.min(rms, maxFloor);
      if (elapsed <= calibrationMs) return null;
      const threshold = Math.max(minThreshold, floor * 2.5);
      const loud = rms >= threshold;
      if (!loud) floor = Math.min(maxFloor, floor * 0.95 + rms * 0.05);
      if (!heard) {
        loudMs = loud ? loudMs + frameMs : Math.max(0, loudMs - frameMs);
        if (loudMs >= minSpeechMs) {
          heard = true;
          quietMs = 0;
        } else if (elapsed >= noSpeechMs) {
          done = true;
          return 'no_speech';
        }
        return null;
      }
      quietMs = loud ? 0 : quietMs + frameMs;
      if (quietMs >= endSilenceMs) {
        done = true;
        return 'speech_end';
      }
      return null;
    },
  };
}
