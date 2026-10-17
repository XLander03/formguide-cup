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
    // does real image work, not just Firestore reads/writes. With 20-page
    // uploads, rendering an 18-page scanned PDF locally added ~80MB RSS over
    // a warm 1-page render (only PNGs, ~13MB, are kept), which fits 512MiB on
    // paper; 1GiB is headroom for 4 in-flight Gemini request bodies and the
    // untested Linux allocator, at negligible cost for an admin-only function.
    memory: '1GiB',
    // At 512MiB a 2nd-gen function only gets a fraction of a vCPU, which
    // makes pdf.js rasterising and PNG encoding slow. A full vCPU cuts that.
    cpu: 1,
    maxInstances: 2,
    minInstances: 0,
    // Up to MAX_PDF_PAGES (20) pages are OCR'd OCR_CONCURRENCY (4) at a time
    // (see draft.ts): 5 waves. A slow page plus its one retry (geminiOcr.ts)
    // was seen at 30-60s, so the worst case is ~5 x 60s = 300s of OCR, plus
    // rendering and Storage writes. 600s leaves headroom; 2nd-gen HTTP
    // functions allow up to 3600s. The admin client calls this URL directly,
    // not through the Hosting rewrite and its 60s cap (see ingestClient.ts).
    timeoutSeconds: 600,
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
