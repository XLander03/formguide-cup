import { SPEAK_LANGUAGES, englishNameFor, isSpeakLanguage, type SpeakLanguage } from './languages';

/**
 * Which of the speak languages the customer actually spoke, so questions and the
 * read-back can answer in it even when the page picker says something else.
 *
 * The transcript's script decides it when there is one: every Indic script maps to
 * one language, except Devanagari (Hindi or Marathi) and Bengali-Assamese script,
 * where the picker or the model's guess breaks the tie. A Latin-only transcript is
 * English unless the picker and the model both say otherwise (romanised Telugu with
 * the Telugu picker), so an English speaker is never answered in a language they
 * did not use.
 */

const SCRIPTS: Array<{ re: RegExp; langs: readonly SpeakLanguage[] }> = [
  { re: /\p{Script=Devanagari}/u, langs: ['hi-IN', 'mr-IN'] },
  { re: /\p{Script=Bengali}/u, langs: ['bn-IN', 'as-IN'] },
  { re: /\p{Script=Telugu}/u, langs: ['te-IN'] },
  { re: /\p{Script=Gujarati}/u, langs: ['gu-IN'] },
  { re: /\p{Script=Kannada}/u, langs: ['kn-IN'] },
  { re: /\p{Script=Malayalam}/u, langs: ['ml-IN'] },
  { re: /\p{Script=Oriya}/u, langs: ['or-IN'] },
  { re: /\p{Script=Gurmukhi}/u, langs: ['pa-IN'] },
  { re: /\p{Script=Arabic}/u, langs: ['sd-Arab-IN'] },
];

function scriptOf(lang: SpeakLanguage): RegExp | null {
  return SCRIPTS.find((row) => row.langs.includes(lang))?.re ?? null;
}

function countScript(text: string, re: RegExp): number {
  let count = 0;
  for (const ch of text) if (re.test(ch)) count++;
  return count;
}

export function detectSpokenLanguage(
  transcript: string,
  hint: SpeakLanguage,
  modelGuess?: unknown,
): SpeakLanguage {
  const guess = typeof modelGuess === 'string' && isSpeakLanguage(modelGuess) ? modelGuess : null;
  let best: (typeof SCRIPTS)[number] | null = null;
  let bestCount = 0;
  for (const row of SCRIPTS) {
    const count = countScript(transcript, row.re);
    if (count > bestCount) {
      best = row;
      bestCount = count;
    }
  }
  if (best) {
    if (best.langs.includes(hint)) return hint;
    // Nobody speaks two Indian scripts in one breath, so a transcript that mixes them is
    // garbled (clean Malayalam came back mostly in Gurmukhi letters, 6 of 62 still Malayalam).
    // With any of the picked language's own script left, keep that language rather than
    // answer in one the customer never spoke.
    const own = scriptOf(hint);
    if (own && countScript(transcript, own) >= 3) return hint;
    if (guess && best.langs.includes(guess)) return guess;
    return best.langs[0];
  }
  if (guess && guess === hint) return guess;
  return 'en-IN';
}

/**
 * True when a question is written in `lang`: its own script for an Indic language
 * (Latin is allowed for PAN, PIN, Form 60 and digits), and no other Indic script.
 * English must have no non-Latin letters at all.
 */
export function isInLanguageScript(text: string, lang: SpeakLanguage): boolean {
  if (!text.trim()) return false;
  const own = scriptOf(lang);
  for (const row of SCRIPTS) {
    if (row.re === own) continue;
    if (countScript(text, row.re) > 0) return false;
  }
  if (!own) return true;
  return countScript(text, own) > 0;
}

/**
 * Language hint for gemini-3.5-transcribe: always the picked language. With no hint the
 * model guesses, and on real microphone audio it guesses wrong (Telugu came back as Hindi
 * script), so everything after it was built on a made-up transcript. English picks still
 * cover Hinglish; any other language is picked in Preparation.
 */
export function transcriptionLanguageCodes(hint: SpeakLanguage): SpeakLanguage[] {
  return [hint];
}

/** Prompt list of the codes the model may return as spoken_lang. */
export function spokenLangChoices(): string {
  return SPEAK_LANGUAGES.map((lang) => `"${lang.bcp47}" (${lang.englishName})`).join(', ');
}

export function spokenLanguageName(lang: SpeakLanguage): string {
  return englishNameFor(lang);
}
