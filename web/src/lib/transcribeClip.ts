import { languageByBcp47, type MicLang } from './languages';

/** Plain words for the speak function's error codes. The journey page never shows a raw code. */
export function journeyMicMessage(code: string | null | undefined): string {
  if (code && /rate_limited|_429/.test(code)) return 'Too many tries from this network. Wait a minute, then try again.';
  if (code && /_503|unavailable/.test(code)) return 'The voice service is busy right now. Try again, or tap a card.';
  return 'Could not hear that. Try again, or tap a card.';
}

/**
 * Same speak function the fill page uses, asked to detect the language: the customer just
 * speaks, and the language they used becomes the session's (mic hint, questions, voice).
 */
export async function transcribeClip(
  wav: Blob,
  language: string,
): Promise<{ transcript: string | null; error: string | null; detected?: MicLang | null }> {
  const body = new FormData();
  body.append('language', language);
  body.append('detect_language', '1');
  body.append('current_values', '{}');
  body.append('audio', wav, 'clip.wav');
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), 70000);
  try {
    const res = await fetch('/api/speak', { method: 'POST', body, signal: ctrl.signal });
    const data = (await res.json()) as { transcript?: unknown; error?: unknown; detected_lang?: unknown };
    const transcript = typeof data.transcript === 'string' ? data.transcript.trim() : '';
    if (!transcript) {
      return { transcript: null, error: journeyMicMessage(typeof data.error === 'string' ? data.error : null) };
    }
    const detected = languageByBcp47(typeof data.detected_lang === 'string' ? data.detected_lang : null)?.bcp47 ?? null;
    return { transcript, error: null, detected };
  } catch {
    return { transcript: null, error: 'The voice service did not answer. Try again.' };
  } finally {
    window.clearTimeout(timer);
  }
}
