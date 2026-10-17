import {
  adminFormRow,
  adminStats,
  type AdminFormRow,
  type AdminFormsResponse,
  type SetFormStatusRequest,
} from '../../../shared/forms/admin';
import type { FormStatus, FormVersion } from '../../../shared/forms/types';
import { IngestError } from './errors';
import { header, sendError, type HttpReq, type HttpRes } from './handlers';
import { updatedAtFromDoc, versionFromDoc } from './versionDoc';

/**
 * Admin console endpoints (see shared/forms/admin.ts). Every handler checks the
 * caller is a Cup admin before reading anything, and reads forms of any status.
 */

export type AdminReq = HttpReq & { query?: Record<string, unknown> };

export type AdminPdfRes = HttpRes & {
  set(name: string, value: string): unknown;
  send(body: Buffer): unknown;
};

/** One stored version doc, read back as a FormVersion plus the time it was last written. */
export type VersionRecord = { formVersion: FormVersion; updatedAt: string | null };

/** What setFormStatus writes: the changed version and the status its parent `forms/{id}` doc should carry. */
export type StatusChange = { formVersion: FormVersion; parentStatus: FormStatus };

export type AdminDeps = {
  verifyAdmin: (authorization: string | undefined) => Promise<{ uid: string }>;
  /** Every version of every form. Tens of forms, so one read of all of them is fine. */
  listAllVersions: () => Promise<VersionRecord[]>;
  loadVersion: (formId: string, version: string) => Promise<VersionRecord | null>;
  /** Bytes at a Storage path, or null when the object is missing. */
  readStorage: (path: string) => Promise<Buffer | null>;
  /** Speak requests in the last 24 hours; null when the limiter's counts cannot be read. */
  voiceRequests24h: () => Promise<number | null>;
  /**
   * Reads every version of `formId`, lets `decide` pick the change, then writes the
   * version doc and the parent doc together (one transaction in production).
   */
  updateForm: (formId: string, decide: (versions: FormVersion[]) => StatusChange) => Promise<FormVersion>;
};

const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/;

function strictId(value: unknown): string {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) throw new IngestError('invalid_input', 400);
  return value;
}

function queryParam(req: AdminReq, name: string): unknown {
  const value = req.query?.[name];
  return Array.isArray(value) ? value[0] : value;
}

function requireMethod(req: HttpReq, method: 'GET' | 'POST'): void {
  if (req.method !== method) throw new IngestError('method_not_allowed', 405);
}

/**
 * Reads a raw version doc. Docs may keep their fields only in `payload` (see
 * versionDocForWrite); `docId` fills `version` for a doc that never stored it.
 */
export function recordFromDoc(data: Record<string, unknown> | undefined, formId: string, docId: string): VersionRecord | null {
  const formVersion = versionFromDoc(data);
  if (!formVersion || !Array.isArray(formVersion.fields)) return null;
  return {
    formVersion: { ...formVersion, formId: formVersion.formId || formId, version: formVersion.version || docId },
    updatedAt: updatedAtFromDoc(data),
  };
}

/** Status a parent `forms/{id}` doc should carry, from the statuses of all its versions. */
export function parentStatusFor(statuses: readonly FormStatus[]): FormStatus {
  if (statuses.includes('published')) return 'published';
  if (statuses.includes('draft')) return 'draft';
  return 'retired';
}

function compareVersionIds(a: string, b: string): number {
  return a.localeCompare(b, 'en', { numeric: true });
}

/** Newest version of each form: highest version id (v10 after v9), so a later publish of v1 does not hide v2. */
export function newestPerForm(records: readonly VersionRecord[]): VersionRecord[] {
  const newest = new Map<string, VersionRecord>();
  for (const record of records) {
    const current = newest.get(record.formVersion.formId);
    if (!current || compareVersionIds(record.formVersion.version, current.formVersion.version) > 0) {
      newest.set(record.formVersion.formId, record);
    }
  }
  return [...newest.values()];
}

/** Newest first by updatedAt; rows written before it was recorded go last, by formId. */
function compareRows(a: AdminFormRow, b: AdminFormRow): number {
  if (a.updatedAt && b.updatedAt && a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? 1 : -1;
  if (a.updatedAt && !b.updatedAt) return -1;
  if (!a.updatedAt && b.updatedAt) return 1;
  return a.formId.localeCompare(b.formId);
}

export async function handleAdminForms(req: AdminReq, res: HttpRes, deps: AdminDeps): Promise<void> {
  try {
    requireMethod(req, 'GET');
    await deps.verifyAdmin(header(req, 'authorization'));
    const [records, voice] = await Promise.all([
      deps.listAllVersions(),
      deps.voiceRequests24h().catch(() => null),
    ]);
    const forms = newestPerForm(records)
      .map((record) => adminFormRow(record.formVersion, record.updatedAt))
      .sort(compareRows);
    const body: AdminFormsResponse = { forms, stats: adminStats(forms, voice) };
    res.status(200).json(body);
  } catch (err) {
    sendError(res, err);
  }
}

async function loadRequested(req: AdminReq, deps: AdminDeps): Promise<VersionRecord> {
  const formId = strictId(queryParam(req, 'formId'));
  // A review link without a version (/admin/forms/:id/review) means the newest one,
  // chosen by the same rule as the console's forms list.
  const requested = queryParam(req, 'version');
  const record = requested
    ? await deps.loadVersion(formId, strictId(requested))
    : newestPerForm((await deps.listAllVersions()).filter((item) => item.formVersion.formId === formId))[0];
  if (!record) throw new IngestError('not_found', 404);
  return record;
}

export async function handleAdminForm(req: AdminReq, res: HttpRes, deps: AdminDeps): Promise<void> {
  try {
    requireMethod(req, 'GET');
    await deps.verifyAdmin(header(req, 'authorization'));
    const record = await loadRequested(req, deps);
    res.status(200).json({ formVersion: record.formVersion });
  } catch (err) {
    sendError(res, err);
  }
}

export async function handleAdminFormPdf(req: AdminReq, res: AdminPdfRes, deps: AdminDeps): Promise<void> {
  try {
    requireMethod(req, 'GET');
    await deps.verifyAdmin(header(req, 'authorization'));
    const record = await loadRequested(req, deps);
    if (typeof record.formVersion.pdfPath !== 'string' || !record.formVersion.pdfPath) {
      throw new IngestError('not_found', 404);
    }
    const bytes = await deps.readStorage(record.formVersion.pdfPath);
    if (!bytes) throw new IngestError('not_found', 404);
    res.set('Content-Type', 'application/pdf');
    // Drafts are not public: never let a shared cache keep them.
    res.set('Cache-Control', 'private, no-store');
    res.status(200);
    res.send(bytes);
  } catch (err) {
    sendError(res, err);
  }
}

function readStatusRequest(body: unknown): SetFormStatusRequest {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Buffer.isBuffer(body)) {
    throw new IngestError('invalid_input', 400);
  }
  const record = body as Record<string, unknown>;
  if (record.status !== 'draft' && record.status !== 'retired') throw new IngestError('invalid_input', 400);
  return { formId: strictId(record.formId), version: strictId(record.version), status: record.status };
}

/**
 * The change setFormStatus makes, given every version of the form.
 *  - `draft` unpublishes: a published (or draft) version goes back to draft. A retired one cannot.
 *  - `retired` takes any version out for good; publishForm then refuses it.
 * The parent doc then follows all its versions: published while any version is still
 * published (the catalog lists only published versions, so the one taken down disappears
 * and the other stays live), else draft while any draft remains, else retired.
 */
export function decideStatusChange(versions: readonly FormVersion[], request: SetFormStatusRequest): StatusChange {
  const target = versions.find((item) => item.version === request.version);
  if (!target) throw new IngestError('not_found', 404);
  if (target.status === 'retired' && request.status !== 'retired') throw new IngestError('retired_form', 409);
  const formVersion: FormVersion = { ...target, status: request.status };
  const statuses = versions.map((item) => (item.version === request.version ? request.status : item.status));
  return { formVersion, parentStatus: parentStatusFor(statuses) };
}

export async function handleSetFormStatus(req: AdminReq, res: HttpRes, deps: AdminDeps): Promise<void> {
  try {
    requireMethod(req, 'POST');
    await deps.verifyAdmin(header(req, 'authorization'));
    const request = readStatusRequest(req.body);
    const formVersion = await deps.updateForm(request.formId, (versions) => decideStatusChange(versions, request));
    res.status(200).json({ formVersion });
  } catch (err) {
    sendError(res, err);
  }
}
