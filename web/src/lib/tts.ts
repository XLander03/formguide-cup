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

/** Server lines under way, fetching or playing: a line in pieces is still speaking between them. */
let serverLines = 0;

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

const RETRY_MS = 1200;

/** Demo hook only: `?flags=1&ttscap=1` pretends the server returned 429 {error:'daily_cap'}. */
function forceDailyCap(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('flags') === '1' && params.get('ttscap') === '1';
}

async function serverAudio(text: string, lang: string, stops: number): Promise<string | null> {
  if (forceDailyCap()) return null;
  const key = `${lang}|${text}`;
  const cached = audioCache.get(key);
  if (cached) return cached;
  // One retry: a busy model or a brief quota blip should not drop the line to a worse voice.
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
      if (stops !== stopCount) return null;
    }
    const url = await fetchAudio(key, text, lang);
    if (url !== 'retry') return url;
  }
  return null;
}

async function fetchAudio(key: string, text: string, lang: string): Promise<string | null | 'retry'> {
  try {
    // v names the server voice: a new one gets new CDN entries instead of a week of the old audio.
    const res = await fetch(`/api/tts?v=chirp3&lang=${encodeURIComponent(lang)}&text=${encodeURIComponent(text)}`);
    // A full daily cap will not clear on a retry. Other 429s are a short quota blip.
    if (res.status === 429) {
      const error = await ttsErrorCode(res);
      if (error === 'daily_cap') return null;
      return 'retry';
    }
    if (res.status >= 500) return 'retry';
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
    return 'retry';
  }
}

async function ttsErrorCode(res: Response): Promise<string | null> {
  try {
    const data = (await res.json()) as { error?: unknown };
    return typeof data.error === 'string' ? data.error : null;
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
      serverLines++;
      try {
        await speakOnServer(text, lang, hooks, voice, stops);
      } finally {
        serverLines--;
      }
      return;
    }
    await speakOnDevice(text, lang, hooks, voice, stops);
  })();
}

/** Lines up to this long are one request; a short question gains nothing from splitting. */
const WHOLE_LINE_CHARS = 120;
/** The first piece stops at the sentence that reaches this length, so it arrives quickly. */
const FIRST_CHUNK_CHARS = 40;
const CHUNK_CHARS = 160;
/** Pieces fetched at once: the one playing and the next two. */
const PREFETCH = 3;

/**
 * A long line in sentence-sized pieces. The server voice makes a whole clip before sending
 * any of it, so a read-back sent whole sat silent for 5-13s; in pieces the first sentence
 * plays in about a second while the rest are fetched. Fixed sentences also cache on their own.
 */
export function speechChunks(text: string): string[] {
  const clean = text.trim();
  if (clean.length <= WHOLE_LINE_CHARS) return [clean];
  const sentences = clean.split(/(?<=[.!?।॥])\s+/u).filter(Boolean);
  const chunks: string[] = [];
  let piece = '';
  for (const sentence of sentences) {
    const enough = chunks.length === 0 ? FIRST_CHUNK_CHARS : CHUNK_CHARS;
    if (piece && (piece.length >= enough || piece.length + 1 + sentence.length > CHUNK_CHARS)) {
      chunks.push(piece);
      piece = sentence;
    } else {
      piece = piece ? `${piece} ${sentence}` : sentence;
    }
  }
  if (piece) chunks.push(piece);
  return chunks;
}

/** Plays the line piece by piece; onStart fires once, onEnd after the last piece. */
async function speakOnServer(
  text: string,
  lang: string,
  hooks: SpeakHooks | undefined,
  voice: SpeechSynthesisVoice | null | undefined,
  stops: number,
): Promise<void> {
  const chunks = speechChunks(text);
  const fetches: Array<Promise<string | null>> = [];
  const fetchAt = (i: number) => (fetches[i] ??= serverAudio(chunks[i], lang, stops));
  let started = false;
  const pieceHooks: SpeakHooks = {
    onStart: () => {
      if (started) return;
      started = true;
      hooks?.onStart?.();
    },
    onError: hooks?.onError,
  };
  for (let i = 0; i < chunks.length; i++) {
    for (let next = i; next < Math.min(chunks.length, i + PREFETCH); next++) void fetchAt(next);
    const url = await fetchAt(i);
    if (stops !== stopCount) return;
    if (url && (await playAudio(url, pieceHooks))) {
      if (stops !== stopCount) return;
      continue;
    }
    if (stops !== stopCount) return;
    // The backup must really speak this language. A browser with no matching voice (or one
    // whose list has not loaded) reads Hindi with an English voice, which says only the
    // digits and the commas; silence, with the words on screen, is better than that.
    const match = voice ?? findVoice(await loadVoices(), lang);
    if (!match) {
      console.warn(`[tts] no ${lang} voice: server voice unavailable and no matching device voice`);
      hooks?.onError?.('no_voice');
      return;
    }
    await speakOnDevice(chunks[i], lang, pieceHooks, match, stops);
    if (stops !== stopCount) return;
  }
  hooks?.onEnd?.();
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
  if (serverLines > 0) return true;
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
