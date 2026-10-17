import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { derivedNameValue, splitName } from '../../../shared/forms/nameParts';
import { bankFieldSections, bankOnlyFields, parseStoredForm, sharedFieldsOnForm } from '../forms/activeForm';
import { HDFC_V1 } from '../forms/hdfcV1';
import type { FieldRecord, FormVersion } from '../forms/types';
import { fillPublishedPdf, planBoxWrites, publishedPdfUrl } from './publishedPdfFill';

function field(partial: Partial<FieldRecord> & Pick<FieldRecord, 'id' | 'type'>): FieldRecord {
  return {
    label: partial.id,
    required: false,
    pii: false,
    order: 0,
    confidence: 1,
    checked: true,
    page: 1,
    box: { x: 100, y: 700, w: 150, h: 14 },
    ...partial,
  };
}

const AXIS: FormVersion = {
  formId: 'form_axis',
  version: 'v1',
  bankId: 'Axis',
  journey: 'rekyc',
  status: 'published',
  source: 'ocr',
  pdfPath: 'forms/form_axis/versions/v1/source.pdf',
  fields: [
    field({ id: 'applicant_full_name', type: 'text', order: 1 }),
    field({ id: 'dob', type: 'date', order: 2, box: { x: 400, y: 700, w: 80, h: 12 } }),
    field({ id: 'ovd_poi_type', type: 'choice', order: 3, box: { x: 100, y: 650, w: 150, h: 14 } }),
    field({ id: 'tax_resident_india_only', type: 'checkbox', order: 4, box: { x: 50, y: 600, w: 10, h: 10 } }),
    field({ id: 'custom_female', type: 'checkbox', section: 'Applicant Details', order: 5, box: { x: 70, y: 600, w: 10, h: 10 } }),
    field({ id: 'custom_male', type: 'checkbox', section: 'Applicant Details', order: 6, box: { x: 90, y: 600, w: 10, h: 10 } }),
    field({ id: 'custom_city_of_birth', type: 'text', section: 'FATCA', page: 2, order: 1, box: { x: 100, y: 500, w: 120, h: 14 } }),
    field({ id: 'custom_no_box', type: 'text', page: 0, box: { x: 0, y: 0, w: 0, h: 0 } }),
  ],
};

describe('active form helpers', () => {
  it('splits a published form into shared schema fields and bank-only fields', () => {
    expect(sharedFieldsOnForm(AXIS).map((f) => f.id)).toEqual([
      'applicant_full_name',
      'dob',
      'ovd_poi_type',
      'tax_resident_india_only',
    ]);
    expect(bankOnlyFields(AXIS).map((f) => f.id)).toEqual([
      'custom_no_box',
      'custom_female',
      'custom_male',
      'custom_city_of_birth',
    ]);
    expect(bankFieldSections(AXIS).map((s) => [s.name, s.fields.length])).toEqual([
      ['Other fields', 1],
      ['Applicant Details', 2],
      ['FATCA', 1],
    ]);
  });

  it('gives the bundled HDFC form no bank-only fields', () => {
    expect(bankOnlyFields(HDFC_V1)).toEqual([]);
    expect(sharedFieldsOnForm(HDFC_V1)).toEqual([]);
  });

  it('restores only published forms from session storage', () => {
    expect(parseStoredForm(AXIS)).toBe(AXIS);
    expect(parseStoredForm({ ...AXIS, status: 'draft' })).toBeNull();
    expect(parseStoredForm({ formId: 'x' })).toBeNull();
    expect(parseStoredForm(JSON.parse(JSON.stringify(HDFC_V1)))).toBe(HDFC_V1);
  });
});

describe('planBoxWrites', () => {
  it('prints shared answers and bank-only answers into their boxes', () => {
    const writes = planBoxWrites(AXIS, {
      applicant_full_name: 'Priya Sharma',
      dob: '1990-04-12',
      ovd_poi_type: 'driving_licence',
      tax_resident_india_only: true,
      custom_female: true,
      custom_male: false,
      custom_city_of_birth: 'Pune',
      custom_no_box: 'never printed',
    });
    expect(writes.map((w) => [w.id, w.kind, w.kind === 'text' ? w.text : '✓'])).toEqual([
      ['applicant_full_name', 'text', 'Priya Sharma'],
      ['dob', 'text', '12/04/1990'],
      ['ovd_poi_type', 'text', 'driving licence'],
      ['tax_resident_india_only', 'check', '✓'],
      ['custom_female', 'check', '✓'],
      ['custom_city_of_birth', 'text', 'Pune'],
    ]);
  });

  it('never writes a value into a checkbox box', () => {
    const form = { ...AXIS, fields: [field({ id: 'mobile_registered', type: 'checkbox' })] };
    expect(planBoxWrites(form, { mobile_registered: '9876543210' })).toEqual([]);
  });

  it('writes nothing for an empty draft', () => {
    expect(planBoxWrites(AXIS, {})).toEqual([]);
  });

  const NAMES: FormVersion = {
    ...AXIS,
    fields: [
      field({ id: 'custom_customer_name_prefix', type: 'text', order: 1 }),
      field({ id: 'applicant_first_name', type: 'text', order: 2 }),
      field({ id: 'applicant_middle_name', type: 'text', order: 3 }),
      field({ id: 'applicant_last_name', type: 'text', order: 4 }),
      // "Name as per PAN" repeats the same person's name in a second row.
      field({ id: 'applicant_first_name', type: 'text', order: 5, box: { x: 100, y: 600, w: 150, h: 14 } }),
      field({ id: 'applicant_last_name', type: 'text', order: 6, box: { x: 300, y: 600, w: 150, h: 14 } }),
      field({ id: 'father_first_name', type: 'text', page: 2, order: 1 }),
      field({ id: 'father_middle_name', type: 'text', page: 2, order: 2 }),
      field({ id: 'father_last_name', type: 'text', page: 2, order: 3 }),
    ],
  };

  it('fills name-part cells from the full names', () => {
    const writes = planBoxWrites(NAMES, {
      applicant_full_name: 'Priya Sharma',
      father_or_spouse_name: 'Ramesh Kumar Sharma',
    });
    expect(writes.map((w) => [w.id, w.kind === 'text' ? w.text : '✓'])).toEqual([
      ['applicant_first_name', 'Priya'],
      ['applicant_last_name', 'Sharma'],
      ['applicant_first_name', 'Priya'],
      ['applicant_last_name', 'Sharma'],
      ['father_first_name', 'Ramesh'],
      ['father_middle_name', 'Kumar'],
      ['father_last_name', 'Sharma'],
    ]);
  });

  it('prefers a value typed for a name-part id', () => {
    const writes = planBoxWrites(NAMES, { applicant_full_name: 'Priya Sharma', applicant_last_name: 'Iyer' });
    expect(writes.filter((w) => w.id === 'applicant_last_name').map((w) => (w.kind === 'text' ? w.text : ''))).toEqual([
      'Iyer',
      'Iyer',
    ]);
  });

  it('repeats the current address in permanent cells when the user said they are the same', () => {
    const form = {
      ...NAMES,
      fields: [
        field({ id: 'addr_permanent_city', type: 'text' }),
        field({ id: 'addr_permanent_pin', type: 'pin' }),
      ],
    };
    const text = (values: Record<string, string | boolean>) =>
      planBoxWrites(form, values).map((w) => (w.kind === 'text' ? w.text : ''));
    const current = { addr_current_city: 'Bengaluru', addr_current_pin: '560038' };
    expect(text({ ...current, addr_permanent_same_as_current: true })).toEqual(['Bengaluru', '560038']);
    expect(text({ ...current, addr_permanent_same_as_current: false })).toEqual([]);
    expect(text({ ...current, addr_permanent_same_as_current: true, addr_permanent_city: 'Pune' })).toEqual([
      'Pune',
      '560038',
    ]);
  });

  it('prints a date as digits only when its cells cannot hold the slashes', () => {
    const form = {
      ...NAMES,
      fields: [field({ id: 'dob', type: 'date', maxChars: 8 }), field({ id: 'custom_date', type: 'date' })],
    };
    const writes = planBoxWrites(form, { dob: '1994-03-12', custom_date: '2026-10-17' });
    expect(writes.map((w) => (w.kind === 'text' ? w.text : ''))).toEqual(['12031994', '17/10/2026']);
  });

  it('never lists name-part cells as bank-only inputs', () => {
    expect(bankOnlyFields(NAMES).map((f) => f.id)).toEqual(['custom_customer_name_prefix']);
  });
});

describe('splitName', () => {
  it('cuts first, middle and last', () => {
    expect(splitName('Priya Sharma')).toEqual({ first: 'Priya', middle: '', last: 'Sharma' });
    expect(splitName('  Ramesh  Kumar Sharma ')).toEqual({ first: 'Ramesh', middle: 'Kumar', last: 'Sharma' });
    expect(splitName('A B C D')).toEqual({ first: 'A', middle: 'B C', last: 'D' });
  });

  it('keeps a single name as the first name only', () => {
    expect(splitName('Priya')).toEqual({ first: 'Priya', middle: '', last: '' });
    expect(splitName('')).toEqual({ first: '', middle: '', last: '' });
    expect(splitName('   ')).toEqual({ first: '', middle: '', last: '' });
  });

  it('drops a spoken salutation', () => {
    expect(splitName('Mr. Ramesh Sharma')).toEqual({ first: 'Ramesh', middle: '', last: 'Sharma' });
    expect(splitName('Smt Priya Devi Sharma')).toEqual({ first: 'Priya', middle: 'Devi', last: 'Sharma' });
    expect(splitName('Dr')).toEqual({ first: 'Dr', middle: '', last: '' });
  });

  it('derives only name-part ids', () => {
    const values = { applicant_full_name: 'Priya Sharma', father_or_spouse_name: null };
    expect(derivedNameValue('applicant_last_name', values)).toBe('Sharma');
    expect(derivedNameValue('father_first_name', values)).toBe('');
    expect(derivedNameValue('dob', values)).toBeUndefined();
  });
});

describe('fillPublishedPdf', () => {
  it('fills the real Axis Re-KYC PDF and keeps every page', async () => {
    // A plain Uint8Array copy: jsdom's realm does not accept a Node Buffer.
    const bytes = new Uint8Array(readFileSync(resolve(__dirname, '../../../corpus/bank-forms/Axis_ReKYC_Form.pdf')));
    const source = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const out = await fillPublishedPdf(
      bytes.buffer as ArrayBuffer,
      AXIS,
      { applicant_full_name: 'Priya Sharma', dob: '1990-04-12', custom_female: true, custom_city_of_birth: 'Pune' },
    );
    const filled = await PDFDocument.load(out);
    expect(filled.getPageCount()).toBe(source.getPageCount());
    expect(out.byteLength).toBeGreaterThan(bytes.byteLength / 2);
  });

  it('asks the server for the published version PDF', () => {
    expect(publishedPdfUrl(AXIS)).toBe('/api/publishedFormPdf?formId=form_axis&version=v1');
  });
});
