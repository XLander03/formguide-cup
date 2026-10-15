import type { FormVersion } from '../../../shared/forms/types';
import type { PageSize } from './geometry';

const STORAGE_KEY = 'formguide.admin.drafts';

export interface AdminDraft {
  form: FormVersion;
  pages: PageSize[];
}

const pdfBytes = new Map<string, Uint8Array>();

export function saveAdminDraft(draft: AdminDraft, bytes?: Uint8Array): void {
  if (bytes) pdfBytes.set(draft.form.formId, bytes);
  const all = readAll();
  all[draft.form.formId] = draft;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function readAdminDraft(formId: string): AdminDraft | null {
  const draft = readAll()[formId];
  if (!draft?.form || !Array.isArray(draft.form.fields) || !Array.isArray(draft.pages)) return null;
  return draft;
}

export function pdfBytesFor(formId: string): Uint8Array | null {
  return pdfBytes.get(formId) ?? null;
}

function readAll(): Record<string, AdminDraft> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, AdminDraft>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}
