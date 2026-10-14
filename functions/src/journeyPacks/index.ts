import { NOMINATION_JOURNEY_ID } from './nomination';

/**
 * Stretch journeys whose fields are filled on the client from the transcript.
 * One Gemini call per speak turn (transcription only).
 * Debit card reissue should append its id here the same way.
 */
export const CLIENT_FILL_JOURNEYS = new Set<string>([NOMINATION_JOURNEY_ID]);

export function clientFillJourney(current: Record<string, unknown>): string | null {
  const id = current.journey_pack;
  if (typeof id === 'string' && CLIENT_FILL_JOURNEYS.has(id)) return id;
  return null;
}
