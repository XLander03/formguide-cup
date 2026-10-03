/**
 * Shared heuristic extractor (mirrors web client) for Functions fallback
 * when GEMINI_API_KEY is absent or Gemini call fails.
 * Hindi + English cues; regional languages are out of this slice.
 */

import {
  extractHindiSlots,
  foldDevanagariDigits,
  hindiExcluded,
  hindiWantsLiveSubmit,
  parseFlexibleDob,
} from './hiSlots';
import {
  detectUtteranceLang,
  excludedMessage,
  excludedNext,
  liveNext,
  liveRefuse,
  localizeAsk,
  preferredLanguageLabel,
} from './utteranceLang';

export type FormValues = Record<string, string | boolean | null | undefined>;

export interface ExtractResponse {
  field_updates: FormValues;
  missing_required: string[];
  next_ask: string | null;
  gates: { answers: Record<string, unknown> };
  completeness: string;
  refuse_live_submit: boolean;
  refuse_message?: string;
  source: 'gemini' | 'heuristic' | 'priya_demo';
  assistant_message?: string;
  reply_lang?: 'en' | 'hi' | 'mixed';
}

const ALWAYS_REQUIRED = [
  'journey_mode',
  'applicant_full_name',
  'dob',
  'residential_status',
  'pan_available',
  'mobile_registered',
  'addr_current_line1',
  'addr_current_city',
  'addr_current_state',
  'addr_current_pin',
  'addr_permanent_same_as_current',
  'ovd_poi_type',
  'ovd_poi_number',
  'ovd_poa_same_as_poi',
  'photo_consent',
  'ovd_originals_ack',
  'existing_bank_customer',
  'pep_declaration',
  'tax_resident_india_only',
];

const CONDITIONAL: Array<{ id: string; when: Record<string, unknown> }> = [
  { id: 'pan_number', when: { pan_available: true } },
  { id: 'form60_declared', when: { pan_available: false } },
  { id: 'addr_permanent_line1', when: { addr_permanent_same_as_current: false } },
  { id: 'addr_permanent_city', when: { addr_permanent_same_as_current: false } },
  { id: 'addr_permanent_state', when: { addr_permanent_same_as_current: false } },
  { id: 'addr_permanent_pin', when: { addr_permanent_same_as_current: false } },
  { id: 'ovd_poa_type', when: { ovd_poa_same_as_poi: false } },
  { id: 'ovd_poa_number', when: { ovd_poa_same_as_poi: false } },
  {
    id: 'aadhaar_voluntary_consent',
    when: { ovd_poi_type: 'proof_of_possession_of_aadhaar' },
  },
  { id: 'customer_id_cif', when: { existing_bank_customer: true } },
  { id: 'account_product_intent', when: { journey_mode: 'account_opening' } },
];

const PRIORITY = [
  'journey_mode',
  'applicant_full_name',
  'dob',
  'mobile_registered',
  'pan_available',
  'pan_number',
  'form60_declared',
  'addr_current_line1',
  'addr_current_city',
  'addr_current_state',
  'addr_current_pin',
  'addr_permanent_same_as_current',
  'ovd_poi_type',
  'ovd_poi_number',
  'ovd_poa_same_as_poi',
  'photo_consent',
  'ovd_originals_ack',
  'existing_bank_customer',
  'customer_id_cif',
  'account_product_intent',
  'pep_declaration',
  'tax_resident_india_only',
  'residential_status',
];

function isFilled(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'boolean') return true;
  if (typeof v === 'string') return v.trim().length > 0;
  return false;
}

function matchesWhen(values: FormValues, when: Record<string, unknown>): boolean {
  return Object.entries(when).every(([k, expect]) => values[k] === expect);
}

export function getMissingRequired(values: FormValues): string[] {
  const missing: string[] = [];
  for (const id of ALWAYS_REQUIRED) {
    if (!isFilled(values[id])) missing.push(id);
  }
  for (const c of CONDITIONAL) {
    if (matchesWhen(values, c.when) && !isFilled(values[c.id])) missing.push(c.id);
  }
  missing.sort((a, b) => {
    const ia = PRIORITY.indexOf(a);
    const ib = PRIORITY.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
  return missing;
}

export function completenessLevel(values: FormValues, missing: string[]): string {
  const any = Object.values(values).some(isFilled);
  if (!any) return 'empty';
  if (missing.length === 0) return 'demo_ready';
  const core = ['journey_mode', 'applicant_full_name', 'dob', 'mobile_registered', 'pan_available'];
  return core.every((id) => isFilled(values[id])) ? 'partial_core' : 'empty';
}

const NAME_NOT_PERSON =
  /\b(?:tax|residents?|india|indian|national|customers?|existing|accounts?|savings|salary|kyc|rekyc|politically|exposed|person|pep|salaried|opening|bank|individual|female|male|wom[ae]n|man|nominee|nomination|status|journey|only|not|already|new|here|draft|confirm(?:ed)?)\b/i;

function tidyPersonName(raw: string): string | null {
  let name = raw.replace(/\s+/g, ' ').trim();
  name = (name.split(/[.,;।!?]/)[0] ?? '').trim();
  name = (
    name.split(/\b(?:and\s+i|i\s+am|i'm|born|dob\b|date of birth|who is|pan\b|mobile|my father|father's name)\b/i)[0] ??
    ''
  ).trim();
  name = name.replace(/^(?:a|an|the)\s+/i, '').replace(/^(?:a|an|the)\s+/i, '').trim();
  if (!name || NAME_NOT_PERSON.test(name)) return null;
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length < 1 || words.length > 4) return null;
  if (!words.every((word) => /^[\p{L}][\p{L}'.-]{0,40}$/u.test(word))) return null;
  if (!words.some((word) => word.length >= 2)) return null;
  return words.join(' ');
}

function extractPersonName(text: string): string | null {
  const re = /\b(?:my full name is|my name is|full name is|full name:|i am|i'm)\s+/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const before = text.slice(Math.max(0, match.index - 18), match.index).toLowerCase();
    if (/father|spouse|husband|wife|mother/.test(before)) continue;
    const found = tidyPersonName(text.slice(match.index + match[0].length));
    if (found) return found;
  }
  return null;
}

const SPOKEN_EN_DIGIT: Record<string, string> = {
  zero: '0',
  oh: '0',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
};

function panFromTokens(tail: string): string | null {
  const tokens = tail.split(/[^A-Za-z0-9]+/).filter(Boolean).slice(0, 16);
  let letters = '';
  let digits = '';
  let phase: 'L' | 'D' | 'T' = 'L';
  for (const token of tokens) {
    const spoken = SPOKEN_EN_DIGIT[token.toLowerCase()];
    if (phase === 'L') {
      if (/^[A-Za-z]{5}$/.test(token)) {
        letters = token.toUpperCase();
        phase = 'D';
        continue;
      }
      if (/^[A-Za-z]$/.test(token)) {
        letters += token.toUpperCase();
        if (letters.length === 5) phase = 'D';
        continue;
      }
      return null;
    }
    if (phase === 'D') {
      if (spoken) digits += spoken;
      else if (/^\d$/.test(token)) digits += token;
      else if (/^\d{4}$/.test(token)) digits += token;
      else return null;
      if (digits.length === 4) phase = 'T';
      else if (digits.length > 4) return null;
      continue;
    }
    if (/^[A-Za-z]$/.test(token)) return `${letters}${digits}${token.toUpperCase()}`;
    return null;
  }
  return null;
}

function extractPan(text: string): string | null {
  const tight = text.toUpperCase().match(/\b([A-Z]{5})\s*([0-9]{4})\s*([A-Z])\b/);
  if (tight) return `${tight[1]}${tight[2]}${tight[3]}`;
  const cue =
    /(?:\bpan\b|permanent account number)(?:\s+(?:number|no\.?|code|is|it's|its))*\s*[:,]?\s*/gi;
  let at: RegExpExecArray | null;
  while ((at = cue.exec(text))) {
    const pan = panFromTokens(text.slice(at.index + at[0].length));
    if (pan) return pan;
    if (at.index === cue.lastIndex) cue.lastIndex += 1;
  }
  return null;
}

function extractOvdNumber(text: string): string | null {
  const dl = text.match(/\b([A-Z]{2}\d{2}\s?\d{6,})\b/i);
  if (dl) return dl[1].toUpperCase();
  const labelled = text.match(
    /(?:\b(?:licence|license|passport|voter|document)\s+)?(?:number|no\.?)\s*(?:is\s*)?[:=]?\s*([A-Z0-9][A-Z0-9\s-]{3,24})/i,
  );
  if (!labelled) return null;
  const token = labelled[1].trim().replace(/[.,।]+$/g, '');
  if (!/\d/.test(token)) return null;
  return token.toUpperCase();
}

function negatedPhrase(text: string, phrase: string): boolean {
  const body = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:\\bnot\\b|\\bno\\b|\\bnever\\b|n't)(?:\\s+\\w+){0,4}\\s+${body}`, 'i').test(
    text,
  );
}

export function heuristicExtract(utterance: string, current: FormValues): ExtractResponse {
  const raw = utterance.trim();
  const text = foldDevanagariDigits(raw);
  const updates: FormValues = {};

  const lang = detectUtteranceLang(raw);
  const excluded =
    /\bneft\b|\brtgs\b|\bimps\b|\bloan\b|\bscss\b|\b15g\b|\b15h\b|\bnomination\b|\bnominee\b/i.test(
      text,
    ) || hindiExcluded(text);
  const refuseLive =
    /\bsubmit\s+to\s+(?:the\s+)?bank\b|\bsend\s+to\s+(?:the\s+)?bank\b|\blive\s+submit\b/i.test(
      text,
    ) || hindiWantsLiveSubmit(text);

  if (excluded) {
    const missing = getMissingRequired(current);
    return {
      field_updates: {},
      missing_required: missing,
      next_ask: excludedNext(lang),
      gates: { answers: buildGates(current, missing, true, false) },
      completeness: completenessLevel(current, missing),
      refuse_live_submit: false,
      source: 'heuristic',
      assistant_message: excludedMessage(lang),
      reply_lang: lang,
    };
  }

  if (/\bre-?kyc\b/i.test(text)) updates.journey_mode = 'rekyc';
  else if (/\bkyc\b|\bupdate\s+kyc\b/i.test(text)) updates.journey_mode = 'kyc_update';
  else if (/\bopen\b.*\baccount\b|\bsavings\b|\baccount\s+opening\b/i.test(text))
    updates.journey_mode = 'account_opening';

  const name = extractPersonName(text);
  if (name) updates.applicant_full_name = name;

  const dob = parseFlexibleDob(text);
  if (dob) updates.dob = dob;

  const pan = extractPan(text);
  if (pan) {
    updates.pan_number = pan;
    updates.pan_available = true;
    updates.form60_declared = false;
  }

  const mob = text.match(/\b(?:\+?91[\s-]?)?([6-9]\d{9})\b/);
  if (mob) updates.mobile_registered = mob[1];

  const email = text.match(/\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/);
  if (email) updates.email = email[1];

  const pin = text.match(/\b(?:pin|pincode|pin code)?\s*(?:is\s+)?(\d{6})\b/i);
  if (pin) updates.addr_current_pin = pin[1];

  if (/\bbengaluru\b|\bbangalore\b/i.test(text)) updates.addr_current_city = 'Bengaluru';
  if (/\bkarnataka\b/i.test(text)) updates.addr_current_state = 'Karnataka';
  if (/\bmumbai\b/i.test(text)) updates.addr_current_city = 'Mumbai';
  if (/\bmaharashtra\b/i.test(text)) updates.addr_current_state = 'Maharashtra';

  const addr = text.match(
    /(?:\bi live at\b|\bi live in\b|\bcurrent address(?:\s+is)?\s*:?|(?<!e-?mail\s)\baddress is\b|(?<!e-?mail\s)\baddress:\s*|\baddress line\s*1(?:\s+is)?\b)\s+(.+?)(?:\.|$)/i,
  );
  if (addr?.[1]) {
    let line = addr[1];
    if (updates.addr_current_pin) line = line.replace(String(updates.addr_current_pin), '');
    line = line.replace(/Bengaluru|Bangalore|Karnataka|Mumbai|Maharashtra|Indiranagar|\bpin(?:\s*code)?\b/gi, '');
    line = line.replace(/,\s*,/g, ',').replace(/^[\s,]+|[\s,]+$/g, '');
    if (line.length >= 3) updates.addr_current_line1 = line;
  }

  if (/\bpassport\b/i.test(text)) updates.ovd_poi_type = 'passport';
  else if (/\bdriving\s*licen/i.test(text) || /\b\bdl\b/i.test(text))
    updates.ovd_poi_type = 'driving_licence';
  else if (/\baadhaar\b|\badhar\b/i.test(text))
    updates.ovd_poi_type = 'proof_of_possession_of_aadhaar';
  else if (/\bvoter\b/i.test(text)) updates.ovd_poi_type = 'voter_id';

  const ovdNum = extractOvdNumber(text);
  if (ovdNum) updates.ovd_poi_number = ovdNum;

  if (/\bresident\b/i.test(text)) updates.residential_status = 'resident_individual';
  if (/\bindian\b/i.test(text)) updates.nationality = 'Indian';

  if (/\bsame as current\b|\bpermanent same\b/i.test(text))
    updates.addr_permanent_same_as_current = true;
  if (/\bsame (ovd|document) for address\b/i.test(text)) updates.ovd_poa_same_as_poi = true;
  if (
    negatedPhrase(text, 'existing customer') ||
    negatedPhrase(text, 'already a customer') ||
    /\bnew to (?:the )?bank\b|\bnew customer\b|\bnot a customer\b/i.test(text)
  ) {
    updates.existing_bank_customer = false;
  } else if (/\bexisting customer\b|\balready a customer\b/i.test(text)) {
    updates.existing_bank_customer = true;
  }
  if (
    negatedPhrase(text, 'politically exposed') ||
    /\bnot a pep\b|\bno pep\b|\bnot politically exposed\b/i.test(text)
  ) {
    updates.pep_declaration = false;
  } else if (/\bi am a pep\b|\bpolitically exposed\b|\byes pep\b/i.test(text)) {
    updates.pep_declaration = true;
  }
  if (/\btax resident of india\b|\bindia only\b|\bonly pay tax in india\b|\bpay tax in india\b/i.test(text)) {
    updates.tax_resident_india_only = true;
  }
  if (
    /\bphoto(?:graph)?\s+consent\b|\bagree to (?:the |a )?photo\b|\bagree to provide (?:a |my )?photograph\b|\bprovide (?:a |my )?photograph\b/i.test(
      text,
    )
  ) {
    updates.photo_consent = true;
  }
  if (
    /\bi (?:will |can |shall )?produce (?:the )?original|\bi have (?:the |my )?original|\boriginals for verification|\boriginals?\b.*\b(?:verification|documents?)\b/i.test(
      text,
    )
  ) {
    updates.ovd_originals_ack = true;
  }
  if (/\bregular savings\b|\bsavings account\b/i.test(text))
    updates.account_product_intent = 'regular_savings';

  if (/\bconfirm(ed)?\b|\bcorrect\b|\blooks good\b/i.test(text))
    updates.readback_confirmed = true;
  if (/\bdraft only\b|\bonly a draft\b/i.test(text)) updates.draft_only_ack = true;
  if (/\bno live\b|\bdon'?t submit\b|\bdo not submit\b/i.test(text))
    updates.no_live_submit_ack = true;

  const hindi = extractHindiSlots(text);
  for (const [k, v] of Object.entries(hindi)) {
    if (updates[k] === undefined) updates[k] = v;
  }
  if (lang !== 'en') {
    const pref = preferredLanguageLabel(lang);
    if (current.preferred_language !== pref && updates.preferred_language === undefined) {
      updates.preferred_language = pref;
    }
  }

  const merged = { ...current, ...updates };
  const missing = getMissingRequired(merged);
  const completeness = completenessLevel(merged, missing);
  const enNext = missing.length ? `Please provide: ${missing[0]}` : null;
  const next_ask = refuseLive
    ? lang === 'en'
      ? 'This demo never submits to a bank. Draft only after confirm gates.'
      : liveNext(lang)
    : localizeAsk(lang, enNext, missing[0] ?? null);

  const count = Object.keys(updates).length;
  const enTail = `${count ? `Updated ${count} field(s).` : 'No new fields mapped.'} ${
    next_ask || 'Ready for read-back.'
  } Fields vary by bank.`;
  const hiTail = `${count ? `आपकी बात से ${count} फ़ील्ड अपडेट हुए।` : 'इससे नया फ़ील्ड नहीं मिला।'} ${
    next_ask || 'रीड-बैक के लिए तैयार।'
  } Fields vary by bank.`;
  const assistant_message =
    lang === 'en'
      ? enTail
      : lang === 'hi'
        ? hiTail
        : `${count ? `आपकी बात से ${count} फ़ील्ड अपडेट हुए।` : 'इससे नया फ़ील्ड नहीं मिला।'} ${
            next_ask || 'रीड-बैक के लिए तैयार।'
          } Fields vary by bank. ${count ? `Updated ${count} field(s).` : 'No new fields mapped.'}`;

  return {
    field_updates: updates,
    missing_required: missing,
    next_ask,
    gates: { answers: buildGates(merged, missing, false, refuseLive) },
    completeness,
    refuse_live_submit: refuseLive,
    refuse_message: refuseLive
      ? lang === 'en'
        ? 'Refusing live bank submit. Draft only — confirm gates required.'
        : liveRefuse(lang)
      : undefined,
    source: 'heuristic',
    assistant_message,
    reply_lang: lang,
  };
}

function buildGates(
  values: FormValues,
  missing: string[],
  excluded: boolean,
  refuseLive: boolean,
): Record<string, unknown> {
  const level = completenessLevel(values, missing);
  const levelIdx = ['empty', 'partial_core', 'demo_ready', 'full_bank_packet'].indexOf(level);
  return {
    journey_type: {
      type: 'choice',
      choice: values.journey_mode || null,
      confidence: values.journey_mode ? 0.8 : 0.2,
    },
    score_completeness: {
      type: 'score',
      score: Math.max(1, levelIdx + 1),
      levels: ['empty', 'partial_core', 'demo_ready', 'full_bank_packet'],
      confidence: 0.75,
    },
    noul_ready_for_readback: {
      type: 'noul',
      noul: missing.length === 0 ? 0.92 : Math.max(0.1, 0.9 - missing.length * 0.05),
    },
    noul_requests_live_bank_submit: { type: 'noul', noul: refuseLive ? 0.95 : 0.05 },
    noul_out_of_scope_excluded_product: { type: 'noul', noul: excluded ? 0.9 : 0.05 },
    noul_user_confirmed_readback: {
      type: 'noul',
      noul: values.readback_confirmed === true ? 0.95 : 0.1,
    },
  };
}
