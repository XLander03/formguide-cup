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
    memory: '256MiB',
    maxInstances: 2,
    minInstances: 0,
    timeoutSeconds: 120,
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
