import type { ExtractResponse, FormValues, GateAnswer } from './types';
import {
  extractHindiSlots,
  foldDevanagariDigits,
  hindiExcluded,
  hindiWantsLiveSubmit,
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

const PAN_RE = /\b([A-Z]{5}[0-9]{4}[A-Z])\b/i;
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
  if (yesWords.some((w) => t.includes(w))) return true;
  if (noWords.some((w) => t.includes(w))) return false;
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

/** Extract a spoken full name after common cues */
function extractName(text: string): string | null {
  const patterns = [
    /(?:my name is|i am|i'm|name is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/i,
    /(?:full name[:\s]+)([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m[1].trim();
  }
  return null;
}

function extractFatherSpouse(text: string): string | null {
  const m = text.match(
    /(?:father'?s?\s+name(?:\s+is)?|spouse'?s?\s+name(?:\s+is)?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/i,
  );
  return m ? m[1].trim() : null;
}

function extractAddressLine(text: string): Partial<FormValues> {
  const out: FormValues = {};
  const t = text;
  // "I live at ..." or "address is ..."
  const addr = t.match(
    /(?:live at|address is|address:|stay at|residing at)\s+(.+?)(?:\.|$)/i,
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

  const name = extractName(text);
  if (name) updates.applicant_full_name = name;

  const father = extractFatherSpouse(text);
  if (father) updates.father_or_spouse_name = father;

  const dob = parseDob(text);
  if (dob) updates.dob = dob;

  const gender = detectGender(text);
  if (gender) updates.gender = gender;

  if (/\bindian\b/i.test(text)) updates.nationality = 'Indian';
  if (/\bresident\b/i.test(text)) updates.residential_status = 'resident_individual';

  const panM = text.match(PAN_RE);
  if (panM) {
    updates.pan_number = panM[1].toUpperCase();
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

  const ovdNum = text.match(
    /(?:licence|license|passport|voter|document)\s*(?:number|no\.?|#)?\s*[:=]?\s*([A-Z0-9][A-Z0-9\s-]{4,20})/i,
  );
  if (ovdNum) updates.ovd_poi_number = ovdNum[1].trim();
  // DL pattern KA01...
  const dl = text.match(/\b([A-Z]{2}\d{2}\s?\d{4,}\d*)\b/i);
  if (dl && !updates.ovd_poi_number) updates.ovd_poi_number = dl[1].toUpperCase();

  const samePoa = yesNo(
    text,
    ['same ovd for address', 'same document for address', 'poi for poa', 'same for address proof'],
    ['different address proof', 'separate poa'],
  );
  if (samePoa !== null) updates.ovd_poa_same_as_poi = samePoa;

  const photo = yesNo(text, ['photo consent', 'photograph consent', 'agree to photo'], []);
  if (photo === true) updates.photo_consent = true;
  if (/\boriginals?\b.*\b(ack|agree|will produce|produce)\b|\bi will produce original/i.test(text))
    updates.ovd_originals_ack = true;

  const existing = yesNo(
    text,
    ['existing customer', 'already a customer', 'i have an account with'],
    ['new to bank', 'new customer', 'not a customer', 'first time'],
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
    ['tax resident of india only', 'only india', 'india only for tax'],
    ['tax resident elsewhere', 'other country tax'],
  );
  if (tax !== null) updates.tax_resident_india_only = tax;

  if (/\bhdfc\b/i.test(text)) updates.bank_hint = 'HDFC';
  if (/\bsbi\b/i.test(text)) updates.bank_hint = 'SBI';
  if (/\bicici\b/i.test(text)) updates.bank_hint = 'ICICI';

  Object.assign(updates, detectConfirm(text));

  fillGaps(updates, extractHindiSlots(text));
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
