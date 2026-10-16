import { HDFC_V1, schemaFieldIdSet } from './hdfcV1';
import type { FieldRecord, FormVersion } from './types';

/**
 * The form a session fills. The bundled HDFC v1 drives the shared schema (questions,
 * voice extraction, read-back). A published form from Firestore reuses those shared
 * field ids where it has them, and adds its own bank-only fields on top.
 */

const SHARED_IDS = schemaFieldIdSet(HDFC_V1);

export function formKey(form: Pick<FormVersion, 'formId' | 'version'>): string {
  return `${form.formId}@${form.version}`;
}

export function isBundledForm(form: Pick<FormVersion, 'formId'>): boolean {
  return form.formId === HDFC_V1.formId;
}

/** Fields the shared conversation already collects that this form also prints. */
export function sharedFieldsOnForm(form: FormVersion): FieldRecord[] {
  if (isBundledForm(form)) return [];
  return form.fields.filter((field) => SHARED_IDS.has(field.id));
}

/** Fields only this bank's form has. The bundled form has none. */
export function bankOnlyFields(form: FormVersion): FieldRecord[] {
  if (isBundledForm(form)) return [];
  return form.fields
    .filter((field) => !SHARED_IDS.has(field.id))
    .sort((a, b) => a.page - b.page || a.order - b.order);
}

export interface BankFieldSection {
  name: string;
  fields: FieldRecord[];
}

/** Bank-only fields grouped by the section the admin review kept, in page order. */
export function bankFieldSections(form: FormVersion): BankFieldSection[] {
  const sections: BankFieldSection[] = [];
  const byName = new Map<string, BankFieldSection>();
  for (const field of bankOnlyFields(form)) {
    const name = field.section?.trim() || 'Other fields';
    let section = byName.get(name);
    if (!section) {
      section = { name, fields: [] };
      byName.set(name, section);
      sections.push(section);
    }
    section.fields.push(field);
  }
  return sections;
}

/** Restored sessions keep only a well-formed published form. */
export function parseStoredForm(raw: unknown): FormVersion | null {
  if (!raw || typeof raw !== 'object') return null;
  const form = raw as FormVersion;
  if (typeof form.formId !== 'string' || typeof form.version !== 'string') return null;
  if (form.status !== 'published' || !Array.isArray(form.fields)) return null;
  if (isBundledForm(form)) return HDFC_V1;
  return form;
}
