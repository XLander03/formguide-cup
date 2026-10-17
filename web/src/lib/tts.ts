import { findVoice, loadVoices } from './languages';

/** Bumped by every new utterance and by stopSpeaking; a mixed read-back stops when it changes. */
let speechGeneration = 0;
/** Bumped only by stopSpeaking, so a line still being fetched or choosing a voice never starts after a stop. */
let stopCount = 0;

export interface SpeakHooks {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: string) => void;
}

/** The server-spoken line now playing, and how to end its promise early on a stop. */
let current: { audio: HTMLAudioElement; finish: () => void } | null = null;

/** Recent server audio by language and text: the questions and read-back copy repeat. */
const audioCache = new Map<string, string>();
const AUDIO_CACHE_SIZE = 40;

/**
 * Hindi and regional languages are spoken by the server (/api/tts), the same on every
 * device. Browser voices for them are unreliable: with no matching voice, or a voice list
 * not loaded yet, Chrome reads the text with an English voice that says only the digits
 * and the commas. English stays on the device voice, which reads it well with no wait.
 */
function serverSpoken(lang: string): boolean {
  return !/^en\b/i.test(lang);
}

async function serverAudio(text: string, lang: string): Promise<string | null> {
  const key = `${lang}|${text}`;
  const cached = audioCache.get(key);
  if (cached) return cached;
  try {
    const res = await fetch(`/api/tts?lang=${encodeURIComponent(lang)}&text=${encodeURIComponent(text)}`);
    if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('audio/')) return null;
    const url = URL.createObjectURL(await res.blob());
    audioCache.set(key, url);
    if (audioCache.size > AUDIO_CACHE_SIZE) {
      const oldest = audioCache.keys().next().value as string;
      URL.revokeObjectURL(audioCache.get(oldest) as string);
      audioCache.delete(oldest);
    }
    return url;
  } catch {
    return null;
  }
}

/** Plays one server line. Resolves false when it could not play, so the device voice can try. */
function playAudio(url: string, hooks?: SpeakHooks): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof Audio === 'undefined') {
      resolve(false);
      return;
    }
    const audio = new Audio(url);
    let started = false;
    const finish = (played: boolean) => {
      if (current?.audio === audio) current = null;
      resolve(played);
    };
    current = { audio, finish: () => finish(true) };
    audio.onplaying = () => {
      if (started) return;
      started = true;
      hooks?.onStart?.();
    };
    audio.onended = () => {
      hooks?.onEnd?.();
      finish(true);
    };
    audio.onerror = () => finish(started);
    audio.play().catch(() => finish(started));
  });
}

export function speak(
  text: string,
  lang: string = 'en-IN',
  hooks?: SpeakHooks,
  voice?: SpeechSynthesisVoice | null,
): Promise<void> {
  return (async () => {
    if (!text.trim()) return;
    const stops = stopCount;
    if (serverSpoken(lang)) {
      const url = await serverAudio(text, lang);
      if (stops !== stopCount) return;
      if (url && (await playAudio(url, hooks))) return;
      if (stops !== stopCount) return;
    }
    await speakOnDevice(text, lang, hooks, voice, stops);
  })();
}

function speakOnDevice(
  text: string,
  lang: string,
  hooks: SpeakHooks | undefined,
  voice: SpeechSynthesisVoice | null | undefined,
  stops: number,
): Promise<void> {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) {
      resolve();
      return;
    }
    // Choosing a voice can wait for Chrome's voice list; a stop during that wait cancels this line.
    void pickVoice(voice, lang).then((chosen) => {
      if (stops !== stopCount) {
        resolve();
        return;
      }
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = chosen?.lang || lang;
      if (chosen) u.voice = chosen;
      u.rate = 0.95;
      u.onstart = () => hooks?.onStart?.();
      u.onend = () => {
        hooks?.onEnd?.();
        resolve();
      };
      u.onerror = (event) => {
        hooks?.onError?.(String((event as SpeechSynthesisErrorEvent).error ?? 'unknown'));
        resolve();
      };
      window.speechSynthesis.speak(u);
    });
  });
}

/** The voice to use on the device: the caller's, else the device voice for `lang`. */
async function pickVoice(voice: SpeechSynthesisVoice | null | undefined, lang: string): Promise<SpeechSynthesisVoice | null> {
  if (voice) return voice;
  return findVoice(await loadVoices(), lang);
}

/** English stays en-IN. Hindi uses hi-IN. Mixed speaks Hindi, then English. */
export async function speakForUtterance(
  text: string,
  lang: 'en' | 'hi' | 'mixed',
  hooks?: SpeakHooks,
): Promise<void> {
  const generation = ++speechGeneration;
  if (lang !== 'mixed') {
    await speak(text, lang === 'hi' ? 'hi-IN' : 'en-IN', hooks);
    return;
  }
  const marker = 'Please confirm this read-back.';
  const splitAt = text.indexOf(marker);
  if (splitAt <= 0) {
    await speak(text, 'hi-IN', hooks);
    return;
  }
  await speak(text.slice(0, splitAt).trim(), 'hi-IN', hooks);
  if (generation !== speechGeneration) return;
  await speak(text.slice(splitAt).trim(), 'en-IN', hooks);
}

/** True while a line is playing, from the server or the device voice. */
export function isSpeaking(): boolean {
  if (current && !current.audio.paused && !current.audio.ended) return true;
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
  return window.speechSynthesis.speaking || window.speechSynthesis.pending;
}

/** Cancels the current clip and any queued clips of a multi-part utterance. */
export function stopSpeaking(): void {
  speechGeneration++;
  stopCount++;
  if (current) {
    const { audio, finish } = current;
    current = null;
    audio.pause();
    finish();
  }
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}
