/** Cup shell language: Hindi + English. Regional languages are out of this slice. */

export type UtteranceLang = 'en' | 'hi' | 'mixed';

const DEVANAGARI = /[\u0900-\u097F]/;

/** Tokens that are IDs or labels, not an English clause. */
const LATIN_TOKEN =
  /^(?:pan|dob|pin|cif|kyc|aof|ovd|bsbda|neft|rtgs|imps|hdfc|sbi|icici|npr|pep|form|dl|id|no)$/i;

export function detectUtteranceLang(text: string): UtteranceLang {
  if (!DEVANAGARI.test(text)) return 'en';
  const stripped = text
    .replace(/[\u0900-\u097F]+/g, ' ')
    .replace(/\b[A-Z]{5}\d{4}[A-Z]\b/gi, ' ')
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, ' ')
    .replace(/\b(?:\+?91[\s-]?)?[6-9]\d{9}\b/g, ' ')
    .replace(/\b[A-Z]{2}\d{2,}[A-Z0-9]*\b/gi, ' ')
    .replace(/\b\d+\b/g, ' ');
  const words = stripped.match(/\b[A-Za-z]{4,}\b/g) ?? [];
  const englishish = words.filter((w) => !LATIN_TOKEN.test(w));
  return englishish.length > 0 ? 'mixed' : 'hi';
}

export type MicLang = 'en-IN' | 'hi-IN';

/**
 * Read-back follows the mic. हिन्दी forces a Hindi script even for an English
 * persona such as Priya Sharma. English mic keeps the utterance language.
 */
export function readbackLanguage(mic: MicLang, utterance: UtteranceLang): UtteranceLang {
  if (mic === 'hi-IN') return 'hi';
  return utterance;
}

export function preferredLanguageLabel(lang: UtteranceLang): 'English' | 'Hindi' | 'Hindi+English' {
  if (lang === 'hi') return 'Hindi';
  if (lang === 'mixed') return 'Hindi+English';
  return 'English';
}

/** Hindi prompts keyed by schema field id. English copy stays in the schema. */
export const HI_FIELD_ASK: Record<string, string> = {
  journey_mode: 'आप खाता खोलना चाहते हैं, केवाईसी अपडेट, या री-केवाईसी?',
  applicant_full_name: 'कृपया अपना पूरा नाम बताएं, जैसा पहचान पत्र पर है।',
  dob: 'जन्म तिथि बताएं — दिन, महीना और साल।',
  residential_status: 'क्या आप भारत के निवासी व्यक्ति हैं?',
  pan_available: 'क्या आपके पास पैन है, या बिना पैन के फॉर्म 60 नोट करें?',
  mobile_registered: 'रजिस्टर्ड मोबाइल नंबर बताएं, दस अंक।',
  addr_current_line1: 'वर्तमान पते की पहली पंक्ति बताएं।',
  addr_current_city: 'वर्तमान शहर या कस्बा बताएं।',
  addr_current_state: 'वर्तमान राज्य या केंद्र शासित प्रदेश बताएं।',
  addr_current_pin: 'वर्तमान पते का छह अंकों का पिन कोड बताएं।',
  addr_permanent_same_as_current: 'क्या स्थायी पता वर्तमान पते जैसा ही है?',
  ovd_poi_type:
    'पहचान के लिए कौन सा दस्तावेज़ देंगे — पासपोर्ट, ड्राइविंग लाइसेंस, आधार का प्रमाण, वोटर आईडी, नरेगा जॉब कार्ड, या एनपीआर पत्र?',
  ovd_poi_number: 'उस पहचान दस्तावेज़ का नंबर बताएं।',
  ovd_poa_same_as_poi: 'क्या पते का प्रमाण वही दस्तावेज़ है?',
  photo_consent: 'क्या आप फोटो की सहमति देते हैं?',
  ovd_originals_ack: 'क्या आप मूल दस्तावेज़ दिखाएँगे?',
  existing_bank_customer: 'क्या आप इस बैंक के मौजूदा ग्राहक हैं, या नए हैं?',
  pep_declaration: 'क्या आप राजनीतिक रूप से उजागर व्यक्ति (PEP) हैं?',
  tax_resident_india_only: 'क्या आप कर के लिए केवल भारत के निवासी हैं?',
  pan_number: 'पैन नंबर बताएं।',
  form60_declared: 'पैन नहीं है — क्या फॉर्म 60 दर्ज करें?',
  account_product_intent:
    'यह रेगुलर सेविंग्स, सैलरी, बेसिक सेविंग्स (BSBDA), या व्यक्तिगत करंट खाता है? उत्पाद के नाम बैंक के अनुसार बदलते हैं।',
  customer_id_cif: 'अगर पास हो तो ग्राहक आईडी या CIF बताएं।',
  addr_permanent_line1: 'स्थायी पते की पहली पंक्ति बताएं।',
  addr_permanent_city: 'स्थायी पते का शहर बताएं।',
  addr_permanent_state: 'स्थायी पते का राज्य बताएं।',
  addr_permanent_pin: 'स्थायी पते का पिन कोड बताएं।',
  ovd_poa_type: 'पते के प्रमाण का दस्तावेज़ कौन सा है?',
  ovd_poa_number: 'पते के प्रमाण का नंबर बताएं।',
  aadhaar_voluntary_consent: 'क्या आप आधार का स्वैच्छिक उपयोग मानते हैं?',
  readback_confirmed: 'रीड-बैक सुनकर बताएं कि विवरण सही है।',
  draft_only_ack: 'पुष्टि करें कि यह केवल ड्राफ्ट है।',
  no_live_submit_ack: 'पुष्टि करें कि बैंक में लाइव जमा नहीं करना है।',
};

const HI_BY_EN: Record<string, string> = {
  'Do you have a PAN, or should we note Form 60 for no PAN?':
    'क्या आपके पास पैन है, या बिना पैन के फॉर्म 60 नोट करें?',
  'Which officially valid document will you use for identity — passport, driving licence, Aadhaar proof, voter ID, NREGA job card, or NPR letter?':
    'पहचान के लिए कौन सा दस्तावेज़ देंगे — पासपोर्ट, ड्राइविंग लाइसेंस, आधार का प्रमाण, वोटर आईडी, नरेगा जॉब कार्ड, या एनपीआर पत्र?',
  'What is the six-digit PIN code for your current address?':
    'वर्तमान पते का छह अंकों का पिन कोड बताएं।',
  'Is this for a regular savings, salary, basic savings (BSBDA), or individual current account? Exact product names vary by bank.':
    'यह रेगुलर सेविंग्स, सैलरी, बेसिक सेविंग्स (BSBDA), या व्यक्तिगत करंट खाता है? उत्पाद के नाम बैंक के अनुसार बदलते हैं।',
  'What is your customer ID or CIF, if you have it handy?':
    'अगर पास हो तो ग्राहक आईडी या CIF बताएं।',
  'A few required KYC details are still missing. Shall we continue with identity, or jump to your address and documents?':
    'कुछ ज़रूरी केवाईसी विवरण अभी बाकी हैं। पहचान से आगे बढ़ें, या पते और दस्तावेज़ों पर जाएँ?',
  'This demo covers account opening and KYC only. Nomination, NEFT, loans, SCSS, and Form 15G are stretch items for later.':
    'यह डेमो केवल खाता खोलने और केवाईसी के लिए है। नामांकन, NEFT, लोन, SCSS और फॉर्म 15G बाद के लिए हैं।',
};

export function localizeAsk(
  lang: UtteranceLang,
  enAsk: string | null,
  fieldId?: string | null,
): string | null {
  if (!enAsk) return null;
  if (lang === 'en') return enAsk;
  const hi = HI_BY_EN[enAsk] ?? (fieldId ? HI_FIELD_ASK[fieldId] : undefined) ?? enAsk;
  if (lang === 'mixed') {
    if (hi === enAsk) return enAsk;
    return `${hi} ${enAsk}`;
  }
  return hi;
}

export const EN_EXCLUDED_NEXT =
  'This demo covers account opening and KYC only. Nomination, NEFT, loans, SCSS, and Form 15G are stretch items for later.';
export const EN_EXCLUDED_MSG =
  'Out of scope for this MVP schema — staying on AOF + KYC. Fields vary by bank.';
export const EN_LIVE_NEXT =
  'This demo never submits to a bank. I can only save a draft after you confirm read-back and the draft-only acknowledgements.';
export const EN_LIVE_REFUSE =
  'Refusing live bank submit. Draft only — confirm gates required.';

const HI_EXCLUDED_NEXT =
  'यह डेमो केवल खाता खोलने और केवाईसी के लिए है। नामांकन, NEFT, लोन, SCSS और फॉर्म 15G बाद के लिए हैं।';
const HI_EXCLUDED_MSG =
  'यह इस MVP से बाहर है — हम AOF + KYC पर रहेंगे। Fields vary by bank.';
const HI_LIVE_NEXT =
  'यह डेमो कभी बैंक में जमा नहीं करता। रीड-बैक और ड्राफ्ट-ओनली पुष्टि के बाद ही ड्राफ्ट बच सकता है।';
const HI_LIVE_REFUSE =
  'बैंक में लाइव जमा मना है। केवल ड्राफ्ट — पुष्टि वाले गेट चाहिए। Fields vary by bank.';

export function excludedNext(lang: UtteranceLang): string {
  if (lang === 'en') return EN_EXCLUDED_NEXT;
  if (lang === 'mixed') return `${HI_EXCLUDED_NEXT} ${EN_EXCLUDED_NEXT}`;
  return HI_EXCLUDED_NEXT;
}

export function excludedMessage(lang: UtteranceLang): string {
  if (lang === 'en') return EN_EXCLUDED_MSG;
  if (lang === 'mixed') return `${HI_EXCLUDED_MSG} ${EN_EXCLUDED_MSG}`;
  return HI_EXCLUDED_MSG;
}

export function liveNext(lang: UtteranceLang): string {
  if (lang === 'en') return EN_LIVE_NEXT;
  if (lang === 'mixed') return `${HI_LIVE_NEXT} ${EN_LIVE_NEXT}`;
  return HI_LIVE_NEXT;
}

export function liveRefuse(lang: UtteranceLang): string {
  if (lang === 'en') return EN_LIVE_REFUSE;
  if (lang === 'mixed') return `${HI_LIVE_REFUSE} ${EN_LIVE_REFUSE}`;
  return HI_LIVE_REFUSE;
}

export function assistantMessage(
  lang: UtteranceLang,
  updateCount: number,
  nextAsk: string | null,
): string {
  if (lang === 'en') {
    let msg = updateCount
      ? `Updated ${updateCount} field(s) from your utterance.`
      : 'I could not map new fields from that — try name, DOB, PAN, mobile, or address.';
    if (nextAsk) msg += ` ${nextAsk}`;
    return `${msg} Fields vary by bank.`;
  }
  const hi = updateCount
    ? `आपकी बात से ${updateCount} फ़ील्ड अपडेट हुए।`
    : 'इससे नया फ़ील्ड नहीं मिला — नाम, जन्म तिथि, पैन, मोबाइल या पता बोलें।';
  let msg = nextAsk ? `${hi} ${nextAsk}` : hi;
  msg += ' Fields vary by bank.';
  if (lang === 'mixed') {
    const en = updateCount
      ? `Updated ${updateCount} field(s) from your utterance.`
      : 'I could not map new fields from that — try name, DOB, PAN, mobile, or address.';
    msg += ` ${en}`;
  }
  return msg;
}

const HI_ENUM: Record<string, string> = {
  account_opening: 'खाता खोलना',
  kyc_update: 'केवाईसी अपडेट',
  rekyc: 'री-केवाईसी',
  regular_savings: 'रेगुलर सेविंग्स',
  salary_savings: 'सैलरी सेविंग्स',
  bsbda: 'बेसिक सेविंग्स',
  individual_current: 'व्यक्तिगत करंट खाता',
  unspecified_varies_by_bank: 'बैंक के अनुसार',
  passport: 'पासपोर्ट',
  driving_licence: 'ड्राइविंग लाइसेंस',
  proof_of_possession_of_aadhaar: 'आधार का प्रमाण',
  voter_id: 'वोटर आईडी',
  nrega_job_card: 'नरेगा जॉब कार्ड',
  npr_letter: 'एनपीआर पत्र',
};

export function hindiEnumLabel(value: string): string {
  return HI_ENUM[value] ?? value.replace(/_/g, ' ');
}

export const HINDI_SAMPLE =
  'मैं बचत खाता खोलना चाहती हूँ। मेरा नाम प्रिया शर्मा है। जन्म तिथि 12/03/1994। पैन ABCPS1234D। मोबाइल 9876543210। मैं 14 लेक व्यू, बेंगलुरु, कर्नाटक 560038 में रहती हूँ। मैं भारतीय निवासी हूँ। पहचान के लिए ड्राइविंग लाइसेंस है। स्थायी पता वही है। मैं नया ग्राहक हूँ। मैं PEP नहीं हूँ। कर के लिए केवल भारत।';

export const MIXED_SAMPLE =
  'I want to open a savings account. मेरा नाम Ananya Reddy है, DOB 15/08/1992, PAN ABCDE1234F, mobile 9876501234. I live at 22 MG Road, Bengaluru, Karnataka 560001. मैं भारतीय निवासी हूँ।';

export const EN_READBACK_FOLLOWUP =
  'After listening, tick “I reviewed the filled details and corrections”, “I understand this saves a draft only”, and “I understand nothing is submitted to a bank” — or say “confirmed, draft only, no live submit”.';

const HI_READBACK_FOLLOWUP =
  'सुनने के बाद “मैंने भरे गए विवरण और सुधार देख लिए”, “मैं समझता/समझती हूँ कि यह केवल ड्राफ्ट है”, और “मैं समझता/समझती हूँ कि बैंक में कुछ जमा नहीं होगा” पर टिक करें — या बोलें “सही है, केवल ड्राफ्ट, लाइव जमा नहीं”.';

export function readbackFollowup(lang: UtteranceLang): string {
  if (lang === 'en') return EN_READBACK_FOLLOWUP;
  if (lang === 'mixed') return `${HI_READBACK_FOLLOWUP} ${EN_READBACK_FOLLOWUP}`;
  return HI_READBACK_FOLLOWUP;
}

export const EN_TRY_LIVE =
  'Refused: this demo never posts to a bank. Live bank submit is disabled. Save a draft only after confirm gates. Fields vary by bank.';

const HI_TRY_LIVE =
  'मना किया: यह डेमो बैंक को कुछ नहीं भेजता। लाइव जमा बंद है। पुष्टि के बाद केवल ड्राफ्ट। Fields vary by bank.';

export function tryLiveMessage(lang: UtteranceLang): string {
  if (lang === 'en') return EN_TRY_LIVE;
  if (lang === 'mixed') return `${HI_TRY_LIVE} ${EN_TRY_LIVE}`;
  return HI_TRY_LIVE;
}
