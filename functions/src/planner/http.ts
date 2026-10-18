import { onRequest } from 'firebase-functions/v2/https';
import { SITE_ORIGINS } from '../siteOrigins';
import { HDFC_V1 } from '../forms/hdfcV1';
import { firestoreCounter } from '../rateLimitStore';
import { geminiCallModel, PlannerModelError } from './gemini';
import { handlePlanJourney } from './handler';

const counter = firestoreCounter();

/**
 * Multi-form journey planner for the journey page. Public like speak, and counted
 * against the same per-caller window. Reads the published catalog with the same
 * Admin SDK code as `publishedForms`.
 */
export const planJourney = onRequest(
  {
    region: 'us-central1',
    minInstances: 0,
    maxInstances: 2,
    memory: '256MiB',
    timeoutSeconds: 60,
    concurrency: 1,
    invoker: 'public',
    cors: SITE_ORIGINS,
    secrets: ['GEMINI_API_KEY'],
  },
  async (req, res) => {
    await handlePlanJourney(req, res, {
      counter,
      planner: () => {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new PlannerModelError('gemini_key_missing', 500);
        return {
          callModel: geminiCallModel(apiKey),
          bundled: HDFC_V1,
          async listForms() {
            const { listPublishedFormVersions } = await import('../ingest/production');
            return listPublishedFormVersions();
          },
        };
      },
    });
  },
);
