import { adminFormRow, adminStats, type AdminFormRow, type AdminFormsResponse } from '../../../shared/forms/admin';
import type { FieldRecord, FormStatus, FormVersion } from '../../../shared/forms/types';
import { PLACEHOLDER_FORM_ID, placeholderFormVersion } from './placeholderForm';

/**
 * In-memory stand-in for the admin console endpoints under `?mock=1`.
 * Actions change it, so the console behaves like the real thing in a dev tab.
 */
interface MockEntry {
  form: FormVersion;
  updatedAt: string | null;
}

let entries: MockEntry[] | null = null;

interface MockSpec {
  formId: string;
  bankId: string;
  journey: string;
  status: FormStatus;
  fillable: boolean;
  fields: number;
  shared: number;
  needsReview: number;
}

/**
 * A form shaped like a real upload: `fields` fields, `shared` of them on the
 * shared library (so voice fills them) and `needsReview` low-confidence ones
 * still unchecked. Boxes reuse the placeholder's, so review still renders.
 */
function mockForm(spec: MockSpec): FormVersion {
  const base = placeholderFormVersion({ bankId: spec.bankId, journey: spec.journey, fillable: spec.fillable });
  const fields: FieldRecord[] = Array.from({ length: spec.fields }, (_, index) => {
    const shape = base.fields[index % base.fields.length];
    const round = Math.floor(index / base.fields.length);
    const shared = index < spec.shared;
    const id = shared ? (round === 0 ? shape.id : `${shape.id}_${round + 1}`) : `custom_field_${index + 1}`;
    const unchecked = index >= spec.fields - spec.needsReview;
    return {
      ...shape,
      id,
      label: round === 0 ? shape.label : `${shape.label} ${round + 1}`,
      order: index + 1,
      pdfField: undefined,
      confidence: unchecked ? 0.5 : 0.95,
      checked: !unchecked,
    };
  });
  return { ...base, formId: spec.formId, status: spec.status, fields };
}

/** Mirrors production today: a live form with a newer draft, and repeated uploads of one PDF. */
function seed(): MockEntry[] {
  const icici = { bankId: 'ICICI', journey: 'rekyc', fillable: false, fields: 129, shared: 41, needsReview: 5 };
  return [
    mockForm({ formId: 'form_axis_aof_new', bankId: 'Axis', journey: 'account_opening', status: 'draft', fillable: false, fields: 262, shared: 23, needsReview: 0 }),
    mockForm({ formId: 'form_axis_aof_old', bankId: 'Axis', journey: 'account_opening', status: 'published', fillable: false, fields: 248, shared: 21, needsReview: 0 }),
    mockForm({ ...icici, formId: 'form_icici_rekyc_a', status: 'draft' }),
    mockForm({ ...icici, formId: 'form_icici_rekyc_b', status: 'draft' }),
    mockForm({ ...icici, formId: 'form_icici_rekyc_c', status: 'draft' }),
    mockForm({ ...icici, formId: 'form_icici_rekyc_live', status: 'published', needsReview: 0 }),
    mockForm({ formId: 'form_axis_rekyc', bankId: 'Axis', journey: 'rekyc', status: 'published', fillable: true, fields: 64, shared: 30, needsReview: 0 }),
  ].map((form) => ({ form, updatedAt: null }));
}

function store(): MockEntry[] {
  entries ??= seed();
  return entries;
}

export function resetMockConsole(): void {
  entries = null;
}

/** Same order as the server: newest updatedAt first, rows without one last by formId. */
function newestFirst(a: AdminFormRow, b: AdminFormRow): number {
  if (a.updatedAt && b.updatedAt && a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? 1 : -1;
  if (a.updatedAt && !b.updatedAt) return -1;
  if (!a.updatedAt && b.updatedAt) return 1;
  return a.formId.localeCompare(b.formId);
}

export function mockAdminForms(): AdminFormsResponse {
  const rows = store()
    .map((entry) => adminFormRow(entry.form, entry.updatedAt))
    .sort(newestFirst);
  // Production cannot read the voice counter yet either.
  return { forms: rows, stats: adminStats(rows, null) };
}

export function mockAdminForm(formId: string, version?: string): FormVersion {
  const entry = store().find(
    (item) => item.form.formId === formId && (!version || item.form.version === version),
  );
  if (entry) return entry.form;
  if (formId === PLACEHOLDER_FORM_ID) return placeholderFormVersion({ bankId: 'HDFC', journey: 'kyc_update', fillable: false });
  throw new Error('That form was not found.');
}

export function mockSetStatus(formId: string, version: string, status: FormStatus, form?: FormVersion): void {
  const list = store();
  const index = list.findIndex((item) => item.form.formId === formId && item.form.version === version);
  const now = new Date().toISOString();
  if (index < 0) {
    if (form) list.unshift({ form: { ...form, status }, updatedAt: now });
    return;
  }
  list[index] = { form: { ...(form ?? list[index].form), status }, updatedAt: now };
}
