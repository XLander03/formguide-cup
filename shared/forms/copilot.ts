import type { FormStatus } from './types';

/**
 * "Ask about your forms": the admin console's ops copilot.
 *
 *   POST /api/adminCopilot  CopilotRequest -> CopilotResponse   (Cup admin ID token required)
 *
 * The server answers with Gemini function calling over read-only admin tools. It can
 * only PROPOSE status changes; nothing changes until an admin confirms them in the
 * console, which then calls setFormStatus / publishForm as it does for a manual click.
 */

export const COPILOT_API = '/api/adminCopilot';

export const COPILOT_MAX_MESSAGE = 500;
export const COPILOT_MAX_HISTORY = 6;
export const COPILOT_MAX_HISTORY_TEXT = 1500;

export interface CopilotTurn {
  role: 'user' | 'model';
  text: string;
}

export interface CopilotRequest {
  message: string;
  /** Up to six earlier turns, oldest first. Older ones are dropped. */
  history?: CopilotTurn[];
}

export type CopilotActionType = 'retire' | 'unpublish' | 'publish';

/** A status change the copilot suggests. Checked against the live data, never executed by the server. */
export interface CopilotAction {
  type: CopilotActionType;
  formId: string;
  version: string;
  reason: string;
  bankId: string;
  journey: string;
  from: FormStatus;
  to: FormStatus;
}

/** One tool the model called, for the "How I got this" disclosure. */
export interface CopilotTraceStep {
  tool: string;
  args: Record<string, unknown>;
  /** Short, human-readable outcome, e.g. "7 forms" or "2 rejected". */
  summary: string;
}

export interface CopilotResponse {
  /** Short markdown-lite answer: paragraphs, "- " bullets and **bold** only. */
  answer: string;
  proposedActions: CopilotAction[];
  trace: CopilotTraceStep[];
}

/** Status a proposal moves a version to. */
export const COPILOT_TARGET: Record<CopilotActionType, FormStatus> = {
  retire: 'retired',
  unpublish: 'draft',
  publish: 'published',
};
