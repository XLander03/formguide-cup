import type { FormValues } from './types';

/**
 * Cross-field checks run over the draft before read-back. Each one is a real rule about Indian KYC
 * data, not a model guess; a check that cannot judge (value missing, unknown spelling) is skipped
 * rather than reported. Nothing here blocks the draft: a warning is "worth a second look".
 */

export type CheckLevel = 'pass' | 'warn' | 'note';

export interface DraftCheck {
  id: string;
  /** What was checked, shown while the check runs. */
  title: string;
  level: CheckLevel;
  detail: string;
  /** Field to jump to when the customer wants to fix it. */
  field: string;
}

function text(values: FormValues, id: string): string {
  const v = values[id];
  return typeof v === 'string' ? v.trim() : '';
}

function parseIso(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getMonth() === Number(m[2]) - 1 ? d : null;
}

function ageYears(born: Date, today: Date): number {
  let age = today.getFullYear() - born.getFullYear();
  const m = today.getMonth() - born.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < born.getDate())) age -= 1;
  return age;
}

/** PAN holder type by its 4th letter (Income Tax Department structure). */
const PAN_HOLDER: Record<string, string> = {
  P: 'an individual',
  C: 'a company',
  H: 'a Hindu undivided family',
  F: 'a firm',
  A: 'an association of persons',
  T: 'a trust',
  B: 'a body of individuals',
  L: 'a local authority',
  J: 'an artificial juridical person',
  G: 'a government body',
};

function panChecks(values: FormValues): DraftCheck[] {
  const pan = text(values, 'pan_number').toUpperCase();
  if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(pan)) return [];
  const out: DraftCheck[] = [];
  const kind = pan[3];
  out.push(
    kind === 'P'
      ? { id: 'pan_type', title: 'PAN holder type', level: 'pass', detail: `4th letter P: a personal PAN.`, field: 'pan_number' }
      : {
          id: 'pan_type',
          title: 'PAN holder type',
          level: 'warn',
          detail: `4th letter is ${kind}, which marks ${PAN_HOLDER[kind] ?? 'a non-individual'}. A personal PAN has P here.`,
          field: 'pan_number',
        },
  );
  const name = text(values, 'applicant_full_name');
  const words = name.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w));
  if (words.length >= 2) {
    const surname = words[words.length - 1];
    const initials = new Set(words.map((w) => w[0].toUpperCase()));
    const fifth = pan[4];
    out.push(
      initials.has(fifth)
        ? {
            id: 'pan_name',
            title: 'PAN matches name',
            level: 'pass',
            detail: `5th letter ${fifth} matches ${words.find((w) => w[0].toUpperCase() === fifth)}.`,
            field: 'pan_number',
          }
        : {
            id: 'pan_name',
            title: 'PAN matches name',
            level: 'warn',
            detail: `A PAN's 5th letter is usually your surname's first letter (${surname} → ${surname[0].toUpperCase()}). This PAN has ${fifth}.`,
            field: 'pan_number',
          },
    );
  }
  return out;
}

/** States served by each PIN code's first two digits (India Post postal circles). */
const PIN_STATES: [string, string[]][] = [
  ['11', ['delhi']],
  ['12-13', ['haryana']],
  ['14-15', ['punjab']],
  ['16', ['punjab', 'chandigarh', 'haryana']],
  ['17', ['himachal pradesh']],
  ['18-19', ['jammu and kashmir', 'ladakh']],
  ['20-28', ['uttar pradesh', 'uttarakhand']],
  ['30-34', ['rajasthan']],
  ['36-39', ['gujarat', 'dadra and nagar haveli and daman and diu']],
  ['40-44', ['maharashtra', 'goa']],
  ['45-48', ['madhya pradesh']],
  ['49', ['chhattisgarh']],
  ['50-53', ['telangana', 'andhra pradesh']],
  ['56-59', ['karnataka']],
  ['60-64', ['tamil nadu', 'puducherry']],
  ['67-69', ['kerala', 'lakshadweep']],
  ['70-74', ['west bengal', 'sikkim', 'andaman and nicobar islands']],
  ['75-77', ['odisha']],
  ['78', ['assam']],
  ['79', ['arunachal pradesh', 'manipur', 'meghalaya', 'mizoram', 'nagaland', 'tripura', 'assam']],
  ['80-85', ['bihar', 'jharkhand']],
];

const STATE_ALIASES: Record<string, string> = {
  orissa: 'odisha',
  'nct of delhi': 'delhi',
  'new delhi': 'delhi',
  'j&k': 'jammu and kashmir',
  'jammu & kashmir': 'jammu and kashmir',
  'tamilnadu': 'tamil nadu',
  'uttaranchal': 'uttarakhand',
  'pondicherry': 'puducherry',
  'कर्नाटक': 'karnataka',
  'महाराष्ट्र': 'maharashtra',
  'दिल्ली': 'delhi',
  'उत्तर प्रदेश': 'uttar pradesh',
  'बिहार': 'bihar',
  'राजस्थान': 'rajasthan',
  'गुजरात': 'gujarat',
  'मध्य प्रदेश': 'madhya pradesh',
  'तमिलनाडु': 'tamil nadu',
  'केरल': 'kerala',
  'पश्चिम बंगाल': 'west bengal',
  'तेलंगाना': 'telangana',
  'हरियाणा': 'haryana',
  'पंजाब': 'punjab',
};

const KNOWN_STATES = new Set(PIN_STATES.flatMap(([, states]) => states));

function normalState(raw: string): string | null {
  const s = raw.toLowerCase().replace(/\s+/g, ' ').trim();
  const name = STATE_ALIASES[s] ?? s.replace(/&/g, 'and');
  return KNOWN_STATES.has(name) ? name : null;
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bAnd\b/g, 'and');
}

function statesForPin(pin: string): string[] | null {
  const two = Number(pin.slice(0, 2));
  for (const [range, states] of PIN_STATES) {
    const [lo, hi = lo] = range.split('-').map(Number);
    if (two >= lo && two <= hi) return states;
  }
  return null;
}

function pinCheck(values: FormValues): DraftCheck[] {
  const pin = text(values, 'addr_current_pin');
  const rawState = text(values, 'addr_current_state');
  if (!/^[1-9]\d{5}$/.test(pin) || !rawState) return [];
  const state = normalState(rawState);
  const states = statesForPin(pin);
  if (!state || !states) return [];
  const where = states.length === 1 ? titleCase(states[0]) : states.slice(0, 2).map(titleCase).join(' or ');
  return [
    states.includes(state)
      ? { id: 'pin_state', title: 'PIN code matches state', level: 'pass', detail: `${pin} is a ${titleCase(state)} PIN.`, field: 'addr_current_pin' }
      : {
          id: 'pin_state',
          title: 'PIN code matches state',
          level: 'warn',
          detail: `PIN ${pin} belongs to ${where}, but the state says ${titleCase(state)}.`,
          field: 'addr_current_pin',
        },
  ];
}

const DOC_FORMATS: Record<string, { re: RegExp; name: string; example: string }> = {
  passport: { re: /^[A-Z]\d{7}$/, name: 'A passport number', example: '1 letter and 7 digits, like K1234567' },
  voter_id: { re: /^[A-Z]{3}\d{7}$/, name: 'A voter ID (EPIC) number', example: '3 letters and 7 digits, like ABC1234567' },
  driving_licence: { re: /^[A-Z]{2}\d{1,2}[0-9A-Z]{9,13}$/, name: 'A driving licence number', example: 'a state code and RTO number, then digits, like MH1420110062821' },
};

function docCheck(values: FormValues): DraftCheck[] {
  const type = text(values, 'ovd_poi_type');
  const fmt = DOC_FORMATS[type];
  const number = text(values, 'ovd_poi_number').toUpperCase().replace(/[\s-]/g, '');
  if (!fmt || !number) return [];
  return [
    fmt.re.test(number)
      ? { id: 'doc_format', title: 'Document number format', level: 'pass', detail: `${fmt.name.replace(/^An? (.)/, (_, c: string) => c.toUpperCase())} format looks right.`, field: 'ovd_poi_number' }
      : {
          id: 'doc_format',
          title: 'Document number format',
          level: 'warn',
          detail: `${fmt.name} is ${fmt.example}. “${number}” doesn't fit.`,
          field: 'ovd_poi_number',
        },
  ];
}

function expiryCheck(values: FormValues, today: Date): DraftCheck[] {
  const expiry = parseIso(text(values, 'ovd_poi_expiry'));
  if (!expiry) return [];
  const days = Math.floor((expiry.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) {
    return [{ id: 'doc_expiry', title: 'Document validity', level: 'warn', detail: 'This proof of identity has expired. Banks need a valid document.', field: 'ovd_poi_expiry' }];
  }
  if (days < 180) {
    return [{ id: 'doc_expiry', title: 'Document validity', level: 'note', detail: `Expires in ${Math.max(1, Math.round(days / 30))} month(s). Some banks ask for longer validity.`, field: 'ovd_poi_expiry' }];
  }
  return [{ id: 'doc_expiry', title: 'Document validity', level: 'pass', detail: 'Proof of identity is valid.', field: 'ovd_poi_expiry' }];
}

function ageCheck(values: FormValues, today: Date): DraftCheck[] {
  const born = parseIso(text(values, 'dob'));
  if (!born) return [];
  const age = ageYears(born, today);
  if (age < 18 || age > 120) return [];
  if (age >= 60) {
    return [{ id: 'age', title: 'Age from date of birth', level: 'note', detail: `Applicant is ${age}, a senior citizen. Many banks offer a senior savings account.`, field: 'dob' }];
  }
  return [{ id: 'age', title: 'Age from date of birth', level: 'pass', detail: `Applicant is ${age}: an adult account.`, field: 'dob' }];
}

function mobileCheck(values: FormValues): DraftCheck[] {
  const mobile = text(values, 'mobile_registered');
  if (!/^[6-9]\d{9}$/.test(mobile)) return [];
  if (/^(\d)\1{9}$/.test(mobile)) {
    return [{ id: 'mobile', title: 'Mobile number', level: 'warn', detail: 'All ten digits are the same. Please check the number.', field: 'mobile_registered' }];
  }
  return [{ id: 'mobile', title: 'Mobile number', level: 'pass', detail: 'Valid Indian mobile number.', field: 'mobile_registered' }];
}

/** Every check that can judge this draft, in the order they are shown. */
export function runDraftChecks(values: FormValues, today = new Date()): DraftCheck[] {
  return [
    ...ageCheck(values, today),
    ...mobileCheck(values),
    ...panChecks(values),
    ...pinCheck(values),
    ...docCheck(values),
    ...expiryCheck(values, today),
  ];
}
