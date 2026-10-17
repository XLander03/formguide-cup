/** Same speak function the fill page uses. Only the transcript is needed to choose a journey. */
export async function transcribeClip(
  wav: Blob,
  language: string,
): Promise<{ transcript: string | null; error: string | null }> {
  const body = new FormData();
  body.append('language', language);
  body.append('current_values', '{}');
  body.append('audio', wav, 'clip.wav');
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), 70000);
  try {
    const res = await fetch('/api/speak', { method: 'POST', body, signal: ctrl.signal });
    const data = (await res.json()) as { transcript?: unknown; error?: unknown };
    const transcript = typeof data.transcript === 'string' ? data.transcript.trim() : '';
    if (!transcript) {
      return {
        transcript: null,
        error: typeof data.error === 'string' ? data.error : 'Could not hear that. Try again.',
      };
    }
    return { transcript, error: null };
  } catch {
    return { transcript: null, error: 'The voice service did not answer. Try again.' };
  } finally {
    window.clearTimeout(timer);
  }
}
