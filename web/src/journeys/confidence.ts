/** Spoken captures below this are flagged for a human check. Deterministic, not a model call. */
export const CONFIDENCE_CHECK = 0.75;

export type ConfidenceEntry = {
  confidence: number;
  reason?: string;
  confirmed?: boolean;
};

export function scoreOf(score: number | ConfidenceEntry | null | undefined): number | undefined {
  if (typeof score === 'number' && Number.isFinite(score)) return score;
  if (score && typeof score === 'object' && typeof score.confidence === 'number' && Number.isFinite(score.confidence)) {
    return score.confidence;
  }
  return undefined;
}

export function confidenceFlag(
  score: number | ConfidenceEntry | null | undefined,
): { text: string; low: boolean } | null {
  const value = scoreOf(score);
  if (value === undefined) return null;
  const shown = value.toFixed(2);
  if (value < CONFIDENCE_CHECK) return { text: `Low confidence ${shown}`, low: true };
  return { text: `Confidence ${shown}`, low: false };
}
