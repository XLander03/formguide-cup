import type { ExtractResponse, FormValues, GateAnswer } from '../../lib/types';
import { foldDevanagariDigits, parseFlexibleDob } from '../../lib/hiSlots';
import {
  detectUtteranceLang,
  liveNext,
  liveRefuse,
  type UtteranceLang,
} from '../../lib/utteranceLang';
import { CONFIDENCE_CHECK } from '../confidence';
import {
  emptyNominationValues,
  isNominationFilled,
  nominationCompleteness,
  nominationMissing,
  nominationNextAsk,
} from './schema';

const RELATIONSHIPS: Array<[RegExp, string]> = [
  [/\bwife\b|पत्नी/, 'wife'],
  [/\bhusband\b|पति(?!\/)/, 'husband'],
  [/\bson\b|बेटा|पुत्र/, 'son'],
  [/\bdaughter\b|बेटी|पुत्री/, 'daughter'],
  [/\bfather\b|पिता/, 'father'],
  [/\bmother\b|माता|माँ/, 'mother'],
  [/\bbrother\b|भाई/, 'brother'],
  [/\bsister\b|बहन/, 'sister'],
  [/\bspouse\b/, 'other'],
];

const NAME_STOP =
  /\b(?:and his|and her|who is|date of|dob\b|born|account|customer|mobile|phone|address|lives|residing|guardian|minor|aged|age|relationship|relation|savings|bank)\b/i;

function tidyName(raw: string): string | null {
  let name = raw.replace(/\s+/g, ' ').trim();
  name = (name.split(/[.,;।!?]/)[0] ?? '').trim();
  name = name.replace(/\s+हैं?\s*$/u, '').trim();
  name = (name.split(NAME_STOP)[0] ?? '').trim();
  name = name.replace(/^(?:a|an|the|is|my)\s+/i, '').trim();
  name = name
    .replace(/^(?:wife|husband|son|daughter|father|mother|brother|sister)\s+/i, '')
    .trim();
  if (!name) return null;
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length < 1 || words.length > 5) return null;
  if (!words.every((word) => /^[\p{L}][\p{L}\p{M}'.-]{0,40}$/u.test(word))) return null;
  if (!words.some((word) => word.length >= 2)) return null;
  return words.join(' ');
}

function nameAfter(text: string, pattern: RegExp): { value: string; confidence: number } | null {
  const match = pattern.exec(text);
  if (!match) return null;
  const value = tidyName(text.slice(match.index + match[0].length));
  if (!value) return null;
  const confidence = value.split(/\s+/).length >= 2 ? 0.9 : 0.72;
  return { value, confidence };
}

function clipAddress(raw: string): string | null {
  let text = raw.replace(/\s+/g, ' ').trim();
  text = text.replace(/^(?:is\s+)/i, '').trim();
  text = (text.split(/\.\s+|।\s*/)[0] ?? '').trim();
  text =
    (text.split(/\s+(?:he is|she is|they are|guardian\b|mobile\b|phone\b|customer\b|वो\b|नाबालिग|अभिभावक|मोबाइल)/i)[0] ??
      ''
    ).trim();
  text = (text.split(/\s+है\b|\s+हैं\b/)[0] ?? '').trim();
  text = text.replace(/[।.,]+$/g, '').trim();
  if (text.length < 4 || text.length > 180) return null;
  if (/^same\b/i.test(text)) return null;
  return text;
}

function addressAfter(text: string, pattern: RegExp): string | null {
  const match = pattern.exec(text);
  if (!match) return null;
  return clipAddress(text.slice(match.index + match[0].length));
}

function labeledDigits(text: string, pattern: RegExp, min: number, max: number): string | null {
  const match = pattern.exec(text);
  if (!match?.[1]) return null;
  const digits = match[1].replace(/\D/g, '');
  if (digits.length < min || digits.length > max) return null;
  return digits;
}

function relationshipOf(text: string): { value: string; confidence: number } | null {
  const labeled = text.match(
    /\b(?:relationship|relation)\s*(?:is|to the account holder is|:)?\s*(wife|husband|son|daughter|father|mother|brother|sister|spouse|other)\b/i,
  );
  if (labeled) {
    const word = labeled[1].toLowerCase();
    return { value: word === 'spouse' ? 'other' : word, confidence: 0.9 };
  }
  const mine = text.match(/\bmy\s+(wife|husband|son|daughter|father|mother|brother|sister)\b/i);
  if (mine) return { value: mine[1].toLowerCase(), confidence: 0.88 };
  for (const [pattern, value] of RELATIONSHIPS) {
    if (pattern.test(text)) return { value, confidence: value === 'other' ? 0.62 : 0.84 };
  }
  if (/\brिश्ता\s+अन्य\b|\bother relation/.test(text)) return { value: 'other', confidence: 0.62 };
  return null;
}

function speechMinor(text: string): boolean | null {
  if (
    /\bnot a minor\b|\bisn'?t a minor\b|\bis not a minor\b|\badult\b|\bmajor\b|नाबालिग नहीं|बालिग/.test(
      text,
    )
  ) {
    return false;
  }
  if (/\bminor\b|\bunder\s*18\b|नाबालिग|अवयस्क/.test(text)) return true;
  return null;
}

export function nomineeIsMinor(iso: string, today = new Date()): boolean | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const dob = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(dob.getTime())) return null;
  let age = today.getFullYear() - dob.getFullYear();
  const month = today.getMonth() - dob.getMonth();
  if (month < 0 || (month === 0 && today.getDate() < dob.getDate())) age -= 1;
  if (age < 0 || age > 120) return null;
  return age < 18;
}

function wantsLiveSubmit(text: string): boolean {
  const lower = text.toLowerCase();
  if (
    /\b(?:no|not|never|don'?t|do not)\b[\s\S]{0,24}\b(?:submit|live)\b/.test(lower) ||
    /लाइव जमा नहीं|बैंक में नहीं/.test(text)
  ) {
    return false;
  }
  return (
    /\b(?:submit|send|post|file)(?:\s+\w+){0,4}\s+to\s+(?:the\s+)?bank\b/.test(lower) ||
    /\blive\s+submit\b/.test(lower) ||
    /\bfile\s+with\s+(?:the\s+)?bank\b/.test(lower) ||
    /बैंक में जमा कर|लाइव जमा कर/.test(text)
  );
}

function confirmUpdates(text: string): { updates: FormValues; confidence: Record<string, number> } {
  const updates: FormValues = {};
  const confidence: Record<string, number> = {};
  const lower = text.toLowerCase();
  if (/\b(confirm|confirmed|correct|looks good|yes.? that.?s right|read.?back is correct)\b|सही है|ठीक है|पुष्टि/.test(lower) || /सही है|ठीक है|पुष्टि/.test(text)) {
    updates.readback_confirmed = true;
    confidence.readback_confirmed = 0.9;
  }
  if (/\bdraft only\b|\bonly a draft\b|\bnot submitted\b|\bdraft.?only\b|केवल ड्राफ्ट|ड्राफ्ट है/.test(lower) || /केवल ड्राफ्ट|ड्राफ्ट/.test(text)) {
    updates.draft_only_ack = true;
    confidence.draft_only_ack = 0.9;
  }
  if (/\bno live\b|\bdon'?t submit\b|\bdo not submit\b|\bdraft only\b|लाइव जमा नहीं|बैंक में नहीं/.test(lower) || /लाइव जमा नहीं/.test(text)) {
    updates.no_live_submit_ack = true;
    confidence.no_live_submit_ack = 0.9;
  }
  return { updates, confidence };
}

function meta(
  confidence: Record<string, number>,
): Record<string, { confidence: number; reason?: string }> {
  const out: Record<string, { confidence: number; reason?: string }> = {};
  for (const [id, score] of Object.entries(confidence)) {
    out[id] = score < CONFIDENCE_CHECK ? { confidence: score, reason: 'Check this value' } : { confidence: score };
  }
  return out;
}

function put(
  updates: FormValues,
  confidence: Record<string, number>,
  id: string,
  value: string | boolean,
  score: number,
): void {
  updates[id] = value;
  confidence[id] = score;
}

function buildGates(
  values: FormValues,
  missing: string[],
  refuseLive: boolean,
): Record<string, GateAnswer> {
  const level = nominationCompleteness(values, missing);
  const levelIdx = ['empty', 'partial_core', 'demo_ready', 'full_bank_packet'].indexOf(level);
  return {
    journey_type: {
      type: 'choice',
      choice: 'nomination',
      confidence: 0.9,
      probabilities: { nomination: 0.9, other: 0.1 },
    },
    score_completeness: {
      type: 'score',
      score: levelIdx + 1,
      levels: ['empty', 'partial_core', 'demo_ready', 'full_bank_packet'],
      confidence: 0.8,
    },
    noul_ready_for_readback: {
      type: 'noul',
      noul: missing.length === 0 ? 0.93 : Math.max(0.1, 0.9 - missing.length * 0.08),
    },
    score_confirmation_clarity: {
      type: 'score',
      score: values.readback_confirmed === true ? 3 : 1,
      levels: ['unclear', 'hedged', 'clear_yes'],
      confidence: values.readback_confirmed === true ? 0.9 : 0.3,
    },
    noul_requests_live_bank_submit: {
      type: 'noul',
      noul: refuseLive ? 0.97 : 0.04,
    },
  };
}

export function extractNomination(utterance: string, current: FormValues): ExtractResponse {
  const raw = utterance.trim();
  const lang = detectUtteranceLang(raw);
  const text = foldDevanagariDigits(raw);
  const updates: FormValues = {};
  const confidence: Record<string, number> = {};

  const base = { ...emptyNominationValues(), ...current };
  const missingNow = () => nominationMissing({ ...base, ...updates });

  if (wantsLiveSubmit(text)) {
    const missing = nominationMissing(base);
    return {
      field_updates: {},
      field_confidence: meta({}),
      missing_required: missing,
      next_ask: liveNext(lang),
      gates: { answers: buildGates(base, missing, true) },
      completeness: nominationCompleteness(base, missing),
      refuse_live_submit: true,
      refuse_message: liveRefuse(lang),
      source: 'heuristic',
      assistant_message: liveRefuse(lang),
      reply_lang: lang,
    };
  }

  const holder =
    nameAfter(text, /\baccount holder(?:'s)?(?:\s+name)?\s*(?:is\s+)?/i) ||
    nameAfter(text, /खाताधारक(?:\s*का\s*नाम)?\s+/) ||
    nameAfter(text, /\b(?:my name is|i am|i'm)\s+/i);
  if (holder) put(updates, confidence, 'account_holder_name', holder.value, holder.confidence);

  const account = labeledDigits(
    text,
    /\b(?:savings\s+)?(?:account|a\/c|ac)\s*(?:number|no\.?|num(?:ber)?)?\s*[:#-]?\s*((?:\d[\s-]?){9,22})/i,
    9,
    18,
  ) || labeledDigits(text, /खाता\s*(?:संख्या|नंबर|नम्बर)\s*[:#-]?\s*(\d{9,18})/, 9, 18);
  if (account) {
    const score = account.length === 10 ? 0.72 : 0.91;
    put(updates, confidence, 'account_number', account, score);
  }

  const customer =
    text.match(/\b(?:customer|cust\.?)\s*(?:id|number|no\.?)?\s*[:#-]?\s*([A-Za-z][A-Za-z0-9]{3,19}|\d{4,16})\b/i) ||
    text.match(/\bcif\s*[:#-]?\s*([A-Za-z0-9]{4,20})\b/i) ||
    text.match(/ग्राहक\s*(?:आईडी|आई ?डी|id)\s*[:#-]?\s*([A-Za-z0-9]{4,20})/i);
  if (customer?.[1]) {
    const id = customer[1].toUpperCase();
    const score = /^\d{10}$/.test(id) ? 0.7 : /[A-Z]/.test(id) ? 0.9 : 0.84;
    put(updates, confidence, 'customer_id', id, score);
  }

  const nominee =
    nameAfter(text, /\bnominee(?:'s)?\s+name\s*(?:is\s+)?/i) ||
    nameAfter(text, /\bnominee\s+is\s+/i) ||
    nameAfter(text, /(?:नॉमिनी|नामिनी|नॉमिनी)\s*(?:का\s*)?नाम\s+/);
  if (nominee) put(updates, confidence, 'nominee_name', nominee.value, nominee.confidence);

  const relation = relationshipOf(text);
  if (relation) put(updates, confidence, 'nominee_relationship', relation.value, relation.confidence);

  const dob = parseFlexibleDob(text);
  if (dob) put(updates, confidence, 'nominee_dob', dob, 0.9);

  const nomineeAddress =
    addressAfter(
      text,
      /\b(?:nominee(?:'s)?\s+)?(?<!same\s)(?:address|lives at|residing at|stays at)\s*(?:is\s+)?/i,
    ) || addressAfter(text, /(?<!का\s)पता\s*(?:है\s+)?/);
  if (nomineeAddress && !/\bguardian\b|अभिभावक/.test(nomineeAddress)) {
    const score = nomineeAddress.length >= 8 ? 0.86 : 0.7;
    put(updates, confidence, 'nominee_address', nomineeAddress, score);
  }

  const spokenMinor = speechMinor(text.toLowerCase()) ?? speechMinor(text);
  const fromDob = typeof updates.nominee_dob === 'string'
    ? nomineeIsMinor(updates.nominee_dob)
    : typeof base.nominee_dob === 'string' && isNominationFilled(base.nominee_dob)
      ? nomineeIsMinor(base.nominee_dob)
      : null;
  if (fromDob !== null && spokenMinor !== null && fromDob !== spokenMinor) {
    put(updates, confidence, 'nominee_is_minor', fromDob, 0.62);
  } else if (fromDob !== null && (updates.nominee_dob || spokenMinor !== null)) {
    put(updates, confidence, 'nominee_is_minor', fromDob, spokenMinor === null ? 0.92 : 0.94);
  } else if (spokenMinor !== null) {
    put(updates, confidence, 'nominee_is_minor', spokenMinor, 0.8);
  }

  const guardian =
    nameAfter(text, /\bguardian(?:'s)?\s+name\s*(?:is\s+)?/i) ||
    nameAfter(text, /\bguardian\s+is\s+/i) ||
    nameAfter(text, /अभिभावक(?:\s*का\s*नाम)?\s+/);
  if (guardian) put(updates, confidence, 'guardian_name', guardian.value, guardian.confidence);

  const sameAddress = /\bsame address\b|वही पता|पता वही/.test(text);
  const guardianAddress = addressAfter(text, /\bguardian(?:'s)?\s+address\s*(?:is\s+)?/i);
  if (guardianAddress) {
    put(updates, confidence, 'guardian_address', guardianAddress, 0.86);
  } else if (sameAddress) {
    const copied =
      (typeof updates.nominee_address === 'string' && updates.nominee_address) ||
      (typeof base.nominee_address === 'string' && base.nominee_address) ||
      '';
    if (copied) put(updates, confidence, 'guardian_address', copied, 0.84);
  }

  const mobile = text.match(
    /\b(?:mobile|phone|contact)\s*(?:number|no\.?)?\s*[:#-]?\s*(?:\+?91[\s-]?)?([6-9]\d{9})\b/i,
  ) || text.match(/(?:मोबाइल|फोन)\s*(?:नंबर|संख्या)?\s*[:#-]?\s*(?:\+?91[\s-]?)?([6-9]\d{9})/);
  if (mobile?.[1] && mobile[1] !== updates.account_number) {
    put(updates, confidence, 'mobile', mobile[1], 0.9);
  }

  const gates = confirmUpdates(text);
  Object.assign(updates, gates.updates);
  Object.assign(confidence, gates.confidence);

  const merged: FormValues = { ...base, ...updates };
  const missing = missingNow();
  const completeness = nominationCompleteness(merged, missing);
  const next_ask = nominationNextAsk(missing, lang);
  const low = Object.entries(confidence).filter(([, score]) => score < CONFIDENCE_CHECK).map(([id]) => id);
  const lead =
    lang === 'hi'
      ? `अपडेट ${Object.keys(updates).length} फ़ील्ड।`
      : `Updated ${Object.keys(updates).length} fields.`;
  const check =
    low.length > 0
      ? lang === 'hi'
        ? ' कुछ फ़ील्ड पर कम भरोसा — जाँच लें।'
        : ' Low confidence on a field — please check.'
      : '';
  return {
    field_updates: updates,
    field_confidence: meta(confidence),
    missing_required: missing,
    next_ask,
    gates: { answers: buildGates(merged, missing, false) },
    completeness,
    refuse_live_submit: false,
    source: 'heuristic',
    assistant_message: `${lead}${check} Fields vary by bank.`.replace(/\s+/g, ' ').trim(),
    reply_lang: lang,
  };
}
