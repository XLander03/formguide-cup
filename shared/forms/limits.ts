/**
 * PDF ingest limits. Single source of truth for both the client-side
 * pre-check (web/src/admin/pdfChecks.ts) and the server-side enforcement
 * (functions/src/ingest/errors.ts) — these must never drift, or the client
 * shows "Pass" on a file the server then rejects (or vice versa).
 */
export const MAX_PDF_BYTES = 10 * 1024 * 1024;
export const MAX_PDF_PAGES = 4;
