import { AUTO_ACCEPT_ABOVE, fieldAutoAccepted, isAutoAccepted, unconfirmedLowConfidence } from '../../../shared/forms/review';
import type { FieldRecord } from '../../../shared/forms/types';

export { AUTO_ACCEPT_ABOVE, fieldAutoAccepted, isAutoAccepted };

/** A field at or below the threshold that the admin has not confirmed yet. */
export function needsConfidenceCheck(field: FieldRecord): boolean {
  return !fieldAutoAccepted(field) && !field.checked;
}

export function publishBlocked(fields: FieldRecord[]): boolean {
  return unconfirmedLowConfidence(fields).length > 0;
}

export function fieldsByLowestConfidence(fields: FieldRecord[]): FieldRecord[] {
  return fields
    .map((field, index) => ({ field, index }))
    .sort(
      (a, b) => a.field.confidence - b.field.confidence || a.field.order - b.field.order || a.index - b.index,
    )
    .map((row) => row.field);
}
