import { describe, expect, it } from 'vitest';
import { placeholderFormVersion } from './placeholderForm';
import { fieldsByLowestConfidence, publishBlocked } from './reviewRules';

describe('publish gate', () => {
  const form = placeholderFormVersion({ bankId: 'HDFC', journey: 'account_opening', fillable: true });

  it('sorts the lowest confidence first', () => {
    const sorted = fieldsByLowestConfidence(form.fields);
    expect(sorted[0]?.label).toBe('Annual income');
    expect(sorted[0]?.confidence).toBeLessThan(sorted[1]?.confidence ?? 1);
  });

  it('blocks publish until every field under 0.8 is checked', () => {
    expect(publishBlocked(form.fields)).toBe(true);
    const checkedLows = form.fields.map((field) =>
      field.confidence < 0.8 ? { ...field, checked: true } : field,
    );
    expect(publishBlocked(checkedLows)).toBe(false);
    const almost = checkedLows.map((field) =>
      field.confidence === 0.79 ? { ...field, checked: false } : field,
    );
    expect(publishBlocked(almost)).toBe(true);
  });
});
