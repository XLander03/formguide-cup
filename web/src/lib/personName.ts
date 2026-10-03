/**
 * Spoken journey and status phrases are not a person's name.
 * "I am an existing customer" must not fill applicant_full_name.
 */

const NON_NAME_TOKENS = new Set([
  'a',
  'an',
  'the',
  'of',
  'to',
  'for',
  'and',
  'or',
  'with',
  'existing',
  'already',
  'new',
  'customer',
  'customers',
  'account',
  'accounts',
  'bank',
  'banks',
  'savings',
  'salary',
  'current',
  'basic',
  'opening',
  'open',
  'kyc',
  'rekyc',
  're',
  'first',
  'time',
  'not',
  'this',
  'have',
  'has',
]);

const JOURNEY_PHRASE =
  /\b(?:existing\s+customer|already\s+(?:a\s+)?customer|new\s+customer|new\s+to\s+(?:the\s+)?bank|not\s+a\s+customer|first\s+time|(?:savings|salary|current|basic)\s+account|account\s+opening|open(?:ing)?\s+(?:an?\s+)?account|(?:re[-\s]?)?kyc)\b|मौजूदा\s*ग्राहक|पहले\s*से\s*ग्राहक|नया\s*ग्राहक|पहली\s*बार|बचत\s*खाता|खाता\s*खोल|केवाईसी|केवाइसी|री[-\s]?के(?:वाई|वाइ)सी/i;

export function isJourneyPhraseName(name: string): boolean {
  const cleaned = name.replace(/\s+/g, ' ').trim();
  if (!cleaned) return true;
  if (/^(?:a|an|the)\b/i.test(cleaned)) return true;
  const tokens = cleaned.toLowerCase().split(' ');
  if (
    tokens.every((token) => {
      const word = token.replace(/[^a-z-]/g, '');
      return word.length > 0 && NON_NAME_TOKENS.has(word);
    })
  ) {
    return true;
  }
  return JOURNEY_PHRASE.test(cleaned);
}

/** Keep a spoken person name. Drop journey phrases and blank captures. */
export function acceptPersonName(candidate: string | null | undefined): string | null {
  if (typeof candidate !== 'string') return null;
  const name = candidate.replace(/\s+/g, ' ').trim();
  if (name.length < 2 || name.length > 80) return null;
  if (isJourneyPhraseName(name)) return null;
  return name;
}
