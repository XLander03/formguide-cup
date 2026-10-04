/**
 * Heuristic (non-Gemini) extractor for the speak-form-ease field set.
 * Used when GEMINI_API_KEY is absent or the Gemini call fails — same
 * fallback role as functions/src/heuristic.ts plays for aof_kyc_demo_v1.
 *
 * Reuses the schema-agnostic Hindi/English parsing helpers from
 * hiSlots.ts and personName.ts rather than re-deriving digit/date
 * parsing a second time (that duplication was the exact problem on the
 * old aof_kyc_demo_v1 heuristic: functions/src/heuristic.ts vs the
 * web client's copy drifting apart).
 */

import {
  extractSpokenMobile,
  extractSpokenPin,
  foldDevanagariDigits,
  parseFlexibleDob,
  PLACES,
} from './../hiSlots';
import { acceptPersonName } from './../personName';
import { detectUtteranceLang, type UtteranceLang } from './../utteranceLang';
import {
  sfeCompleteness,
  sfeGetMissingRequired,
  SFE_BANK_VARIES_COPY,
  sfeFieldLabel,
  type SfeFormValues,
} from './schema';

export interface SfeExtractResult {
  field_updates: SfeFormValues;
  field_said: Record<string, string>;
  missing_required: string[];
  next_ask: string | null;
  completeness: 'empty' | 'partial' | 'demo_ready';
  reply_lang: UtteranceLang;
  assistant_message: string;
  source: 'heuristic' | 'gemini';
}

const PARKED_RE = /\bnominat|\bnominee\b|\bनामांकन|\bनॉमिनी|\bdebit\s*card\b|\breissue\b|\bpersonal\s*loan\b|\bऋण|लोन|\bfixed\s*deposit\b|\bFD\b|\bNEFT\b|\bRTGS\b|\bIMPS\b/i;

export function sfeHeuristicExtract(
  utterance: string,
  current: SfeFormValues,
): SfeExtractResult {
  const text = utterance.trim();
  const lang = detectUtteranceLang(text);
  const updates: SfeFormValues = {};
  const said: Record<string, string> = {};
  const folded = foldDevanagariDigits(text);

  const parkedHit = text.match(PARKED_RE);
  if (parkedHit) {
    const missing = sfeGetMissingRequired(current);
    return {
      field_updates: {},
      field_said: {},
      missing_required: missing,
      next_ask: 'That form is not part of this demo yet. Working today: account opening, KYC update, Re-KYC.',
      completeness: sfeCompleteness(current),
      reply_lang: lang,
      assistant_message: `That's a later journey, not available yet. ${SFE_BANK_VARIES_COPY}`,
      source: 'heuristic',
    };
  }

  // --- name (English) ---
  // A bare "name is" (without "my"/"I am"/"I'm") would also match
  // "father's name is ..." / "spouse's name is ...", so it is deliberately
  // excluded here rather than used as a fourth alternative. "I am ..." is
  // also how gender/marital/occupation get stated ("I am female", "I am
  // married"), so the capture must actually be capitalized in the source
  // text (the /i flag only makes the cue case-insensitive, not the
  // capture) and must not be one of those status words.
  const NOT_A_NAME = new Set([
    'female', 'male', 'other', 'single', 'married', 'unmarried', 'indian',
    'salaried', 'professional', 'student', 'homemaker', 'retired',
    'resident', 'existing', 'new',
  ]);
  const nameMatch = text.match(/(?:my name is|i am|i'm)\s+([A-Za-z][a-zA-Z'-]+(?:\s+[A-Za-z][a-zA-Z'-]+){0,3})/i);
  if (nameMatch && /^[A-Z]/.test(nameMatch[1]) && !NOT_A_NAME.has(nameMatch[1].toLowerCase())) {
    const accepted = acceptPersonName(nameMatch[1]);
    if (accepted) {
      updates.full_name = accepted;
      said.full_name = nameMatch[0];
    }
  }
  // --- name (Hindi) ---
  const hiName = text.match(/(?:मेरा नाम|मेरा पूरा नाम)\s+(.+?)(?:\s+है|\s+हैं|[।,.]|$)/);
  if (!updates.full_name && hiName) {
    const accepted = acceptPersonName(hiName[1]);
    if (accepted) {
      updates.full_name = accepted;
      said.full_name = hiName[0];
    }
  }

  // --- father/spouse name ---
  const fatherMatch =
    text.match(/(?:father'?s? name is|spouse'?s? name is)\s+([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+){0,3})/i) ||
    text.match(/(?:पिता का नाम|पति का नाम)\s+(.+?)(?:\s+है|[।,.]|$)/);
  if (fatherMatch) {
    const accepted = acceptPersonName(fatherMatch[1]);
    if (accepted) {
      updates.father_spouse_name = accepted;
      said.father_spouse_name = fatherMatch[0];
    }
  }

  // --- DOB (reuses the shared flexible parser: numeric, month-name, and
  // spoken Hindi/English digit-word dates) ---
  const dob = parseFlexibleDob(text);
  if (dob) {
    updates.dob = dob;
    said.dob = text;
  }

  // --- gender ---
  if (/\bfemale\b/i.test(text) || /महिला|स्त्री/.test(text)) {
    updates.gender = 'female';
    said.gender = text.match(/\bfemale\b/i)?.[0] ?? text.match(/महिला|स्त्री/)?.[0] ?? text;
  } else if (/\bmale\b/i.test(text) || /पुरुष/.test(text)) {
    updates.gender = 'male';
    said.gender = text.match(/\bmale\b/i)?.[0] ?? text.match(/पुरुष/)?.[0] ?? text;
  }

  // --- marital status ---
  if (/\bmarried\b/i.test(text) || /विवाहित|शादीशुदा/.test(text)) updates.marital_status = 'married';
  else if (/\bsingle\b|\bunmarried\b/i.test(text) || /अविवाहित|कुंवारा|कुंवारी/.test(text))
    updates.marital_status = 'single';

  // --- nationality ---
  if (/\bindian\b/i.test(text) || /भारतीय/.test(text)) updates.nationality = 'Indian';

  // --- mobile (shared spoken-digit parser: ASCII, Devanagari digits,
  // spoken digit-words in Hindi or English) ---
  const mobile = extractSpokenMobile(text);
  if (mobile) {
    updates.mobile = mobile;
    said.mobile = text;
  }

  // --- email ---
  const email = text.match(/\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/);
  if (email) {
    updates.email = email[1];
    said.email = email[0];
  }

  // --- PIN code ---
  const pin = extractSpokenPin(text) ?? folded.match(/\b(\d{6})\b/)?.[1] ?? null;
  if (pin) {
    updates.pin_code = pin;
    said.pin_code = text;
  }

  // --- city / state (shared PLACES gazetteer, Hindi + English) ---
  for (const p of PLACES) {
    if (!p.re.test(text)) continue;
    if (p.city && !updates.city) {
      updates.city = p.city;
      said.city = text.match(p.re)?.[0] ?? p.city;
    }
    if (p.state && !updates.state) {
      updates.state = p.state;
      said.state = text.match(p.re)?.[0] ?? p.state;
    }
  }
  if (/\bbengaluru\b|\bbangalore\b/i.test(text) && !updates.city) updates.city = 'Bengaluru';
  if (/\bkarnataka\b/i.test(text) && !updates.state) updates.state = 'Karnataka';
  if (/\bmumbai\b/i.test(text) && !updates.city) updates.city = 'Mumbai';
  if (/\bmaharashtra\b/i.test(text) && !updates.state) updates.state = 'Maharashtra';

  // --- residential address (free-text line, English + Hindi cue) ---
  const addrEn = text.match(/(?:live at|address is|address:)\s+(.+?)(?:\.|$)/i);
  const addrHi = text.match(/(?:मेरा पता|पता है|पता:)\s+(.+?)(?:[।.]|$)/);
  const addrMatch = addrEn ?? addrHi;
  if (addrMatch) {
    let line = addrMatch[1];
    if (updates.pin_code) line = line.replace(String(updates.pin_code), '');
    for (const p of PLACES) line = line.replace(p.re, ' ');
    line = line.replace(/Bengaluru|Bangalore|Karnataka|Mumbai|Maharashtra/gi, '');
    line = line.replace(/,\s*,/g, ',').replace(/^[\s,]+|[\s,]+$/g, '').trim();
    if (line.length >= 3) {
      updates.residential_address = line;
      said.residential_address = addrMatch[0];
    }
  }

  // --- proof of identity ---
  if (/\bpassport\b/i.test(text) || /पासपोर्ट/.test(text)) {
    updates.document_type = 'passport';
    said.document_type = text.match(/\bpassport\b/i)?.[0] ?? 'पासपोर्ट';
  } else if (/\bdriving\s*licen[cs]e\b|\bDL\b/i.test(text) || /ड्राइविंग\s*ला[इी]से(?:न्स|ंस)/.test(text)) {
    updates.document_type = 'driving_licence';
    said.document_type = text.match(/\bdriving\s*licen[cs]e\b/i)?.[0] ?? 'ड्राइविंग लाइसेंस';
  } else if (/\bvoter\b/i.test(text) || /वोटर|मतदाता/.test(text)) {
    updates.document_type = 'voter_id';
    said.document_type = text.match(/\bvoter\b/i)?.[0] ?? 'वोटर';
  }

  const pan = folded.match(/\b([A-Z]{5}[0-9]{4}[A-Z])\b/i);
  if (pan) {
    updates.pan = pan[1].toUpperCase();
    said.pan = pan[0];
  }

  // Document number: only after a document-type cue, to avoid colliding
  // with mobile/PAN/PIN captures above. Accepts alphanumeric runs 4-20 chars.
  const docNumMatch = text.match(
    /(?:document\s*number|passport\s*number|licen[cs]e\s*number|voter\s*id\s*number|दस्तावेज़\s*नंबर)\s*(?:is\s*)?([A-Za-z0-9]{4,20})/i,
  );
  if (docNumMatch) {
    updates.document_number = docNumMatch[1].toUpperCase();
    said.document_number = docNumMatch[0];
  }

  // --- expiry date ---
  const expiryMatch = text.match(/expir\w*\s*(?:on|date)?\s*(.*)$/i);
  if (expiryMatch) {
    const expDob = parseFlexibleDob(expiryMatch[1]);
    if (expDob) {
      updates.expiry_date = expDob;
      said.expiry_date = expiryMatch[0];
    }
  }

  // --- occupation ---
  if (/\bsalaried\b|\bemployee\b/i.test(text) || /नौकरी|कर्मचारी|सैलरी पाने/.test(text))
    updates.occupation = 'salaried';
  else if (/\bself[-\s]?employed\b/i.test(text) || /खुद का काम|व्यवसाय/.test(text))
    updates.occupation = 'self_employed';
  else if (/\bprofessional\b/i.test(text)) updates.occupation = 'professional';
  else if (/\bstudent\b/i.test(text) || /छात्र/.test(text)) updates.occupation = 'student';
  else if (/\bhomemaker\b/i.test(text) || /गृहिणी/.test(text)) updates.occupation = 'homemaker';
  else if (/\bretired\b/i.test(text) || /सेवानिवृत्त/.test(text)) updates.occupation = 'retired';
  else if (/\bteacher\b|\bi work as\b/i.test(text)) {
    // "I work as a teacher" -> occupation bucket + free-text employer/business
    updates.occupation = updates.occupation ?? 'professional';
    const role = text.match(/i work as\s+(?:a|an)?\s*(.+?)(?:\.|$)/i);
    if (role) {
      updates.employer_business = role[1].trim();
      said.employer_business = role[0];
    }
  }

  // --- employer / business (explicit cue) ---
  const employerMatch = text.match(/(?:work at|employer is|business is|employed at)\s+(.+?)(?:\.|$)/i);
  if (employerMatch) {
    updates.employer_business = employerMatch[1].trim();
    said.employer_business = employerMatch[0];
  }

  // --- annual income ---
  const incomeMatch = text.match(/(?:annual income|income is)\s+(.+?)(?:\.|$)/i);
  if (incomeMatch) {
    updates.annual_income = incomeMatch[1].trim();
    said.annual_income = incomeMatch[0];
  }

  const merged = { ...current, ...updates };
  const missing = sfeGetMissingRequired(merged);
  const completeness = sfeCompleteness(merged);
  const next_ask = missing.length
    ? `Please provide: ${sfeFieldLabel(missing[0])}`
    : null;

  return {
    field_updates: updates,
    field_said: said,
    missing_required: missing,
    next_ask,
    completeness,
    reply_lang: lang,
    assistant_message: `${
      Object.keys(updates).length ? `Updated ${Object.keys(updates).length} field(s).` : 'No new fields mapped.'
    } ${next_ask ?? 'Ready for read-back.'} ${SFE_BANK_VARIES_COPY}`,
    source: 'heuristic',
  };
}
