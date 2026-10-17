import { IngestError } from '../src/ingest/errors';
import type { FormVersion } from '../../shared/forms/types';
import type { HttpReq, HttpRes, IngestDeps, PublishDeps } from '../src/ingest/handlers';
import { recordFromDoc, type AdminDeps, type StatusChange } from '../src/ingest/admin';
import { strip, versionDocWithTime, versionFromDoc } from '../src/ingest/versionDoc';

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

type ParentDoc = { formId: string; bankId: string; journey: string; status: FormVersion['status'] };

/**
 * In-memory stand-in for forms/{id} and forms/{id}/versions/{v}, holding raw version docs
 * written the way production writes them (versionDocWithTime). It serves the admin and
 * publish handlers, and `listPublished` applies the same two status filters as
 * listPublishedFormVersions (parent published, then version published).
 */
export function memoryForms(seed: Array<{ doc: Record<string, unknown>; parent?: FormVersion['status'] }> = []): AdminDeps &
  PublishDeps & {
    docs: Map<string, Record<string, unknown>>;
    parents: Map<string, ParentDoc>;
    files: Map<string, Buffer>;
    voice: number | null | Error;
    listPublished(): FormVersion[];
  } {
  const docs = new Map<string, Record<string, unknown>>();
  const parents = new Map<string, ParentDoc>();
  const files = new Map<string, Buffer>();
  for (const { doc, parent } of seed) {
    const formId = String(doc.formId);
    docs.set(`${formId}/${String(doc.version)}`, JSON.parse(JSON.stringify(doc)) as Record<string, unknown>);
    const current = parents.get(formId);
    const status = parent ?? (current?.status === 'published' ? 'published' : (doc.status as FormVersion['status']));
    parents.set(formId, { formId, bankId: String(doc.bankId), journey: String(doc.journey), status });
  }
  const records = (formId?: string) =>
    [...docs.entries()]
      .filter(([key]) => !formId || key.startsWith(`${formId}/`))
      .map(([key, doc]) => recordFromDoc(doc, key.split('/')[0], key.split('/')[1]))
      .filter((record): record is NonNullable<typeof record> => record !== null);
  const store = {
    docs,
    parents,
    files,
    voice: 0 as number | null | Error,
    verifyAdmin: adminAuth,
    async listAllVersions() {
      return records();
    },
    async loadVersion(formId: string, version: string) {
      const doc = docs.get(`${formId}/${version}`);
      return doc ? recordFromDoc(doc, formId, version) : null;
    },
    async readStorage(path: string) {
      return files.get(path) ?? null;
    },
    async voiceRequests24h() {
      if (store.voice instanceof Error) throw store.voice;
      return store.voice;
    },
    async updateForm(formId: string, decide: (versions: FormVersion[]) => StatusChange) {
      const change = decide(records(formId).map((record) => record.formVersion));
      const next = change.formVersion;
      docs.set(`${formId}/${next.version}`, { ...versionDocWithTime(next, new Date().toISOString()) });
      parents.set(formId, { formId, bankId: next.bankId, journey: next.journey, status: change.parentStatus });
      return next;
    },
    async loadFormVersion(formId: string, version: string) {
      return versionFromDoc(docs.get(`${formId}/${version}`));
    },
    async markPublished(formId: string, version: string, next: FormVersion) {
      if (!docs.has(`${formId}/${version}`)) throw new IngestError('not_found', 404);
      docs.set(`${formId}/${version}`, { ...versionDocWithTime({ ...next, formId, version, status: 'published' }, new Date().toISOString()) });
      parents.set(formId, { formId, bankId: next.bankId, journey: next.journey, status: 'published' });
    },
    listPublished() {
      const out: FormVersion[] = [];
      for (const parent of parents.values()) {
        if (parent.status !== 'published') continue;
        for (const [key, doc] of docs) {
          if (!key.startsWith(`${parent.formId}/`) || doc.status !== 'published') continue;
          out.push(strip(JSON.parse(String(doc.payload)) as FormVersion));
        }
      }
      return out;
    },
  };
  return store;
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
