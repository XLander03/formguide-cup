/**
 * HTTP surface for the speak-form-ease backend. One Cloud Function (`sfe`)
 * dispatches by path suffix so Firebase Hosting only needs a single
 * rewrite (`/sfe/**` -> `sfe`), the same pattern as the existing
 * `extract` function for aof_kyc_demo_v1.
 *
 * Routes:
 *   GET  /sfe/journeys        -> journey list + sample phrases
 *   POST /sfe/detect_journey  -> { utterance } -> { journey }
 *   POST /sfe/extract         -> { utterance, current_values, journey? } -> SfeExtractResult
 *   POST /sfe/readback        -> { values } -> { script }
 *   POST /sfe/confirm         -> { values, said?, gates } -> SfeConfirmResult
 */

import { onRequest } from 'firebase-functions/v2/https';
import { sfeConfirmDraft, type SfeGateAnswers } from './confirm';
import { sfeHeuristicExtract } from './heuristic';
import { sfeCallGemini } from './gemini';
import { sfeDetectJourney, sfeJourneysPayload } from './journeys';
import { sfeBuildReadback } from './readback';
import { sfeEmptyValues, type SfeFormValues } from './schema';

type Req = { method: string; path: string; body: unknown };
type Res = {
  status: (n: number) => { json: (b: unknown) => void; send: (b: string) => void };
  set: (k: string, v: string) => void;
  json: (b: unknown) => void;
};

function cors(res: Res): void {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
}

function parseBody(req: Req): Record<string, unknown> {
  if (typeof req.body === 'string') {
    if (!req.body.trim()) return {};
    try {
      return JSON.parse(req.body) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return (req.body as Record<string, unknown>) || {};
}

async function handleExtract(body: Record<string, unknown>): Promise<unknown> {
  const utterance = String(body.utterance ?? '').trim();
  const current = (body.current_values as SfeFormValues) ?? sfeEmptyValues();
  const journey = typeof body.journey === 'string' ? body.journey : null;

  if (!utterance) return { error: 'utterance required' };

  const key = process.env.GEMINI_API_KEY || '';
  if (key) {
    try {
      const gem = await sfeCallGemini(key, utterance, current, journey);
      if (gem) return gem;
    } catch (err) {
      console.warn('[sfe] Gemini failed, heuristic fallback', err);
    }
  }
  return sfeHeuristicExtract(utterance, current);
}

export const sfe = onRequest({ cors: true, invoker: 'public' }, async (req, res) => {
  cors(res as Res);
  const request = req as unknown as Req;
  const response = res as unknown as Res;

  if (request.method === 'OPTIONS') {
    response.status(204).send('');
    return;
  }

  const path = request.path || '';

  if (request.method === 'GET' && path.endsWith('/journeys')) {
    response.json(sfeJourneysPayload());
    return;
  }

  if (request.method !== 'POST') {
    response.status(405).json({ error: 'POST only (except /journeys)' });
    return;
  }

  const body = parseBody(request);

  if (path.endsWith('/detect_journey')) {
    const utterance = String(body.utterance ?? '').trim();
    if (!utterance) {
      response.status(400).json({ error: 'utterance required' });
      return;
    }
    response.json({ journey: sfeDetectJourney(utterance) });
    return;
  }

  if (path.endsWith('/extract')) {
    const result = await handleExtract(body);
    response.json(result);
    return;
  }

  if (path.endsWith('/readback')) {
    const values = (body.values as SfeFormValues) ?? {};
    response.json({ script: sfeBuildReadback(values) });
    return;
  }

  if (path.endsWith('/confirm')) {
    const values = (body.values as SfeFormValues) ?? {};
    const said = (body.said as Record<string, string>) ?? {};
    const gates = (body.gates as SfeGateAnswers) ?? {
      reviewed_corrections: false,
      draft_only_ack: false,
      no_live_submit_ack: false,
    };
    response.json(sfeConfirmDraft(values, said, gates));
    return;
  }

  response.status(404).json({ error: 'Unknown sfe route' });
});
