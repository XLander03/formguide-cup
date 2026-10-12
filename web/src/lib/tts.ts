export interface SpeakHooks {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: string) => void;
}

export function speak(
  text: string,
  lang: 'en-IN' | 'hi-IN' = 'en-IN',
  hooks?: SpeakHooks,
): Promise<void> {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window) || !text.trim()) {
      resolve();
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
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
}

/** English stays en-IN. Hindi uses hi-IN. Mixed speaks Hindi, then English. */
export async function speakForUtterance(
  text: string,
  lang: 'en' | 'hi' | 'mixed',
  hooks?: SpeakHooks,
): Promise<void> {
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
  await speak(text.slice(splitAt).trim(), 'en-IN', hooks);
}

export function stopSpeaking(): void {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}
