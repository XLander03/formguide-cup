import { CONFIDENCE_FLAG_THRESHOLD as UNSURE_BELOW, type FieldConfidence } from '../session/FormSession';

export type ChipTone = 'typed' | 'sample' | 'unsure' | 'confirmed';

/**
 * The small label under a filled field, in the customer's terms. Spoken answers need none (the
 * status already says "heard"); only typed, sample, checked, or not-quite-sure values get one.
 */
export function sourceChip(
  source: string | undefined,
  confidence: FieldConfidence | undefined,
): { text: string; tone: ChipTone } | null {
  if (!source) return null;
  if (source === 'manual') return { text: 'typed', tone: 'typed' };
  if (source === 'priya_demo') return { text: 'sample', tone: 'sample' };
  if (confidence?.confirmed) return { text: '✓ you checked', tone: 'confirmed' };
  if (confidence && confidence.confidence < UNSURE_BELOW) return { text: 'please check', tone: 'unsure' };
  return null;
}
