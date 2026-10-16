/**
 * Hindi and Hinglish cues for aof_kyc_demo_v1.
 * English detectors run first; callers should keep those values.
 * Schema enum values stay English codes. Spoken names stay as spoken.
 */

export type SlotValue = string | boolean;

const PLACES: Array<{ re: RegExp; city?: string; state?: string }> = [
  { re: /नई दिल्ली|नयी दिल्ली/, city: 'New Delhi', state: 'Delhi' },
  {
    re: /बैंगलुरु|बैंगलूरु|बैंग्लुरु|बेंगलुरु|बेंगलूरु|बेंगलूर|बंगलुरु|बैंगलोर|बेंगलोर|बंगलोर/,
    city: 'Bengaluru',
    state: 'Karnataka',
  },
  { re: /मुंबई|मुम्बई/, city: 'Mumbai', state: 'Maharashtra' },
  { re: /चेन्नई|चेन्नै/, city: 'Chennai', state: 'Tamil Nadu' },
  { re: /हैदराबाद/, city: 'Hyderabad', state: 'Telangana' },
  { re: /पुणे/, city: 'Pune', state: 'Maharashtra' },
  { re: /कोलकाता/, city: 'Kolkata', state: 'West Bengal' },
  { re: /अहमदाबाद/, city: 'Ahmedabad', state: 'Gujarat' },
  { re: /जयपुर/, city: 'Jaipur', state: 'Rajasthan' },
  { re: /लखनऊ/, city: 'Lucknow', state: 'Uttar Pradesh' },
  { re: /दिल्ली/, city: 'Delhi', state: 'Delhi' },
  { re: /कर्नाटक/, state: 'Karnataka' },
  { re: /महाराष्ट्र/, state: 'Maharashtra' },
  { re: /तमिल\s?नाडु/, state: 'Tamil Nadu' },
  { re: /तेलंगाना/, state: 'Telangana' },
  { re: /पश्चिम बंगाल/, state: 'West Bengal' },
  { re: /गुजरात/, state: 'Gujarat' },
  { re: /राजस्थान/, state: 'Rajasthan' },
  { re: /उत्तर प्रदेश/, state: 'Uttar Pradesh' },
  { re: /मध्य प्रदेश/, state: 'Madhya Pradesh' },
  { re: /केरल/, state: 'Kerala' },
  { re: /हरियाणा/, state: 'Haryana' },
  { re: /पंजाब/, state: 'Punjab' },
  { re: /बिहार/, state: 'Bihar' },
  { re: /ओडिशा|उड़ीसा/, state: 'Odisha' },
  { re: /असम/, state: 'Assam' },
  { re: /गोवा/, state: 'Goa' },
];

function takeName(text: string, cues: RegExp): string | null {
  const m = text.match(cues);
  if (!m) return null;
  const name = m[1].replace(/\s+/g, ' ').trim();
  if (name.length < 2 || name.length > 80) return null;
  return name;
}

function addressChunk(text: string): string | null {
  const labeled = text.match(
    /(?:मेरा पता|पता है|पता:|mera pata(?:\s+hai)?|pata hai)\s+(.+?)(?:[।.]|$)/i,
  );
  if (labeled) return labeled[1].trim();
  const live = text.match(
    /(?:मैं|main)\s+(.+?)\s+(?:में|mein)\s+रह(?:ती|ता|ते)\s+(?:हूँ|हूं|हैं|hoon|hun|hain)/i,
  );
  if (live) return live[1].trim();
  return null;
}

function stripPlaces(line: string): string {
  let out = line;
  for (const p of PLACES) out = out.replace(p.re, ' ');
  out = out.replace(/\b\d{6}\b/g, ' ');
  out = out.replace(/\b(?:bengaluru|bangalore|mumbai|karnataka|maharashtra|delhi)\b/gi, ' ');
  return out.replace(/[,\s]+/g, ' ').replace(/^[\s,]+|[\s,]+$/g, '').trim();
}

const DEVANAGARI_DIGITS = '०१२३४५६७८९';

/** Devanagari digits → ASCII. Spoken words are unchanged. */
export function foldDevanagariDigits(text: string): string {
  return text.replace(/[०-९]/g, (ch) => String(DEVANAGARI_DIGITS.indexOf(ch)));
}

/** Single spoken digits. Compounds (पंद्रह, दस) stay out so “नौकरी” is not a 9. */
const SPOKEN_DIGIT: Record<string, string> = {
  शून्य: '0',
  जीरो: '0',
  ज़ीरो: '0',
  ज़ीरो: '0',
  zero: '0',
  oh: '0',
  एक: '1',
  one: '1',
  वन: '1',
  दो: '2',
  two: '2',
  टू: '2',
  तीन: '3',
  three: '3',
  थ्री: '3',
  चार: '4',
  four: '4',
  फोर: '4',
  पांच: '5',
  पाँच: '5',
  five: '5',
  फाइव: '5',
  छह: '6',
  छः: '6',
  छे: '6',
  six: '6',
  सिक्स: '6',
  सात: '7',
  seven: '7',
  सेवन: '7',
  आठ: '8',
  eight: '8',
  एट: '8',
  नौ: '9',
  nine: '9',
  नाइन: '9',
};

const REPEAT_WORD: Record<string, number> = {
  double: 2,
  triple: 3,
  डबल: 2,
  ट्रिपल: 3,
};

const HI_SMALL: Record<string, number> = {
  शून्य: 0,
  एक: 1,
  दो: 2,
  तीन: 3,
  चार: 4,
  पांच: 5,
  पाँच: 5,
  छह: 6,
  छः: 6,
  छे: 6,
  सात: 7,
  आठ: 8,
  नौ: 9,
  दस: 10,
  ग्यारह: 11,
  बारह: 12,
  तेरह: 13,
  चौदह: 14,
  पंद्रह: 15,
  पन्द्रह: 15,
  सोलह: 16,
  सत्रह: 17,
  अठारह: 18,
  अट्ठारह: 18,
  उन्नीस: 19,
  बीस: 20,
  इक्कीस: 21,
  बाईस: 22,
  तेईस: 23,
  चौबीस: 24,
  पच्चीस: 25,
  छब्बीस: 26,
  सत्ताईस: 27,
  अट्ठाईस: 28,
  उनतीस: 29,
  तीस: 30,
  इकतीस: 31,
  बत्तीस: 32,
  तैंतीस: 33,
  तेंतीस: 33,
  चौंतीस: 34,
  पैंतीस: 35,
  छत्तीस: 36,
  सैंतीस: 37,
  अड़तीस: 38,
  उनतालीस: 39,
  चालीस: 40,
  इकतालीस: 41,
  बयालीस: 42,
  तैंतालीस: 43,
  चौवालीस: 44,
  पैंतालीस: 45,
  छियालीस: 46,
  सैंतालीस: 47,
  अड़तालीस: 48,
  उनचास: 49,
  पचास: 50,
  इक्यावन: 51,
  बावन: 52,
  तिरपन: 53,
  त्रेपन: 53,
  चौवन: 54,
  पचपन: 55,
  छप्पन: 56,
  सत्तावन: 57,
  अट्ठावन: 58,
  उनसठ: 59,
  साठ: 60,
  इकसठ: 61,
  बासठ: 62,
  तिरसठ: 63,
  त्रेसठ: 63,
  चौंसठ: 64,
  पैंसठ: 65,
  छियासठ: 66,
  सड़सठ: 67,
  अड़सठ: 68,
  उनहत्तर: 69,
  सत्तर: 70,
  इकहत्तर: 71,
  बहत्तर: 72,
  तिहत्तर: 73,
  चौहत्तर: 74,
  पचहत्तर: 75,
  छिहत्तर: 76,
  सतहत्तर: 77,
  अठहत्तर: 78,
  उन्यासी: 79,
  अस्सी: 80,
  इक्यासी: 81,
  बयासी: 82,
  तिरासी: 83,
  चौरासी: 84,
  पचासी: 85,
  छियासी: 86,
  सत्तासी: 87,
  अठासी: 88,
  नवासी: 89,
  नब्बे: 90,
  इक्यानवे: 91,
  बानवे: 92,
  ब्यानवे: 92,
  तिरानवे: 93,
  चौनवे: 94,
  चौन्यानवे: 94,
  चौरानवे: 94,
  पचानवे: 95,
  छियानवे: 96,
  सत्तानवे: 97,
  अठानवे: 98,
  निन्यानवे: 99,
  पहली: 1,
  पहला: 1,
  दूसरी: 2,
  दूसरा: 2,
  तीसरी: 3,
  तीसरा: 3,
};
const EN_ONES: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
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

const EN_DAY: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
  eleventh: 11,
  twelfth: 12,
  thirteenth: 13,
  fourteenth: 14,
  fifteenth: 15,
  sixteenth: 16,
  seventeenth: 17,
  eighteenth: 18,
  nineteenth: 19,
  twentieth: 20,
  thirtieth: 30,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  thirty: 30,
};

const MONTHS: Record<string, string> = {
  जनवरी: '01',
  january: '01',
  jan: '01',
  फरवरी: '02',
  फ़रवरी: '02',
  february: '02',
  feb: '02',
  मार्च: '03',
  march: '03',
  mar: '03',
  अप्रैल: '04',
  april: '04',
  apr: '04',
  मई: '05',
  may: '05',
  जून: '06',
  june: '06',
  jun: '06',
  जुलाई: '07',
  july: '07',
  jul: '07',
  अगस्त: '08',
  august: '08',
  aug: '08',
  सितंबर: '09',
  सितम्बर: '09',
  september: '09',
  sept: '09',
  sep: '09',
  अक्टूबर: '10',
  अक्तूबर: '10',
  october: '10',
  oct: '10',
  नवंबर: '11',
  नवम्बर: '11',
  november: '11',
  nov: '11',
  दिसंबर: '12',
  दिसम्बर: '12',
  december: '12',
  dec: '12',
};

const MONTH_RE =
  /(?<![\u0900-\u097F])(?:जनवरी|फ़रवरी|फरवरी|मार्च|अप्रैल|मई|जून|जुलाई|अगस्त|सितम्बर|सितंबर|अक्तूबर|अक्टूबर|नवम्बर|नवंबर|दिसम्बर|दिसंबर)(?![\u0900-\u097F])|\b(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)\b/gi;

const DAY_FILLER = new Set([
  'on',
  'the',
  'of',
  'born',
  'birth',
  'date',
  'dob',
  'is',
  'was',
  'मेरी',
  'मेरा',
  'जन्म',
  'तिथि',
  'तारीख',
  'तारीख़',
  'दिनांक',
  'को',
  'है',
  'की',
]);

const YEAR_FILLER = new Set([
  'को',
  'में',
  'की',
  'का',
  'के',
  'सन',
  'साल',
  'year',
  'of',
  'है',
  'the',
  'in',
  'on',
]);

function tokenize(text: string): string[] {
  // Danda । is inside the Devanagari block, so it must be split out before the word scan.
  const cleaned = text.replace(/[।॥॰]/g, ' ');
  return cleaned.split(/[^0-9A-Za-z\u0900-\u097F]+/).filter(Boolean);
}

function normHi(word: string): string {
  return word.replace(/(वीं|वाँ|वां)$/u, '');
}

function hiSmall(word: string): number | null {
  const n = HI_SMALL[normHi(word)];
  return n === undefined ? null : n;
}

function digitWord(token: string): string | null {
  return SPOKEN_DIGIT[token] ?? SPOKEN_DIGIT[token.toLowerCase()] ?? null;
}

function takeMobile(run: string): string | null {
  if (/^[6-9]\d{9}$/.test(run)) return run;
  if (/^91[6-9]\d{9}$/.test(run)) return run.slice(2);
  if (/^0[6-9]\d{9}$/.test(run)) return run.slice(1);
  return null;
}

/**
 * Mobile from ASCII, Devanagari digits, spaced digits, or Hindi/English digit-words.
 * A run must be exactly 10 digits (or 91 + 10). Longer globs are ignored.
 */
export function extractSpokenMobile(text: string): string | null {
  const tokens = tokenize(foldDevanagariDigits(text));
  let spoken = '';
  let groups = '';
  let repeat = 1;

  const flushSpoken = (): string | null => {
    const found = takeMobile(spoken);
    spoken = '';
    return found;
  };
  const flushGroups = (): string | null => {
    const found = takeMobile(groups);
    groups = '';
    return found;
  };

  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (REPEAT_WORD[lower] || REPEAT_WORD[token]) {
      repeat = REPEAT_WORD[lower] ?? REPEAT_WORD[token];
      continue;
    }
    if (/^[6-9]\d{9}$/.test(token)) return token;
    if (/^91[6-9]\d{9}$/.test(token)) return token.slice(2);

    const spokenDigit = digitWord(token);
    if (spokenDigit) {
      const glued = flushGroups();
      if (glued) return glued;
      spoken += spokenDigit.repeat(repeat);
      repeat = 1;
      continue;
    }
    if (/^\d$/.test(token)) {
      const glued = flushGroups();
      if (glued) return glued;
      spoken += token.repeat(repeat);
      repeat = 1;
      continue;
    }
    if (/^\d{2,9}$/.test(token)) {
      const said = flushSpoken();
      if (said) return said;
      const next = groups + token;
      groups = next.length > 12 ? token : next;
      const joined = takeMobile(groups);
      if (joined && groups.length >= 10) return joined;
      repeat = 1;
      continue;
    }

    const said = flushSpoken();
    if (said) return said;
    const glued = flushGroups();
    if (glued) return glued;
    repeat = 1;
  }
  return flushSpoken() ?? flushGroups();
}
function digitsAfterCue(tail: string, exact: number): string | null {
  const tokens = tokenize(foldDevanagariDigits(tail));
  const fillers = new Set(['is', 'number', 'no', 'code', 'नंबर', 'नम्बर', 'है', 'हैं', 'कोड']);
  let i = 0;
  while (i < tokens.length && fillers.has(tokens[i].toLowerCase())) i++;
  let run = '';
  let repeat = 1;
  for (; i < tokens.length; i++) {
    const token = tokens[i];
    const lower = token.toLowerCase();
    if ((REPEAT_WORD[lower] || REPEAT_WORD[token]) && run.length === 0) {
      repeat = REPEAT_WORD[lower] ?? REPEAT_WORD[token];
      continue;
    }
    const spokenDigit = digitWord(token);
    if (spokenDigit) run += spokenDigit.repeat(repeat);
    else if (/^\d+$/.test(token)) run += token;
    else if (run.length === 0 && fillers.has(lower)) continue;
    else break;
    repeat = 1;
    if (run.length === exact) return run;
    if (run.length > exact) return null;
  }
  return run.length === exact ? run : null;
}

function extractSpokenPin(text: string): string | null {
  const cue =
    /(?:\bpin(?:\s*code)?\b|\bpincode\b|(?<![\u0900-\u097F])पिन(?:\s*कोड)?(?![\u0900-\u097F]))/gi;
  let m: RegExpExecArray | null;
  while ((m = cue.exec(text))) {
    const pin = digitsAfterCue(text.slice(m.index + m[0].length, m.index + m[0].length + 64), 6);
    if (pin) return pin;
  }
  return null;
}

function dayAt(tokens: string[], index: number): { day: number; used: number } | null {
  const token = tokens[index];
  if (!token) return null;
  const lower = token.toLowerCase();
  const next = tokens[index + 1]?.toLowerCase() ?? '';
  if (lower === 'twenty' || lower === 'thirty') {
    const base = lower === 'thirty' ? 30 : 20;
    const ones = next === 'first' ? 1 : EN_ONES[next];
    if (ones !== undefined && ones < 10 && base + ones <= 31) return { day: base + ones, used: 2 };
    if (next === 'hundred' || next === 'ninety' || next === 'thousand') return null;
  }
  const prev = index > 0 ? tokens[index - 1].toLowerCase() : '';
  if ((lower === 'first' || EN_ONES[lower] !== undefined) && (prev === 'twenty' || prev === 'thirty')) {
    const base = prev === 'thirty' ? 30 : 20;
    const ones = lower === 'first' ? 1 : EN_ONES[lower];
    if (ones < 10 && base + ones <= 31) return { day: base + ones, used: 2 };
  }
  const ordinal = token.match(/^(\d{1,2})(?:st|nd|rd|th)?$/i);
  if (ordinal) {
    const day = Number(ordinal[1]);
    if (day >= 1 && day <= 31) return { day, used: 1 };
  }
  if (EN_DAY[lower] !== undefined && EN_DAY[lower] <= 31 && lower !== 'two') {
    return { day: EN_DAY[lower], used: 1 };
  }
  if (lower === 'two') return { day: 2, used: 1 };
  const hi = hiSmall(token);
  if (hi !== null && hi >= 1 && hi <= 31) return { day: hi, used: 1 };
  return null;
}

function parseDayBefore(before: string): number | null {
  const tokens = tokenize(before).slice(-6);
  let i = tokens.length - 1;
  while (i >= 0 && DAY_FILLER.has(tokens[i].toLowerCase())) i--;
  if (i < 0) return null;
  const lower = tokens[i].toLowerCase();
  if (lower === 'nineteen' || lower === 'thousand' || lower === 'hundred') return null;
  if (lower === 'two' && tokens[i + 1]?.toLowerCase() === 'thousand') return null;
  return dayAt(tokens, i)?.day ?? null;
}

function parseLeadingDay(tokens: string[]): { day: number; rest: string[] } | null {
  let i = 0;
  while (i < tokens.length && (DAY_FILLER.has(tokens[i].toLowerCase()) || YEAR_FILLER.has(tokens[i].toLowerCase()))) {
    i++;
  }
  if (i >= tokens.length) return null;
  const lower = tokens[i].toLowerCase();
  if (lower === 'nineteen' || lower === 'thousand' || lower === 'hundred') return null;
  if (lower === 'two' && tokens[i + 1]?.toLowerCase() === 'thousand') return null;
  const parsed = dayAt(tokens, i);
  if (!parsed) return null;
  const forward = lower === 'twenty' || lower === 'thirty';
  const step = forward ? parsed.used : 1;
  return { day: parsed.day, rest: tokens.slice(i + step) };
}

function parseEnglishYear(phrase: string): number | null {
  const t = phrase.toLowerCase().replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
  const tens: Record<string, number> = {
    twenty: 20,
    thirty: 30,
    forty: 40,
    fifty: 50,
    sixty: 60,
    seventy: 70,
    eighty: 80,
    ninety: 90,
  };
  let m = t.match(
    /^nineteen(?:\s+hundred)?(?:\s+(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety))?(?:\s+(one|two|three|four|five|six|seven|eight|nine))?(?:\s|$)/,
  );
  if (m && (m[1] || m[2] || /nineteen\s+hundred/.test(t))) {
    let y = 1900;
    if (m[1]) y += tens[m[1]];
    if (m[2]) y += EN_ONES[m[2]];
    if (y >= 1900 && y <= 1999) return y;
  }
  m = t.match(
    /^two\s+thousand(?:\s+and)?(?:\s+(twenty|thirty))?(?:\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve))?(?:\s|$)/,
  );
  if (m) {
    let y = 2000;
    if (m[1]) y += tens[m[1]];
    if (m[2]) y += EN_ONES[m[2]];
    if (y >= 2000 && y <= 2099) return y;
  }
  return null;
}

function parseHindiYear(phrase: string): number | null {
  const t = phrase.replace(/\s+/g, ' ').trim();
  let m = t.match(/^उन्नीस\s*सौ(?=\s|$)/);
  if (m) {
    const rest = t.slice(m[0].length).trim();
    if (!rest) return 1900;
    const word = rest.split(/\s+/)[0];
    const n = hiSmall(word);
    if (n === null) return YEAR_FILLER.has(word) ? 1900 : null;
    if (n > 99) return null;
    return 1900 + n;
  }
  m = t.match(/^दो\s*ह(?:जार|ज़ार|ज़ार)(?=\s|$)/);
  if (m) {
    const rest = t.slice(m[0].length).trim();
    if (!rest) return 2000;
    const word = rest.split(/\s+/)[0];
    const n = hiSmall(word);
    if (n === null) return YEAR_FILLER.has(word) ? 2000 : null;
    if (n > 99) return null;
    return 2000 + n;
  }
  return null;
}

function parseYearTokens(tokens: string[]): number | null {
  let i = 0;
  while (i < tokens.length && YEAR_FILLER.has(tokens[i].toLowerCase())) i++;
  if (i >= tokens.length) return null;
  if (/^\d{4}$/.test(tokens[i])) {
    const y = Number(tokens[i]);
    return y >= 1900 && y <= 2100 ? y : null;
  }
  const phrase = tokens.slice(i, i + 5).join(' ');
  return parseHindiYear(phrase) ?? parseEnglishYear(phrase);
}

function isoDate(year: number, month: string, day: number): string | null {
  const mm = Number(month);
  if (mm < 1 || mm > 12 || day < 1 || day > 31) return null;
  return `${year}-${month}-${String(day).padStart(2, '0')}`;
}

function parseNumericDob(text: string): string | null {
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    if (year >= 1900 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${iso[1]}-${iso[2]}-${iso[3]}`;
    }
  }
  const slash = text.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})\b/);
  if (slash) {
    const day = Number(slash[1]);
    const month = Number(slash[2]);
    const year = Number(slash[3]);
    if (year >= 1900 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${slash[3]}-${slash[2].padStart(2, '0')}-${slash[1].padStart(2, '0')}`;
    }
  }
  const spaced = text.match(/\b(\d{1,2})\s+(\d{1,2})\s+(\d{4})\b/);
  if (spaced) {
    const day = Number(spaced[1]);
    const month = Number(spaced[2]);
    const year = Number(spaced[3]);
    if (year >= 1900 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${spaced[3]}-${spaced[2].padStart(2, '0')}-${spaced[1].padStart(2, '0')}`;
    }
  }
  return null;
}

/** Month-name, spoken Hindi/English, slash, ISO, and spaced day-month-year. */
export function parseFlexibleDob(text: string): string | null {
  const src = foldDevanagariDigits(text);
  const re = new RegExp(MONTH_RE.source, 'gi');
  let match: RegExpExecArray | null;
  while ((match = re.exec(src))) {
    const month = MONTHS[match[0].toLowerCase()];
    if (!month) continue;
    const before = src.slice(Math.max(0, match.index - 48), match.index);
    const after = src.slice(match.index + match[0].length, match.index + match[0].length + 48);
    let day = parseDayBefore(before);
    let year = parseYearTokens(tokenize(after));
    if (day === null) {
      const leading = parseLeadingDay(tokenize(after));
      if (leading) {
        day = leading.day;
        year = parseYearTokens(leading.rest);
      }
    }
    if (day !== null && year !== null) {
      const iso = isoDate(year, month, day);
      if (iso) return iso;
    }
  }
  return parseNumericDob(src);
}
export function extractHindiSlots(text: string): Record<string, SlotValue> {
  const out: Record<string, SlotValue> = {};
  const t = text.toLowerCase();

  if (/डेबिट\s*कार्ड|एटीएम\s*कार्ड|debit\s*card|atm\s*card/.test(text) || /कार्ड\s*(खो|चोरी|गुम)/.test(text)) {
    out.journey_mode = 'debit_reissue';
  } else if (/री[-\s]?के(?:वाई|वाइ)सी|रीकेवाईसी/.test(text)) {
    out.journey_mode = 'rekyc';
  } else if (/केवाईसी|केवाइसी/.test(text) || /केवाईसी\s*अपडेट/.test(text)) {
    out.journey_mode = 'kyc_update';
  } else if (
    /खाता\s*खोल|नया खाता|बचत खाता|सेविंग्स खाता/.test(text) ||
    /khata\s*khol|naya\s+khata|bachat\s+khata|savings\s+khata/.test(t)
  ) {
    out.journey_mode = 'account_opening';
  }

  const name = takeName(
    text,
    /(?:मेरा पूरा नाम|मेरा नाम|mera poora naam|mera naam|mera name)\s+(.+?)(?:\s+है|\s+हैं|\s+hai\b|\s+hain\b|[।,.]|$)/i,
  );
  if (name) out.applicant_full_name = name;

  const father = takeName(
    text,
    /(?:पिता का नाम|पिताजी का नाम|पति का नाम|pita ka naam|pati ka naam)\s+(.+?)(?:\s+है|\s+hai\b|[।,.]|$)/i,
  );
  if (father) out.father_or_spouse_name = father;

  if (/महिला|स्त्री/.test(text) || /\bmahila\b|\bstree\b/.test(t)) out.gender = 'female';
  else if (/पुरुष/.test(text) || /\bpurush\b/.test(t)) out.gender = 'male';

  if (/भारतीय/.test(text) || /\bbharatiya\b/.test(t)) out.nationality = 'Indian';
  if (/निवासी/.test(text) || /\bnivasi\b/.test(t)) out.residential_status = 'resident_individual';

  if (/पैन\s*नह|बिना पैन/.test(text) || /pan\s+nahi|pan\s+nahin/.test(t)) {
    out.pan_available = false;
    out.form60_declared = true;
  } else if (/मेरे पास पैन|पैन है|mere paas pan|paas pan hai/.test(text) || /mere paas pan|paas pan hai/.test(t)) {
    out.pan_available = true;
  }

  if (/सैलरी/.test(text) && /खाता|अकाउंट|account/.test(text)) out.account_product_intent = 'salary_savings';
  else if (/बीएसबीडीए|बेसिक सेविंग्स/.test(text)) out.account_product_intent = 'bsbda';
  else if (/करंट खाता/.test(text)) out.account_product_intent = 'individual_current';
  else if (/बचत खाता|सेविंग्स खाता|नियमित बचत|रेगुलर सेविंग्स/.test(text))
    out.account_product_intent = 'regular_savings';

  for (const p of PLACES) {
    if (!p.re.test(text)) continue;
    if (p.city && out.addr_current_city === undefined) out.addr_current_city = p.city;
    if (p.state && out.addr_current_state === undefined) out.addr_current_state = p.state;
  }

  const chunk = addressChunk(text);
  if (chunk) {
    const pin = chunk.match(/\b(\d{6})\b/);
    if (pin) out.addr_current_pin = pin[1];
    for (const p of PLACES) {
      if (!p.re.test(chunk)) continue;
      if (p.city) out.addr_current_city = p.city;
      if (p.state) out.addr_current_state = p.state;
    }
    const line = stripPlaces(chunk);
    if (line.length >= 3) out.addr_current_line1 = line;
  }

  if (/पासपोर्ट/.test(text)) out.ovd_poi_type = 'passport';
  else if (/ड्राइविंग\s*ला[इी]से(?:न्स|ंस)|चालक\s*ला[इी]से(?:न्स|ंस)/.test(text))
    out.ovd_poi_type = 'driving_licence';
  else if (/आधार/.test(text)) {
    out.ovd_poi_type = 'proof_of_possession_of_aadhaar';
    out.aadhaar_voluntary_consent = true;
  } else if (/वोटर|मतदाता/.test(text)) out.ovd_poi_type = 'voter_id';
  else if (/नरेगा|मनरेगा/.test(text)) out.ovd_poi_type = 'nrega_job_card';
  else if (/एनपीआर/.test(text)) out.ovd_poi_type = 'npr_letter';

  if (/स्थायी पता (?:भी )?वही|स्थायी पता वर्तमान|स्थायी और वर्तमान एक|sthayi pata (?:bhi )?wahi/.test(text))
    out.addr_permanent_same_as_current = true;
  else if (/स्थायी पता अलग|sthayi pata alag/.test(text)) out.addr_permanent_same_as_current = false;

  if (/पते का प्रमाण वही|पता प्रमाण वही|वही दस्तावेज़ पता/.test(text))
    out.ovd_poa_same_as_poi = true;

  if (/फोटो की सहमति|फोटोग्राफ की सहमति|photo ki sahmati/.test(text)) out.photo_consent = true;
  if (/मूल दस्तावे|मूल दिखा|mool dastavez|mool dastaavez/.test(text)) out.ovd_originals_ack = true;

  if (/नया ग्राहक|पहली बार|naya grahak/.test(text)) out.existing_bank_customer = false;
  else if (/मौजूदा ग्राहक|पहले से ग्राहक|pehle se grahak/.test(text))
    out.existing_bank_customer = true;

  if (/नौकरी|कर्मचारी|सैलरी पाने/.test(text)) out.occupation_bucket = 'salaried';
  else if (/खुद का काम|व्यवसाय/.test(text)) out.occupation_bucket = 'self_employed';
  else if (/छात्र/.test(text)) out.occupation_bucket = 'student';
  else if (/गृहिणी/.test(text)) out.occupation_bucket = 'homemaker';
  else if (/सेवानिवृत्त/.test(text)) out.occupation_bucket = 'retired';

  if (/राजनीतिक रूप से उजागर नहीं|पीईपी नहीं|pep\s*नहीं/i.test(text) || /\bpep\s+nahi\b/.test(t))
    out.pep_declaration = false;
  else if (/राजनीतिक रूप से उजागर हूँ|राजनीतिक रूप से उजागर हूं|मैं पीईपी/.test(text))
    out.pep_declaration = true;

  if (/केवल भारत|सिर्फ भारत|कर के लिए केवल भारत/.test(text)) out.tax_resident_india_only = true;

  if (/एचडीएफसी/.test(text)) out.bank_hint = 'HDFC';
  else if (/एसबीआई/.test(text)) out.bank_hint = 'SBI';
  else if (/आईसीआईसीआई|आईसीआईसीआई/.test(text)) out.bank_hint = 'ICICI';

  if (/सही है|ठीक है|पुष्टि कर/.test(text) || /\bsahi hai\b/.test(t)) out.readback_confirmed = true;
  if (/केवल ड्राफ्ट|सिर्फ ड्राफ्ट|ड्राफ्ट ही/.test(text) || /\bkeval draft\b|\bsirf draft\b/.test(t))
    out.draft_only_ack = true;
  if (
    /लाइव जमा नहीं|बैंक को नहीं भेज|बैंक में जमा नहीं|बैंक को मत भेज/.test(text) ||
    /live jama nahi|bank ko mat bhej/.test(t)
  ) {
    out.no_live_submit_ack = true;
  }

  if (out.dob === undefined) {
    const dob = parseFlexibleDob(text);
    if (dob) out.dob = dob;
  }
  if (out.mobile_registered === undefined) {
    const mobile = extractSpokenMobile(text);
    if (mobile) out.mobile_registered = mobile;
  }
  if (out.addr_current_pin === undefined) {
    const pin = extractSpokenPin(text);
    if (pin) out.addr_current_pin = pin;
  }

  return out;
}

export function hindiWantsLiveSubmit(text: string): boolean {
  if (/जमा नहीं|नहीं भेज|मत भेज|nahi jama|mat bhej|nahin bhej/.test(text.toLowerCase())) return false;
  return /बैंक\s*(?:में|को)\s*(?:जमा|भेज)|लाइव\s*(?:जमा|सबमिट)|बैंक में सबमिट/.test(text);
}

export function hindiExcluded(text: string): boolean {
  return /नामांकन|नॉमिनी|नोमिनी|नामिनी|ऋण/.test(text) || /(?:^|[\s।,])लोन(?:[\s।,]|$)/.test(text);
}
