import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { isCupAdmin } from '../../../shared/forms/cupAdmin';
import type { FormVersion } from '../../../shared/forms/types';
import { INSIGHTS_COLLECTION, insightDayIds, sumInsightDays, type InsightSummary } from '../insights';
import { SPEAK_PER_CLIENT } from '../rateLimit';
import {
  handleAdminForm,
  handleAdminFormPdf,
  handleAdminForms,
  handleSetFormStatus,
  recordFromDoc,
  type AdminDeps,
  type AdminPdfRes,
  type AdminReq,
  type VersionRecord,
} from './admin';
import { geminiCaller, handleAdminCopilot } from './copilot';
import { IngestError, MAX_PDF_BYTES } from './errors';
import { ocrPageWithGemini } from './geminiOcr';
import { handleIngest, handlePublish, safeStoragePath, type HttpReq, type HttpRes } from './handlers';
import { strip, versionDocWithTime, versionFromDoc } from './versionDoc';

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
      const doc = versionDocWithTime(version, new Date().toISOString());
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
      const published = versionDocWithTime({ ...next, formId, version, status: 'published' }, new Date().toISOString());
      await versions(formId).doc(version).set(published);
      await writeParent(published, 'published');
    },
  });
}

/** The speak limiter's windows: rateLimits/{ip_<hash>_<windowStart>} with expiresAt = start + one window. */
async function voiceRequests24h(now = Date.now()): Promise<number | null> {
  try {
    // A window that started in the last 24 hours expires after now - 24h + one window.
    const since = new Date(now - 24 * 60 * 60 * 1000 + SPEAK_PER_CLIENT.windowMs);
    // A sum() aggregate over a range filter needs a composite index (expiresAt, count) that the
    // project does not have, so read just `count` and add it up. One doc per caller per
    // 10 minutes stays small at this scale, and it needs only the automatic expiresAt index.
    const snap = await db().collection('rateLimits').where('expiresAt', '>', since).select('count').get();
    let total = 0;
    for (const doc of snap.docs) total += Number(doc.get('count')) || 0;
    return total;
  } catch (err) {
    console.error('voice_requests_failed', err instanceof Error ? err.message.slice(0, 80) : 'unknown');
    return null;
  }
}

function adminDeps(): AdminDeps {
  return {
    verifyAdmin,
    async listAllVersions() {
      // One collection-group read instead of a query per form. Only forms/{id}/versions docs count.
      const snap = await db().collectionGroup('versions').get();
      const out: VersionRecord[] = [];
      for (const doc of snap.docs) {
        const parent = doc.ref.parent.parent;
        if (!parent || parent.parent.id !== 'forms') continue;
        const record = recordFromDoc(doc.data(), parent.id, doc.id);
        if (record) out.push(record);
      }
      return out;
    },
    async loadVersion(formId, version) {
      const snap = await versions(formId).doc(version).get();
      return snap.exists ? recordFromDoc(snap.data(), formId, version) : null;
    },
    async readStorage(path) {
      const file = getStorage().bucket().file(safeStoragePath(path));
      const [exists] = await file.exists();
      if (!exists) return null;
      const [buf] = await file.download();
      return buf;
    },
    voiceRequests24h: () => voiceRequests24h(),
    async updateForm(formId, decide) {
      const store = db();
      const col = versions(formId);
      const parentRef = store.collection('forms').doc(formId);
      return store.runTransaction(async (tx) => {
        const snap = await tx.get(col);
        const all: FormVersion[] = [];
        for (const doc of snap.docs) {
          const record = recordFromDoc(doc.data(), formId, doc.id);
          if (record) all.push(record.formVersion);
        }
        const change = decide(all);
        const next = change.formVersion;
        tx.set(col.doc(next.version), versionDocWithTime(next, new Date().toISOString()));
        // Deliberately not writeParent: it keeps a published parent published, which is right
        // for a re-ingest but would leave an unpublished form in the customer catalog.
        tx.set(
          parentRef,
          { formId, bankId: next.bankId, journey: next.journey, status: change.parentStatus },
          { merge: true },
        );
        return strip(next);
      });
    },
  };
}

export async function productionAdminForms(req: AdminReq, res: HttpRes): Promise<void> {
  ensureAdmin();
  await handleAdminForms(req, res, adminDeps());
}

export async function productionAdminForm(req: AdminReq, res: HttpRes): Promise<void> {
  ensureAdmin();
  await handleAdminForm(req, res, adminDeps());
}

export async function productionAdminFormPdf(req: AdminReq, res: AdminPdfRes): Promise<void> {
  ensureAdmin();
  await handleAdminFormPdf(req, res, adminDeps());
}

export async function productionSetFormStatus(req: AdminReq, res: HttpRes): Promise<void> {
  ensureAdmin();
  await handleSetFormStatus(req, res, adminDeps());
}

/** Sums the copilot's anonymous `insights/day_*` docs for the last `days` days (India time). */
async function readInsights(days: number, now = new Date()): Promise<InsightSummary> {
  const span = Math.min(7, Math.max(1, Math.round(days) || 1));
  const col = db().collection(INSIGHTS_COLLECTION);
  const snaps = await db().getAll(...insightDayIds(now, span).map((id) => col.doc(id)));
  return sumInsightDays(
    snaps.map((snap) => (snap.exists ? (snap.data() as Record<string, unknown>) : null)),
    span,
  );
}

/** "Ask about your forms": read-only tools over the same data as adminForms. Never writes. */
export async function productionAdminCopilot(req: HttpReq, res: HttpRes): Promise<void> {
  ensureAdmin();
  const admin = adminDeps();
  await handleAdminCopilot(req, res, {
    verifyAdmin: admin.verifyAdmin,
    listAllVersions: admin.listAllVersions,
    readInsights: (days) => readInsights(days),
    gemini: geminiCaller(process.env.GEMINI_API_KEY || ''),
  });
}
