import { fieldAutoAccepted } from './review';
import type { FieldRecord, FormStatus, FormVersion } from './types';

/**
 * Contract between the admin console (web/src/admin) and the admin-only functions.
 * Every endpoint below needs `Authorization: Bearer <Firebase ID token>` of a Cup admin,
 * and is reached through a Hosting rewrite under /api.
 *
 *   GET  /api/adminForms                                -> AdminFormsResponse
 *   GET  /api/adminForm?formId=..&version=..            -> { formVersion: FormVersion }
 *   GET  /api/adminFormPdf?formId=..&version=..         -> the source PDF (any status)
 *   POST /api/setFormStatus  SetFormStatusRequest       -> { formVersion: FormVersion }
 *
 * Publishing still goes through POST /api/publishForm, which enforces the review gate.
 */

export const ADMIN_API = {
  forms: '/api/adminForms',
  form: '/api/adminForm',
  formPdf: '/api/adminFormPdf',
  setStatus: '/api/setFormStatus',
} as const;

/** One row of the console's forms table: the newest version of each form. */
export interface AdminFormRow {
  formId: string;
  version: string;
  bankId: string;
  journey: string;
  status: FormStatus;
  source: FormVersion['source'];
  fieldCount: number;
  /** Fields carrying a shared schema id, so voice fills them. */
  sharedCount: number;
  /** Fields an admin still has to check before publish. */
  needsReview: number;
  /** ISO time of the last ingest, publish or status change; null for forms written before it was recorded. */
  updatedAt: string | null;
}

export interface AdminStats {
  publishedForms: number;
  draftForms: number;
  fieldsAwaitingReview: number;
  /** Speak requests counted by the rate limiter over the last 24 hours; null when it cannot be read. */
  voiceRequests24h: number | null;
}

export interface AdminFormsResponse {
  forms: AdminFormRow[];
  stats: AdminStats;
}

/** Unpublish (back to draft, off the customer list) or retire (never publishable again). */
export interface SetFormStatusRequest {
  formId: string;
  version: string;
  status: Extract<FormStatus, 'draft' | 'retired'>;
}

/** Fields that would block publish: neither accepted at ingest nor checked by an admin. */
export function fieldsNeedingReview(fields: readonly FieldRecord[]): number {
  return fields.filter((field) => !field.checked && !fieldAutoAccepted(field)).length;
}

export function adminFormRow(version: FormVersion, updatedAt: string | null): AdminFormRow {
  return {
    formId: version.formId,
    version: version.version,
    bankId: version.bankId,
    journey: version.journey,
    status: version.status,
    source: version.source,
    fieldCount: version.fields.length,
    sharedCount: version.fields.filter((field) => !field.id.startsWith('custom_')).length,
    needsReview: version.status === 'draft' ? fieldsNeedingReview(version.fields) : 0,
    updatedAt,
  };
}

export function adminStats(rows: readonly AdminFormRow[], voiceRequests24h: number | null): AdminStats {
  return {
    publishedForms: rows.filter((row) => row.status === 'published').length,
    draftForms: rows.filter((row) => row.status === 'draft').length,
    fieldsAwaitingReview: rows.reduce((sum, row) => sum + row.needsReview, 0),
    voiceRequests24h,
  };
}
