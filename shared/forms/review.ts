import type { FieldRecord } from './types';

/**
 * Field confidence is 0–1. Extracted fields scoring above this are accepted
 * at ingest (`checked: true`) and go straight onto the form. Fields at or
 * below it wait for an admin to confirm, edit or remove them before publish.
 * Shared by ingest, the publish function and the admin review screen.
 */
export const AUTO_ACCEPT_ABOVE = 0.85;

export function isAutoAccepted(confidence: number): boolean {
  return confidence > AUTO_ACCEPT_ABOVE;
}

/** Ingest marks high-confidence fields as already accepted. */
export function withAutoAccept(fields: FieldRecord[]): FieldRecord[] {
  return fields.map((field) => (isAutoAccepted(field.confidence) ? { ...field, checked: true } : field));
}

/** Fields that still block publish: at or below the threshold and not confirmed. */
export function unconfirmedLowConfidence(fields: FieldRecord[]): FieldRecord[] {
  return fields.filter((field) => !isAutoAccepted(field.confidence) && field.checked !== true);
}
