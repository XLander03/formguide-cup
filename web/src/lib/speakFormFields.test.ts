import { describe, expect, it } from 'vitest';
import { HDFC_V1 } from '../forms/hdfcV1';
import type { FieldRecord, FormVersion } from '../forms/types';
import { MAX_SPEAK_FORM_FIELDS, isOfficeField, speakFormFields } from './speakFormFields';

function field(id: string, label: string, extra: Partial<FieldRecord> = {}): FieldRecord {
  return {
    id,
    label,
    type: 'text',
    required: false,
    pii: false,
    order: 0,
    confidence: 1,
    checked: true,
    page: 1,
    box: { x: 0, y: 0, w: 10, h: 10 },
    ...extra,
  };
}

function form(fields: FieldRecord[]): FormVersion {
  return {
    formId: 'axis_rekyc',
    version: 'v1',
    bankId: 'Axis',
    journey: 'rekyc',
    status: 'published',
    source: 'ocr',
    pdfPath: 'x.pdf',
    fields,
  };
}

describe('speakFormFields', () => {
  it('sends nothing for the bundled HDFC form', () => {
    expect(speakFormFields(HDFC_V1)).toBeNull();
  });

  it('keeps customer boxes and drops shared ids and bank-office boxes', () => {
    const out = speakFormFields(
      form([
        field('applicant_full_name', 'Customer Name'),
        field('custom_salaried', 'Salaried', { type: 'checkbox', section: 'Applicant Details' }),
        field('custom_employers_name', "Employer's Name", { section: 'Applicant Details' }),
        field('custom_city_of_birth', 'City of Birth', { section: 'FATCA - CRS Declaration' }),
        field('custom_branch_sol_id', 'Branch Sol ID'),
        field('custom_emp_name', 'Emp. Name', { section: 'KYC Verification Carried Out By' }),
        field('custom_emp_code', 'Emp. Code'),
        field('custom_name_of_branch_official', 'Name of Branch Official', { section: 'Acknowledgement Copy' }),
        field('custom_resident_individual', 'Resident Individual', {
          type: 'checkbox',
          section: 'Branch Declaration - For Bank Use Only',
        }),
        field('custom_i_have_conducted', 'I have conducted necessary due diligence and confirm', { type: 'checkbox' }),
        field('custom_present_signature', 'Present Signature'),
        field('custom_office', 'Received on', { section: 'For Office Use Only' }),
        field('custom_axis', 'Authorised signatory', { section: 'For Axis Bank Limited' }),
        field('custom_joint_name', 'Name', { section: 'Customer Onboarding Section - Joint Appl' }),
        field('custom_s_s_no', 'S.S No'),
        field('custom_aadhaar_tail', 'Aadhaar', { type: 'partial' }),
        field('custom_choice_none', 'Pick one', { type: 'choice' }),
      ]),
    );
    expect(out?.map((f) => f.id)).toEqual(['custom_salaried', 'custom_employers_name', 'custom_city_of_birth']);
    expect(out?.[0]).toEqual({ id: 'custom_salaried', label: 'Salaried', type: 'checkbox', section: 'Applicant Details' });
  });

  it('caps the count and label length and flattens labels', () => {
    const many = Array.from({ length: 200 }, (_, i) =>
      field(`custom_f${i}`, `Line one\nline two <b> ${'x'.repeat(100)}`, { order: i }),
    );
    const out = speakFormFields(form(many)) ?? [];
    expect(out).toHaveLength(MAX_SPEAK_FORM_FIELDS);
    for (const row of out) {
      expect(row.label.length).toBeLessThanOrEqual(80);
      expect(row.label).not.toMatch(/[\n<>]/);
    }
  });

  it('fills the cap with applicant boxes before account and declaration sections', () => {
    const huf = Array.from({ length: 10 }, (_, i) =>
      field(`custom_huf_${i}`, `Place ${i}`, { section: 'HUF Declaration & Mandate', order: i }),
    );
    const applicant = Array.from({ length: MAX_SPEAK_FORM_FIELDS }, (_, i) =>
      field(`custom_a${i}`, `Box ${i}`, { section: 'Applicant Details', order: 100 + i }),
    );
    const out = speakFormFields(form([...huf, ...applicant])) ?? [];
    expect(out).toHaveLength(MAX_SPEAK_FORM_FIELDS);
    expect(out.every((row) => row.id.startsWith('custom_a'))).toBe(true);
  });

  it('sends choice options that fit the server limits', () => {
    const out = speakFormFields(
      form([
        field('custom_marital', 'Marital status', { type: 'choice', options: ['Married', 'Unmarried', 'x'.repeat(61)] }),
      ]),
    );
    expect(out?.[0].options).toEqual(['Married', 'Unmarried']);
  });

  it('does not treat employer or self-employed as office boxes', () => {
    expect(isOfficeField({ label: "Employer's Name", section: 'Applicant Details' })).toBe(false);
    expect(isOfficeField({ label: 'Self Employed', section: 'Applicant Details' })).toBe(false);
    expect(isOfficeField({ label: 'Emp. Designation', section: '' })).toBe(true);
  });
});
