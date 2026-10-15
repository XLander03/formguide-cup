import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import type { FormVersion } from '../../../shared/forms/types';
import { IngestError, MAX_PDF_BYTES } from './errors';
import { ocrPageWithGemini } from './geminiOcr';
import { handleIngest, handlePublish, safeStoragePath, type HttpReq, type HttpRes } from './handlers';

function ensureAdmin(): void {
  if (getApps().length === 0) initializeApp();
}

async function verifyAdmin(authorization: string | undefined): Promise<{ uid: string }> {
  const match = /^Bearer\s+(\S+)/i.exec(authorization || '');
  if (!match) throw new IngestError('unauthenticated', 401);
  ensureAdmin();
  try {
    const decoded = await getAuth().verifyIdToken(match[1]);
    if (decoded.admin !== true) throw new IngestError('admin_required', 403);
    return { uid: decoded.uid };
  } catch (err) {
    if (err instanceof IngestError) throw err;
    throw new IngestError('unauthenticated', 401);
  }
}

function isAlreadyExists(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: unknown }).code;
  return code === 6 || code === 'already-exists' || code === 'ALREADY_EXISTS';
}

function versions(formId: string) {
  return getFirestore().collection('forms').doc(formId).collection('versions');
}

function strip(value: FormVersion): FormVersion {
  return JSON.parse(JSON.stringify(value)) as FormVersion;
}

export async function productionIngest(req: HttpReq, res: HttpRes): Promise<void> {
  ensureAdmin();
  const bucket = getStorage().bucket();
  await handleIngest(req, res, {
    verifyAdmin,
    async readStoragePdf(storagePath: string) {
      const safe = safeStoragePath(storagePath);
      const file = bucket.file(safe);
      const [exists] = await file.exists();
      if (!exists) throw new IngestError('storage_not_found', 404);
      const [meta] = await file.getMetadata();
      const size = Number(meta.size || 0);
      if (size > MAX_PDF_BYTES) throw new IngestError('pdf_too_large', 400);
      const [buf] = await file.download();
      return buf;
    },
    async writeStorage(path: string, bytes: Buffer, contentType: string) {
      await bucket.file(path).save(bytes, { contentType, resumable: false });
    },
    async allocateVersion(formId: string, requested: string | undefined) {
      const col = versions(formId);
      if (requested) {
        const snap = await col.doc(requested).get();
        if (snap.exists) throw new IngestError('version_exists', 409);
        return requested;
      }
      const snap = await col.get();
      let max = 0;
      for (const doc of snap.docs) {
        const found = /^v(\d+)$/.exec(doc.id);
        if (found) max = Math.max(max, Number(found[1]));
      }
      return `v${max + 1}`;
    },
    async createFormVersion(version: FormVersion) {
      try {
        await versions(version.formId).doc(version.version).create(strip(version));
      } catch (err) {
        if (isAlreadyExists(err)) throw new IngestError('version_exists', 409);
        throw err;
      }
    },
    ocrPage(input) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new IngestError('gemini_key_missing', 500);
      return ocrPageWithGemini({ ...input, apiKey });
    },
  });
}

export async function productionPublish(req: HttpReq, res: HttpRes): Promise<void> {
  ensureAdmin();
  await handlePublish(req, res, {
    verifyAdmin,
    async loadFormVersion(formId: string, version: string) {
      const snap = await versions(formId).doc(version).get();
      if (!snap.exists) return null;
      return snap.data() as FormVersion;
    },
    async markPublished(formId: string, version: string) {
      await versions(formId).doc(version).update({ status: 'published' });
    },
  });
}
