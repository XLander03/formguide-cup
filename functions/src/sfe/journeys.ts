import { SFE_JOURNEYS, SFE_PARKED_JOURNEYS, SFE_SAMPLE_PHRASES, type SfeJourneyId } from './schema';

export function sfeJourneysPayload() {
  return {
    journeys: SFE_JOURNEYS,
    parked: SFE_PARKED_JOURNEYS,
    sample_phrases: SFE_SAMPLE_PHRASES,
  };
}

const PARKED_RE =
  /\bnominat|\bnominee\b|नामांकन|नॉमिनी|\bdebit\s*card\b|\breissue\b|\bpersonal\s*loan\b|ऋण|लोन|\bfixed\s*deposit\b|\bFD\b|\bNEFT\b|\bRTGS\b|\bIMPS\b/i;

const RE_KYC_HINT = /\bre-?kyc\b|redo\s+(?:my\s+)?kyc|periodic\s+(?:re-?)?verification|bank\s+(?:sent|asked)|फिर\s*से\s*केवाईसी|री[-\s]?के(?:वाई|वाइ)सी/i;
const KYC_HINT = /\bkyc\b|केवाईसी|केवाइसी|update\s+(?:my\s+)?(?:address|mobile|identity)/i;
const SALARY_HINT = /\bsalary\b|सैलरी/i;
const BASIC_HINT = /\bbasic\b|no-?frills|बेसिक/i;
const CURRENT_HINT = /\bcurrent\s+account\b|करंट\s*खाता/i;
const SAVINGS_HINT = /\bsavings?\s+account\b|\bopen\b.*\baccount\b|बचत\s*खाता|खाता\s*खोल/i;

/**
 * Best-effort journey detection from a free-form utterance, used on the
 * journey picker ("Just tell me what you need") before any field
 * extraction starts. Returns null when nothing matches confidently —
 * callers should fall back to letting the user pick a journey card.
 */
export function sfeDetectJourney(utterance: string): SfeJourneyId | null {
  const text = utterance.trim();
  if (PARKED_RE.test(text)) return null;
  if (RE_KYC_HINT.test(text)) return 'rekyc';
  if (SALARY_HINT.test(text)) return 'salary';
  if (CURRENT_HINT.test(text)) return 'individual_current';
  if (BASIC_HINT.test(text)) return 'basic';
  if (KYC_HINT.test(text)) return 'kyc_update';
  if (SAVINGS_HINT.test(text)) return 'regular_savings';
  return null;
}
