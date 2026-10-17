import { SPEAK_LANGUAGES, type SpeakLanguage } from './languages';

/**
 * Speech-to-Text with Chirp 3, for the regional languages and for finding out which
 * language a customer speaks.
 *
 * gemini-3.5-transcribe lists every regional language as Experimental, and on clean
 * Malayalam it returned a mix of Gurmukhi and Malayalam letters, so the turn was read as
 * Punjabi and answered in English. Chirp 3 has these languages and can also detect the
 * language itself (language code "auto"), which the Preparation page uses so a customer
 * never has to pick one. https://docs.cloud.google.com/speech-to-text/docs/models/chirp-3
 */

/** Chirp 3's code for each speak language. Sindhi has none. */
const CHIRP_CODES: Partial<Record<SpeakLanguage, string>> = {
  'en-IN': 'en-IN',
  'hi-IN': 'hi-IN',
  'bn-IN': 'bn-IN',
  'mr-IN': 'mr-IN',
  'te-IN': 'te-IN',
  'gu-IN': 'gu-IN',
  'kn-IN': 'kn-IN',
  'ml-IN': 'ml-IN',
  'or-IN': 'or-IN',
  'pa-IN': 'pa-Guru-IN',
  'as-IN': 'as-IN',
};

const STT_TIMEOUT_MS = 15_000;

export function chirpSttCode(lang: SpeakLanguage): string | null {
  return CHIRP_CODES[lang] ?? null;
}

/** A detected code ("ml-in", "pa-guru-in", "hi-IN") as a speak language, or null for one we do not offer. */
export function speakLanguageFromStt(code: unknown): SpeakLanguage | null {
  if (typeof code !== 'string' || !code) return null;
  const lower = code.toLowerCase();
  for (const [lang, chirp] of Object.entries(CHIRP_CODES)) {
    if (chirp.toLowerCase() === lower) return lang as SpeakLanguage;
  }
  // "ml" or "hi" with no region.
  const primary = lower.split('-')[0];
  return SPEAK_LANGUAGES.find((row) => row.bcp47.split('-')[0] === primary)?.bcp47 ?? null;
}

export interface SttResult {
  transcript: string;
  /** What Chirp heard, as a speak language; null when it named one we do not offer. */
  language: SpeakLanguage | null;
}

/**
 * One clip through Chirp 3. `lang` "auto" detects the language. Null on any failure
 * (API not enabled, timeout, nothing heard), so the caller can use Gemini instead.
 */
export async function transcribeChirp(
  token: string,
  project: string,
  wav: Buffer,
  lang: SpeakLanguage | 'auto',
): Promise<SttResult | null> {
  const code = lang === 'auto' ? 'auto' : chirpSttCode(lang);
  if (!code) return null;
  try {
    const res = await fetch(
      `https://us-speech.googleapis.com/v2/projects/${project}/locations/us/recognizers/_:recognize`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: { autoDecodingConfig: {}, languageCodes: [code], model: 'chirp_3' },
          content: wav.toString('base64'),
        }),
        signal: AbortSignal.timeout(STT_TIMEOUT_MS),
      },
    );
    if (!res.ok) {
      // 403 SERVICE_DISABLED means the Speech-to-Text API is not enabled on the project.
      const detail = await res.text().catch(() => '');
      console.warn('stt_chirp_failed', code, res.status, detail.replace(/\s+/g, ' ').slice(0, 900));
      return null;
    }
    const data = (await res.json()) as {
      results?: Array<{ alternatives?: Array<{ transcript?: string }>; languageCode?: string }>;
    };
    const results = data.results ?? [];
    const transcript = results
      .map((row) => row.alternatives?.[0]?.transcript?.trim() ?? '')
      .filter(Boolean)
      .join(' ')
      .trim();
    if (!transcript) return null;
    const heard = results.find((row) => row.languageCode)?.languageCode;
    return { transcript, language: lang === 'auto' ? speakLanguageFromStt(heard) : lang };
  } catch (err) {
    console.warn('stt_chirp_failed', code, err instanceof Error ? err.message : 'unknown');
    return null;
  }
}
