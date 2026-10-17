import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { isCupAdmin } from '../../../shared/forms/cupAdmin';
import type { FormVersion } from '../../../shared/forms/types';
import { IngestError, MAX_PDF_BYTES } from './errors';
import { ocrPageWithGemini } from './geminiOcr';
import { handleIngest, handlePublish, safeStoragePath, type HttpReq, type HttpRes } from './handlers';
import { strip, versionDocForWrite, versionFromDoc } from './versionDoc';

function ensureAdmin(): void {
  if (getApps().length === 0) initializeApp();
}

async function verifyAdmin(authorization: string | undefined): Promise<{ uid: string }> {
  const match = /^Bearer\s+(\S+)/i.exec(authorization || '');
  if (!match) throw new IngestError('unauthenticated', 401);
  ensureAdmin();
  try {
    const decoded = await getAuth().verifyIdToken(match[1]);
    if (decoded.admin !== true && !isCupAdmin(decoded.email)) throw new IngestError('admin_required', 403);
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

/** Native Firestore. The project's `(default)` database is Datastore mode and cannot store these documents. */
const FORM_DATABASE_ID = 'formguide';

function db() {
  ensureAdmin();
  return getFirestore(FORM_DATABASE_ID);
}

function versions(formId: string) {
  return db().collection('forms').doc(formId).collection('versions');
}

/** Parent `forms/{id}` is what the public catalog reads. A new draft must not hide an already published form. */
async function writeParent(version: Pick<FormVersion, 'formId' | 'bankId' | 'journey'>, status: FormVersion['status']): Promise<void> {
  const ref = db().collection('forms').doc(version.formId);
  const snap = await ref.get();
  const current = snap.exists ? String((snap.data() as { status?: string } | undefined)?.status || '') : '';
  const nextStatus = status === 'draft' && current === 'published' ? 'published' : status;
  await ref.set(
    { formId: version.formId, bankId: version.bankId, journey: version.journey, status: nextStatus },
    { merge: true },
  );
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
      // Throws form_too_large before any Firestore call if even the slim doc is over budget.
      const doc = versionDocForWrite(version);
      try {
        await versions(version.formId).doc(version.version).create(doc);
        await writeParent(version, 'draft');
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

export async function listPublishedFormVersions(): Promise<FormVersion[]> {
  ensureAdmin();
  const parents = await db().collection('forms').where('status', '==', 'published').get();
  const forms: FormVersion[] = [];
  for (const parent of parents.docs) {
    const versionsSnap = await parent.ref.collection('versions').where('status', '==', 'published').get();
    for (const doc of versionsSnap.docs) {
      const data = doc.data() as FormVersion & { payload?: string };
      let parsed: FormVersion | null = null;
      if (typeof data.payload === 'string') {
        try {
          parsed = JSON.parse(data.payload) as FormVersion;
        } catch {
          parsed = null;
        }
      }
      const form = parsed?.status === 'published' && Array.isArray(parsed.fields) ? parsed : data;
      if (form.status !== 'published' || !Array.isArray(form.fields)) continue;
      forms.push(strip(form));
    }
  }
  return forms;
}

/**
 * Source PDF bytes for a published form version, so the user side can fill the bank's own layout.
 * Null when the version is missing, not published, or its PDF is not in Storage.
 */
export async function readPublishedFormPdf(formId: string, version: string): Promise<Buffer | null> {
  ensureAdmin();
  const snap = await versions(formId).doc(version).get();
  if (!snap.exists) return null;
  const data = snap.data() as Partial<FormVersion> | undefined;
  if (data?.status !== 'published' || typeof data.pdfPath !== 'string') return null;
  const file = getStorage().bucket().file(safeStoragePath(data.pdfPath));
  const [exists] = await file.exists();
  if (!exists) return null;
  const [buf] = await file.download();
  return buf;
}

export async function productionPublish(req: HttpReq, res: HttpRes): Promise<void> {
  ensureAdmin();
  await handlePublish(req, res, {
    verifyAdmin,
    async loadFormVersion(formId: string, version: string) {
      const snap = await versions(formId).doc(version).get();
      if (!snap.exists) return null;
      return versionFromDoc(snap.data());
    },
    async markPublished(formId: string, version: string, next: FormVersion) {
      const published = versionDocForWrite({ ...next, formId, version, status: 'published' });
      await versions(formId).doc(version).set(published);
      await writeParent(published, 'published');
    },
  });
}
