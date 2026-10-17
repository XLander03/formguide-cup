import { ADMIN_API } from '../../../shared/forms/admin';
import type { CopilotRequest, CopilotResponse } from '../../../shared/forms/copilot';
import { adminPost } from './adminFetch';
import { mockCopilotReply } from './mockCopilot';
import { mockIngestRequested } from './mockQuery';

export const COPILOT_UNAVAILABLE = 'The forms assistant is not available right now.';

/** Asks the admin copilot. It only reads and proposes; nothing changes until the admin confirms. */
export async function askCopilot(request: CopilotRequest): Promise<CopilotResponse> {
  if (mockIngestRequested()) return mockCopilotReply(request.message);
  const payload = (await adminPost(ADMIN_API.copilot, request, COPILOT_UNAVAILABLE)) as Partial<CopilotResponse>;
  if (typeof payload.answer !== 'string' || !Array.isArray(payload.proposedActions) || !Array.isArray(payload.trace)) {
    throw new Error(`${COPILOT_UNAVAILABLE} (bad response)`);
  }
  return { answer: payload.answer, proposedActions: payload.proposedActions, trace: payload.trace };
}
