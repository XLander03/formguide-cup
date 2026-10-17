import { isRegionalLanguage, regionalReadbackFollowup, type RegionalLanguage } from './readbackI18n';

/** Cup shell language: Hindi + English. Regional read-back copy lives in readbackI18n. */

export type UtteranceLang = 'en' | 'hi' | 'mixed';

/** Language of a read-back script: the en/hi/mixed copy, or one regional language. */
export type ReadbackLang = UtteranceLang | RegionalLanguage;

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

/**
 * English questions keyed by schema field id, kept in step with EN_ASK in the speak
 * function. Used when the local extractor asks next, instead of a bare field label.
 */
export const EN_FIELD_ASK: Record<string, string> = {
  journey_mode: 'What would you like to do today: open a new account, update your KYC details, or do your periodic re-KYC?',
  applicant_full_name: 'What is your full name, exactly as it is printed on your ID card?',
  father_or_spouse_name: "What is your father's full name? If you are married, you can give your spouse's name instead.",
  dob: 'What is your date of birth? Please say the day, month and year, for example 12 March 1994.',
  residential_status: 'Do you live in India and hold Indian residency, or are you a non-resident (NRI)?',
  pan_available: "Do you have a PAN card? If you don't, that's fine, we will note Form 60 instead.",
  mobile_registered: 'What is your 10-digit mobile number? The bank will send updates and OTPs to it.',
  addr_current_line1: 'What is your current address? Start with the house or flat number and the street.',
  addr_current_city: 'Which city or town is that address in?',
  addr_current_state: 'Which state is that in?',
  addr_current_pin: 'What is the 6-digit PIN code of that address?',
  addr_permanent_same_as_current: 'Is your permanent address the same as the address you just gave, or is it different?',
  ovd_poi_type: 'Which ID will you show as proof of identity: passport, driving licence, Aadhaar, voter ID, NREGA job card, or NPR letter?',
  ovd_poi_number: 'What is the number printed on that ID?',
  ovd_poa_same_as_poi: 'Does that same ID also show your current address, so it can be your address proof?',
  photo_consent: 'The bank keeps a recent photograph with your form. Is it okay to take or attach one?',
  ovd_originals_ack: 'When you visit the branch, will you bring the original ID so the staff can check it?',
  existing_bank_customer: 'Do you already have an account with this bank, or will you be a new customer?',
  pep_declaration: 'Do you, or a close family member, hold a senior government or political position, such as a minister, MP, MLA, judge or senior officer?',
  tax_resident_india_only: 'Do you pay tax only in India, or are you also a tax resident of another country?',
  pan_number: 'What is your PAN number? It is 10 characters: 5 letters, 4 digits and 1 letter.',
  form60_declared: 'Since you do not have a PAN, shall I note that you will fill Form 60 instead?',
  account_product_intent: 'Which account would you like: a regular savings account, a salary account, a basic savings account with zero balance, or a current account?',
  customer_id_cif: 'What is your customer ID, also called CIF? It is on your passbook or cheque book. You can skip this if you do not have it.',
  card_customer_id: 'What is your customer ID? You can find it on your passbook, cheque book or net banking.',
  card_account_number: 'What is the account number this card is linked to?',
  card_last4: 'What are the last 4 digits printed on the card? Please do not say the full card number.',
  card_reason: 'What happened to the card: was it lost, stolen, damaged, or is it something else?',
  card_reason_other: 'In a few words, what is the reason you need a new card?',
  card_reissue_new: 'Would you like the bank to send you a new card to replace this one?',
};

/** Hindi prompts keyed by schema field id. English copy stays in the schema. */
export const HI_FIELD_ASK: Record<string, string> = {
  journey_mode: 'आज आप क्या करना चाहते हैं: नया खाता खोलना, केवाईसी विवरण अपडेट करना, या री-केवाईसी?',
  applicant_full_name: 'आपका पूरा नाम क्या है? ठीक वैसे बताइए जैसा आपके पहचान पत्र पर छपा है।',
  dob: 'आपकी जन्म तिथि क्या है? दिन, महीना और साल बताइए, जैसे 12 मार्च 1994।',
  residential_status: 'क्या आप भारत में रहते हैं और भारत के निवासी हैं, या आप अनिवासी (NRI) हैं?',
  pan_available: 'क्या आपके पास पैन कार्ड है? अगर नहीं है तो कोई बात नहीं, हम फॉर्म 60 दर्ज कर देंगे।',
  mobile_registered: 'आपका दस अंकों का मोबाइल नंबर क्या है? बैंक इसी पर जानकारी और OTP भेजेगा।',
  addr_current_line1: 'आपका वर्तमान पता क्या है? मकान या फ़्लैट नंबर और गली से शुरू कीजिए।',
  addr_current_city: 'यह पता किस शहर या कस्बे में है?',
  addr_current_state: 'यह किस राज्य में है?',
  addr_current_pin: 'इस पते का छह अंकों का पिन कोड क्या है?',
  addr_permanent_same_as_current: 'क्या आपका स्थायी पता यही है, या अलग है?',
  ovd_poi_type: 'पहचान के प्रमाण के लिए कौन सा दस्तावेज़ दिखाएँगे: पासपोर्ट, ड्राइविंग लाइसेंस, आधार, वोटर आईडी, नरेगा जॉब कार्ड, या एनपीआर पत्र?',
  ovd_poi_number: 'उस दस्तावेज़ पर छपा नंबर क्या है?',
  ovd_poa_same_as_poi: 'क्या उसी दस्तावेज़ पर आपका वर्तमान पता भी है, ताकि वही पते का प्रमाण बन सके?',
  photo_consent: 'बैंक फॉर्म के साथ आपकी एक हाल की फोटो रखता है। क्या फोटो लेना या लगाना ठीक है?',
  ovd_originals_ack: 'शाखा आते समय क्या आप मूल दस्तावेज़ साथ लाएँगे, ताकि स्टाफ़ उसे जाँच सके?',
  existing_bank_customer: 'क्या इस बैंक में आपका पहले से खाता है, या आप नए ग्राहक होंगे?',
  pep_declaration: 'क्या आप या आपके परिवार का कोई करीबी सदस्य किसी बड़े सरकारी या राजनीतिक पद पर है, जैसे मंत्री, सांसद, विधायक, जज या वरिष्ठ अधिकारी?',
  tax_resident_india_only: 'क्या आप केवल भारत में टैक्स देते हैं, या किसी और देश में भी टैक्स निवासी हैं?',
  pan_number: 'आपका पैन नंबर क्या है? इसमें 10 अक्षर होते हैं: 5 अक्षर, 4 अंक और 1 अक्षर।',
  form60_declared: 'आपके पास पैन नहीं है, तो क्या मैं दर्ज करूँ कि आप फॉर्म 60 भरेंगे?',
  account_product_intent: 'आप कौन सा खाता चाहते हैं: रेगुलर सेविंग्स, सैलरी खाता, ज़ीरो बैलेंस वाला बेसिक सेविंग्स खाता, या करंट खाता?',
  customer_id_cif: 'आपकी ग्राहक आईडी, यानी CIF, क्या है? यह पासबुक या चेक बुक पर होती है। न हो तो छोड़ सकते हैं।',
  card_customer_id: 'आपकी ग्राहक आईडी क्या है? यह पासबुक, चेक बुक या नेट बैंकिंग में मिलेगी।',
  card_account_number: 'यह कार्ड किस खाता संख्या से जुड़ा है?',
  card_last4: 'कार्ड पर छपे आखिरी चार अंक क्या हैं? कृपया पूरा कार्ड नंबर न बोलें।',
  card_reason: 'कार्ड के साथ क्या हुआ: खो गया, चोरी हुआ, खराब हो गया, या कुछ और?',
  card_reason_other: 'कुछ शब्दों में बताइए, नया कार्ड क्यों चाहिए?',
  card_reissue_new: 'क्या आप चाहते हैं कि बैंक इसकी जगह नया कार्ड भेजे?',
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
  father_or_spouse_name: 'आपके पिता का पूरा नाम क्या है? अगर आप विवाहित हैं, तो पति या पत्नी का नाम भी बता सकते हैं।',
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
  'What is your customer ID, account number, and the last 4 digits of the card?':
    'ग्राहक आईडी, खाता संख्या, और कार्ड के आखिरी चार अंक बताएं।',
  'Was the card lost or misplaced, stolen, damaged, or something else?':
    'कार्ड खोया या गुम, चोरी, खराब, या कोई और कारण?',
  'What should we write for the other reason?': 'अन्य कारण क्या लिखें?',
  'Should we reissue a new card?': 'क्या नया कार्ड जारी करें?',
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

export function readbackFollowup(lang: ReadbackLang): string {
  if (isRegionalLanguage(lang)) return regionalReadbackFollowup(lang);
  if (lang === 'en') return EN_READBACK_FOLLOWUP;
  if (lang === 'mixed') return `${HI_READBACK_FOLLOWUP} ${EN_READBACK_FOLLOWUP}`;
  return HI_READBACK_FOLLOWUP;
}
