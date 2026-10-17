import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FieldRecord, FormVersion } from '../forms/types';
import { BankFields } from './BankFields';

function field(id: string, label: string, type: FieldRecord['type'], section: string): FieldRecord {
  return {
    id,
    label,
    type,
    section,
    required: false,
    pii: false,
    order: 0,
    confidence: 1,
    checked: true,
    page: 1,
    box: { x: 0, y: 0, w: 10, h: 10 },
  };
}

const FORM: FormVersion = {
  formId: 'axis_rekyc',
  version: 'v1',
  bankId: 'Axis',
  journey: 'rekyc',
  status: 'published',
  source: 'ocr',
  pdfPath: 'x.pdf',
  fields: [
    field('custom_salaried', 'Salaried', 'checkbox', 'Applicant Details'),
    field('custom_retired', 'Retired', 'checkbox', 'Applicant Details'),
    field('custom_city_of_birth', 'City of Birth', 'text', 'FATCA - CRS Declaration'),
    field('custom_place_1', 'Place 1', 'text', 'HUF Declaration'),
  ],
};

describe('BankFields voice provenance', () => {
  it('marks voice-filled boxes as heard and opens their sections', () => {
    const { container } = render(
      <BankFields
        form={FORM}
        values={{ custom_salaried: true, custom_retired: false, custom_city_of_birth: 'Pune', custom_place_1: 'Delhi' }}
        onChange={vi.fn()}
        flashIds={new Set(['custom_salaried'])}
        said={{ custom_salaried: 'I am salaried', custom_city_of_birth: 'born in Pune' }}
        fieldSource={{ custom_salaried: 'gemini', custom_city_of_birth: 'gemini', custom_place_1: 'manual' }}
      />,
    );
    expect(screen.getAllByText('✓ heard')).toHaveLength(2);
    expect(screen.getByText(/I am salaried/)).toBeTruthy();
    const open = Array.from(container.querySelectorAll('details')).map((d) => d.open);
    // Applicant Details and FATCA had voice fills; the typed HUF section stays closed.
    expect(open).toEqual([true, true, false]);
    expect(screen.getByLabelText(/Salaried/).closest('label')?.className).toContain('bg-saffron/30');
  });

  it('hides bank-use sections and boxes from the customer', () => {
    const form: FormVersion = {
      ...FORM,
      fields: [
        ...FORM.fields,
        field('custom_branch_sol_id', 'Branch Sol ID', 'text', 'Applicant Details'),
        field('custom_place', 'Place', 'text', 'Branch Declaration - For Bank Use Only'),
        field('custom_emp_name', 'Emp. Name', 'text', 'KYC Verification Carried Out By'),
      ],
    };
    render(<BankFields form={form} values={{}} onChange={vi.fn()} />);
    expect(screen.queryByText(/Branch Declaration/)).toBeNull();
    expect(screen.queryByText(/KYC Verification Carried Out By/)).toBeNull();
    expect(screen.queryByLabelText(/Branch Sol ID/)).toBeNull();
    expect(screen.getByLabelText(/City of Birth/)).toBeTruthy();
  });
});
