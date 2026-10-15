import type { FieldRecord, FormVersion } from '../../../shared/forms/types';
import { buildFormVersion, draftFromPdf, type OcrPageFn } from './draft';
import { IngestError, MAX_PDF_BYTES, PUBLISH_CONFIDENCE } from './errors';
import { randomBytes } from 'node:crypto';

export type HttpReq = {
  method: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
  rawBody?: Buffer;
  header?: (name: string) => string | undefined;
};

export type HttpRes = {
  status(code: number): HttpRes;
  json(body: unknown): void;
};

export type PageImage = {
  page: number;
  storagePath: string;
  width: number;
  height: number;
  pngBase64: string;
};

export type IngestDeps = {
  verifyAdmin: (authorization: string | undefined) => Promise<{ uid: string }>;
  readStoragePdf: (storagePath: string) => Promise<Buffer>;
  writeStorage: (path: string, bytes: Buffer, contentType: string) => Promise<void>;
  createFormVersion: (version: FormVersion) => Promise<void>;
  allocateVersion: (formId: string, requested: string | undefined) => Promise<string>;
  ocrPage: OcrPageFn;
};

export type PublishDeps = {
  verifyAdmin: (authorization: string | undefined) => Promise<{ uid: string }>;
  loadFormVersion: (formId: string, version: string) => Promise<FormVersion | null>;
  markPublished: (formId: string, version: string) => Promise<void>;
};

function header(req: HttpReq, name: string): string | undefined {
  if (req.header) {
    const value = req.header(name);
    if (value) return value;
  }
  const headers = req.headers || {};
  const key = Object.keys(headers).find((item) => item.toLowerCase() === name.toLowerCase());
  if (!key) return undefined;
  const value = headers[key];
  return Array.isArray(value) ? value[0] : value;
}

function contentType(req: HttpReq): string {
  return (header(req, 'content-type') || '').toLowerCase();
}

export function safeId(input: unknown, fallback?: string): string {
  if (input === undefined || input === null || input === '') {
    if (fallback) return fallback;
    throw new IngestError('invalid_input', 400);
  }
  if (typeof input !== 'string') throw new IngestError('invalid_input', 400);
  const cleaned = input.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
  if (!cleaned) throw new IngestError('invalid_input', 400);
  return cleaned;
}

export function safeStoragePath(input: unknown): string {
  if (typeof input !== 'string') throw new IngestError('invalid_input', 400);
  const storagePath = input.trim().replace(/^\/+/, '');
  if (!storagePath || storagePath.length > 512 || storagePath.includes('..') || storagePath.includes('\\') || storagePath.includes('\0')) {
    throw new IngestError('invalid_input', 400);
  }
  if (!/^[a-zA-Z0-9._/-]+$/.test(storagePath)) throw new IngestError('invalid_input', 400);
  return storagePath;
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new IngestError('invalid_input', 400);
  return value;
}

function decodePdfBase64(value: string): Buffer {
  const cleaned = value.replace(/\s/g, '');
  if (!cleaned || !/^[A-Za-z0-9+/]+=*$/.test(cleaned)) throw new IngestError('invalid_input', 400);
  const buf = Buffer.from(cleaned, 'base64');
  if (buf.length === 0) throw new IngestError('invalid_input', 400);
  return buf;
}

type Incoming = {
  bytes?: Buffer;
  storagePath?: string;
  formId?: string;
  version?: string;
  bankId?: string;
  journey?: string;
};

function readIncoming(req: HttpReq): Incoming {
  const type = contentType(req);
  if (type.startsWith('application/pdf') || type.startsWith('application/octet-stream')) {
    const bytes = Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    return {
      bytes,
      formId: header(req, 'x-form-id'),
      version: header(req, 'x-form-version'),
      bankId: header(req, 'x-bank-id'),
      journey: header(req, 'x-journey'),
    };
  }
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body) || Buffer.isBuffer(body)) {
    throw new IngestError('invalid_input', 400);
  }
  const record = body as Record<string, unknown>;
  const hasPath = record.storagePath !== undefined && record.storagePath !== '';
  const hasB64 = record.pdfBase64 !== undefined && record.pdfBase64 !== '';
  if (hasPath && hasB64) throw new IngestError('invalid_input', 400);
  if (!hasPath && !hasB64) throw new IngestError('invalid_input', 400);
  return {
    bytes: hasB64 ? decodePdfBase64(String(record.pdfBase64)) : undefined,
    storagePath: hasPath ? safeStoragePath(record.storagePath) : undefined,
    formId: optionalString(record.formId),
    version: optionalString(record.version),
    bankId: optionalString(record.bankId),
    journey: optionalString(record.journey),
  };
}

function pdfStoragePath(formId: string, version: string): string {
  return `forms/${formId}/versions/${version}/source.pdf`;
}

function pageStoragePath(formId: string, version: string, page: number): string {
  return `forms/${formId}/versions/${version}/pages/${page}.png`;
}

function sendError(res: HttpRes, err: unknown): void {
  if (err instanceof IngestError) {
    res.status(err.httpStatus).json({ error: err.code, ...(err.details || {}) });
    return;
  }
  console.error('ingest_failed', err instanceof Error ? err.name : 'error');
  res.status(500).json({ error: 'ingest_failed' });
}

export function lowConfidenceUnchecked(fields: FieldRecord[]): Array<{ id: string; confidence: number; checked: boolean }> {
  return fields
    .filter((field) => field.confidence < PUBLISH_CONFIDENCE && field.checked !== true)
    .map((field) => ({ id: field.id, confidence: field.confidence, checked: field.checked === true }));
}

export function canPublish(fields: FieldRecord[]): boolean {
  return lowConfidenceUnchecked(fields).length === 0;
}

function isFormVersion(value: unknown): value is FormVersion {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (typeof record.formId !== 'string' || typeof record.version !== 'string') return false;
  if (record.status !== 'draft' && record.status !== 'published' && record.status !== 'retired') return false;
  if (record.source !== 'acroform' && record.source !== 'ocr') return false;
  if (!Array.isArray(record.fields)) return false;
  return record.fields.every((field) => {
    if (!field || typeof field !== 'object') return false;
    const row = field as Record<string, unknown>;
    return typeof row.id === 'string' && typeof row.confidence === 'number' && Number.isFinite(row.confidence);
  });
}

export async function handleIngest(req: HttpReq, res: HttpRes, deps: IngestDeps): Promise<void> {
  try {
    if (req.method !== 'POST') throw new IngestError('method_not_allowed', 405);
    await deps.verifyAdmin(header(req, 'authorization'));
    const incoming = readIncoming(req);
    const bytes = incoming.bytes ?? await deps.readStoragePdf(incoming.storagePath as string);
    if (bytes.byteLength > MAX_PDF_BYTES) throw new IngestError('pdf_too_large', 400);
    const formId = safeId(incoming.formId, `form_${randomBytes(4).toString('hex')}`);
    const version = await deps.allocateVersion(formId, incoming.version ? safeId(incoming.version) : undefined);
    const bankId = safeId(incoming.bankId, 'unspecified');
    const journey = safeId(incoming.journey, 'aof_kyc');
    const draft = await draftFromPdf(bytes, deps.ocrPage);
    const pdfPath = pdfStoragePath(formId, version);
    const formVersion = buildFormVersion({
      formId,
      version,
      bankId,
      journey,
      source: draft.source,
      pdfPath,
      fields: draft.fields,
    });
    if (formVersion.status !== 'draft') throw new IngestError('ingest_failed', 500);
    await deps.writeStorage(pdfPath, Buffer.from(bytes), 'application/pdf');
    const pages: PageImage[] = [];
    for (const page of draft.pages) {
      const storagePath = pageStoragePath(formId, version, page.page);
      await deps.writeStorage(storagePath, page.png, 'image/png');
      pages.push({
        page: page.page,
        storagePath,
        width: page.width,
        height: page.height,
        pngBase64: page.png.toString('base64'),
      });
    }
    await deps.createFormVersion(formVersion);
    res.status(200).json({ formVersion, pages });
  } catch (err) {
    sendError(res, err);
  }
}

export async function handlePublish(req: HttpReq, res: HttpRes, deps: PublishDeps): Promise<void> {
  try {
    if (req.method !== 'POST') throw new IngestError('method_not_allowed', 405);
    await deps.verifyAdmin(header(req, 'authorization'));
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      throw new IngestError('invalid_input', 400);
    }
    const body = req.body as Record<string, unknown>;
    const formId = safeId(body.formId);
    const version = safeId(body.version);
    const stored = await deps.loadFormVersion(formId, version);
    if (!stored) throw new IngestError('not_found', 404);
    if (!isFormVersion(stored)) throw new IngestError('invalid_stored_form', 400);
    if (stored.status === 'retired') throw new IngestError('retired_form', 409);
    const blocking = lowConfidenceUnchecked(stored.fields as FieldRecord[]);
    if (blocking.length > 0) {
      throw new IngestError('unchecked_low_confidence', 400, { fields: blocking });
    }
    if (stored.status !== 'published') await deps.markPublished(formId, version);
    res.status(200).json({
      formVersion: { ...stored, status: 'published' as const },
    });
  } catch (err) {
    sendError(res, err);
  }
}
