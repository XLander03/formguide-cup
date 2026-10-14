/**
 * Picker + speak hint for India locales of gemini-3.5-transcribe.
 * Same codes as functions/src/languages.ts. English and Hindi are Supported;
 * every other code is Experimental on the model language table and shows Beta.
 * Tamil and Urdu are not on that table, so they are not listed.
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
  { id: 'pa-guru', bcp47: 'pa-Guru-IN', englishName: 'Punjabi (Gurmukhi)', pickerLabel: 'ਪੰਜਾਬੀ (Gurmukhi)', beta: true },
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

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
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
  /** True when a beta language has no installed voice, so speech uses English. */
  fellBackToEnglish: boolean;
  /** Set only when a matching regional voice should speak the read-back. */
  speech?: { lang: string; voice: SpeechSynthesisVoice };
}

/**
 * English and Hindi keep the existing read-back path.
 * Other languages use a matching Web Speech voice, or English when the device has none.
 */
export async function resolveReadbackVoice(bcp47: string): Promise<ReadbackVoicePlan> {
  if (bcp47 === 'en-IN' || bcp47 === 'hi-IN') return { fellBackToEnglish: false };
  const voices = await loadVoices();
  const voice = findVoice(voices, bcp47);
  if (!voice) return { fellBackToEnglish: true };
  return { fellBackToEnglish: false, speech: { lang: bcp47, voice } };
}
