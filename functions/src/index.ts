import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { readSpeakRequest } from './wav';
import { buildNextAsk, mergeFieldUpdatesWithMeta, type FieldMetaMap } from './merge';

const geminiApiKey = defineSecret('GEMINI_API_KEY');

const FIELD_IDS = [
  'journey_mode',
  'applicant_full_name',
  'father_or_spouse_name',
  'dob',
  'gender',
  'nationality',
  'residential_status',
  'pan_available',
  'pan_number',
  'form60_declared',
  'ckyc_number',
  'mobile_registered',
  'email',
  'preferred_language',
  'addr_current_line1',
  'addr_current_line2',
  'addr_current_city',
  'addr_current_state',
  'addr_current_pin',
  'addr_permanent_same_as_current',
  'addr_permanent_line1',
  'addr_permanent_city',
  'addr_permanent_state',
  'addr_permanent_pin',
  'ovd_poi_type',
  'ovd_poi_number',
  'ovd_poi_expiry',
  'ovd_poa_same_as_poi',
  'ovd_poa_type',
  'ovd_poa_number',
  'aadhaar_voluntary_consent',
  'photo_consent',
  'ovd_originals_ack',
  'existing_bank_customer',
  'customer_id_cif',
  'linked_account_last4',
  'account_product_intent',
  'branch_hint',
  'occupation_bucket',
  'pep_declaration',
  'tax_resident_india_only',
  'bank_hint',
  'readback_confirmed',
  'draft_only_ack',
  'no_live_submit_ack',
] as const;

const OVD = [
  'passport',
  'driving_licence',
  'proof_of_possession_of_aadhaar',
  'voter_id',
  'nrega_job_card',
  'npr_letter',
];

const ENUMS: Record<string, readonly string[]> = {
  journey_mode: ['account_opening', 'kyc_update', 'rekyc'],
  gender: ['female', 'male', 'other', 'prefer_not_to_say'],
  residential_status: ['resident_individual'],
  ovd_poi_type: OVD,
  ovd_poa_type: OVD,
  account_product_intent: [
    'regular_savings',
    'salary_savings',
    'bsbda',
    'individual_current',
    'unspecified_varies_by_bank',
  ],
  occupation_bucket: [
    'salaried',
    'self_employed',
    'professional',
    'student',
    'homemaker',
    'retired',
    'other',
  ],
};

const BOOLS = new Set([
  'pan_available',
  'form60_declared',
  'addr_permanent_same_as_current',
  'ovd_poa_same_as_poi',
  'aadhaar_voluntary_consent',
  'photo_consent',
  'ovd_originals_ack',
  'existing_bank_customer',
  'pep_declaration',
  'tax_resident_india_only',
  'readback_confirmed',
  'draft_only_ack',
  'no_live_submit_ack',
]);

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
  { id: 'aadhaar_voluntary_consent', when: { ovd_poi_type: 'proof_of_possession_of_aadhaar' } },
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

const EN_ASK: Record<string, string> = {
  journey_mode: 'Are you opening an account, updating KYC, or doing re-KYC?',
  applicant_full_name: 'What is your full name, as on your ID?',
  father_or_spouse_name: "What is your father's or spouse's full name?",
  dob: 'What is your date of birth?',
  residential_status: 'Are you a resident individual of India?',
  pan_available: 'Do you have a PAN, or should this note Form 60?',
  mobile_registered: 'What is your 10-digit registered mobile number?',
  addr_current_line1: 'What is the first line of your current address?',
  addr_current_city: 'Which city or town do you live in?',
  addr_current_state: 'Which state is that in?',
  addr_current_pin: 'What is the 6-digit PIN code?',
  addr_permanent_same_as_current: 'Is your permanent address the same as your current address?',
  ovd_poi_type: 'Which identity document will you use?',
  ovd_poi_number: 'What is that document number?',
  ovd_poa_same_as_poi: 'Is the address proof the same document?',
  photo_consent: 'Do you consent to a photograph?',
  ovd_originals_ack: 'Will you show the original documents?',
  existing_bank_customer: 'Are you already a customer of this bank?',
  pep_declaration: 'Are you a politically exposed person?',
  tax_resident_india_only: 'Are you a tax resident of India only?',
  pan_number: 'What is your PAN number?',
  form60_declared: 'No PAN — should Form 60 be noted?',
  account_product_intent: 'Is this a regular savings, salary, basic savings, or individual current account?',
  customer_id_cif: 'What is your customer ID or CIF, if you have one?',
};

const HI_ASK: Record<string, string> = {
  journey_mode: 'आप खाता खोलना चाहते हैं, केवाईसी अपडेट, या री-केवाईसी?',
  applicant_full_name: 'कृपया अपना पूरा नाम बताएं, जैसा पहचान पत्र पर है।',
  father_or_spouse_name: 'पिता या पति/पत्नी का पूरा नाम बताएं।',
  dob: 'जन्म तिथि बताएं — दिन, महीना और साल।',
  residential_status: 'क्या आप भारत के निवासी व्यक्ति हैं?',
  pan_available: 'क्या आपके पास पैन है, या बिना पैन के फॉर्म 60 नोट करें?',
  mobile_registered: 'रजिस्टर्ड मोबाइल नंबर बताएं, दस अंक।',
  addr_current_line1: 'वर्तमान पते की पहली पंक्ति बताएं।',
  addr_current_city: 'वर्तमान शहर या कस्बा बताएं।',
  addr_current_state: 'वर्तमान राज्य बताएं।',
  addr_current_pin: 'छह अंकों का पिन कोड बताएं।',
  addr_permanent_same_as_current: 'क्या स्थायी पता वर्तमान पते जैसा ही है?',
  ovd_poi_type: 'पहचान के लिए कौन सा दस्तावेज़ देंगे?',
  ovd_poi_number: 'उस दस्तावेज़ का नंबर बताएं।',
  ovd_poa_same_as_poi: 'क्या पते का प्रमाण वही दस्तावेज़ है?',
  photo_consent: 'क्या आप फोटो की सहमति देते हैं?',
  ovd_originals_ack: 'क्या आप मूल दस्तावेज़ दिखाएँगे?',
  existing_bank_customer: 'क्या आप इस बैंक के मौजूदा ग्राहक हैं?',
  pep_declaration: 'क्या आप राजनीतिक रूप से उजागर व्यक्ति हैं?',
  tax_resident_india_only: 'क्या आप कर के लिए केवल भारत के निवासी हैं?',
  pan_number: 'पैन नंबर बताएं।',
  form60_declared: 'पैन नहीं है — क्या फॉर्म 60 दर्ज करें?',
  account_product_intent: 'यह रेगुलर सेविंग्स, सैलरी, बेसिक सेविंग्स, या व्यक्तिगत करंट खाता है?',
  customer_id_cif: 'ग्राहक आईडी या CIF बताएं, अगर पास हो।',
};

type FieldValue = string | boolean | null;
type FormValues = Record<string, FieldValue>;

const API = 'https://generativelanguage.googleapis.com';

function isFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'boolean') return true;
  if (typeof value === 'string') return value.trim().length > 0;
  return false;
}

function getMissingRequired(values: FormValues): string[] {
  const missing: string[] = [];
  for (const id of ALWAYS_REQUIRED) {
    if (!isFilled(values[id])) missing.push(id);
  }
  for (const cond of CONDITIONAL) {
    const match = Object.entries(cond.when).every(([key, expect]) => values[key] === expect);
    if (match && !isFilled(values[cond.id])) missing.push(cond.id);
  }
  missing.sort((a, b) => {
    const ia = PRIORITY.indexOf(a);
    const ib = PRIORITY.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
  return missing;
}

function completeness(values: FormValues, missing: string[]): 'empty' | 'partial_core' | 'demo_ready' {
  const any = Object.values(values).some(isFilled);
  if (!any) return 'empty';
  if (missing.length === 0) return 'demo_ready';
  const core = ['journey_mode', 'applicant_full_name', 'dob', 'mobile_registered', 'pan_available'];
  return core.every((id) => isFilled(values[id])) ? 'partial_core' : 'empty';
}

function toIsoDate(value: string): string {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (iso) return value;
  const slash = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(value);
  if (!slash) return value;
  return `${slash[3]}-${slash[2].padStart(2, '0')}-${slash[1].padStart(2, '0')}`;
}

function sanitizeUpdates(raw: unknown): FormValues {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: FormValues = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!FIELD_IDS.includes(key as (typeof FIELD_IDS)[number])) continue;
    if (value === null) {
      out[key] = null;
      continue;
    }
    if (BOOLS.has(key)) {
      if (typeof value === 'boolean') out[key] = value;
      else if (value === 'true' || value === 'yes') out[key] = true;
      else if (value === 'false' || value === 'no') out[key] = false;
      continue;
    }
    if (typeof value !== 'string' && typeof value !== 'number') continue;
    let text = String(value).trim();
    if (!text) continue;
    if (ENUMS[key]) {
      if (ENUMS[key].includes(text)) out[key] = text;
      continue;
    }
    if (key === 'dob' || key === 'ovd_poi_expiry') text = toIsoDate(text);
    if (key === 'pan_number') text = text.toUpperCase().replace(/\s+/g, '');
    if (key === 'mobile_registered') {
      const digits = text.replace(/\D/g, '');
      text = digits.length > 10 ? digits.slice(-10) : digits;
    }
    if (key === 'addr_current_pin' || key === 'addr_permanent_pin') {
      const digits = text.replace(/\D/g, '');
      if (digits) text = digits.slice(0, 6);
    }
    out[key] = text;
  }
  return out;
}

function asValues(current: Record<string, unknown>): FormValues {
  const out: FormValues = {};
  for (const id of FIELD_IDS) {
    const value = current[id];
    if (typeof value === 'string' || typeof value === 'boolean' || value === null) out[id] = value;
  }
  return out;
}

function stripFence(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fenced ? fenced[1] : trimmed;
}

function authHeaders(apiKey: string): Record<string, string> {
  return { 'x-goog-api-key': apiKey };
}

/** Preferred field model. gemini-3.8-flash currently returns 503 UNAVAILABLE (high demand). */
const FIELD_MODEL = 'gemini-3.5-flash-lite';

type SpeakFail = Error & { code: string; httpStatus: number };

function speakFail(code: string, httpStatus = 502): SpeakFail {
  const err = new Error(code) as SpeakFail;
  err.code = code;
  err.httpStatus = httpStatus;
  return err;
}

async function readGeminiError(prefix: string, res: Response): Promise<SpeakFail> {
  let detail = '';
  try {
    const body = (await res.json()) as {
      error?: { message?: string; status?: string; code?: string | number };
    };
    const msg = String(body.error?.message || body.error?.status || '').toLowerCase();
    if (msg.includes('high demand') || msg.includes('unavailable') || body.error?.status === 'UNAVAILABLE') {
      detail = 'unavailable';
    } else if (msg.includes('invalid') || res.status === 400) {
      detail = 'bad_request';
    } else if (res.status === 429) {
      detail = 'rate_limited';
    }
  } catch {
    detail = '';
  }
  const code = detail ? `${prefix}_${res.status}_${detail}` : `${prefix}_${res.status}`;
  const httpStatus = detail === 'unavailable' || res.status === 503 ? 503 : 502;
  return speakFail(code, httpStatus);
}

function interactionText(data: {
  output_text?: unknown;
  outputText?: unknown;
  steps?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
}): string {
  if (typeof data.output_text === 'string' && data.output_text.trim()) return data.output_text.trim();
  if (typeof data.outputText === 'string' && data.outputText.trim()) return data.outputText.trim();
  const chunks: string[] = [];
  for (const step of data.steps || []) {
    for (const part of step.content || []) {
      if (part && part.type === 'text' && typeof part.text === 'string' && part.text.trim()) {
        chunks.push(part.text.trim());
      }
    }
  }
  return chunks.join('\n').trim();
}

async function uploadWav(apiKey: string, wav: Buffer): Promise<{ name: string; uri: string }> {
  const start = await fetch(`${API}/upload/v1beta/files`, {
    method: 'POST',
    headers: {
      ...authHeaders(apiKey),
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(wav.length),
      'X-Goog-Upload-Header-Content-Type': 'audio/wav',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: 'speak.wav' } }),
  });
  if (!start.ok) throw await readGeminiError('upload_start', start);
  const uploadUrl = start.headers.get('x-goog-upload-url');
  if (!uploadUrl || !uploadUrl.startsWith('https://')) throw speakFail('upload_url_missing');
  const put = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(wav.length),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: new Uint8Array(wav),
  });
  if (!put.ok) throw await readGeminiError('upload_finalize', put);
  const info = (await put.json()) as { file?: { name?: string; uri?: string } };
  const name = info.file?.name || '';
  const uri = info.file?.uri || '';
  if (!name.startsWith('files/') || !uri.startsWith('https://')) throw speakFail('upload_meta_missing');
  return { name, uri };
}

async function deleteUploaded(apiKey: string, name: string): Promise<void> {
  if (!name.startsWith('files/')) return;
  await fetch(`${API}/v1beta/${name}`, { method: 'DELETE', headers: authHeaders(apiKey) });
}

async function transcribe(apiKey: string, uri: string, language: 'en-IN' | 'hi-IN'): Promise<string> {
  const res = await fetch(`${API}/v1beta/interactions`, {
    method: 'POST',
    headers: { ...authHeaders(apiKey), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gemini-3.5-transcribe',
      input: [{ type: 'audio', uri, mime_type: 'audio/wav' }],
      generation_config: {
        transcription_config: {
          language_codes: [language],
          mode: { type: 'verbatim' },
        },
      },
    }),
  });
  if (!res.ok) throw await readGeminiError('transcribe', res);
  const data = (await res.json()) as {
    output_text?: unknown;
    outputText?: unknown;
    steps?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  return interactionText(data);
}

function fieldPrompt(
  transcript: string,
  language: 'en-IN' | 'hi-IN',
  current: FormValues,
  missing: string[],
): string {
  const filled = Object.fromEntries(
    Object.entries(current).filter(([, value]) => isFilled(value)),
  );
  return `You are FormGuide extract for India BFSI account-opening and KYC demo schema aof_kyc_demo_v1.
Page language: ${language}. Transcript may be English or Hindi (or mixed).

FIELD IDS (exact strings only — never invent bank form ids like full_name):
${FIELD_IDS.join(', ')}

NAME FIELDS — critical:
- applicant_full_name = the applicant's own name ("my name is…", "मेरा नाम…").
- father_or_spouse_name = father or spouse ("father's name", "spouse", "पति/पत्नी", "पिता").
- These are DIFFERENT ids. Never put a father/spouse answer into applicant_full_name.
- If applicant_full_name is already filled and the user now gives another person name, use father_or_spouse_name.
- Never overwrite a filled id with a value meant for a different id.

MULTI-FIELD EXTRACTION:
- One spoken dump may fill many fields at once (name + DOB + PAN + mobile + address…).
- Put every clearly stated fact into field_updates in this same turn.
- Each field_updates entry is an object: {"value": <string|boolean|null>, "confidence": <0..1>, "reason": <optional short reason, max 8 words>}.
- confidence = how sure you are the value was heard and assigned to the right id. Use < 0.75 for unclear audio, guessed spellings, ambiguous digits/dates, or uncertain which person a name belongs to; give a reason then.
- Do not invent values. Do not clear unrelated filled fields. Only include keys you are setting.

NORMALIZATION:
- Enums: journey_mode=account_opening|kyc_update|rekyc; gender=female|male|other|prefer_not_to_say; residential_status=resident_individual; ovd_poi_type/ovd_poa_type=passport|driving_licence|proof_of_possession_of_aadhaar|voter_id|nrega_job_card|npr_letter; account_product_intent=regular_savings|salary_savings|bsbda|individual_current|unspecified_varies_by_bank; occupation_bucket=salaried|self_employed|professional|student|homemaker|retired|other.
- DOB → YYYY-MM-DD (English or Hindi spoken dates).
- City/state as place names (बेंगलुरु→Bengaluru, मुंबई→Mumbai).
- Spoken numbers → digits (mobile 10 digits, PIN 6 digits).
- Booleans true/false only.

next_ask:
- After this turn, ask only still-missing REQUIRED fields.
- Currently missing required ids: ${JSON.stringify(missing)}
- You may ask 1–2 missing requireds in one short natural question. Do not re-ask filled fields.
- Null if nothing required remains.
- Language: Hindi if transcript is Hindi, else English.
- reply_lang: "hi" or "en".

OTHER:
- refuse_live_submit true only if user asks to submit/send to a bank.
- assistant_message must include the exact English sentence "Fields vary by bank."

Already filled JSON: ${JSON.stringify(filled)}
Full current JSON: ${JSON.stringify(current)}
Transcript: ${JSON.stringify(transcript)}

Return JSON: field_updates (id → {value, confidence, reason?}), next_ask, reply_lang, refuse_live_submit, assistant_message.`;
}

async function fieldJson(
  apiKey: string,
  transcript: string,
  language: 'en-IN' | 'hi-IN',
  current: FormValues,
): Promise<{
  field_updates: FormValues;
  field_confidence: FieldMetaMap;
  next_ask: string | null;
  reply_lang: 'hi' | 'en';
  refuse_live_submit: boolean;
  assistant_message: string;
}> {
  // Keep gemini-3.5-flash-lite (gemini-3.8-flash was 503 high-demand). No retry loop.
  const missingBefore = getMissingRequired(current);
  const res = await fetch(`${API}/v1beta/interactions`, {
    method: 'POST',
    headers: { ...authHeaders(apiKey), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: FIELD_MODEL,
      input: fieldPrompt(transcript, language, current, missingBefore),
      generation_config: {
        thinking_level: 'low',
        // Each field is {value, confidence, reason}; a full multi-field dump needs headroom.
        max_output_tokens: 4096,
      },
      response_format: {
        type: 'text',
        mime_type: 'application/json',
      },
    }),
  });
  if (!res.ok) throw await readGeminiError('fields', res);
  const data = (await res.json()) as {
    output_text?: unknown;
    outputText?: unknown;
    steps?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
    candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
  };
  let text = interactionText(data);
  if (!text) {
    const parts = data.candidates?.[0]?.content?.parts || [];
    text = parts.filter((part) => part.text && !part.thought).map((part) => part.text as string).join('');
  }
  let parsed: {
    field_updates?: unknown;
    field_confidence?: unknown;
    next_ask?: unknown;
    reply_lang?: unknown;
    refuse_live_submit?: unknown;
    assistant_message?: unknown;
  } = {};
  try {
    parsed = JSON.parse(stripFence(text)) as typeof parsed;
  } catch {
    // Usually a reply cut off at the token limit. Fail loudly so the client shows an error.
    console.error('fields_bad_json', text.length);
    throw speakFail('fields_bad_json', 502);
  }
  const hindi = parsed.reply_lang === 'hi' || /[\u0900-\u097F]/.test(transcript);
  const replyLang: 'hi' | 'en' = hindi ? 'hi' : 'en';
  const rawUpdates =
    parsed.field_updates && typeof parsed.field_updates === 'object' && !Array.isArray(parsed.field_updates)
      ? (parsed.field_updates as Record<string, unknown>)
      : {};
  const confMap =
    parsed.field_confidence && typeof parsed.field_confidence === 'object' && !Array.isArray(parsed.field_confidence)
      ? (parsed.field_confidence as Record<string, unknown>)
      : {};
  const { updates: mergedIncoming, meta } = mergeFieldUpdatesWithMeta(current, rawUpdates, transcript, confMap);
  const updates = sanitizeUpdates(mergedIncoming);
  const merged: FormValues = { ...current, ...updates };
  const missing = getMissingRequired(merged);
  const refuse =
    parsed.refuse_live_submit === true ||
    /\bsubmit\s+to\s+(?:the\s+)?bank\b|\bsend\s+(?:it|this)\s+to\s+(?:the\s+)?bank\b|\blive\s+submit\b/i.test(
      transcript,
    );
  const askTable = replyLang === 'hi' ? HI_ASK : EN_ASK;
  const modelAsk = typeof parsed.next_ask === 'string' ? parsed.next_ask.trim() : '';
  const nextAsk = buildNextAsk(missing, replyLang, askTable, modelAsk);
  let message = typeof parsed.assistant_message === 'string' ? parsed.assistant_message.trim() : '';
  if (!message) message = nextAsk || 'Draft updated.';
  if (!message.includes('Fields vary by bank.')) message = `${message} Fields vary by bank.`;
  return {
    field_updates: updates,
    field_confidence: meta,
    next_ask: nextAsk,
    reply_lang: replyLang,
    refuse_live_submit: refuse,
    assistant_message: message,
  };
}

function rawBuffer(req: { rawBody?: unknown; body?: unknown }): Buffer {
  if (Buffer.isBuffer(req.rawBody) && req.rawBody.length > 0) return req.rawBody;
  if (Buffer.isBuffer(req.body) && req.body.length > 0) return req.body;
  return Buffer.alloc(0);
}

export const speak = onRequest(
  {
    region: 'us-central1',
    minInstances: 0,
    maxInstances: 2,
    memory: '256MiB',
    timeoutSeconds: 60,
    concurrency: 1,
    invoker: 'public',
    cors: ['https://faceapp-5397b.web.app'],
    secrets: [geminiApiKey],
  },
  async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'POST only' });
      return;
    }

    const raw = rawBuffer(req);
    const contentType = String(req.header('content-type') || '');
    const read = readSpeakRequest(raw, contentType);
    if (!read.ok) {
      res.status(400).json({ error: read.error });
      return;
    }

    const apiKey = geminiApiKey.value();
    const current = asValues(read.parts.current);
    let uploadedName = '';
    let transcript = '';
    try {
      const file = await uploadWav(apiKey, read.parts.audio);
      uploadedName = file.name;
      transcript = await transcribe(apiKey, file.uri, read.parts.language);
      const extracted = await fieldJson(apiKey, transcript, read.parts.language, current);
      const merged: FormValues = { ...current, ...extracted.field_updates };
      const missing = getMissingRequired(merged);
      res.json({
        transcript,
        reply_lang: extracted.reply_lang,
        field_updates: extracted.field_updates,
        field_confidence: extracted.field_confidence,
        missing_required: missing,
        next_ask: extracted.next_ask,
        gates: { answers: {} },
        completeness: completeness(merged, missing),
        refuse_live_submit: extracted.refuse_live_submit,
        refuse_message: extracted.refuse_live_submit ? 'Refusing live bank submit. Draft only.' : undefined,
        source: 'gemini',
        assistant_message: extracted.assistant_message,
      });
    } catch (err) {
      const fail = err as SpeakFail;
      const code = typeof fail?.code === 'string' ? fail.code : err instanceof Error ? err.message : 'speak_failed';
      const status = typeof fail?.httpStatus === 'number' ? fail.httpStatus : 502;
      console.error('speak_failed', code.slice(0, 64));
      res.status(status >= 400 && status < 600 ? status : 502).json({
        error: code.slice(0, 64),
        transcript: transcript || undefined,
      });
    } finally {
      if (uploadedName) {
        try {
          await deleteUploaded(apiKey, uploadedName);
        } catch {
          console.error('delete_failed');
        }
      }
    }
  },
);
