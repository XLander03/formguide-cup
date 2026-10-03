import type { Plugin, ViteDevServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function setCors(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  setCors(res);
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

const EMPTY_PAYLOAD = {
  field_updates: {},
  missing_required: [],
  next_ask: null,
  gates: { answers: {} },
  completeness: 'empty' as const,
  refuse_live_submit: false,
  source: 'heuristic-dev' as const,
  assistant_message: 'No utterance yet. Fields vary by bank.',
};

/**
 * Vite-dev middleware: serve /api/extract (+ /api/extractLocal) with the
 * client heuristic so the clickable demo does not need the Firebase emulator.
 */
export function formguideDevExtractApi(): Plugin {
  return {
    name: 'formguide-dev-extract-api',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const path = (req.url || '').split('?')[0];
        if (path !== '/api/extract' && path !== '/api/extractLocal') {
          next();
          return;
        }

        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          setCors(res);
          res.end();
          return;
        }

        // Quick health / readiness for the client (avoid POSTing into a dead proxy)
        if (req.method === 'GET') {
          sendJson(res, 200, { ok: true, mode: 'heuristic-dev' });
          return;
        }

        if (req.method !== 'POST') {
          sendJson(res, 200, {
            ...EMPTY_PAYLOAD,
            assistant_message: 'POST only. Fields vary by bank.',
          });
          return;
        }

        try {
          const raw = await readBody(req);
          let body: Record<string, unknown> = {};
          if (raw.trim()) {
            try {
              body = JSON.parse(raw) as Record<string, unknown>;
            } catch {
              sendJson(res, 200, {
                ...EMPTY_PAYLOAD,
                assistant_message: 'Invalid JSON body. Fields vary by bank.',
              });
              return;
            }
          }

          const utterance = String(body.utterance ?? body.text ?? '').trim();
          const current =
            (body.current_values as Record<string, unknown> | undefined) ||
            (body.currentValues as Record<string, unknown> | undefined) ||
            {};

          if (!utterance) {
            sendJson(res, 200, EMPTY_PAYLOAD);
            return;
          }

          const mod = await server.ssrLoadModule('/src/lib/heuristicExtract.ts');
          const extract = mod.heuristicExtract as (
            u: string,
            c: Record<string, unknown>,
          ) => Record<string, unknown>;
          const result = extract(utterance, current);
          result.source = 'heuristic-dev';
          sendJson(res, 200, result);
        } catch (err) {
          console.warn('[formguide-dev-extract-api] falling back empty payload', err);
          sendJson(res, 200, {
            ...EMPTY_PAYLOAD,
            assistant_message:
              'Dev extract unavailable; use client heuristic. Fields vary by bank.',
          });
        }
      });
    },
  };
}
