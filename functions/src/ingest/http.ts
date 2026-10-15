import { onRequest } from 'firebase-functions/v2/https';
import type { HttpReq, HttpRes } from './handlers';

const HOST = 'https://faceapp-5397b.web.app';

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
    cors: [HOST],
    secrets: ['GEMINI_API_KEY'],
  },
  async (req, res) => {
    const { productionIngest } = await import('./production');
    await productionIngest(req as unknown as HttpReq, res as unknown as HttpRes);
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
    cors: [HOST],
  },
  async (req, res) => {
    const { productionPublish } = await import('./production');
    await productionPublish(req as unknown as HttpReq, res as unknown as HttpRes);
  },
);
