/**
 * Deterministic clean-up of speak-function field values for Hindi and mixed speech.
 * Runs on the field model's output; never calls Gemini.
 */

import {
  extractSpokenMobile,
  extractSpokenPin,
  foldDevanagariDigits,
  foldHindi,
  hindiNumberWord,
  parseFlexibleDob,
} from './spokenParse';
import { isFilled, type FieldMeta, type FieldMetaMap, type FormValues } from './merge';

const DEVANAGARI = /[\u0900-\u097F]/;

/** Confidence for values read straight from the transcript by these parsers. */
const TRANSCRIPT_CONFIDENCE = 0.8;
/** Below the client's 0.75 flag threshold so the field gets a “Check this” pill. */
const WRONG_COUNT_CONFIDENCE = 0.4;
const TRANSLITERATED_CONFIDENCE = 0.6;

function tokens(text: string): string[] {
  return foldDevanagariDigits(foldHindi(text))
    .replace(/[।॥॰]/g, ' ')
    .split(/[^0-9A-Za-z\u0900-\u097F]+/)
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Spoken digits
// ---------------------------------------------------------------------------

const DIGIT_WORD: Record<string, string> = {
  शून्य: '0',
  सुन्य: '0',
  जीरो: '0',
  एक: '1',
  दो: '2',
  तीन: '3',
  चार: '4',
  पांच: '5',
  पाँच: '5',
  छह: '6',
  छः: '6',
  छे: '6',
  छै: '6',
  सात: '7',
  आठ: '8',
  नौ: '9',
  ओ: '0',
  वन: '1',
  टू: '2',
  थ्री: '3',
  फोर: '4',
  फाइव: '5',
  सिक्स: '6',
  सेवन: '7',
  एट: '8',
  नाइन: '9',
  zero: '0',
  oh: '0',
  o: '0',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  shunya: '0',
  shunye: '0',
  sunya: '0',
  ek: '1',
  do: '2',
  teen: '3',
  tin: '3',
  char: '4',
  chaar: '4',
  paanch: '5',
  panch: '5',
  chhe: '6',
  chhah: '6',
  chah: '6',
  che: '6',
  saat: '7',
  sat: '7',
  aath: '8',
  ath: '8',
  nau: '9',
};

const REPEAT_WORD: Record<string, number> = {
  double: 2,
  triple: 3,
  dabal: 2,
  dubal: 2,
  tripal: 3,
  डबल: 2,
  ट्रिपल: 3,
};

const HUNDRED = new Set(['सौ', 'hundred', 'sau']);

const EN_TEEN: Record<string, number> = {
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};

const EN_TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

function numberAt(list: string[], i: number): { digits: string; used: number } | null {
  const token = list[i];
  if (!token) return null;
  const lower = token.toLowerCase();
  if (/^\d+$/.test(token)) return { digits: token, used: 1 };
  if (DIGIT_WORD[lower] !== undefined) return { digits: DIGIT_WORD[lower], used: 1 };
  if (EN_TEEN[lower] !== undefined) return { digits: String(EN_TEEN[lower]), used: 1 };
  if (EN_TENS[lower] !== undefined) {
    const ones = DIGIT_WORD[list[i + 1]?.toLowerCase() ?? ''];
    if (ones && ones !== '0' && /^[a-z]+$/.test(list[i + 1].toLowerCase())) {
      return { digits: String(EN_TENS[lower] + Number(ones)), used: 2 };
    }
    return { digits: String(EN_TENS[lower]), used: 1 };
  }
  const hi = hindiNumberWord(token);
  if (hi !== null) return { digits: String(hi), used: 1 };
  return null;
}

/**
 * Digits from a field-scoped spoken value: ASCII or Devanagari digits, Hindi /
 * English / Hinglish digit words, “डबल पाँच”, and two-digit words (“अट्ठानवे” → 98).
 * Words that are not numbers are skipped.
 */
export function spokenDigits(raw: string): string {
  const list = tokens(raw);
  let out = '';
  let repeat = 1;
  for (let i = 0; i < list.length; i++) {
    const lower = list[i].toLowerCase();
    if (REPEAT_WORD[lower] !== undefined) {
      repeat = REPEAT_WORD[lower];
      continue;
    }
    if (HUNDRED.has(lower)) {
      // “पाँच सौ साठ” → 560, “पाँच सौ तीन” → 503, “पाँच सौ” → 500.
      const next = numberAt(list, i + 1);
      if (!next) out += '00';
      else if (next.digits.length === 1) out += '0';
      continue;
    }
    const n = numberAt(list, i);
    if (!n) {
      repeat = 1;
      continue;
    }
    out += n.digits.length === 1 ? n.digits.repeat(repeat) : n.digits;
    repeat = 1;
    i += n.used - 1;
  }
  return out;
}

export interface DigitCheck {
  value: string;
  ok: boolean;
  reason?: string;
  expected?: number;
}

type DigitSpec = { exact?: number; min?: number; max?: number; label: string };

const DIGIT_FIELDS: Record<string, DigitSpec> = {
  mobile_registered: { exact: 10, label: 'mobile' },
  addr_current_pin: { exact: 6, label: 'PIN' },
  addr_permanent_pin: { exact: 6, label: 'PIN' },
  linked_account_last4: { exact: 4, label: 'last 4' },
  ckyc_number: { min: 10, max: 20, label: 'CKYC' },
};

/** Normalize one digit field. Null when the value has no digits to check. */
export function checkDigitField(key: string, raw: string): DigitCheck | null {
  const spec = DIGIT_FIELDS[key];
  if (!spec) return null;
  // CKYC may carry letters on some banks' forms; only normalize when it is spoken digits.
  if (key === 'ckyc_number' && /[A-Za-z]/.test(raw) && !DEVANAGARI.test(raw) && spokenDigits(raw).length < 10) {
    return null;
  }
  let digits = spokenDigits(raw);
  if (!digits) return { value: '', ok: false, reason: 'No digits heard', expected: spec.exact };
  if (key === 'mobile_registered') {
    if (/^91[6-9]\d{9}$/.test(digits)) digits = digits.slice(2);
    else if (/^0[6-9]\d{9}$/.test(digits)) digits = digits.slice(1);
  }
  const n = digits.length;
  if (spec.exact !== undefined && n !== spec.exact) {
    return { value: digits, ok: false, reason: `Heard ${n} digits, expected ${spec.exact}`, expected: spec.exact };
  }
  if (spec.min !== undefined && spec.max !== undefined && (n < spec.min || n > spec.max)) {
    return { value: digits, ok: false, reason: `Heard ${n} digits, expected ${spec.min}–${spec.max}` };
  }
  if (key === 'mobile_registered' && !/^[6-9]/.test(digits)) {
    return { value: digits, ok: false, reason: 'Mobile should start with 6–9', expected: 10 };
  }
  if ((key === 'addr_current_pin' || key === 'addr_permanent_pin') && digits.startsWith('0')) {
    return { value: digits, ok: false, reason: 'PIN cannot start with 0', expected: 6 };
  }
  return { value: digits, ok: true };
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

function validIso(y: number, m: number, d: number, allowFuture: boolean): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  if (y < 1900 || y > 2100) return null;
  if (!allowFuture && date.getTime() > Date.now()) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Any spoken or written date → YYYY-MM-DD: ISO, DD/MM/YYYY, Devanagari digits,
 * “बारह मार्च उन्नीस सौ चौरानवे”, Hinglish months (“12 maarch 1994”). Day-first.
 */
export function normalizeDate(raw: string, allowFuture = false): string | null {
  const text = foldDevanagariDigits(foldHindi(raw)).trim();
  if (!text) return null;
  const ymd = /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/.exec(text);
  if (ymd) return validIso(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]), allowFuture);
  const dmy = /^(\d{1,2})[-\/.\s](\d{1,2})[-\/.\s](\d{4})$/.exec(text);
  if (dmy) return validIso(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]), allowFuture);
  const parsed = parseFlexibleDob(text);
  if (!parsed) return null;
  const [y, m, d] = parsed.split('-').map(Number);
  return validIso(y, m, d, allowFuture);
}

const DOB_CUE = /जन्म|पैदा|डीओबी|\bdob\b|\bbirth\b|\bborn\b|janm|paida/i;

/** DOB from the transcript: after a birth cue, or the whole clip when DOB was just asked. */
export function dobFromTranscript(transcript: string, dobAsked: boolean): string | null {
  const cue = DOB_CUE.exec(transcript);
  if (cue) {
    const found = normalizeDate(transcript.slice(cue.index, cue.index + 120));
    if (found) return found;
  }
  return dobAsked ? normalizeDate(transcript) : null;
}

// ---------------------------------------------------------------------------
// Places
// ---------------------------------------------------------------------------

type Place = { name: string; state?: string; hi: string[]; latin?: string[] };

const CITIES: Place[] = [
  { name: 'New Delhi', state: 'Delhi', hi: ['नई दिल्ली', 'नयी दिल्ली'], latin: ['new delhi'] },
  { name: 'Delhi', state: 'Delhi', hi: ['दिल्ली', 'देहली'], latin: ['dilli', 'delhi'] },
  { name: 'Navi Mumbai', state: 'Maharashtra', hi: ['नवी मुंबई', 'नवी मुम्बई'] },
  { name: 'Mumbai', state: 'Maharashtra', hi: ['मुंबई', 'मुम्बई', 'बंबई', 'बम्बई', 'बॉम्बे'], latin: ['bombay', 'mumbai'] },
  {
    name: 'Bengaluru',
    state: 'Karnataka',
    hi: [
      'बेंगलुरु',
      'बेंगलुरू',
      'बेंगलूरु',
      'बैंगलुरु',
      'बैंगलूरु',
      'बैंग्लुरु',
      'बेंगलूर',
      'बंगलुरु',
      'बेंगालुरु',
      'बंगलौर',
      'बैंगलोर',
      'बेंगलोर',
      'बंगलोर',
    ],
    latin: ['bangalore', 'bengaluru', 'bangaluru', 'bengalore'],
  },
  { name: 'Chennai', state: 'Tamil Nadu', hi: ['चेन्नई', 'चेन्नै', 'मद्रास'], latin: ['madras', 'chennai'] },
  { name: 'Hyderabad', state: 'Telangana', hi: ['हैदराबाद'] },
  { name: 'Pune', state: 'Maharashtra', hi: ['पुणे', 'पुने', 'पूना'], latin: ['poona', 'pune'] },
  { name: 'Kolkata', state: 'West Bengal', hi: ['कोलकाता', 'कोलकत्ता', 'कलकत्ता'], latin: ['calcutta', 'kolkata'] },
  { name: 'Ahmedabad', state: 'Gujarat', hi: ['अहमदाबाद', 'अमदावाद'] },
  { name: 'Surat', state: 'Gujarat', hi: ['सूरत'] },
  { name: 'Vadodara', state: 'Gujarat', hi: ['वडोदरा', 'बडौदा', 'बड़ौदा'], latin: ['baroda', 'vadodara'] },
  { name: 'Rajkot', state: 'Gujarat', hi: ['राजकोट'] },
  { name: 'Gandhinagar', state: 'Gujarat', hi: ['गांधीनगर', 'गाँधीनगर'] },
  { name: 'Jaipur', state: 'Rajasthan', hi: ['जयपुर'] },
  { name: 'Jodhpur', state: 'Rajasthan', hi: ['जोधपुर'] },
  { name: 'Udaipur', state: 'Rajasthan', hi: ['उदयपुर'] },
  { name: 'Lucknow', state: 'Uttar Pradesh', hi: ['लखनऊ', 'लखनौ'] },
  { name: 'Kanpur', state: 'Uttar Pradesh', hi: ['कानपुर'] },
  { name: 'Varanasi', state: 'Uttar Pradesh', hi: ['वाराणसी', 'बनारस', 'काशी'], latin: ['banaras', 'benares', 'varanasi'] },
  { name: 'Prayagraj', state: 'Uttar Pradesh', hi: ['प्रयागराज', 'इलाहाबाद'], latin: ['allahabad', 'prayagraj'] },
  { name: 'Agra', state: 'Uttar Pradesh', hi: ['आगरा'] },
  { name: 'Meerut', state: 'Uttar Pradesh', hi: ['मेरठ'] },
  { name: 'Noida', state: 'Uttar Pradesh', hi: ['नोएडा', 'नॉएडा', 'नोयडा'] },
  { name: 'Ghaziabad', state: 'Uttar Pradesh', hi: ['गाजियाबाद'] },
  { name: 'Gorakhpur', state: 'Uttar Pradesh', hi: ['गोरखपुर'] },
  { name: 'Bareilly', state: 'Uttar Pradesh', hi: ['बरेली'] },
  { name: 'Aligarh', state: 'Uttar Pradesh', hi: ['अलीगढ़', 'अलीगढ'] },
  { name: 'Moradabad', state: 'Uttar Pradesh', hi: ['मुरादाबाद'] },
  { name: 'Gurugram', state: 'Haryana', hi: ['गुरुग्राम', 'गुड़गांव', 'गुड़गाँव', 'गुडगांव'], latin: ['gurgaon', 'gurugram'] },
  { name: 'Faridabad', state: 'Haryana', hi: ['फरीदाबाद'] },
  { name: 'Chandigarh', state: 'Chandigarh', hi: ['चंडीगढ़', 'चंडीगढ', 'चण्डीगढ़'] },
  { name: 'Ludhiana', state: 'Punjab', hi: ['लुधियाना'] },
  { name: 'Amritsar', state: 'Punjab', hi: ['अमृतसर'] },
  { name: 'Dehradun', state: 'Uttarakhand', hi: ['देहरादून'] },
  { name: 'Shimla', state: 'Himachal Pradesh', hi: ['शिमला'] },
  { name: 'Srinagar', state: 'Jammu and Kashmir', hi: ['श्रीनगर'] },
  { name: 'Jammu', state: 'Jammu and Kashmir', hi: ['जम्मू'] },
  { name: 'Nagpur', state: 'Maharashtra', hi: ['नागपुर'] },
  { name: 'Nashik', state: 'Maharashtra', hi: ['नासिक', 'नाशिक'] },
  { name: 'Thane', state: 'Maharashtra', hi: ['ठाणे'] },
  { name: 'Indore', state: 'Madhya Pradesh', hi: ['इंदौर', 'इन्दौर'] },
  { name: 'Bhopal', state: 'Madhya Pradesh', hi: ['भोपाल'] },
  { name: 'Gwalior', state: 'Madhya Pradesh', hi: ['ग्वालियर'] },
  { name: 'Jabalpur', state: 'Madhya Pradesh', hi: ['जबलपुर'] },
  { name: 'Patna', state: 'Bihar', hi: ['पटना'] },
  { name: 'Ranchi', state: 'Jharkhand', hi: ['रांची', 'राँची'] },
  { name: 'Jamshedpur', state: 'Jharkhand', hi: ['जमशेदपुर'] },
  { name: 'Dhanbad', state: 'Jharkhand', hi: ['धनबाद'] },
  { name: 'Raipur', state: 'Chhattisgarh', hi: ['रायपुर'] },
  { name: 'Bhubaneswar', state: 'Odisha', hi: ['भुवनेश्वर', 'भुबनेश्वर'] },
  { name: 'Guwahati', state: 'Assam', hi: ['गुवाहाटी', 'गोहाटी'] },
  { name: 'Kochi', state: 'Kerala', hi: ['कोच्चि', 'कोचीन'], latin: ['cochin', 'kochi'] },
  { name: 'Thiruvananthapuram', state: 'Kerala', hi: ['तिरुवनंतपुरम', 'त्रिवेंद्रम'], latin: ['trivandrum'] },
  { name: 'Coimbatore', state: 'Tamil Nadu', hi: ['कोयंबटूर', 'कोयम्बटूर'] },
  { name: 'Madurai', state: 'Tamil Nadu', hi: ['मदुरै', 'मदुरई'] },
  { name: 'Mysuru', state: 'Karnataka', hi: ['मैसूर', 'मैसूरु'], latin: ['mysore', 'mysuru'] },
  { name: 'Mangaluru', state: 'Karnataka', hi: ['मंगलुरु', 'मंगलौर', 'मैंगलोर'], latin: ['mangalore', 'mangaluru'] },
  { name: 'Visakhapatnam', state: 'Andhra Pradesh', hi: ['विशाखापत्तनम', 'विशाखापट्टनम'], latin: ['vizag'] },
  { name: 'Vijayawada', state: 'Andhra Pradesh', hi: ['विजयवाड़ा', 'विजयवाडा'] },
  { name: 'Panaji', state: 'Goa', hi: ['पणजी', 'पंजिम'], latin: ['panjim'] },
  { name: 'Puducherry', state: 'Puducherry', hi: ['पुडुचेरी', 'पांडिचेरी'], latin: ['pondicherry', 'pondy'] },
];

const STATES: Place[] = [
  { name: 'Andhra Pradesh', hi: ['आंध्र प्रदेश', 'आन्ध्र प्रदेश'] },
  { name: 'Arunachal Pradesh', hi: ['अरुणाचल प्रदेश'] },
  { name: 'Assam', hi: ['असम'] },
  { name: 'Bihar', hi: ['बिहार'] },
  { name: 'Chhattisgarh', hi: ['छत्तीसगढ़', 'छत्तीसगढ'] },
  { name: 'Goa', hi: ['गोवा'] },
  { name: 'Gujarat', hi: ['गुजरात'] },
  { name: 'Haryana', hi: ['हरियाणा', 'हरियाना'] },
  { name: 'Himachal Pradesh', hi: ['हिमाचल प्रदेश', 'हिमाचल'] },
  { name: 'Jharkhand', hi: ['झारखंड', 'झारखण्ड'] },
  { name: 'Karnataka', hi: ['कर्नाटक', 'कर्णाटक'] },
  { name: 'Kerala', hi: ['केरल', 'केरला'] },
  { name: 'Madhya Pradesh', hi: ['मध्य प्रदेश', 'मध्यप्रदेश'] },
  { name: 'Maharashtra', hi: ['महाराष्ट्र'] },
  { name: 'Manipur', hi: ['मणिपुर'] },
  { name: 'Meghalaya', hi: ['मेघालय'] },
  { name: 'Mizoram', hi: ['मिजोरम'] },
  { name: 'Nagaland', hi: ['नागालैंड', 'नगालैंड'] },
  { name: 'Odisha', hi: ['ओडिशा', 'ओड़िशा', 'उड़ीसा', 'उडीसा'], latin: ['orissa'] },
  { name: 'Punjab', hi: ['पंजाब'] },
  { name: 'Rajasthan', hi: ['राजस्थान'] },
  { name: 'Sikkim', hi: ['सिक्किम'] },
  { name: 'Tamil Nadu', hi: ['तमिलनाडु', 'तमिल नाडु', 'तमिलनाडू'] },
  { name: 'Telangana', hi: ['तेलंगाना', 'तेलंगान'] },
  { name: 'Tripura', hi: ['त्रिपुरा'] },
  { name: 'Uttar Pradesh', hi: ['उत्तर प्रदेश', 'उत्तरप्रदेश', 'यूपी'], latin: ['up'] },
  { name: 'Uttarakhand', hi: ['उत्तराखंड', 'उत्तराखण्ड'] },
  { name: 'West Bengal', hi: ['पश्चिम बंगाल', 'पश्चिमी बंगाल', 'बंगाल'] },
  { name: 'Andaman and Nicobar Islands', hi: ['अंडमान निकोबार', 'अंडमान और निकोबार', 'अंडमान'] },
  { name: 'Chandigarh', hi: ['चंडीगढ़', 'चंडीगढ'] },
  { name: 'Dadra and Nagar Haveli and Daman and Diu', hi: ['दादरा नगर हवेली', 'दमन दीव', 'दादरा और नगर हवेली'] },
  { name: 'Delhi', hi: ['दिल्ली', 'नई दिल्ली'], latin: ['new delhi', 'nct of delhi'] },
  { name: 'Jammu and Kashmir', hi: ['जम्मू और कश्मीर', 'जम्मू कश्मीर', 'जम्मू-कश्मीर', 'कश्मीर'], latin: ['j&k', 'jammu kashmir'] },
  { name: 'Ladakh', hi: ['लद्दाख'] },
  { name: 'Lakshadweep', hi: ['लक्षद्वीप'] },
  { name: 'Puducherry', hi: ['पुडुचेरी', 'पांडिचेरी'], latin: ['pondicherry'] },
];

/** Comparison key: folded, no nukta at all, no spaces or punctuation. */
function placeKey(text: string): string {
  return foldHindi(text)
    .replace(/\u093C/g, '')
    .toLowerCase()
    .replace(/[\s\-–—,.।()]/g, '');
}

type KeyedPlace = { key: string; place: Place };

function keyed(list: Place[]): KeyedPlace[] {
  const out: KeyedPlace[] = [];
  for (const place of list) {
    for (const name of place.hi) out.push({ key: placeKey(name), place });
  }
  return out.sort((a, b) => b.key.length - a.key.length);
}

const CITY_KEYS = keyed(CITIES);
const STATE_KEYS = keyed(STATES);

function latinAlias(list: Place[], value: string): Place | null {
  const lower = value.trim().toLowerCase().replace(/\s+/g, ' ');
  for (const place of list) {
    if (place.name.toLowerCase() === lower) return place;
    if (place.latin?.includes(lower)) return place;
  }
  return null;
}

const PLACE_FILLER =
  /(?<![\u0900-\u097F])(?:शहर|नगर\s+निगम|जिला|ज़िला|राज्य|प्रदेश\s+राज्य|में|से|है|हूँ|हूं|का|की|के)(?![\u0900-\u097F])/g;

// --- Devanagari → Latin fallback (Hunterian-style, with schwa deletion) ---

const CONSONANT: Record<string, string> = {
  क: 'k', ख: 'kh', ग: 'g', घ: 'gh', ङ: 'n',
  च: 'ch', छ: 'chh', ज: 'j', झ: 'jh', ञ: 'n',
  ट: 't', ठ: 'th', ड: 'd', ढ: 'dh', ण: 'n',
  त: 't', थ: 'th', द: 'd', ध: 'dh', न: 'n',
  प: 'p', फ: 'ph', ब: 'b', भ: 'bh', म: 'm',
  य: 'y', र: 'r', ल: 'l', ळ: 'l', व: 'v',
  श: 'sh', ष: 'sh', स: 's', ह: 'h',
};

const NUKTA_CONSONANT: Record<string, string> = {
  क: 'q', ख: 'kh', ग: 'g', ज: 'z', फ: 'f', ड: 'r', ढ: 'rh',
};

const VOWEL: Record<string, string> = {
  अ: 'a', आ: 'a', इ: 'i', ई: 'i', उ: 'u', ऊ: 'u', ऋ: 'ri',
  ए: 'e', ऐ: 'ai', ओ: 'o', औ: 'au', ऑ: 'o',
};

const MATRA: Record<string, string> = {
  'ा': 'a', 'ि': 'i', 'ी': 'i', 'ु': 'u', 'ू': 'u', 'ृ': 'ri',
  'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ॉ': 'o',
};

type Syllable = { c: string; v: string; schwa: boolean; tail: string };

function transliterateWord(word: string): string {
  const syl: Syllable[] = [];
  const chars = [...word.normalize('NFC')];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const last = syl[syl.length - 1];
    if (CONSONANT[ch] !== undefined) {
      let c = CONSONANT[ch];
      if (chars[i + 1] === '\u093C') {
        c = NUKTA_CONSONANT[ch] ?? c;
        i++;
      }
      syl.push({ c, v: 'a', schwa: true, tail: '' });
    } else if (MATRA[ch] !== undefined && last && last.schwa) {
      last.v = MATRA[ch];
      last.schwa = false;
    } else if (ch === '\u094D' && last) {
      last.v = '';
      last.schwa = false;
    } else if (VOWEL[ch] !== undefined) {
      syl.push({ c: '', v: VOWEL[ch], schwa: false, tail: '' });
    } else if ((ch === 'ं' || ch === 'ँ') && last) {
      last.tail += 'n';
      last.schwa = false;
    } else if (ch === 'ः' && last) {
      last.tail += 'h';
    } else if (/[0-9A-Za-z]/.test(ch)) {
      syl.push({ c: ch, v: '', schwa: false, tail: '' });
    }
  }
  if (syl.length > 1 && syl[syl.length - 1].schwa) syl[syl.length - 1].v = '';
  // Medial schwa: drop the inherent “a” in V C_a C V, scanning right to left.
  for (let i = syl.length - 2; i >= 1; i--) {
    const cur = syl[i];
    const prev = syl[i - 1];
    const next = syl[i + 1];
    if (cur.schwa && cur.v === 'a' && prev.v !== '' && next.c !== '' && next.v !== '') cur.v = '';
  }
  const latin = syl.map((s) => s.c + s.v + s.tail).join('');
  return latin ? latin[0].toUpperCase() + latin.slice(1) : '';
}

/** Best-effort Latin spelling for a Devanagari place name that is not in the tables. */
export function transliterateDevanagari(text: string): string {
  return text
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((w) => (DEVANAGARI.test(w) ? transliterateWord(w) : w))
    .filter(Boolean)
    .join(' ');
}

export interface PlaceMatch {
  value: string;
  state?: string;
  transliterated: boolean;
}

/**
 * Canonical English place name for a city or state value: “बेंगलुरु” → Bengaluru,
 * “Bangalore” → Bengaluru, unknown Devanagari → transliterated Latin.
 */
export function normalizePlace(raw: string, kind: 'city' | 'state'): PlaceMatch | null {
  const value = raw.trim();
  if (!value) return null;
  const list = kind === 'city' ? CITIES : STATES;
  if (!DEVANAGARI.test(value)) {
    const alias = latinAlias(list, value);
    return alias ? { value: alias.name, state: alias.state, transliterated: false } : null;
  }
  const key = placeKey(value);
  const table = kind === 'city' ? CITY_KEYS : STATE_KEYS;
  const exact = table.find((entry) => entry.key === key);
  const hit = exact ?? table.find((entry) => key.includes(entry.key));
  if (hit) return { value: hit.place.name, state: hit.place.state, transliterated: false };
  const stripped = foldHindi(value).replace(PLACE_FILLER, ' ').replace(/\s+/g, ' ').trim();
  const latin = transliterateDevanagari(stripped);
  return latin.length >= 2 ? { value: latin, transliterated: true } : null;
}

/** The one known city named in a Hindi transcript, or null when none or several. */
export function cityFromTranscript(transcript: string): Place | null {
  let text = foldHindi(transcript).replace(/\u093C/g, '');
  const found = new Set<Place>();
  const sorted = CITIES.flatMap((place) => place.hi.map((name) => ({ name: foldHindi(name).replace(/\u093C/g, ''), place })))
    .sort((a, b) => b.name.length - a.name.length);
  for (const { name, place } of sorted) {
    const re = new RegExp(`(?<![\\u0900-\\u097F])${name}(?![\\u0900-\\u097F])`, 'g');
    if (!re.test(text)) continue;
    found.add(place);
    text = text.replace(re, ' ');
  }
  return found.size === 1 ? [...found][0] : null;
}

// ---------------------------------------------------------------------------
// Merge step for the speak function
// ---------------------------------------------------------------------------

const MOBILE_CUE = /मोबाइल|फोन|फ़ोन|नंबर|नम्बर|\bmobile\b|\bphone\b|\bnumber\b/i;
const CITY_CUE = /शहर|रहत[ाीे]|रहते|पता|निवास|\bcity\b|\blive\b|\brehta\b|\brehti\b/i;

export interface VoiceNormalizeInput {
  current: FormValues;
  updates: FormValues;
  meta: FieldMetaMap;
  transcript: string;
  /** Hindi page language or Hindi transcript. Transcript gap-fill runs only then. */
  hindi: boolean;
  /** Required ids the previous ask targeted (first one or two missing). */
  asked: string[];
}

export interface DigitRecheck {
  key: string;
  heard: number;
  expected?: number;
}

export interface VoiceNormalizeResult {
  updates: FormValues;
  meta: FieldMetaMap;
  recheck: DigitRecheck[];
}

function withConfidence(prev: FieldMeta | undefined, cap: number, reason?: string): FieldMeta {
  const confidence = Math.min(prev?.confidence ?? 1, cap);
  const why = reason ?? prev?.reason;
  return why ? { confidence, reason: why } : { confidence };
}

/**
 * Normalize DOB, digit fields, and city/state after the field model, then fill
 * still-empty Hindi DOB / mobile / PIN / city from the transcript.
 * Wrong digit counts keep the heard digits at low confidence and are listed for a re-ask.
 */
export function normalizeVoiceUpdates(input: VoiceNormalizeInput): VoiceNormalizeResult {
  const { current, transcript, hindi, asked } = input;
  const updates: FormValues = { ...input.updates };
  const meta: FieldMetaMap = { ...input.meta };
  const recheck: DigitRecheck[] = [];
  const open = (key: string) => !isFilled(current[key]) && !isFilled(updates[key]);
  const fill = (key: string, value: string, confidence: number, reason?: string) => {
    updates[key] = value;
    meta[key] = reason ? { confidence, reason } : { confidence };
  };
  const drop = (key: string) => {
    delete updates[key];
    delete meta[key];
  };

  for (const key of ['dob', 'ovd_poi_expiry']) {
    const raw = updates[key] as unknown;
    if (typeof raw !== 'string' && typeof raw !== 'number') continue;
    const text = String(raw).trim();
    if (!text) continue;
    const allowFuture = key !== 'dob';
    let iso = normalizeDate(text, allowFuture);
    if (!iso && key === 'dob' && hindi) iso = dobFromTranscript(transcript, true);
    if (iso) updates[key] = iso;
    else drop(key);
  }

  for (const key of Object.keys(DIGIT_FIELDS)) {
    const raw = updates[key] as unknown;
    if (typeof raw !== 'string' && typeof raw !== 'number') continue;
    const check = checkDigitField(key, String(raw));
    if (!check) continue;
    if (check.ok) {
      updates[key] = check.value;
      continue;
    }
    const heard =
      key === 'mobile_registered'
        ? extractSpokenMobile(transcript)
        : key === 'addr_current_pin'
          ? extractSpokenPin(transcript)
          : null;
    if (heard) {
      fill(key, heard, Math.min(meta[key]?.confidence ?? 1, TRANSCRIPT_CONFIDENCE));
      continue;
    }
    if (!check.value) {
      drop(key);
      continue;
    }
    updates[key] = check.value;
    meta[key] = withConfidence(meta[key], WRONG_COUNT_CONFIDENCE, check.reason);
    recheck.push({ key, heard: check.value.length, expected: check.expected });
  }

  const placeFields: Array<[string, 'city' | 'state', string | null]> = [
    ['addr_current_city', 'city', 'addr_current_state'],
    ['addr_permanent_city', 'city', 'addr_permanent_state'],
    ['addr_current_state', 'state', null],
    ['addr_permanent_state', 'state', null],
  ];
  for (const [key, kind, stateKey] of placeFields) {
    const raw = updates[key];
    if (typeof raw !== 'string' || !raw.trim()) continue;
    const match = normalizePlace(raw, kind);
    if (!match) continue;
    updates[key] = match.value;
    if (match.transliterated) {
      meta[key] = withConfidence(meta[key], TRANSLITERATED_CONFIDENCE, `${kind === 'city' ? 'City' : 'State'} spelling transliterated from Hindi`);
    }
    if (hindi && stateKey && match.state && open(stateKey)) fill(stateKey, match.state, TRANSCRIPT_CONFIDENCE);
  }

  if (hindi && transcript.trim()) {
    if (open('dob')) {
      const dob = dobFromTranscript(transcript, asked.includes('dob'));
      if (dob) fill('dob', dob, TRANSCRIPT_CONFIDENCE);
    }
    if (open('mobile_registered') && (asked.includes('mobile_registered') || MOBILE_CUE.test(transcript))) {
      const mobile = extractSpokenMobile(transcript);
      if (mobile) fill('mobile_registered', mobile, TRANSCRIPT_CONFIDENCE);
    }
    if (open('addr_current_pin')) {
      let pin = extractSpokenPin(transcript);
      if (!pin && asked.includes('addr_current_pin')) {
        const digits = spokenDigits(transcript);
        if (/^[1-9]\d{5}$/.test(digits)) pin = digits;
      }
      if (pin) fill('addr_current_pin', pin, TRANSCRIPT_CONFIDENCE);
    }
    if (open('addr_current_city') && (asked.includes('addr_current_city') || CITY_CUE.test(transcript))) {
      const city = cityFromTranscript(transcript);
      if (city) {
        fill('addr_current_city', city.name, TRANSCRIPT_CONFIDENCE);
        if (city.state && open('addr_current_state')) fill('addr_current_state', city.state, TRANSCRIPT_CONFIDENCE);
      }
    }
  }

  return { updates, meta, recheck };
}

const RECHECK_LABEL: Record<string, { hi: string; en: string }> = {
  mobile_registered: { hi: 'मोबाइल नंबर', en: 'mobile number' },
  addr_current_pin: { hi: 'पिन कोड', en: 'PIN code' },
  addr_permanent_pin: { hi: 'स्थायी पते का पिन कोड', en: 'permanent PIN code' },
  linked_account_last4: { hi: 'खाते के आखिरी चार अंक', en: 'account last four digits' },
  ckyc_number: { hi: 'सीकेवाईसी नंबर', en: 'CKYC number' },
};

/** One short re-ask for the first digit field whose count was wrong. */
export function digitRecheckAsk(recheck: DigitRecheck[], lang: 'hi' | 'en'): string | null {
  const first = recheck[0];
  if (!first) return null;
  const label = RECHECK_LABEL[first.key] ?? { hi: 'नंबर', en: 'number' };
  if (lang === 'hi') {
    const need = first.expected ? `, ${first.expected} चाहिए` : '';
    return `${label.hi} में ${first.heard} अंक सुनाई दिए${need}। कृपया एक-एक अंक करके दोबारा बताएं।`;
  }
  const need = first.expected ? `; it needs ${first.expected}` : '';
  return `I heard ${first.heard} digits for the ${label.en}${need}. Please say it again, one digit at a time.`;
}
