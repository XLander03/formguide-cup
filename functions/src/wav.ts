import { parseFormFields, type BankFormField } from './bankFields';
import { isSpeakLanguage, type SpeakLanguage } from './languages';
import { isVoiceContext, type VoiceContext } from '../../shared/voiceCommands';

/** Gate audio before any outbound Gemini request. */

export const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
export const MAX_PCM_BYTES = 16000 * 2 * 45;

export type SpeakParts = {
  language: SpeakLanguage;
  current: Record<string, unknown>;
  audio: Buffer;
  /** Bank-only fields of a published form. Empty for the bundled form or a malformed part. */
  formFields: BankFormField[];
  /** Optional `form_id` part naming the published form, for anonymous usage counts only. */
  formId?: string;
  /** Optional `context` part: where the turn was spoken. Missing or unknown means `fill`. */
  context: VoiceContext;
  /** Optional `detect_language` part ("1"): find the spoken language rather than trust `language`. */
  detect?: boolean;
};

export type SpeakRead =
  | { ok: true; parts: SpeakParts }
  | { ok: false; error: string };

export function inspectWav(buf: Buffer): { ok: true } | { ok: false; error: string } {
  if (!buf || buf.length === 0) return { ok: false, error: 'empty_audio' };
  if (buf.length > MAX_AUDIO_BYTES) return { ok: false, error: 'audio_too_large' };
  if (buf.length < 44) return { ok: false, error: 'bad_wav' };
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    return { ok: false, error: 'bad_wav' };
  }

  let offset = 12;
  let audioFormat = 0;
  let channels = 0;
  let sampleRate = 0;
  let bits = 0;
  let dataSize = -1;

  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (size < 0 || start + size > buf.length) return { ok: false, error: 'bad_wav' };
    if (id === 'fmt ') {
      if (size < 16) return { ok: false, error: 'bad_wav' };
      audioFormat = buf.readUInt16LE(start);
      channels = buf.readUInt16LE(start + 2);
      sampleRate = buf.readUInt32LE(start + 4);
      bits = buf.readUInt16LE(start + 14);
    } else if (id === 'data') {
      dataSize = size;
    }
    const padded = size + (size % 2);
    offset = start + padded;
  }

  if (audioFormat !== 1 || channels !== 1 || bits !== 16 || sampleRate !== 16000) {
    return { ok: false, error: 'bad_wav' };
  }
  if (dataSize < 2) return { ok: false, error: 'empty_audio' };
  if (dataSize > MAX_PCM_BYTES) return { ok: false, error: 'audio_too_long' };
  return { ok: true };
}

function parseMultipart(raw: Buffer, contentType: string): SpeakRead {
  const match = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType);
  if (!match) return { ok: false, error: 'bad_body' };
  const boundary = match[1] || match[2];
  const delim = Buffer.from(`--${boundary}`);
  const parts: Buffer[] = [];
  let cursor = raw.indexOf(delim);
  if (cursor < 0) return { ok: false, error: 'bad_body' };
  while (cursor >= 0) {
    let start = cursor + delim.length;
    if (raw[start] === 45 && raw[start + 1] === 45) break; // --
    if (raw[start] === 13 && raw[start + 1] === 10) start += 2;
    const next = raw.indexOf(delim, start);
    if (next < 0) break;
    let end = next;
    if (raw[end - 2] === 13 && raw[end - 1] === 10) end -= 2;
    parts.push(raw.subarray(start, end));
    cursor = next;
  }

  let language: SpeakLanguage | '' = '';
  let current: Record<string, unknown> = {};
  let audio: Buffer | null = null;
  let formFields: BankFormField[] = [];
  let formId: string | undefined;
  let context: VoiceContext = 'fill';
  let detect = false;

  for (const part of parts) {
    const sep = part.indexOf(Buffer.from('\r\n\r\n'));
    if (sep < 0) continue;
    const head = part.subarray(0, sep).toString('utf8');
    const body = part.subarray(sep + 4);
    const nameMatch = /name="([^"]+)"/i.exec(head);
    const name = nameMatch ? nameMatch[1] : '';
    if (name === 'language') {
      const value = body.toString('utf8').trim();
      if (isSpeakLanguage(value)) language = value;
    } else if (name === 'current_values') {
      const text = body.toString('utf8').trim();
      if (text) {
        try {
          const parsed = JSON.parse(text) as unknown;
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            current = parsed as Record<string, unknown>;
          }
        } catch {
          return { ok: false, error: 'bad_body' };
        }
      }
    } else if (name === 'form_fields') {
      formFields = parseFormFields(body);
    } else if (name === 'form_id') {
      const value = body.toString('utf8').trim();
      if (/^[A-Za-z0-9_-]{1,80}$/.test(value)) formId = value;
    } else if (name === 'context') {
      const value = body.toString('utf8').trim();
      if (isVoiceContext(value)) context = value;
    } else if (name === 'detect_language') {
      detect = body.toString('utf8').trim() === '1';
    } else if (name === 'audio') {
      audio = Buffer.from(body);
    }
  }

  if (!audio || audio.length === 0) return { ok: false, error: 'empty_audio' };
  if (audio.length > MAX_AUDIO_BYTES) return { ok: false, error: 'audio_too_large' };
  if (!isSpeakLanguage(language)) return { ok: false, error: 'bad_language' };
  const wav = inspectWav(audio);
  if (!wav.ok) return wav;
  return { ok: true, parts: { language, current, audio, formFields, context, ...(formId ? { formId } : {}), ...(detect ? { detect } : {}) } };
}

export function readSpeakRequest(raw: Buffer, contentType: string): SpeakRead {
  if (!raw || raw.length === 0) return { ok: false, error: 'empty_audio' };
  const type = (contentType || '').toLowerCase();
  if (type.startsWith('audio/wav') || type.startsWith('audio/x-wav')) {
    if (raw.length > MAX_AUDIO_BYTES) return { ok: false, error: 'audio_too_large' };
    const wav = inspectWav(raw);
    if (!wav.ok) return wav;
    return { ok: false, error: 'bad_language' };
  }
  if (type.includes('multipart/form-data')) return parseMultipart(raw, contentType);
  if (raw.length > MAX_AUDIO_BYTES) return { ok: false, error: 'audio_too_large' };
  return { ok: false, error: 'empty_audio' };
}
