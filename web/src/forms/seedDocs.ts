import { HDFC_V1, schemaBoundFields } from './hdfcV1';
import type { FieldRecord, FormVersion } from './types';

export interface SeedDocument {
  path: string;
  data: Record<string, string | boolean>;
}

function libraryRecord(field: FieldRecord): Record<string, string | boolean> {
  const data: Record<string, string | boolean> = {
    status: 'published',
    fieldId: field.id,
    label: field.label,
    type: field.type,
    required: field.required,
    pii: field.pii,
  };
  if (field.section) data.section = field.section;
  if (field.options) data.options = field.options.join('|');
  if (field.partial) data.partial = `${field.partial.keep}:${field.partial.count}`;
  return data;
}

/** Documents the seed script writes. Published only. No invented form ids. */
export function seedDocuments(form: FormVersion = HDFC_V1): SeedDocument[] {
  const docs: SeedDocument[] = [
    {
      path: `banks/${form.bankId}`,
      data: {
        status: 'published',
        bankId: form.bankId,
        citeAs: 'HDFC Forms Centre — Personal',
        url: 'https://www.hdfc.bank.in/resources/forms-centre/forms-centre-personal',
      },
    },
    {
      path: `forms/${form.formId}`,
      data: {
        status: 'published',
        formId: form.formId,
        bankId: form.bankId,
        journey: form.journey,
        pdfPath: form.pdfPath,
        title: form.formId,
      },
    },
    {
      path: `forms/${form.formId}/versions/${form.version}`,
      data: {
        status: form.status,
        formId: form.formId,
        version: form.version,
        bankId: form.bankId,
        journey: form.journey,
        source: form.source,
        pdfPath: form.pdfPath,
        payload: JSON.stringify(form),
      },
    },
  ];
  for (const field of schemaBoundFields(form)) {
    docs.push({ path: `fieldLibrary/${field.id}`, data: libraryRecord(field) });
  }
  return docs;
}
