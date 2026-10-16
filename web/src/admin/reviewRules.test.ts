import { describe, expect, it } from 'vitest';
import { placeholderFormVersion } from './placeholderForm';
import { fieldsByLowestConfidence, isAutoAccepted, publishBlocked } from './reviewRules';

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
});
