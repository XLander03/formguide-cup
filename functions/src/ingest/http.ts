import { onRequest } from 'firebase-functions/v2/https';
import type { HttpReq, HttpRes } from './handlers';

const HOSTS = [
  'https://faceapp-5397b.web.app',
  'https://faceapp-5397b.firebaseapp.com',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
];

/**
 * Admin ingest. The speak function is a separate export and is not modified.
 * Gemini is loaded only when this handler runs, and only for flat PDFs.
 */
export const ingestForm = onRequest(
  {
    region: 'us-central1',
    // 256MiB was observed to exceed its limit (265MiB used) while rendering
    // PDF pages to PNG for OCR — unlike the other ingest functions, this one
    // does real image work, not just Firestore reads/writes.
    memory: '512MiB',
    // At 512MiB a 2nd-gen function only gets a fraction of a vCPU, which
    // makes pdf.js rasterising and PNG encoding slow. A full vCPU cuts that.
    cpu: 1,
    maxInstances: 2,
    minInstances: 0,
    // 120s was measured hitting ECONNRESET when pages were OCR'd one after
    // another. Pages now run concurrently (see draft.ts), but a slow page plus
    // its one retry (see geminiOcr.ts) can still take a while, so keep 300s.
    timeoutSeconds: 300,
    concurrency: 1,
    invoker: 'public',
    cors: HOSTS,
    secrets: ['GEMINI_API_KEY'],
  },
  async (req, res) => {
    const { productionIngest } = await import('./production');
    await productionIngest(req as unknown as HttpReq, res as unknown as HttpRes);
  },
);

/** Published catalog for the journey page. Drafts stay on the server. */
export const publishedForms = onRequest(
  {
    region: 'us-central1',
    memory: '256MiB',
    maxInstances: 2,
    minInstances: 0,
    timeoutSeconds: 30,
    concurrency: 1,
    invoker: 'public',
    cors: HOSTS,
  },
  async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'method_not_allowed' });
      return;
    }
    try {
      const { listPublishedFormVersions } = await import('./production');
      const forms = await listPublishedFormVersions();
      res.status(200).json({ forms });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'error';
      console.error('published_forms_failed', message);
      // Firestore is not turned on for this project yet. The journey page then keeps the bundled HDFC row.
      if (/firestore api has not been used|5 NOT_FOUND/i.test(message)) {
        res.status(200).json({ forms: [] });
        return;
      }
      res.status(500).json({ error: 'published_forms_failed' });
    }
  },
);

const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/;

/** Source PDF of a published form version. Drafts and retired versions return 404. */
export const publishedFormPdf = onRequest(
  {
    region: 'us-central1',
    memory: '256MiB',
    maxInstances: 2,
    minInstances: 0,
    timeoutSeconds: 30,
    concurrency: 1,
    invoker: 'public',
    cors: HOSTS,
  },
  async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'method_not_allowed' });
      return;
    }
    const formId = typeof req.query.formId === 'string' ? req.query.formId : '';
    const version = typeof req.query.version === 'string' ? req.query.version : '';
    if (!SAFE_ID.test(formId) || !SAFE_ID.test(version)) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    try {
      const { readPublishedFormPdf } = await import('./production');
      const bytes = await readPublishedFormPdf(formId, version);
      if (!bytes) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      res.set('Content-Type', 'application/pdf');
      res.set('Cache-Control', 'public, max-age=300');
      res.status(200).send(bytes);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'error';
      console.error('published_form_pdf_failed', message);
      res.status(500).json({ error: 'published_form_pdf_failed' });
    }
  },
);

export const publishForm = onRequest(
  {
    region: 'us-central1',
    memory: '256MiB',
    maxInstances: 2,
    minInstances: 0,
    timeoutSeconds: 30,
    concurrency: 1,
    invoker: 'public',
    cors: HOSTS,
  },
  async (req, res) => {
    const { productionPublish } = await import('./production');
    await productionPublish(req as unknown as HttpReq, res as unknown as HttpRes);
  },
);
