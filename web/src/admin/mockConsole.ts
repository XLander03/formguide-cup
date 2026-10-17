import { adminFormRow, adminStats, type AdminFormsResponse } from '../../../shared/forms/admin';
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

function confirmed(fields: FieldRecord[]): FieldRecord[] {
  return fields.map((field) => ({ ...field, checked: true }));
}

function seed(): MockEntry[] {
  const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();
  const placeholder = placeholderFormVersion({ bankId: 'HDFC', journey: 'kyc_update', fillable: false });
  const ready = placeholderFormVersion({ bankId: 'Axis', journey: 'account_opening', fillable: true });
  const live = placeholderFormVersion({ bankId: 'ICICI', journey: 'kyc_update', fillable: true });
  const old = placeholderFormVersion({ bankId: 'PNB', journey: 'rekyc', fillable: false });
  return [
    { form: placeholder, updatedAt: hoursAgo(0.2) },
    { form: { ...ready, formId: 'axis_aof_mock', fields: confirmed(ready.fields) }, updatedAt: hoursAgo(5) },
    {
      form: { ...live, formId: 'icici_kyc_mock', status: 'published', fields: confirmed(live.fields) },
      updatedAt: hoursAgo(50),
    },
    { form: { ...old, formId: 'pnb_rekyc_mock', status: 'retired' }, updatedAt: null },
  ];
}

function store(): MockEntry[] {
  entries ??= seed();
  return entries;
}

export function resetMockConsole(): void {
  entries = null;
}

export function mockAdminForms(): AdminFormsResponse {
  const rows = store().map((entry) => adminFormRow(entry.form, entry.updatedAt));
  return { forms: rows, stats: adminStats(rows, 42) };
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
