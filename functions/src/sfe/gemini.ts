import { callGeminiJson } from './../geminiClient';
import { acceptPersonName } from './../personName';
import { detectUtteranceLang } from './../utteranceLang';
import {
  sfeCompleteness,
  sfeGetMissingRequired,
  sfeFieldLabel,
  SFE_BANK_VARIES_COPY,
  SFE_FIELDS,
  type SfeFormValues,
} from './schema';
import type { SfeExtractResult } from './heuristic';

const FIELD_IDS = SFE_FIELDS.map((f) => f.id);

// Gemini's structured-output schema is a restricted OpenAPI subset with no
// `additionalProperties` support, and a dynamically-keyed object declared
// as a bare `{ type: 'object' }` (no `properties`) was observed to make
// the model always return `{}` for it — it reads as "an object with no
// properties allowed" rather than "any keys". Our field vocabulary is
// small and fixed, so field_updates/field_said list every field id
// explicitly instead of relying on dynamic keys.
const FIELD_PROPERTIES = Object.fromEntries(
  FIELD_IDS.map((id) => [id, { type: 'string', nullable: true }]),
);

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    field_updates: {
      type: 'object',
      description: 'Only fields explicitly present or clearly implied in the utterance. Omit fields not mentioned.',
      properties: FIELD_PROPERTIES,
    },
    field_said: {
      type: 'object',
      description: 'For each field present in field_updates, the short utterance snippet that gave that value.',
      properties: FIELD_PROPERTIES,
    },
    out_of_scope: {
      type: 'boolean',
      description: 'true if the utterance is about a parked journey (nomination, debit reissue, personal loan, fixed deposit, NEFT)',
    },
    assistant_message: { type: 'string' },
  },
  required: ['field_updates', 'field_said', 'out_of_scope', 'assistant_message'],
};

export async function sfeCallGemini(
  apiKey: string,
  utterance: string,
  current: SfeFormValues,
  journey: string | null,
): Promise<SfeExtractResult | null> {
  const prompt = `You are FormGuide extract for a simplified India bank-account/KYC voice form (speak-form-ease UI).
Rules:
- Hindi, English, or mixed Hindi+English utterance -> structured field_updates only for fields clearly stated or clearly implied.
- Never infer gender or marital_status from a name alone — only set them when the speaker states them directly.
- Never invent bank form IDs. Always include the exact phrase "Fields vary by bank." in assistant_message.
- This demo never submits to a bank — it only fills a draft.
- If the utterance is about nomination, debit card reissue, personal loan, fixed deposit, or NEFT/RTGS/IMPS, set out_of_scope=true and do not extract fields for it.
- Allowed field ids: ${FIELD_IDS.join(', ')}
- Enums: gender=female|male|other; marital_status=single|married; document_type=passport|voter_id|driving_licence;
  occupation=salaried|self_employed|professional|student|homemaker|retired|other
- dob/expiry_date as YYYY-MM-DD. Accept 12/03/1992, 12 March 1992, बारह मार्च उन्नीस सौ बानवे, and Devanagari digits.
- mobile is 10 digits. Spoken digit-words (नौ आठ सात... / nine eight seven...) and Devanagari digits count.
- pan as ABCDE1234F pattern.
- Current journey: ${journey ?? 'unknown'}
- Current form JSON: ${JSON.stringify(current)}
- Utterance: ${JSON.stringify(utterance)}
For each field you fill, also add the short utterance snippet that produced it to field_said, keyed by the same field id.
Return JSON matching the schema.`;

  const parsed = await callGeminiJson<{
    field_updates?: SfeFormValues;
    field_said?: Record<string, string>;
    out_of_scope?: boolean;
    assistant_message?: string;
  }>(apiKey, prompt, RESPONSE_SCHEMA);
  if (!parsed) return null;

  const lang = detectUtteranceLang(utterance);

  if (parsed.out_of_scope) {
    const missing = sfeGetMissingRequired(current);
    return {
      field_updates: {},
      field_said: {},
      missing_required: missing,
      next_ask: 'That form is not part of this demo yet. Working today: account opening, KYC update, Re-KYC.',
      completeness: sfeCompleteness(current),
      reply_lang: lang,
      assistant_message: `That's a later journey, not available yet. ${SFE_BANK_VARIES_COPY}`,
      source: 'gemini',
    };
  }

  const updates: SfeFormValues = {};
  for (const [k, v] of Object.entries(parsed.field_updates || {})) {
    if (!FIELD_IDS.includes(k)) continue;
    updates[k] = v as SfeFormValues[string];
  }
  if (typeof updates.full_name === 'string') {
    const accepted = acceptPersonName(updates.full_name);
    if (accepted) updates.full_name = accepted;
    else delete updates.full_name;
  }

  const said: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed.field_said || {})) {
    if (typeof v === 'string' && k in updates) said[k] = v;
  }

  const merged = { ...current, ...updates };
  const missing = sfeGetMissingRequired(merged);
  const completeness = sfeCompleteness(merged);
  const next_ask = missing.length ? `Please provide: ${sfeFieldLabel(missing[0])}` : null;

  let msg = parsed.assistant_message || `Updated ${Object.keys(updates).length} field(s).`;
  if (!msg.includes('Fields vary by bank')) msg += ` ${SFE_BANK_VARIES_COPY}`;

  return {
    field_updates: updates,
    field_said: said,
    missing_required: missing,
    next_ask,
    completeness,
    reply_lang: lang,
    assistant_message: msg,
    source: 'gemini',
  };
}
