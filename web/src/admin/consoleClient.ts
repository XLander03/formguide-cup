import {
  ADMIN_API,
  type AdminFormRow,
  type AdminFormsResponse,
  type SetFormStatusRequest,
} from '../../../shared/forms/admin';
import type { CopilotRequest, CopilotResponse } from '../../../shared/forms/copilot';
import type { FormVersion } from '../../../shared/forms/types';
import { adminGetBlob, adminGetJson, adminPost } from './adminFetch';
import { askCopilot } from './copilotClient';
import { mockAdminForm, mockAdminForms, mockSetStatus } from './mockConsole';
import { mockIngestRequested } from './mockQuery';
import { buildPlaceholderPdf } from './pdfChecks';
import { publishForm } from './publishClient';

export const CONSOLE_UNAVAILABLE = 'The admin console is not available yet.';

type FormRef = Pick<AdminFormRow, 'formId' | 'version'>;

function query(ref: { formId: string; version?: string }): string {
  const params = new URLSearchParams({ formId: ref.formId });
  if (ref.version) params.set('version', ref.version);
  return params.toString();
}

/** Every form's newest version plus the console's headline numbers. `?mock=1` serves an in-memory list. */
export async function loadAdminForms(): Promise<AdminFormsResponse> {
  if (mockIngestRequested()) return mockAdminForms();
  const payload = (await adminGetJson(ADMIN_API.forms, CONSOLE_UNAVAILABLE)) as Partial<AdminFormsResponse>;
  if (!Array.isArray(payload.forms) || !payload.stats) throw new Error(`${CONSOLE_UNAVAILABLE} (bad response)`);
  return { forms: payload.forms, stats: payload.stats };
}

/** One stored version, any status. Without a version the server picks the newest. */
export async function loadAdminForm(formId: string, version?: string): Promise<FormVersion> {
  if (mockIngestRequested()) return mockAdminForm(formId, version);
  const payload = (await adminGetJson(`${ADMIN_API.form}?${query({ formId, version })}`, CONSOLE_UNAVAILABLE)) as {
    formVersion?: FormVersion;
  };
  const form = payload.formVersion;
  if (!form || typeof form.formId !== 'string' || !Array.isArray(form.fields)) {
    throw new Error('The server did not return that form.');
  }
  return form;
}

/** The source PDF an admin uploaded, whatever the form's status. */
export async function loadAdminFormPdf(formId: string, version?: string): Promise<Blob> {
  if (mockIngestRequested()) return buildPlaceholderPdf();
  return adminGetBlob(`${ADMIN_API.formPdf}?${query({ formId, version })}`, CONSOLE_UNAVAILABLE);
}

/** Unpublish (back to draft) or retire. */
export async function setFormStatus(request: SetFormStatusRequest): Promise<void> {
  if (mockIngestRequested()) {
    mockSetStatus(request.formId, request.version, request.status);
    return;
  }
  await adminPost(ADMIN_API.setStatus, request, CONSOLE_UNAVAILABLE);
}

/** Publish a stored draft as-is: the publish function re-checks the review gate. */
export async function publishStoredForm(row: FormRef): Promise<void> {
  const form = await loadAdminForm(row.formId, row.version);
  await publishForm(form);
}

/**
 * Opens the source PDF in a new tab. The tab is opened before the fetch so the
 * click still counts as a user gesture; it is pointed at the blob once loaded.
 */
export async function openSourcePdf(row: FormRef, load: typeof loadAdminFormPdf = loadAdminFormPdf): Promise<void> {
  const tab = window.open('', '_blank');
  try {
    const blob = await load(row.formId, row.version);
    const pdf = blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' });
    const url = URL.createObjectURL(pdf);
    if (tab) {
      tab.opener = null;
      tab.location.href = url;
    } else {
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.click();
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    tab?.close();
    throw error;
  }
}

export interface ConsoleApi {
  loadForms: () => Promise<AdminFormsResponse>;
  publish: (row: AdminFormRow) => Promise<void>;
  setStatus: (request: SetFormStatusRequest) => Promise<void>;
  openPdf: (row: AdminFormRow) => Promise<void>;
  /** "Ask about your forms". Optional: the console hides the panel without it. */
  askCopilot?: (request: CopilotRequest) => Promise<CopilotResponse>;
}

export const consoleApi: ConsoleApi = {
  loadForms: loadAdminForms,
  publish: publishStoredForm,
  setStatus: setFormStatus,
  openPdf: (row) => openSourcePdf(row),
  askCopilot,
};
