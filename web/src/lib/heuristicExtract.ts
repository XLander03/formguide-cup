import {
  debitReadback,
  extractDebitSlots,
  isDebitJourney,
  keepDebitUpdates,
  redactFullCardNumbers,
  stripDebitOnly,
} from './debitReissue';
import type { ExtractResponse, FormValues, GateAnswer } from './types';
import {
  extractHindiSlots,
  foldDevanagariDigits,
  hindiExcluded,
  hindiWantsLiveSubmit,
  parseFlexibleDob,
} from './hiSlots';
import {
  completenessLevel,
  getMissingRequired,
  getNextAsk,
  SCHEMA,
} from './schema';
import {
  assistantMessage,
  detectUtteranceLang,
  excludedMessage,
  excludedNext,
  hindiEnumLabel,
  liveNext,
  liveRefuse,
  preferredLanguageLabel,
  type UtteranceLang,
} from './utteranceLang';

const MOBILE_RE = /\b(?:\+?91[\s-]?)?([6-9]\d{9})\b/;
const PIN_RE = /\b(\d{6})\b/;
const DOB_RE =
  /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})\b|\b(\d{4})-(\d{2})-(\d{2})\b/;

const STATE_NAMES = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Delhi',
  'Jammu and Kashmir',
  'Ladakh',
  'Puducherry',
  'Chandigarh',
];

const CITY_HINTS = [
  'Bengaluru',
  'Bangalore',
  'Mumbai',
  'Delhi',
  'New Delhi',
  'Chennai',
  'Hyderabad',
  'Pune',
  'Kolkata',
  'Ahmedabad',
  'Jaipur',
  'Lucknow',
  'Indiranagar',
];

function yesNo(text: string, yesWords: string[], noWords: string[]): boolean | null {
  const t = text.toLowerCase();
  const negated = (phrase: string) => {
    const body = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Only a short same-clause "not / no" counts. A later sentence must not flip the answer.
    return new RegExp(
      `(?:\\bnot\\b|\\bno\\b|\\bnever\\b|n't)(?:\\s+\\w+){0,4}\\s+${body}`,
      'i',
    ).test(t);
  };
  for (const phrase of yesWords) {
    if (t.includes(phrase) && negated(phrase)) return false;
  }
  if (noWords.some((phrase) => t.includes(phrase))) return false;
  if (yesWords.some((phrase) => t.includes(phrase))) return true;
  return null;
}

function parseDob(text: string): string | null {
  const m = text.match(DOB_RE);
  if (!m) return null;
  if (m[4]) return `${m[4]}-${m[5]}-${m[6]}`;
  const d = m[1].padStart(2, '0');
  const mo = m[2].padStart(2, '0');
  const y = m[3];
  return `${y}-${mo}-${d}`;
}

function detectOvd(text: string): string | null {
  const t = text.toLowerCase();
  if (/\bpassport\b/.test(t)) return 'passport';
  if (/\b(driving\s*licen[cs]e|dl)\b/.test(t)) return 'driving_licence';
  if (/\baadhaar\b|\badhar\b/.test(t)) return 'proof_of_possession_of_aadhaar';
  if (/\bvoter\b|\belector\b/.test(t)) return 'voter_id';
  if (/\bnrega\b|\bmgnrega\b/.test(t)) return 'nrega_job_card';
  if (/\bnpr\b/.test(t)) return 'npr_letter';
  return null;
}

function detectJourney(text: string): string | null {
  const t = text.toLowerCase();
  if (
    /\b(?:debit|atm)\s+cards?\b|\bcard\s+re-?issue\b|\bre-?issue\b.{0,24}\bcard\b|\bhot-?list\b.{0,24}\bcard\b|\b(?:lost|stolen|damaged)\b.{0,24}\b(?:debit|atm)\s+card\b/i.test(
      text,
    )
  ) {
    return 'debit_reissue';
  }
  if (/\bre-?kyc\b|\brekyc\b/.test(t)) return 'rekyc';
  if (/\bkyc\b|\bupdate\s+kyc\b|\bcustomer\s+information\b/.test(t)) return 'kyc_update';
  if (
    /\bopen\b.*\baccount\b|\bsavings\b|\baof\b|\baccount\s+opening\b|\bnew\s+account\b/.test(t)
  )
    return 'account_opening';
  return null;
}

function detectProduct(text: string): string | null {
  const t = text.toLowerCase();
  if (/\bsalary\b/.test(t)) return 'salary_savings';
  if (/\bbsbda\b|\bbasic\s+savings\b/.test(t)) return 'bsbda';
  if (/\bcurrent\s+account\b/.test(t)) return 'individual_current';
  if (/\bregular\s+savings\b|\bsavings\s+account\b|\bsavings\b/.test(t)) return 'regular_savings';
  return null;
}

function detectGender(text: string): string | null {
  const t = text.toLowerCase();
  if (/\bfemale\b|\bwoman\b|\bms\.?\b|\bmrs\.?\b/.test(t)) return 'female';
  if (/\bmale\b|\bman\b|\bmr\.?\b/.test(t)) return 'male';
  return null;
}

function detectOccupation(text: string): string | null {
  const t = text.toLowerCase();
  const map: [RegExp, string][] = [
    [/\bsalaried\b|\bemployee\b|\bjob\b/, 'salaried'],
    [/\bself[- ]employed\b|\bbusiness\b/, 'self_employed'],
    [/\bprofessional\b|\bdoctor\b|\blawyer\b|\bca\b/, 'professional'],
    [/\bstudent\b/, 'student'],
    [/\bhomemaker\b|\bhousewife\b/, 'homemaker'],
    [/\bretired\b/, 'retired'],
  ];
  for (const [re, v] of map) if (re.test(t)) return v;
  return null;
}

/** Journey and status words that must not be stored as a person's name. */
const NAME_NOT_PERSON =
  /\b(?:tax|residents?|india|indian|national|customers?|existing|accounts?|savings|salary|kyc|rekyc|politically|exposed|person|pep|salaried|opening|bank|individual|female|male|wom[ae]n|man|nominee|nomination|status|journey|only|not|already|new|here|draft|confirm(?:ed)?)\b/i;

function tidyPersonName(raw: string): string | null {
  let name = raw.replace(/\s+/g, ' ').trim();
  name = (name.split(/[.,;।!?]/)[0] ?? '').trim();
  name = (
    name.split(
      /\b(?:and\s+i|i\s+am|i'm|born|dob\b|date of birth|who is|pan\b|mobile|my father|father's name)\b/i,
    )[0] ?? ''
  ).trim();
  name = name.replace(/^(?:a|an|the)\s+/i, '').replace(/^(?:a|an|the)\s+/i, '').trim();
  if (!name || NAME_NOT_PERSON.test(name)) return null;
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length < 1 || words.length > 4) return null;
  if (!words.every((word) => /^[\p{L}][\p{L}'.-]{0,40}$/u.test(word))) return null;
  if (!words.some((word) => word.length >= 2)) return null;
  return words.join(' ');
}

/**
 * A person's name after a name cue. "Existing customer", "tax resident of India",
 * and other journey/status phrases are not names. The first real name wins.
 */
function extractName(text: string): string | null {
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

/** Compact, spaced, or letter-by-letter PAN. Spoken digit words after a PAN cue count. */
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

/** Document numbers must contain a digit. Prose after "licence" is not a number. */
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

function extractFatherSpouse(text: string): string | null {
  const m = text.match(
    /(?:father'?s?\s+name(?:\s+is)?|spouse'?s?\s+name(?:\s+is)?)\s+([^.,।]+)/i,
  );
  return m ? tidyPersonName(m[1]) : null;
}

function extractAddressLine(text: string): Partial<FormValues> {
  const out: FormValues = {};
  const t = text;
  // "I live at ..." or "address is ..."
  const addr = t.match(
    /(?:\bi live at\b|\bi live in\b|\bi stay at\b|\bstay at\b|\bresiding at\b|\bcommunication address(?:\s+is)?\b|\bcurrent address(?:\s+is)?\s*:?|(?<!e-?mail\s)\baddress is\b|(?<!e-?mail\s)\baddress:\s*|\baddress line\s*1(?:\s+is)?\b)\s+(.+?)(?:\.|$)/i,
  );
  if (addr) {
    const chunk = addr[1].trim();
    // Try pin
    const pin = chunk.match(PIN_RE);
    if (pin) out.addr_current_pin = pin[1];
    for (const st of STATE_NAMES) {
      if (chunk.toLowerCase().includes(st.toLowerCase())) {
        out.addr_current_state = st;
        break;
      }
    }
    for (const c of CITY_HINTS) {
      if (chunk.toLowerCase().includes(c.toLowerCase())) {
        out.addr_current_city = c === 'Bangalore' ? 'Bengaluru' : c;
        break;
      }
    }
    // line1 = chunk without city/state/pin if short enough
    let line = chunk;
    if (out.addr_current_pin) line = line.replace(String(out.addr_current_pin), '');
    if (out.addr_current_state)
      line = line.replace(new RegExp(String(out.addr_current_state), 'i'), '');
    if (out.addr_current_city)
      line = line.replace(new RegExp(String(out.addr_current_city), 'i'), '');
    line = line.replace(/\bpin(?:\s*code)?\b/gi, '');
    line = line.replace(/,\s*,/g, ',').replace(/^[\s,]+|[\s,]+$/g, '');
    if (line.length >= 3) out.addr_current_line1 = line;
  }

  // standalone city / state / pin mentions
  const cityM = t.match(/\bcity\s+(?:is\s+)?([A-Za-z ]{3,30})\b/i);
  if (cityM) out.addr_current_city = cityM[1].trim();
  const stateM = t.match(/\bstate\s+(?:is\s+)?([A-Za-z ]{3,30})\b/i);
  if (stateM) out.addr_current_state = stateM[1].trim();
  const pinM = t.match(/\b(?:pin|pincode|pin code)\s*(?:is\s+)?(\d{6})\b/i);
  if (pinM) out.addr_current_pin = pinM[1];
  else {
    // bare 6-digit if no other context used yet
    const bare = t.match(PIN_RE);
    if (bare && !out.addr_current_pin) out.addr_current_pin = bare[1];
  }

  for (const st of STATE_NAMES) {
    if (new RegExp(`\\b${st}\\b`, 'i').test(t) && !out.addr_current_state) {
      out.addr_current_state = st;
    }
  }
  for (const c of CITY_HINTS) {
    if (new RegExp(`\\b${c}\\b`, 'i').test(t) && !out.addr_current_city) {
      out.addr_current_city = c === 'Bangalore' ? 'Bengaluru' : c;
    }
  }

  return out;
}

function detectExcluded(text: string): boolean {
  const t = text.toLowerCase();
  return (
    /\bneft\b|\brtgs\b|\bimps\b|\bloan\b|\bscss\b|\b15g\b|\b15h\b|\bnomination\b|\bnominee\b/.test(
      t,
    ) || hindiExcluded(text)
  );
}

function detectLiveSubmit(text: string): boolean {
  const t = text.toLowerCase();
  return (
    /\bsubmit\s+to\s+(?:the\s+)?bank\b|\bsend\s+to\s+(?:the\s+)?bank\b|\blive\s+submit\b|\bpost\s+to\s+bank\b|\bfile\s+with\s+bank\b/.test(
      t,
    ) || hindiWantsLiveSubmit(text)
  );
}

function detectConfirm(text: string): Partial<FormValues> {
  const t = text.toLowerCase();
  const out: FormValues = {};
  if (
    /\b(confirm|confirmed|correct|looks good|yes.? that.?s right|read.?back is correct)\b/.test(t)
  ) {
    out.readback_confirmed = true;
  }
  if (/\bdraft only\b|\bonly a draft\b|\bnot submitted\b|\bdraft.?only\b/.test(t)) {
    out.draft_only_ack = true;
  }
  if (
    /\bno live\b|\bdon'?t submit\b|\bdo not submit\b|\bnot asking.*bank\b|\bdraft only\b/.test(t)
  ) {
    out.no_live_submit_ack = true;
  }
  return out;
}

function fillGaps(updates: FormValues, extra: Record<string, string | boolean>): void {
  for (const [k, v] of Object.entries(extra)) {
    if (updates[k] === undefined) updates[k] = v;
  }
}

export function heuristicExtract(utterance: string, current: FormValues): ExtractResponse {
  const raw = utterance.trim();
  const lang = detectUtteranceLang(raw);
  const text = foldDevanagariDigits(raw);
  const updates: FormValues = {};

  if (detectExcluded(text)) {
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

  const refuseLive = detectLiveSubmit(text);

  const journey = detectJourney(text);
  if (journey) updates.journey_mode = journey;

  const hindiPreview = extractHindiSlots(text);
  const detectedJourney =
    journey || (typeof hindiPreview.journey_mode === 'string' ? hindiPreview.journey_mode : null);
  const effectiveJourney = detectedJourney || (typeof current.journey_mode === 'string' ? current.journey_mode : null);
  if (isDebitJourney(effectiveJourney)) {
    updates.journey_mode = 'debit_reissue';
    const debitName = extractName(text);
    if (debitName) updates.applicant_full_name = debitName;
    if (typeof hindiPreview.applicant_full_name === 'string' && !updates.applicant_full_name) {
      updates.applicant_full_name = hindiPreview.applicant_full_name;
    }
    Object.assign(updates, extractDebitSlots(text));
    Object.assign(updates, detectConfirm(text));
    if (lang !== 'en') {
      const pref = preferredLanguageLabel(lang);
      if (current.preferred_language !== pref && updates.preferred_language === undefined) {
        updates.preferred_language = pref;
      }
    }
    const debitUpdates = redactFullCardNumbers(keepDebitUpdates(updates));
    const mergedDebit: FormValues = redactFullCardNumbers({ ...current, ...debitUpdates, journey_mode: 'debit_reissue' });
    const missingDebit = getMissingRequired(mergedDebit);
    const completenessDebit = completenessLevel(mergedDebit, missingDebit);
    const nextDebit = refuseLive ? liveNext(lang) : getNextAsk(missingDebit, mergedDebit, lang);
    return {
      field_updates: debitUpdates,
      missing_required: missingDebit,
      next_ask: nextDebit,
      gates: { answers: buildGates(mergedDebit, missingDebit, false, refuseLive) },
      completeness: completenessDebit,
      refuse_live_submit: refuseLive,
      refuse_message: refuseLive ? liveRefuse(lang) : undefined,
      source: 'heuristic',
      assistant_message: assistantMessage(lang, Object.keys(debitUpdates).length, nextDebit),
      reply_lang: lang,
    };
  }

  const name = extractName(text);
  if (name) updates.applicant_full_name = name;

  const father = extractFatherSpouse(text);
  if (father) updates.father_or_spouse_name = father;

  const dob = parseFlexibleDob(text) ?? parseDob(text);
  if (dob) updates.dob = dob;

  const gender = detectGender(text);
  if (gender) updates.gender = gender;

  if (/\bindian\b/i.test(text)) updates.nationality = 'Indian';
  if (/\bresident\b/i.test(text)) updates.residential_status = 'resident_individual';

  const pan = extractPan(text);
  if (pan) {
    updates.pan_number = pan;
    updates.pan_available = true;
    updates.form60_declared = false;
  } else {
    const panYN = yesNo(
      text,
      ['i have a pan', 'i have pan', 'pan is', 'my pan', 'yes pan', 'pan available'],
      ['no pan', 'form 60', "don't have pan", 'do not have a pan', 'without pan'],
    );
    if (panYN === true) updates.pan_available = true;
    if (panYN === false) {
      updates.pan_available = false;
      updates.form60_declared = true;
    }
  }

  const mob = text.match(MOBILE_RE);
  if (mob) updates.mobile_registered = mob[1];

  const emailM = text.match(/\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/);
  if (emailM) updates.email = emailM[1];

  Object.assign(updates, extractAddressLine(text));

  const sameAddr = yesNo(
    text,
    ['permanent same', 'same as current', 'permanent address is same', 'same address'],
    ['permanent different', 'different permanent', 'permanent address is different'],
  );
  if (sameAddr !== null) updates.addr_permanent_same_as_current = sameAddr;

  const ovd = detectOvd(text);
  if (ovd) {
    updates.ovd_poi_type = ovd;
    if (ovd === 'proof_of_possession_of_aadhaar') updates.aadhaar_voluntary_consent = true;
  }

  const ovdNum = extractOvdNumber(text);
  if (ovdNum) updates.ovd_poi_number = ovdNum;

  const samePoa = yesNo(
    text,
    [
      'same ovd for address',
      'same document for address',
      'poi for poa',
      'same for address proof',
      'proof of address is the same',
      'address proof is the same',
      'same document',
    ],
    ['different address proof', 'separate poa', 'different document for address'],
  );
  if (samePoa !== null) updates.ovd_poa_same_as_poi = samePoa;

  if (
    /\bphoto(?:graph)?\s+consent\b|\bagree to (?:the |a )?photo\b|\bagree to provide (?:a |my )?photograph\b|\bprovide (?:a |my )?photograph\b|\bconsent to (?:a |the |my )?photograph\b/i.test(
      text,
    )
  ) {
    updates.photo_consent = true;
  }
  if (
    /\boriginals?\b.*\b(?:ack|agree|will produce|produce|verification|documents?)\b|\bi (?:will |can |shall )?produce (?:the )?original|\bi have (?:the |my )?original|\boriginals for verification|\bshow(?:ing)? (?:the |my )?original/i.test(
      text,
    )
  ) {
    updates.ovd_originals_ack = true;
  }

  const existing = yesNo(
    text,
    ['existing bank customer', 'existing customer', 'already a customer', 'i have an account with'],
    ['new to bank', 'new customer', 'not a customer', 'not an existing', 'first time'],
  );
  if (existing !== null) updates.existing_bank_customer = existing;

  const cif = text.match(/\b(?:cif|customer\s*id)\s*[:=]?\s*([A-Z0-9]{4,20})\b/i);
  if (cif) {
    updates.customer_id_cif = cif[1];
    updates.existing_bank_customer = true;
  }

  const product = detectProduct(text);
  if (product) updates.account_product_intent = product;

  const occ = detectOccupation(text);
  if (occ) updates.occupation_bucket = occ;

  const pep = yesNo(
    text,
    ['i am a pep', 'politically exposed', 'yes pep'],
    ['not a pep', 'no pep', 'not politically exposed'],
  );
  if (pep !== null) updates.pep_declaration = pep;

  const tax = yesNo(
    text,
    [
      'tax resident of india only',
      'tax resident of india',
      'only india',
      'india only for tax',
      'only pay tax in india',
      'pay tax in india',
    ],
    ['tax resident elsewhere', 'other country tax'],
  );
  if (tax !== null) updates.tax_resident_india_only = tax;

  if (/\bhdfc\b/i.test(text)) updates.bank_hint = 'HDFC';
  if (/\bsbi\b/i.test(text)) updates.bank_hint = 'SBI';
  if (/\bicici\b/i.test(text)) updates.bank_hint = 'ICICI';

  Object.assign(updates, detectConfirm(text));

  fillGaps(updates, extractHindiSlots(text));
  if (!isDebitJourney(updates.journey_mode) && !isDebitJourney(current.journey_mode)) {
    const cleaned = stripDebitOnly(updates);
    for (const key of Object.keys(updates)) {
      if (!(key in cleaned)) delete updates[key];
    }
  }
  if (lang !== 'en') {
    const pref = preferredLanguageLabel(lang);
    if (current.preferred_language !== pref && updates.preferred_language === undefined) {
      updates.preferred_language = pref;
    }
  }

  // Merge for missing calc
  const merged: FormValues = { ...current, ...updates };
  const missing = getMissingRequired(merged);
  const completeness = completenessLevel(merged, missing);
  const next_ask = refuseLive ? liveNext(lang) : getNextAsk(missing, merged, lang);

  return {
    field_updates: updates,
    missing_required: missing,
    next_ask,
    gates: { answers: buildGates(merged, missing, false, refuseLive) },
    completeness,
    refuse_live_submit: refuseLive,
    refuse_message: refuseLive ? liveRefuse(lang) : undefined,
    source: 'heuristic',
    assistant_message: assistantMessage(lang, Object.keys(updates).length, next_ask),
    reply_lang: lang,
  };
}

function buildGates(
  values: FormValues,
  missing: string[],
  excluded: boolean,
  refuseLive: boolean,
): Record<string, GateAnswer> {
  const level = completenessLevel(values, missing);
  const levelIdx = ['empty', 'partial_core', 'demo_ready', 'full_bank_packet'].indexOf(level);
  const journey = (values.journey_mode as string) || null;

  return {
    journey_type: {
      type: 'choice',
      choice: journey,
      confidence: journey ? 0.8 : 0.2,
      probabilities: journey
        ? { [journey]: 0.8, other: 0.2 }
        : { account_opening: 0.25, kyc_update: 0.25, rekyc: 0.25, other: 0.25 },
    },
    score_completeness: {
      type: 'score',
      score: levelIdx + 1,
      levels: ['empty', 'partial_core', 'demo_ready', 'full_bank_packet'],
      confidence: 0.75,
      probabilities: {
        empty: level === 'empty' ? 0.7 : 0.05,
        partial_core: level === 'partial_core' ? 0.7 : 0.1,
        demo_ready: level === 'demo_ready' ? 0.7 : 0.1,
        full_bank_packet: level === 'full_bank_packet' ? 0.7 : 0.05,
      },
    },
    noul_ready_for_readback: {
      type: 'noul',
      noul: missing.length === 0 ? 0.92 : Math.max(0.1, 0.9 - missing.length * 0.05),
    },
    score_confirmation_clarity: {
      type: 'score',
      score: values.readback_confirmed === true ? 3 : 1,
      levels: ['unclear', 'hedged', 'clear_yes'],
      confidence: values.readback_confirmed === true ? 0.9 : 0.3,
    },
    noul_user_confirmed_readback: {
      type: 'noul',
      noul: values.readback_confirmed === true ? 0.95 : 0.1,
    },
    noul_requests_live_bank_submit: {
      type: 'noul',
      noul: refuseLive ? 0.95 : 0.05,
    },
    noul_out_of_scope_excluded_product: {
      type: 'noul',
      noul: excluded ? 0.9 : 0.05,
    },
  };
}

export function buildReadbackScript(values: FormValues, lang: UtteranceLang = 'en'): string {
  if (isDebitJourney(values.journey_mode)) return debitReadback(values, lang);
  const name = values.applicant_full_name || (lang === 'en' ? 'applicant' : 'आवेदक');
  const dob = values.dob || (lang === 'en' ? 'date of birth not set' : 'जन्म तिथि नहीं');
  const mobile = String(values.mobile_registered || '');
  const last4 = mobile.length >= 4 ? mobile.slice(-4) : 'xxxx';
  const ovd = values.ovd_poi_type || (lang === 'en' ? 'document not set' : 'दस्तावेज़ नहीं');
  const product = values.account_product_intent || values.journey_mode || (lang === 'en' ? 'not set' : 'सेट नहीं');
  const en =
    `Please confirm this read-back. Name: ${name}. Date of birth: ${dob}. ` +
    `Mobile ending ${last4}. Proof of identity: ${String(ovd).replace(/_/g, ' ')}. ` +
    `Product or journey: ${String(product).replace(/_/g, ' ')}. ` +
    `This is a draft only. Fields vary by bank. No live bank submit.`;
  if (lang === 'en') return en;
  const hi =
    `कृपया इस रीड-बैक की पुष्टि करें। नाम: ${name}. जन्म तिथि: ${dob}. ` +
    `मोबाइल के आखिरी चार अंक ${last4}. पहचान पत्र: ${hindiEnumLabel(String(ovd))}. ` +
    `उत्पाद या यात्रा: ${hindiEnumLabel(String(product))}. ` +
    `यह केवल ड्राफ्ट है। Fields vary by bank. बैंक में लाइव जमा नहीं होगा।`;
  if (lang === 'mixed') return `${hi} ${en}`;
  return hi;
}

// Keep SCHEMA import referenced for future gate docs
void SCHEMA;
