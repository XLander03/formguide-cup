import { IngestError } from '../src/ingest/errors';
import type { FormVersion } from '../../shared/forms/types';
import type { HttpReq, HttpRes, IngestDeps, PublishDeps } from '../src/ingest/handlers';

const networkDenied = () => {
  throw new Error('network disabled in tests');
};
globalThis.fetch = networkDenied as typeof fetch;

export function mockRes(): HttpRes & { statusCode: number; body: unknown } {
  return {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
}

export function adminAuth(authorization: string | undefined): Promise<{ uid: string }> {
  if (authorization === 'Bearer admin') return Promise.resolve({ uid: 'admin-user' });
  if (!authorization || !authorization.startsWith('Bearer ')) {
    return Promise.reject(new IngestError('unauthenticated', 401));
  }
  return Promise.reject(new IngestError('admin_required', 403));
}

export function memoryPublish(seed: FormVersion[] = []): PublishDeps & { docs: Map<string, FormVersion> } {
  const docs = new Map<string, FormVersion>();
  for (const version of seed) docs.set(`${version.formId}/${version.version}`, { ...version, fields: version.fields.map((field) => ({ ...field })) });
  return {
    docs,
    verifyAdmin: adminAuth,
    async loadFormVersion(formId, version) {
      return docs.get(`${formId}/${version}`) ?? null;
    },
    async markPublished(formId, version, next) {
      const current = docs.get(`${formId}/${version}`);
      if (!current) throw new IngestError('not_found', 404);
      docs.set(`${formId}/${version}`, { ...next, formId, version, status: 'published' });
    },
  };
}

export function memoryIngest(): IngestDeps & {
  files: Map<string, { bytes: Buffer; contentType: string }>;
  docs: Map<string, FormVersion>;
  ocrCalls: number;
} {
  const files = new Map<string, { bytes: Buffer; contentType: string }>();
  const docs = new Map<string, FormVersion>();
  const deps: IngestDeps & {
    files: typeof files;
    docs: typeof docs;
    ocrCalls: number;
  } = {
    files,
    docs,
    ocrCalls: 0,
    verifyAdmin: adminAuth,
    async readStoragePdf(storagePath: string) {
      const file = files.get(storagePath);
      if (!file) throw new IngestError('storage_not_found', 404);
      return file.bytes;
    },
    async writeStorage(path, bytes, contentType) {
      files.set(path, { bytes, contentType });
    },
    async allocateVersion(formId, requested) {
      if (requested) {
        if (docs.has(`${formId}/${requested}`)) throw new IngestError('version_exists', 409);
        return requested;
      }
      let max = 0;
      for (const key of docs.keys()) {
        if (!key.startsWith(`${formId}/`)) continue;
        const found = /^v(\d+)$/.exec(key.slice(formId.length + 1));
        if (found) max = Math.max(max, Number(found[1]));
      }
      return `v${max + 1}`;
    },
    async createFormVersion(version) {
      const key = `${version.formId}/${version.version}`;
      if (docs.has(key)) throw new IngestError('version_exists', 409);
      docs.set(key, version);
    },
    async ocrPage() {
      deps.ocrCalls += 1;
      throw new Error('ocr should be replaced per test');
    },
  };
  return deps;
}

export function jsonReq(body: unknown, authorization = 'Bearer admin'): HttpReq {
  return {
    method: 'POST',
    headers: { authorization, 'content-type': 'application/json' },
    body,
  };
}

export function pdfReq(bytes: Buffer, authorization = 'Bearer admin', headers: Record<string, string> = {}): HttpReq {
  return {
    method: 'POST',
    headers: { authorization, 'content-type': 'application/pdf', ...headers },
    rawBody: bytes,
  };
}
