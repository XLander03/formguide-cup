import { onRequest } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';
import {
  completenessLevel,
  getMissingRequired,
  heuristicExtract,
  type ExtractResponse,
  type FormValues,
} from './heuristic';
import { detectUtteranceLang, localizeAsk, preferredLanguageLabel } from './utteranceLang';

setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

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
];

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    field_updates: {
      type: 'object',
      description: 'Only fields explicitly present or clearly implied in the utterance',
      additionalProperties: true,
    },
    gates: {
      type: 'object',
      properties: {
        answers: {
          type: 'object',
          additionalProperties: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['choice', 'score', 'noul'] },
              choice: { type: 'string', nullable: true },
              score: { type: 'number', nullable: true },
              noul: { type: 'number', nullable: true },
              confidence: { type: 'number', nullable: true },
              probabilities: { type: 'object', additionalProperties: { type: 'number' } },
              levels: { type: 'array', items: { type: 'string' } },
            },
            required: ['type'],
          },
        },
      },
      required: ['answers'],
    },
    refuse_live_submit: { type: 'boolean' },
    out_of_scope: { type: 'boolean' },
    assistant_message: { type: 'string' },
  },
  required: ['field_updates', 'gates', 'refuse_live_submit', 'assistant_message'],
};

async function callGemini(
  apiKey: string,
  utterance: string,
  current: FormValues,
): Promise<ExtractResponse | null> {
  const prompt = `You are FormGuide extract for India BFSI AOF+KYC demo (aof_kyc_demo_v1).
Rules:
- Hindi, English, or mixed Hindi+English utterance → structured field_updates only for fields clearly stated.
- Reply assistant_message in the utterance language. Hindi or mixed utterances should use Hindi (Devanagari); English utterances stay English. Regional languages are out of scope.
- Schema enum values stay English codes (journey_mode, ovd type, product). Names may stay in the script spoken.
- Never invent bank form IDs. Always include the exact phrase "Fields vary by bank."
- No live bank submit. If user asks to submit to bank, set refuse_live_submit=true.
- Gates emulate Choice/Score/Noul (TypeSafe-style) — no live Jev API. Do not call Jev.
- Allowed field ids: ${FIELD_IDS.join(', ')}
- Enums: journey_mode=account_opening|kyc_update|rekyc; gender=female|male|other|prefer_not_to_say;
  residential_status=resident_individual; ovd_type=passport|driving_licence|proof_of_possession_of_aadhaar|voter_id|nrega_job_card|npr_letter;
  account_product_intent=regular_savings|salary_savings|bsbda|individual_current|unspecified_varies_by_bank;
  occupation_bucket=salaried|self_employed|professional|student|homemaker|retired|other
- DOB as YYYY-MM-DD. Accept 15/08/1992, 15 August 1992, 15 अगस्त 1992, पंद्रह अगस्त उन्नीस सौ बानवे, and Devanagari digits.
- Mobile is 10 digits. Spoken digit-words (नौ आठ सात… / nine eight seven…) and Devanagari digits count. PAN as ABCDE1234F.
- बैंगलुरु, बेंगलुरु, बंगलुरु, and Bangalore all mean city Bengaluru, state Karnataka.
- Current form JSON: ${JSON.stringify(current)}
- Utterance: ${JSON.stringify(utterance)}
Return JSON matching the schema. Include gates.answers for journey_type (choice), score_completeness (score 1-4), noul_ready_for_readback, noul_requests_live_bank_submit, noul_out_of_scope_excluded_product, noul_user_confirmed_readback.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    }),
  });

  if (!res.ok) {
    console.warn('Gemini HTTP', res.status, await res.text());
    return null;
  }
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return null;

  let parsed: {
    field_updates?: FormValues;
    gates?: { answers: Record<string, unknown> };
    refuse_live_submit?: boolean;
    out_of_scope?: boolean;
    assistant_message?: string;
  };
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  const updates: FormValues = {};
  for (const [k, v] of Object.entries(parsed.field_updates || {})) {
    if (!FIELD_IDS.includes(k)) continue;
    updates[k] = v as FormValues[string];
  }
  const merged = { ...current, ...updates };
  const missing = getMissingRequired(merged);
  const completeness = completenessLevel(merged, missing);

  const lang = detectUtteranceLang(utterance);
  if (lang !== 'en' && (updates.preferred_language === undefined || updates.preferred_language === '')) {
    updates.preferred_language = preferredLanguageLabel(lang);
  }

  let msg = parsed.assistant_message || `Updated ${Object.keys(updates).length} field(s).`;
  if (!msg.includes('Fields vary by bank')) msg += ' Fields vary by bank.';
  if ((lang === 'hi' || lang === 'mixed') && !/[\u0900-\u097F]/.test(msg)) {
    const hiLead =
      lang === 'hi'
        ? 'हिन्दी में समझा।'
        : 'हिन्दी और English दोनों में समझा।';
    msg = `${hiLead} ${msg}`;
  }

  const enNext = missing.length ? `Please provide: ${missing[0]}` : null;

  return {
    field_updates: updates,
    missing_required: missing,
    next_ask: localizeAsk(lang, enNext, missing[0] ?? null),
    reply_lang: lang,
    gates: parsed.gates || { answers: {} },
    completeness,
    refuse_live_submit: !!parsed.refuse_live_submit,
    refuse_message: parsed.refuse_live_submit
      ? 'Refusing live bank submit. Draft only.'
      : undefined,
    source: 'gemini',
    assistant_message: msg,
  };
}

function cors(res: { set: (k: string, v: string) => void }): void {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
}

async function handleExtract(req: {
  method: string;
  body: unknown;
}, res: {
  status: (n: number) => { json: (b: unknown) => void; send: (b: string) => void };
  set: (k: string, v: string) => void;
  json: (b: unknown) => void;
}): Promise<void> {
  cors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }

  const body = (typeof req.body === 'string' ? JSON.parse(req.body as string) : req.body) || {};
  const utterance = String((body as { utterance?: string }).utterance || '').trim();
  const current = ((body as { current_values?: FormValues }).current_values || {}) as FormValues;

  if (!utterance) {
    res.status(400).json({ error: 'utterance required' });
    return;
  }

  // GEMINI_API_KEY from env (emulator export) or Functions env / Secret Manager injection
  const key = process.env.GEMINI_API_KEY || '';

  try {
    if (key) {
      const gem = await callGemini(key, utterance, current);
      if (gem) {
        res.json(gem);
        return;
      }
    }
  } catch (err) {
    console.warn('Gemini failed, heuristic fallback', err);
  }

  res.json(heuristicExtract(utterance, current));
}

/**
 * POST body: { utterance: string, current_values?: object }
 * Uses Gemini when GEMINI_API_KEY is set; otherwise heuristic.
 * Set key: `export GEMINI_API_KEY=...` (emulator) or
 * `firebase functions:secrets:set GEMINI_API_KEY` + bind in console / params.
 */
export const extract = onRequest({ cors: true, invoker: 'public' }, async (req, res) => {
  await handleExtract(req, res);
});

/** Alias for local/emulator clarity — same behaviour as extract. */
export const extractLocal = onRequest({ cors: true, invoker: 'public' }, async (req, res) => {
  await handleExtract(req, res);
});
