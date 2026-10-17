import { useCallback, useEffect, useRef, useState } from 'react';
import { createSilenceDetector, rmsLevel, type SilenceDetector } from '../lib/silence';

const MAX_SAMPLES = 16000 * 45;

function mergeFloats(chunks: Float32Array[], total: number): Float32Array {
  const merged = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

function downsampleTo16k(input: Float32Array, inRate: number): Float32Array {
  if (input.length === 0 || inRate <= 0) return new Float32Array(0);
  const outLen = Math.min(MAX_SAMPLES, Math.floor((input.length * 16000) / inRate));
  const out = new Float32Array(outLen);
  const step = inRate / 16000;
  for (let i = 0; i < outLen; i++) {
    const pos = i * step;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = pos - i0;
    out[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return out;
}

function encodeWav16kMono(samples: Float32Array): Blob {
  const n = Math.min(samples.length, MAX_SAMPLES);
  const buffer = new ArrayBuffer(44 + n * 2);
  const view = new DataView(buffer);
  const write = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  write(0, 'RIFF');
  view.setUint32(4, 36 + n * 2, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, n * 2, true);
  let offset = 44;
  for (let i = 0; i < n; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

type RecSession = {
  stream: MediaStream;
  ctx: AudioContext;
  processor: ScriptProcessorNode;
  source: MediaStreamAudioSourceNode;
  gain: GainNode;
  chunks: Float32Array[];
  samples: number;
  inputRate: number;
  timer: number;
  stopped: boolean;
  /** Set for hands-free turns: stops on its own when the speaker goes quiet. */
  detector: SilenceDetector | null;
};

export interface SpeakMicStart {
  /** Stop by itself once the speaker has talked and gone quiet. */
  autoStop?: boolean;
  /** With autoStop: nobody spoke, so no clip is sent. */
  onNoSpeech?: () => void;
}

/** Live speak mic: PCM until stop, silence (autoStop) or 45s, then one WAV. Does not auto-restart. */
export function useSpeakMic(lang: string, onClip: (wav: Blob, lang: string) => void) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onClipRef = useRef(onClip);
  const langRef = useRef(lang);
  const sessionRef = useRef<RecSession | null>(null);
  onClipRef.current = onClip;
  langRef.current = lang;

  const teardown = useCallback((emit: boolean) => {
    const session = sessionRef.current;
    if (!session || session.stopped) return;
    session.stopped = true;
    window.clearTimeout(session.timer);
    session.processor.onaudioprocess = null;
    session.processor.disconnect();
    session.source.disconnect();
    session.gain.disconnect();
    session.stream.getTracks().forEach((track) => track.stop());
    const chunks = session.chunks;
    const samples = session.samples;
    const inputRate = session.inputRate;
    void session.ctx.close();
    sessionRef.current = null;
    setListening(false);
    if (!emit || samples === 0) return;
    const merged = mergeFloats(chunks, samples);
    const cap = Math.floor(inputRate * 45);
    const clipped = merged.length > cap ? merged.subarray(0, cap) : merged;
    const pcm = downsampleTo16k(clipped, inputRate);
    if (pcm.length === 0) return;
    onClipRef.current(encodeWav16kMono(pcm), langRef.current);
  }, []);

  const stop = useCallback(() => {
    teardown(true);
  }, [teardown]);

  const cancel = useCallback(() => {
    teardown(false);
  }, [teardown]);

  const start = useCallback(async (options: SpeakMicStart = {}): Promise<boolean> => {
    if (sessionRef.current) return false;
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser has no microphone.');
      return false;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      setError('Microphone permission was blocked.');
      setListening(false);
      return false;
    }
    const ctx = new AudioContext();
    await ctx.resume();
    const source = ctx.createMediaStreamSource(stream);
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const session: RecSession = {
      stream,
      ctx,
      processor,
      source,
      gain,
      chunks: [],
      samples: 0,
      inputRate: ctx.sampleRate || 48000,
      timer: 0,
      stopped: false,
      detector: options.autoStop ? createSilenceDetector() : null,
    };
    sessionRef.current = session;
    processor.onaudioprocess = (event) => {
      if (session.stopped) return;
      const data = event.inputBuffer.getChannelData(0);
      session.chunks.push(new Float32Array(data));
      session.samples += data.length;
      if (session.samples >= session.inputRate * 45) {
        teardown(true);
        return;
      }
      const heard = session.detector?.push(rmsLevel(data), (data.length / session.inputRate) * 1000);
      if (heard === 'speech_end') teardown(true);
      else if (heard === 'no_speech') {
        teardown(false);
        options.onNoSpeech?.();
      }
    };
    source.connect(processor);
    processor.connect(gain);
    gain.connect(ctx.destination);
    session.timer = window.setTimeout(() => teardown(true), 45000);
    setListening(true);
    return true;
  }, [teardown]);

  useEffect(() => {
    return () => {
      const session = sessionRef.current;
      if (!session) return;
      session.stopped = true;
      window.clearTimeout(session.timer);
      session.stream.getTracks().forEach((track) => track.stop());
      void session.ctx.close();
      sessionRef.current = null;
    };
  }, []);

  const supported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  return { listening, error, supported, start, stop, cancel };
}
