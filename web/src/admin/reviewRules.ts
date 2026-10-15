import type { FieldRecord } from '../../../shared/forms/types';

/** Rows under this confidence must be checked before publish. */
export const CONFIDENCE_CHECK_BELOW = 0.8;

export function needsConfidenceCheck(field: FieldRecord): boolean {
  return field.confidence < CONFIDENCE_CHECK_BELOW && !field.checked;
}

export function publishBlocked(fields: FieldRecord[]): boolean {
  return fields.some(needsConfidenceCheck);
}

export function fieldsByLowestConfidence(fields: FieldRecord[]): FieldRecord[] {
  return fields
    .map((field, index) => ({ field, index }))
    .sort(
      (a, b) => a.field.confidence - b.field.confidence || a.field.order - b.field.order || a.index - b.index,
    )
    .map((row) => row.field);
}
