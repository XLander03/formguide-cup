import type { FieldRecord, FormVersion } from '../../../shared/forms/types';

/** Local stand-in. Not a bank form id. */
export const PLACEHOLDER_FORM_ID = 'local-placeholder';

export function placeholderFormVersion(input: {
  bankId: string;
  journey: string;
  fillable: boolean;
}): FormVersion {
  const fields: FieldRecord[] = [
    field('applicant_full_name', 'Full name', 'text', 1, 0.96, 1, { x: 48, y: 760, w: 280, h: 24 }, { required: true, pii: true, section: 'Identity', pdfField: 'txt_name' }),
    field('dob', 'Date of birth', 'date', 2, 0.91, 1, { x: 340, y: 760, w: 180, h: 24 }, { required: true, pii: true, section: 'Identity' }),
    field('mobile_registered', 'Mobile', 'phone', 3, 0.62, 1, { x: 48, y: 700, w: 200, h: 24 }, { required: true, pii: true, section: 'Contact' }),
    field('email', 'Email', 'email', 4, 0.55, 1, { x: 270, y: 700, w: 250, h: 24 }, { required: false, pii: true, section: 'Contact' }),
    field('addr_current_pin', 'PIN code', 'pin', 5, 0.88, 1, { x: 48, y: 640, w: 120, h: 24 }, { required: true, pii: false, section: 'Address', maxChars: 6 }),
    field('pan_number', 'PAN', 'text', 6, 0.41, 1, { x: 190, y: 640, w: 180, h: 24 }, { required: true, pii: true, section: 'Identity', maxChars: 10 }),
    field('gender', 'Gender', 'choice', 7, 0.73, 1, { x: 48, y: 560, w: 220, h: 40 }, { required: true, pii: false, section: 'Identity', options: ['Female', 'Male', 'Other'] }),
    field('addr_current_line1', 'Address line', 'text', 8, 0.84, 2, { x: 48, y: 760, w: 460, h: 24 }, { required: true, pii: true, section: 'Address' }),
    field('annual_income', 'Annual income', 'number', 9, 0.33, 2, { x: 48, y: 680, w: 180, h: 24 }, { required: false, pii: false, section: 'Profile' }),
    field('pep_declaration', 'PEP', 'checkbox', 10, 0.9, 2, { x: 48, y: 620, w: 20, h: 20 }, { required: true, pii: false, section: 'Profile' }),
    field('aadhaar_last_digits', 'Aadhaar last digits', 'partial', 11, 0.47, 2, { x: 48, y: 560, w: 140, h: 24 }, { required: false, pii: true, section: 'KYC', partial: { keep: 'last', count: 4 }, maxChars: 4 }),
    field('account_product_intent', 'Account type', 'choice', 12, 0.79, 2, { x: 220, y: 540, w: 240, h: 36 }, { required: true, pii: false, section: 'Account', options: ['Savings', 'Current'] }),
  ];

  return {
    formId: PLACEHOLDER_FORM_ID,
    version: 'v1',
    bankId: input.bankId,
    journey: input.journey,
    status: 'draft',
    source: input.fillable ? 'acroform' : 'ocr',
    pdfPath: 'placeholder://two-page',
    fields,
  };
}

function field(
  id: string,
  label: string,
  type: FieldRecord['type'],
  order: number,
  confidence: number,
  page: number,
  box: FieldRecord['box'],
  extra: Partial<FieldRecord>,
): FieldRecord {
  return {
    id,
    label,
    type,
    required: false,
    pii: false,
    order,
    confidence,
    checked: false,
    page,
    box,
    ...extra,
  };
}
