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

/**
 * A bank-only field read from a fillable PDF's own widget is certain: its name, type and box
 * come from the PDF. Its confidence is only how well that name matched a shared library id,
 * which it did not claim, so a low score there says nothing about the field itself.
 */
function isCertainWidget(field: FieldRecord): boolean {
  return Boolean(field.pdfField) && field.id.startsWith('custom_');
}

/**
 * Whether a field goes onto the form without an admin looking at it.
 * An unmatched OCR label stays in review even when the model reports a high score.
 * A fillable-PDF widget is different: its name and box come from the file.
 */
export function fieldAutoAccepted(field: FieldRecord): boolean {
  if (field.id.startsWith('custom_') && !field.pdfField) return false;
  return isCertainWidget(field) || isAutoAccepted(field.confidence);
}

/** Ingest marks high-confidence fields as already accepted. */
export function withAutoAccept(fields: FieldRecord[]): FieldRecord[] {
  return fields.map((field) => (fieldAutoAccepted(field) ? { ...field, checked: true } : field));
}

/** Fields that still block publish: not auto-accepted and not confirmed. */
export function unconfirmedLowConfidence(fields: FieldRecord[]): FieldRecord[] {
  return fields.filter((field) => !fieldAutoAccepted(field) && field.checked !== true);
}
