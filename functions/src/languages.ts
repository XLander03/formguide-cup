/**
 * India locales accepted by gemini-3.5-transcribe as a language_codes hint.
 * Checked against the model language tables (do not add codes that are absent):
 * - https://ai.google.dev/gemini-api/docs/models/gemini-3.5-transcribe
 * - https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-5-transcribe
 *
 * en-IN and hi-IN are Supported. Every other India code on that list is Experimental.
 * Not offered, because they are not on the list: Tamil (ta-IN), Urdu (ur-IN / ur-PK).
 * Also omitted: bn-BD (Bangladesh) and ne-NP (Nepal), which are not India locales.
 * Keep this list aligned with web/src/lib/languages.ts.
 */
export const SPEAK_LANGUAGES = [
  { bcp47: 'en-IN', englishName: 'English', beta: false },
  { bcp47: 'hi-IN', englishName: 'Hindi', beta: false },
  { bcp47: 'bn-IN', englishName: 'Bengali', beta: true },
  { bcp47: 'mr-IN', englishName: 'Marathi', beta: true },
  { bcp47: 'te-IN', englishName: 'Telugu', beta: true },
  { bcp47: 'gu-IN', englishName: 'Gujarati', beta: true },
  { bcp47: 'kn-IN', englishName: 'Kannada', beta: true },
  { bcp47: 'ml-IN', englishName: 'Malayalam', beta: true },
  { bcp47: 'or-IN', englishName: 'Odia', beta: true },
  { bcp47: 'pa-IN', englishName: 'Punjabi', beta: true },
  { bcp47: 'as-IN', englishName: 'Assamese', beta: true },
  { bcp47: 'sd-Arab-IN', englishName: 'Sindhi', beta: true },
  { bcp47: 'pa-Guru-IN', englishName: 'Punjabi (Gurmukhi)', beta: true },
] as const;

export type SpeakLanguage = (typeof SPEAK_LANGUAGES)[number]['bcp47'];

const BY_CODE = new Map<string, (typeof SPEAK_LANGUAGES)[number]>(
  SPEAK_LANGUAGES.map((lang) => [lang.bcp47, lang]),
);

export function isSpeakLanguage(value: string): value is SpeakLanguage {
  return BY_CODE.has(value);
}

export function isBetaSpeakLanguage(value: string): boolean {
  return BY_CODE.get(value)?.beta === true;
}

export function englishNameFor(bcp47: string): string {
  return BY_CODE.get(bcp47)?.englishName ?? 'English';
}

/** Letters outside Latin (plus numbers, punctuation, symbols, spaces). */
export function hasNonLatinLetter(value: string): boolean {
  return /[^\p{Script=Latin}\p{N}\p{P}\p{S}\p{Z}\p{M}]/u.test(value);
}

/**
 * Beta languages store field strings in English/Latin script.
 * English and Hindi are returned unchanged.
 */
export function enforceLatinFieldValues<T extends Record<string, string | boolean | null>>(
  updates: T,
  language: string,
): T {
  if (!isBetaSpeakLanguage(language)) return updates;
  const out: Record<string, string | boolean | null> = { ...updates };
  for (const [key, value] of Object.entries(out)) {
    if (typeof value !== 'string' || !hasNonLatinLetter(value)) continue;
    if (key === 'preferred_language') {
      out[key] = englishNameFor(language);
      continue;
    }
    delete out[key];
  }
  return out as T;
}

/** Extra extract instruction for beta hints. Empty for English and Hindi. */
export function fieldScriptNote(language: string): string {
  if (!isBetaSpeakLanguage(language)) return '';
  const name = englishNameFor(language);
  return `LATIN FIELD VALUES:
Page language hint is ${language} (${name}). The transcript may be ${name}.
Every string stored in field_updates must be English or Latin script so the form and PDF stay readable. Transliterate names, cities, and addresses. Do not copy ${name} script into values.
Enums stay the English codes above. Booleans stay true/false.
Set confidence from how clearly the value was heard. Do not skip a field, a confidence flag, or the confirm step because the language is ${name}.
next_ask stays English. reply_lang stays "en" unless the transcript is Hindi.
assistant_message stays English and must include the exact sentence "Fields vary by bank."`;
}
