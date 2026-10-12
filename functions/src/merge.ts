/** Field-update merge helpers (no Gemini). */

export type FieldValue = string | boolean | null;
export type FormValues = Record<string, FieldValue>;

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

const FIELD_ID_SET = new Set<string>(FIELD_IDS);

/** Wrong / shorthand keys models sometimes invent → canonical schema ids. */
const ALIASES: Record<string, string> = {
  full_name: 'applicant_full_name',
  name: 'applicant_full_name',
  applicant_name: 'applicant_full_name',
  customer_name: 'applicant_full_name',
  father_name: 'father_or_spouse_name',
  fathers_name: 'father_or_spouse_name',
  father: 'father_or_spouse_name',
  spouse_name: 'father_or_spouse_name',
  husband_name: 'father_or_spouse_name',
  wife_name: 'father_or_spouse_name',
  parent_name: 'father_or_spouse_name',
};

const FATHER_CUE =
  /\b(?:father|father'?s|spouse|husband|wife|parent|माता|पिता|पति|पत्नी|श्रीमान|श्रीमती)\b/i;
const APPLICANT_CUE =
  /\b(?:my name is|i am|i'm|myself|मेरा नाम|मेरा पूरा नाम|मैं\s)\b/i;

export function isFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'boolean') return true;
  if (typeof value === 'string') return value.trim().length > 0;
  return false;
}

function normName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Canonicalize keys, drop unknown ids, then protect filled fields.
 * Remaps a mis-bound second name onto father_or_spouse_name when needed.
 */
export function mergeFieldUpdates(
  current: FormValues,
  rawUpdates: Record<string, unknown> | FormValues,
  transcript = '',
): FormValues {
  const incoming: FormValues = {};
  for (const [rawKey, value] of Object.entries(rawUpdates || {})) {
    const key = ALIASES[rawKey] || rawKey;
    if (!FIELD_ID_SET.has(key)) continue;
    if (value === undefined) continue;
    incoming[key] = value as FieldValue;
  }

  // If model set both alias paths onto applicant only, restore father from cues.
  if (
    isFilled(incoming.applicant_full_name) &&
    !isFilled(incoming.father_or_spouse_name) &&
    isFilled(current.applicant_full_name) &&
    !isFilled(current.father_or_spouse_name)
  ) {
    const nextName = String(incoming.applicant_full_name);
    const curName = String(current.applicant_full_name);
    if (normName(nextName) !== normName(curName)) {
      const fatherish = FATHER_CUE.test(transcript) || !APPLICANT_CUE.test(transcript);
      if (fatherish) {
        incoming.father_or_spouse_name = nextName;
        delete incoming.applicant_full_name;
      }
    }
  }

  // Prefer explicit father id when both names arrive equal to the already-filled applicant.
  if (
    isFilled(incoming.applicant_full_name) &&
    isFilled(incoming.father_or_spouse_name) &&
    isFilled(current.applicant_full_name) &&
    normName(String(incoming.applicant_full_name)) === normName(String(current.applicant_full_name))
  ) {
    delete incoming.applicant_full_name;
  }

  const out: FormValues = {};
  for (const [key, value] of Object.entries(incoming)) {
    if (value === undefined) continue;
    // Do not clear an already-filled field with empty / null from a partial extract.
    if ((value === null || value === '') && isFilled(current[key])) continue;

    if (isFilled(current[key]) && typeof current[key] === 'string' && typeof value === 'string') {
      if (normName(String(current[key])) === normName(value)) continue; // no-op
      // Protect filled applicant name from a different string that belongs elsewhere.
      if (
        key === 'applicant_full_name' &&
        !isFilled(current.father_or_spouse_name) &&
        (FATHER_CUE.test(transcript) || !APPLICANT_CUE.test(transcript))
      ) {
        if (!isFilled(out.father_or_spouse_name) && !isFilled(incoming.father_or_spouse_name)) {
          out.father_or_spouse_name = value;
        }
        continue;
      }
    }
    out[key] = value;
  }
  return out;
}

export function buildNextAsk(
  missing: string[],
  replyLang: 'hi' | 'en',
  askTable: Record<string, string>,
  modelAsk?: string | null,
): string | null {
  if (missing.length === 0) return null;
  const fallbackOne = askTable[missing[0]] || (replyLang === 'hi' ? 'अगली ज़रूरी जानकारी बताएं।' : 'Please share the next required detail.');
  if (missing.length >= 2) {
    const a = askTable[missing[0]];
    const b = askTable[missing[1]];
    if (a && b) {
      const combo =
        replyLang === 'hi'
          ? `${a} अगर हो तो ${labelHint(missing[1], replyLang)} भी बता दें।`
          : `${a} If you have it, also share ${labelHint(missing[1], replyLang)}.`;
      // Prefer model ask only when it does not re-ask a filled-only topic; we already pass missing.
      if (modelAsk && modelAsk.trim() && !looksLikeReaskFilled(modelAsk, missing)) {
        return modelAsk.trim();
      }
      return combo;
    }
  }
  if (modelAsk && modelAsk.trim() && !looksLikeReaskFilled(modelAsk, missing)) {
    return modelAsk.trim();
  }
  return fallbackOne;
}

function labelHint(id: string, lang: 'hi' | 'en'): string {
  const en: Record<string, string> = {
    dob: 'date of birth',
    mobile_registered: 'mobile number',
    pan_number: 'PAN',
    pan_available: 'whether you have a PAN',
    addr_current_city: 'city',
    addr_current_pin: 'PIN code',
    father_or_spouse_name: "father's or spouse's name",
    applicant_full_name: 'full name',
  };
  const hi: Record<string, string> = {
    dob: 'जन्म तिथि',
    mobile_registered: 'मोबाइल नंबर',
    pan_number: 'पैन',
    father_or_spouse_name: 'पिता या पति/पत्नी का नाम',
    applicant_full_name: 'पूरा नाम',
  };
  return (lang === 'hi' ? hi : en)[id] || id;
}

function looksLikeReaskFilled(ask: string, missing: string[]): boolean {
  // If the ask clearly targets applicant name but applicant is not missing, reject.
  if (!missing.includes('applicant_full_name') && /\b(full name|your name|पूरा नाम|अपना नाम)\b/i.test(ask)) {
    return true;
  }
  return false;
}
