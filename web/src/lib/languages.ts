/**
 * Picker + speak hint for India locales of gemini-3.5-transcribe.
 * Same codes as functions/src/languages.ts. English and Hindi are Supported;
 * every other code is Experimental on the model language table. The `beta` flag marks those
 * rows in the language picker with a Beta badge. English and Hindi have none.
 * Tamil (ta-IN) and Urdu (ur-IN / ur-PK) are not on that table, so they are not listed.
 * The table also lists Punjabi (Gurmukhi script) as pa-Guru-IN. The picker offers
 * one Punjabi row and sends pa-IN. Sindhi is listed as sd-Arab-IN and is kept.
 * https://ai.google.dev/gemini-api/docs/models/gemini-3.5-transcribe
 * https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-5-transcribe
 */
export const LANGUAGES = [
  { id: 'en', bcp47: 'en-IN', englishName: 'English', pickerLabel: 'English', beta: false },
  { id: 'hi', bcp47: 'hi-IN', englishName: 'Hindi', pickerLabel: 'हिन्दी', beta: false },
  { id: 'bn', bcp47: 'bn-IN', englishName: 'Bengali', pickerLabel: 'বাংলা', beta: true },
  { id: 'mr', bcp47: 'mr-IN', englishName: 'Marathi', pickerLabel: 'मराठी', beta: true },
  { id: 'te', bcp47: 'te-IN', englishName: 'Telugu', pickerLabel: 'తెలుగు', beta: true },
  { id: 'gu', bcp47: 'gu-IN', englishName: 'Gujarati', pickerLabel: 'ગુજરાતી', beta: true },
  { id: 'kn', bcp47: 'kn-IN', englishName: 'Kannada', pickerLabel: 'ಕನ್ನಡ', beta: true },
  { id: 'ml', bcp47: 'ml-IN', englishName: 'Malayalam', pickerLabel: 'മലയാളം', beta: true },
  { id: 'or', bcp47: 'or-IN', englishName: 'Odia', pickerLabel: 'ଓଡ଼ିଆ', beta: true },
  { id: 'pa', bcp47: 'pa-IN', englishName: 'Punjabi', pickerLabel: 'ਪੰਜਾਬੀ', beta: true },
  { id: 'as', bcp47: 'as-IN', englishName: 'Assamese', pickerLabel: 'অসমীয়া', beta: true },
  { id: 'sd', bcp47: 'sd-Arab-IN', englishName: 'Sindhi', pickerLabel: 'سنڌي', beta: true },
] as const;

export type LanguageOption = (typeof LANGUAGES)[number];
export type ShellLanguage = LanguageOption['id'];
export type MicLang = LanguageOption['bcp47'];

const BY_ID = new Map<string, LanguageOption>(LANGUAGES.map((lang) => [lang.id, lang]));
const BY_BCP47 = new Map<string, LanguageOption>(LANGUAGES.map((lang) => [lang.bcp47, lang]));

export function languageById(id: string | null | undefined): LanguageOption | null {
  if (!id) return null;
  return BY_ID.get(id) ?? null;
}

export function languageByBcp47(code: string | null | undefined): LanguageOption | null {
  if (!code) return null;
  return BY_BCP47.get(code) ?? null;
}

/** Visible shell label. English and Hindi keep their existing words. */
export function languageLabel(id: string | null | undefined): string {
  return languageById(id)?.pickerLabel ?? 'English';
}

export function storedLanguageName(id: string | null | undefined): string {
  return languageById(id)?.englishName ?? 'English';
}

/** Letters outside Latin (numbers and punctuation are allowed). */
export function hasNonLatinLetter(value: string): boolean {
  return /[^\p{Script=Latin}\p{N}\p{P}\p{S}\p{Z}\p{M}]/u.test(value);
}

function normalizeLang(code: string): string {
  return code.replace(/_/g, '-').toLowerCase();
}

/** A device voice whose BCP-47 tag matches the hint (exact, then primary language). */
export function findVoice(voices: SpeechSynthesisVoice[], bcp47: string): SpeechSynthesisVoice | null {
  const target = normalizeLang(bcp47);
  const tags = voices.map((voice) => ({ voice, tag: normalizeLang(voice.lang || '') }));
  const exact = tags.find((row) => row.tag === target);
  if (exact) return exact.voice;
  const longer = tags.find((row) => row.tag.startsWith(`${target}-`));
  if (longer) return longer.voice;
  const subtag = target.split('-')[0];
  if (!subtag) return null;
  const family = tags.find((row) => row.tag.split('-')[0] === subtag);
  return family?.voice ?? null;
}

/** The device's speech voices; waits up to 1s for Chrome, which loads them after page load. */
export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return Promise.resolve([]);
  const synth = window.speechSynthesis;
  const ready = synth.getVoices();
  if (ready.length > 0) return Promise.resolve(ready);
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      synth.removeEventListener('voiceschanged', finish);
      resolve(synth.getVoices());
    };
    synth.addEventListener('voiceschanged', finish);
    window.setTimeout(finish, 1000);
  });
}

export interface ReadbackVoicePlan {
  /** True only when the read-back must be spoken in English instead. */
  fellBackToEnglish: boolean;
  /** Set for every language but English: speak() sends these to the server voice, with the device voice as backup. */
  speech?: { lang: string; voice?: SpeechSynthesisVoice };
}

/**
 * English keeps the default device path. Hindi and the regional languages are spoken by the
 * server voice (see tts.ts), so the read-back stays in the customer's language even on a
 * device with no voice for it; a matching device voice is kept as the backup.
 */
export async function resolveReadbackVoice(bcp47: string): Promise<ReadbackVoicePlan> {
  if (bcp47 === 'en-IN') return { fellBackToEnglish: false };
  const voice = findVoice(await loadVoices(), bcp47) ?? undefined;
  return { fellBackToEnglish: false, speech: voice ? { lang: bcp47, voice } : { lang: bcp47 } };
}

const SCRIPT_LANGS: Array<{ re: RegExp; codes: readonly MicLang[] }> = [
  { re: /\p{Script=Devanagari}/u, codes: ['hi-IN', 'mr-IN'] },
  { re: /\p{Script=Bengali}/u, codes: ['bn-IN', 'as-IN'] },
  { re: /\p{Script=Telugu}/u, codes: ['te-IN'] },
  { re: /\p{Script=Gujarati}/u, codes: ['gu-IN'] },
  { re: /\p{Script=Kannada}/u, codes: ['kn-IN'] },
  { re: /\p{Script=Malayalam}/u, codes: ['ml-IN'] },
  { re: /\p{Script=Oriya}/u, codes: ['or-IN'] },
  { re: /\p{Script=Gurmukhi}/u, codes: ['pa-IN'] },
  { re: /\p{Script=Arabic}/u, codes: ['sd-Arab-IN'] },
];

/**
 * Language of typed or transcribed text from its script, or null for Latin-only text.
 * Devanagari and Bengali script are shared, so the mic hint picks between them.
 * The speak function does the same with the model's guess; this covers typed turns.
 */
export function detectScriptLanguage(text: string, hint: MicLang): MicLang | null {
  let best: (typeof SCRIPT_LANGS)[number] | null = null;
  let bestCount = 0;
  for (const row of SCRIPT_LANGS) {
    let count = 0;
    for (const ch of text) if (row.re.test(ch)) count++;
    if (count > bestCount) {
      best = row;
      bestCount = count;
    }
  }
  if (!best) return null;
  return best.codes.includes(hint) ? hint : best.codes[0];
}
