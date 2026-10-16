import { describe, expect, it } from 'vitest';
import { placeholderFormVersion } from './placeholderForm';
import { fieldAutoAccepted, fieldsByLowestConfidence, isAutoAccepted, publishBlocked } from './reviewRules';

describe('publish gate', () => {
  const form = placeholderFormVersion({ bankId: 'HDFC', journey: 'account_opening', fillable: true });

  it('sorts the lowest confidence first', () => {
    const sorted = fieldsByLowestConfidence(form.fields);
    expect(sorted[0]?.label).toBe('Annual income');
    expect(sorted[0]?.confidence).toBeLessThan(sorted[1]?.confidence ?? 1);
  });

  it('auto-accepts above 0.85 and blocks publish until every field at or below it is checked', () => {
    expect(isAutoAccepted(0.86)).toBe(true);
    expect(isAutoAccepted(0.85)).toBe(false);
    expect(publishBlocked(form.fields)).toBe(true);
    const checkedLows = form.fields.map((field) =>
      field.confidence <= 0.85 ? { ...field, checked: true } : field,
    );
    expect(publishBlocked(checkedLows)).toBe(false);
    const almost = checkedLows.map((field) =>
      field.confidence === 0.84 ? { ...field, checked: false } : field,
    );
    expect(publishBlocked(almost)).toBe(true);
  });

  it('accepts bank-only fields read from a fillable PDF whatever their library-match score', () => {
    const base = form.fields[0];
    // re-kyc-form-for-individuals.pdf: 120 of 129 widgets are bank-only and score 0–23%.
    const bankOnlyWidget = { ...base, id: 'custom_per_in_cust_tel', pdfField: 'per_in_cust_tel', confidence: 0, checked: false };
    const sharedMatch = { ...base, id: 'addr_current_city', pdfField: 'city_1', confidence: 0.72, checked: false };
    const ocrCustom = { ...base, id: 'custom_city_of_birth', pdfField: undefined, confidence: 0.4, checked: false };
    expect(fieldAutoAccepted(bankOnlyWidget)).toBe(true);
    expect(fieldAutoAccepted(sharedMatch)).toBe(false);
    expect(fieldAutoAccepted(ocrCustom)).toBe(false);
    expect(publishBlocked([bankOnlyWidget])).toBe(false);
    expect(publishBlocked([bankOnlyWidget, sharedMatch])).toBe(true);
  });
});
