/**
 * PAN photo mode for the speak function.
 * The JPEG is read from the request, sent inline to Gemini, and not stored.
 */

export const MAX_PAN_IMAGE_BYTES = 1_500_000;

const FIELD_MODEL = 'gemini-3.5-flash-lite';
const API = 'https://generativelanguage.googleapis.com';

const NOT_PAN_MESSAGE = "That photo isn't a readable PAN card. Nothing was filled.";
const READ_FAILED_MESSAGE = "Could not read that photo. Nothing was filled.";

export type PanFields = {
  applicant_full_name?: string;
  dob?: string;
  pan_number?: string;
};

export type PanGate =
  | { kind: 'skip' }
  | { kind: 'pan'; image: Buffer }
  | { kind: 'reject'; error: string; message: string; httpStatus: number };

type PanExtract =
  | { ok: true; fields: PanFields }
  | { ok: false; error: string; message: string; httpStatus: number };

function validDate(year: string, month: string, day: string): string | null {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (y < 1900 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function cleanDob(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (iso) return validDate(iso[1], iso[2], iso[3]);
  const slash = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(text);
  if (slash) return validDate(slash[3], slash[2], slash[1]);
  return null;
}

function cleanName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let text = value.replace(/\s+/g, ' ').trim();
  text = text.replace(/^(?:name|applicant(?:'s)? name)\s*[:\-]\s*/i, '');
  if (text.length < 2 || text.length > 80) return null;
  if (!/[A-Za-z\u0900-\u097F]/.test(text)) return null;
  return text;
}

function cleanPan(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = value.toUpperCase().match(/[A-Z]{5}[0-9]{4}[A-Z]/);
  return match ? match[0] : null;
}

/** Accept a PAN read only. Aadhaar-shaped numbers fail cleanPan and are dropped. */
export function sanitizePanExtract(raw: unknown): { ok: true; fields: PanFields } | { ok: false } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false };
  const obj = raw as Record<string, unknown>;
  if (obj.ok !== true) return { ok: false };
  const fields: PanFields = {};
  const name = cleanName(obj.applicant_full_name);
  const dob = cleanDob(obj.dob);
  const pan = cleanPan(obj.pan_number);
  if (name) fields.applicant_full_name = name;
  if (dob) fields.dob = dob;
  if (pan) fields.pan_number = pan;
  if (!name && !dob && !pan) return { ok: false };
  return { ok: true, fields };
}

function splitParts(raw: Buffer, contentType: string): Buffer[] | null {
  const match = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType);
  if (!match) return null;
  const boundary = match[1] || match[2];
  const delim = Buffer.from(`--${boundary}`);
  const parts: Buffer[] = [];
  let cursor = raw.indexOf(delim);
  if (cursor < 0) return null;
  while (cursor >= 0) {
    let start = cursor + delim.length;
    if (raw[start] === 45 && raw[start + 1] === 45) break;
    if (raw[start] === 13 && raw[start + 1] === 10) start += 2;
    const next = raw.indexOf(delim, start);
    if (next < 0) break;
    let end = next;
    if (raw[end - 2] === 13 && raw[end - 1] === 10) end -= 2;
    parts.push(raw.subarray(start, end));
    cursor = next;
  }
  return parts;
}

function partNameAndBody(part: Buffer): { name: string; body: Buffer } | null {
  const sep = part.indexOf(Buffer.from('\r\n\r\n'));
  if (sep < 0) return null;
  const head = part.subarray(0, sep).toString('utf8');
  const nameMatch = /name="([^"]+)"/i.exec(head);
  return { name: nameMatch ? nameMatch[1] : '', body: part.subarray(sep + 4) };
}

function isJpeg(buf: Buffer): boolean {
  return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

/**
 * Audio posts have no mode field and return skip so the existing reader runs.
 * mode=pan never falls through to the audio path.
 */
export function readPanImageRequest(raw: Buffer, contentType: string): PanGate {
  const type = (contentType || '').toLowerCase();
  if (!type.includes('multipart/form-data')) return { kind: 'skip' };
  const parts = splitParts(raw, contentType);
  if (!parts) return { kind: 'skip' };

  let mode = '';
  let image: Buffer | null = null;
  for (const part of parts) {
    const parsed = partNameAndBody(part);
    if (!parsed) continue;
    if (parsed.name === 'mode') mode = parsed.body.toString('utf8').trim().toLowerCase();
    else if (parsed.name === 'image') image = Buffer.from(parsed.body);
  }
  if (mode !== 'pan') return { kind: 'skip' };
  if (!image || image.length === 0) {
    return {
      kind: 'reject',
      error: 'empty_image',
      message: NOT_PAN_MESSAGE,
      httpStatus: 400,
    };
  }
  if (image.length > MAX_PAN_IMAGE_BYTES) {
    return {
      kind: 'reject',
      error: 'image_too_large',
      message: 'That photo is too large. Nothing was filled.',
      httpStatus: 413,
    };
  }
  if (!isJpeg(image)) {
    return {
      kind: 'reject',
      error: 'bad_image',
      message: 'Send a JPEG photo of a PAN card. Nothing was filled.',
      httpStatus: 400,
    };
  }
  return { kind: 'pan', image };
}

function stripFence(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fenced ? fenced[1] : trimmed;
}

function interactionText(data: {
  output_text?: unknown;
  outputText?: unknown;
  steps?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
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
  if (chunks.length) return chunks.join('\n').trim();
  const parts = data.candidates?.[0]?.content?.parts || [];
  return parts
    .filter((part) => part.text && !part.thought)
    .map((part) => part.text as string)
    .join('')
    .trim();
}

const PAN_PROMPT = `You read one photo for FormGuide, India account-opening demo schema aof_kyc_demo_v1.
Accept ONLY an Indian PAN card (Permanent Account Number card).

Set ok=false and every field null when:
- the image is blurry, cropped, dark, or the name, date of birth, or PAN cannot be read
- it is not a PAN card
- it is Aadhaar, passport, driving licence, voter ID, or any other document
- you would have to guess

Aadhaar is out of scope. Never return an Aadhaar number. Never invent a form id.

If it is a readable PAN card, set ok=true and copy only these schema ids:
- applicant_full_name: the cardholder line labeled Name (not the father's name)
- dob: date of birth as YYYY-MM-DD
- pan_number: the 10-character PAN, uppercase, no spaces

Use null for a field you cannot read. If none of the three can be read, ok=false.
Do not return any other field.

Return JSON only:
{"ok":boolean,"applicant_full_name":string|null,"dob":string|null,"pan_number":string|null}`;

/**
 * One flash-lite image call, same interactions style as field JSON.
 * Inline bytes only — no Files API upload. No retry.
 */
export async function extractPanFromImage(apiKey: string, jpeg: Buffer): Promise<PanExtract> {
  const res = await fetch(`${API}/v1beta/interactions`, {
    method: 'POST',
    headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: FIELD_MODEL,
      input: [
        { type: 'text', text: PAN_PROMPT },
        { type: 'image', data: jpeg.toString('base64'), mime_type: 'image/jpeg' },
      ],
      generation_config: {
        thinking_level: 'low',
        max_output_tokens: 1024,
      },
      response_format: {
        type: 'text',
        mime_type: 'application/json',
      },
    }),
  });
  if (!res.ok) {
    console.error('pan_gemini', res.status);
    const httpStatus = res.status === 503 || res.status === 429 ? 503 : 502;
    return { ok: false, error: `pan_${res.status}`, message: READ_FAILED_MESSAGE, httpStatus };
  }
  const data = (await res.json()) as {
    output_text?: unknown;
    outputText?: unknown;
    steps?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
    candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
  };
  const text = interactionText(data);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFence(text));
  } catch {
    console.error('pan_bad_json', text.length);
    return { ok: false, error: 'not_a_pan', message: NOT_PAN_MESSAGE, httpStatus: 422 };
  }
  const clean = sanitizePanExtract(parsed);
  if (!clean.ok) return { ok: false, error: 'not_a_pan', message: NOT_PAN_MESSAGE, httpStatus: 422 };
  return { ok: true, fields: clean.fields };
}
