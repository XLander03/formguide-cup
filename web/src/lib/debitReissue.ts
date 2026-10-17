import type { FormValues } from './types';

/** Researcher field list (14 Oct 2026). Not a bank form ID. */
export const DEBIT_JOURNEY = 'debit_reissue';

export const HELPLINE_COPY =
  "For a lost card, block it right away through your bank's helpline or app first.";

export const REGISTERED_ADDRESS_COPY = 'Card goes to your registered address';

export const OLD_CARD_BLOCKED_ACK =
  "I understand the old card is permanently blocked and can't be used again, even if found";

export const CARD_REASONS = ['lost_or_misplaced', 'stolen', 'damaged', 'other'] as const;

export const REASON_LABEL: Record<string, string> = {
  lost_or_misplaced: 'Lost or misplaced',
  stolen: 'Stolen',
  damaged: 'Damaged',
  other: 'Other',
};

/** Ids this journey fills. AOF/KYC ids stay off the draft. */
export const DEBIT_VALUE_IDS = [
  'applicant_full_name',
  'card_customer_id',
  'card_account_number',
  'card_last4',
  'card_reason',
  'card_reason_other',
  'card_reissue_new',
  'card_charges_account',
  'card_remarks',
  'card_confirm_mobile',
  'card_old_blocked_ack',
  'preferred_language',
  'readback_confirmed',
  'draft_only_ack',
  'no_live_submit_ack',
] as const;

const DEBIT_ONLY = new Set([
  'card_customer_id',
  'card_account_number',
  'card_last4',
  'card_reason',
  'card_reason_other',
  'card_reissue_new',
  'card_charges_account',
  'card_remarks',
  'card_confirm_mobile',
  'card_old_blocked_ack',
]);

export function isDebitJourney(value: unknown): boolean {
  return value === DEBIT_JOURNEY;
}

/** Spoken or pasted card numbers become the last 4 digits. Shorter input is kept while typing. */
export function cardLast4(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length <= 4) return digits;
  return digits.slice(-4);
}

export function debitDefaults(): FormValues {
  return {
    card_reissue_new: true,
    card_charges_account: 'same account',
  };
}

/**
 * Drop full card numbers from any stored string, and PIN/CVV/OTP from card fields.
 * A string with nothing to drop is returned untouched, so typing a trailing space
 * or an Indian postal "PIN 560001" in an address keeps working.
 */
export function redactFullCardNumbers(values: FormValues): FormValues {
  const next: FormValues = { ...values };
  for (const [key, value] of Object.entries(next)) {
    if (typeof value !== 'string') continue;
    if (key === 'card_last4') {
      next[key] = cardLast4(value);
      continue;
    }
    let text = value;
    if (key.startsWith('card_')) text = text.replace(/\b(?:pin|cvv|otp)\b[:\s-]*\d{3,8}/gi, '');
    text = text.replace(/\d[\d\s-]{14,}\d/g, (run) => {
      const digits = run.replace(/\D/g, '');
      if (digits.length < 16 || digits.length > 19) return run;
      if (!next.card_last4) next.card_last4 = digits.slice(-4);
      return '';
    });
    if (text !== value) next[key] = text.replace(/\s{2,}/g, ' ').trim();
  }
  if (typeof next.card_last4 === 'string') next.card_last4 = cardLast4(next.card_last4);
  return next;
}

export function stripDebitOnly(updates: FormValues): FormValues {
  const next: FormValues = { ...updates };
  for (const id of DEBIT_ONLY) delete next[id];
  return next;
}

export function keepDebitUpdates(updates: FormValues): FormValues {
  const next: FormValues = {};
  for (const [key, value] of Object.entries(updates)) {
    if (key === 'journey_mode' || (DEBIT_VALUE_IDS as readonly string[]).includes(key)) next[key] = value;
  }
  return next;
}

function labeledDigits(text: string, label: RegExp): string | null {
  const match = label.exec(text);
  if (!match) return null;
  const digits = match[1].replace(/\D/g, '');
  return digits || null;
}

export function extractDebitSlots(text: string): FormValues {
  const updates: FormValues = {};
  const customer = text.match(
    /(?:customer\s*id|cust(?:omer)?\s*id|cif|ग्राहक\s*(?:आईडी|आई\.?\s*डी\.?|id))\s*(?:is|number|no\.?)?\s*[:#-]?\s*([A-Za-z0-9]{4,20})/i,
  );
  if (customer) updates.card_customer_id = customer[1].toUpperCase();

  const account = labeledDigits(
    text,
    /(?:account\s*(?:number|no\.?|#)?|a\/c|खाता\s*(?:संख्या|नंबर|नम्बर))\s*(?:is)?\s*[:#-]?\s*(\d[\d\s-]{5,20})/i,
  );
  if (account && account.length >= 6 && account.length <= 18) updates.card_account_number = account;

  const labeledCard = labeledDigits(
    text,
    /(?:debit\s*card|atm\s*card|कार्ड|card)\s*(?:number|no\.?|नंबर|नम्बर|ending|last\s*(?:four|4))?\s*[:#-]?\s*((?:\d[\s-]*){4,24})/i,
  );
  const lastFourCue = text.match(/(?:last\s*(?:four|4)|आखिरी\s*चार|ending)\s*[:#-]?\s*(\d{4})\b/i);
  if (labeledCard && labeledCard.length >= 4) updates.card_last4 = labeledCard.slice(-4);
  else if (lastFourCue) updates.card_last4 = lastFourCue[1];
  else {
    const runs = text.match(/\d[\d\s-]{14,}\d/g) ?? [];
    for (const run of runs) {
      const digits = run.replace(/\D/g, '');
      if (digits.length < 16 || digits === account) continue;
      updates.card_last4 = digits.slice(-4);
      break;
    }
  }

  if (/चोरी|stolen|theft/i.test(text)) updates.card_reason = 'stolen';
  else if (/खराब|टूट|damaged|broken/i.test(text)) updates.card_reason = 'damaged';
  else if (/खो|गुम|misplaced|\blost\b/i.test(text)) updates.card_reason = 'lost_or_misplaced';
  else if (/\bother\b|अन्य/.test(text)) updates.card_reason = 'other';

  if (updates.card_reason === 'other') {
    const specify = text.match(/\bother(?:\s+reason)?\s*[:\-]\s*([^.\n।]{2,80})/i);
    if (specify) updates.card_reason_other = specify[1].trim();
  }

  if (/\b(?:do not|don't|dont)\s+re-?issue\b|\bno new card\b|\bblock only\b|\bwithout a new card\b/i.test(text)) {
    updates.card_reissue_new = false;
  } else if (/\bre-?issue\b|\bnew card\b|\breplace(?:ment)?\b|नया कार्ड|फिर से/i.test(text)) {
    updates.card_reissue_new = true;
  }

  if (/\bsame account\b|उसी खाते/i.test(text)) updates.card_charges_account = 'same account';

  const remarks = text.match(/\bremarks?\s*[:\-]\s*([^.\n।]{2,120})/i);
  if (remarks) updates.card_remarks = remarks[1].trim();

  const mobile = text.match(
    /(?:confirmation\s+)?(?:mobile|मोबाइल)\s*(?:number|नंबर|नम्बर)?\s*(?:is|for confirmation)?\s*[:#-]?\s*([6-9]\d{9})\b/i,
  );
  if (mobile && mobile[1] !== updates.card_account_number) updates.card_confirm_mobile = mobile[1];

  if (/permanently blocked|old card is blocked|blocked and can'?t be used|पुराना कार्ड.*ब्लॉक/i.test(text)) {
    updates.card_old_blocked_ack = true;
  }

  return redactFullCardNumbers(updates);
}

export function debitReadback(values: FormValues, lang: 'en' | 'hi' | 'mixed'): string {
  const name = values.applicant_full_name || (lang === 'en' ? 'applicant' : 'आवेदक');
  const customer = values.card_customer_id || (lang === 'en' ? 'not set' : 'नहीं');
  const account = values.card_account_number || (lang === 'en' ? 'not set' : 'नहीं');
  const last4 = cardLast4(String(values.card_last4 || '')) || 'xxxx';
  const reason = REASON_LABEL[String(values.card_reason || '')] || String(values.card_reason || 'not set');
  const other = values.card_reason === 'other' && values.card_reason_other ? ` (${values.card_reason_other})` : '';
  const reissue = values.card_reissue_new === false ? (lang === 'en' ? 'no' : 'नहीं') : lang === 'en' ? 'yes' : 'हाँ';
  const en =
    `Please confirm this read-back. Debit card reissue. Name: ${name}. Customer ID: ${customer}. ` +
    `Account number: ${account}. Card last four: ${last4}. Reason: ${reason}${other}. ` +
    `Reissue a new card: ${reissue}. ${REGISTERED_ADDRESS_COPY}. ` +
    `This is a draft only. Fields vary by bank. No live bank submit.`;
  if (lang === 'en') return en;
  const hi =
    `कृपया इस रीड-बैक की पुष्टि करें। डेबिट कार्ड री-इश्यू। नाम: ${name}. ग्राहक आईडी: ${customer}. ` +
    `खाता संख्या: ${account}. कार्ड के आखिरी चार अंक ${last4}. कारण: ${reason}${other}. ` +
    `नया कार्ड: ${reissue}. ${REGISTERED_ADDRESS_COPY}. ` +
    `यह केवल ड्राफ्ट है। Fields vary by bank. बैंक में लाइव जमा नहीं होगा।`;
  if (lang === 'mixed') return `${hi} ${en}`;
  return hi;
}
