import { bankOnlyFields, isBundledForm } from '../forms/activeForm';
import type { FieldRecord, FieldType, FormVersion } from '../forms/types';

/**
 * The bank-only boxes the speak call may fill by voice, sent as the `form_fields` part.
 * The server re-validates all of this; the limits here only keep the request and the
 * prompt small and keep bank-staff boxes away from the model.
 */

export interface SpeakFormField {
  id: string;
  label: string;
  type: FieldType;
  options?: string[];
  section?: string;
}

export const MAX_SPEAK_FORM_FIELDS = 120;
const MAX_LABEL = 80;
const MAX_SECTION = 60;
const MAX_OPTION = 60;
const MAX_OPTIONS = 20;
const ID_RE = /^custom_[a-z0-9_]{1,64}$/;

/** Sections the bank fills in, or another person's details. */
const OFFICE_SECTION =
  /office use|bank use|for (?:the )?bank|for [a-z ]*bank limited|branch|official|verification carried out|due diligence|acknowledg|customer copy|joint appl|signature|thumb/i;

/** Boxes the bank fills in, or that cannot be spoken (signatures, photos). */
const OFFICE_LABEL =
  /branch|official|\bemployee\b|\bemp\.?(?:\s|$)|\bemp\s*(?:name|code|designation|branch)|sol\s*id|due diligence|signature|thumb|photo|\bs\.?\s?s\.? no\b|service request|request received|scheme code|\bstamp\b|\bseal\b|verified by|authori[sz]ed by|for bank use|office use/i;

/**
 * Sections about the account or a rarer declaration rather than the applicant. They are
 * still sent when there is room, but the cap fills with applicant details first.
 */
const LATER_SECTION =
  /huf|hindu undivided|mismatch|inoperative|remittance|initial payment|fd\/rd|fd advice|interest payment|maturity|mode of operation|nominat|minor|\bda1\b|products? & offering|profile update/i;

/** Flatten to one line; the server rejects control characters and fence-like brackets anyway. */
function clean(text: string | undefined, max: number): string {
  return (text ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/[<>`{}[\]\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim();
}

export function isOfficeField(field: Pick<FieldRecord, 'label' | 'section'>): boolean {
  return OFFICE_SECTION.test(field.section ?? '') || OFFICE_LABEL.test(field.label);
}

/** Null for the bundled HDFC form: its requests must not carry a form_fields part. */
export function speakFormFields(form: FormVersion): SpeakFormField[] | null {
  if (isBundledForm(form)) return null;
  const rows: Array<{ row: SpeakFormField; later: boolean }> = [];
  for (const field of bankOnlyFields(form)) {
    if (!ID_RE.test(field.id) || field.type === 'partial') continue;
    if (isOfficeField(field)) continue;
    const label = clean(field.label, MAX_LABEL);
    if (!label) continue;
    const row: SpeakFormField = { id: field.id, label, type: field.type };
    const section = clean(field.section, MAX_SECTION);
    if (section) row.section = section;
    if (field.type === 'choice') {
      const options = (field.options ?? []).filter(
        (option) => option.length > 0 && option.length <= MAX_OPTION && clean(option, MAX_OPTION) === option,
      );
      if (options.length === 0 || options.length > MAX_OPTIONS) continue;
      row.options = options;
    }
    rows.push({ row, later: LATER_SECTION.test(field.section ?? '') });
  }
  // Applicant boxes win the cap; what is kept stays in form order.
  const keep = new Set(
    [...rows.filter((entry) => !entry.later), ...rows.filter((entry) => entry.later)]
      .slice(0, MAX_SPEAK_FORM_FIELDS)
      .map((entry) => entry.row),
  );
  const out = rows.filter((entry) => keep.has(entry.row)).map((entry) => entry.row);
  return out.length > 0 ? out : null;
}
