/** Hindi words for read-back so hi-IN voices read digits one by one and dates naturally. */

const HI_0_99 = [
  'शून्य', 'एक', 'दो', 'तीन', 'चार', 'पाँच', 'छह', 'सात', 'आठ', 'नौ',
  'दस', 'ग्यारह', 'बारह', 'तेरह', 'चौदह', 'पंद्रह', 'सोलह', 'सत्रह', 'अठारह', 'उन्नीस',
  'बीस', 'इक्कीस', 'बाईस', 'तेईस', 'चौबीस', 'पच्चीस', 'छब्बीस', 'सत्ताईस', 'अट्ठाईस', 'उनतीस',
  'तीस', 'इकतीस', 'बत्तीस', 'तैंतीस', 'चौंतीस', 'पैंतीस', 'छत्तीस', 'सैंतीस', 'अड़तीस', 'उनतालीस',
  'चालीस', 'इकतालीस', 'बयालीस', 'तैंतालीस', 'चौवालीस', 'पैंतालीस', 'छियालीस', 'सैंतालीस', 'अड़तालीस', 'उनचास',
  'पचास', 'इक्यावन', 'बावन', 'तिरपन', 'चौवन', 'पचपन', 'छप्पन', 'सत्तावन', 'अट्ठावन', 'उनसठ',
  'साठ', 'इकसठ', 'बासठ', 'तिरसठ', 'चौंसठ', 'पैंसठ', 'छियासठ', 'सड़सठ', 'अड़सठ', 'उनहत्तर',
  'सत्तर', 'इकहत्तर', 'बहत्तर', 'तिहत्तर', 'चौहत्तर', 'पचहत्तर', 'छिहत्तर', 'सतहत्तर', 'अठहत्तर', 'उन्यासी',
  'अस्सी', 'इक्यासी', 'बयासी', 'तिरासी', 'चौरासी', 'पचासी', 'छियासी', 'सत्तासी', 'अठासी', 'नवासी',
  'नब्बे', 'इक्यानवे', 'बानवे', 'तिरानवे', 'चौरानवे', 'पचानवे', 'छियानवे', 'सत्तानवे', 'अट्ठानवे', 'निन्यानवे',
];

const HI_MONTHS = [
  'जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून',
  'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर',
];

/** 0–99 as a Hindi word; other values stay as digits. */
export function hindiNumber(n: number): string {
  return Number.isInteger(n) && n >= 0 && n < 100 ? HI_0_99[n] : String(n);
}

/** “3210” → “तीन दो एक शून्य”. Non-digits are dropped. */
export function hindiDigits(value: string): string {
  return [...value]
    .filter((ch) => /\d/.test(ch))
    .map((ch) => HI_0_99[Number(ch)])
    .join(' ');
}

/** 1994 → “उन्नीस सौ चौरानवे”, 2001 → “दो हज़ार एक”. */
export function hindiYear(year: number): string {
  if (year >= 1900 && year <= 1999) {
    const rest = year - 1900;
    return rest ? `उन्नीस सौ ${HI_0_99[rest]}` : 'उन्नीस सौ';
  }
  if (year >= 2000 && year <= 2099) {
    const rest = year - 2000;
    return rest ? `दो हज़ार ${HI_0_99[rest]}` : 'दो हज़ार';
  }
  return hindiDigits(String(year));
}

/** “1994-03-12” → “बारह मार्च उन्नीस सौ चौरानवे”. Null when not an ISO date. */
export function hindiDate(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${HI_0_99[day]} ${HI_MONTHS[month - 1]} ${hindiYear(year)}`;
}
