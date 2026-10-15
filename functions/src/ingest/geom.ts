import type { FieldRecord } from '../../../shared/forms/types';

export function roundPt(value: number): number {
  return Math.round(value * 100) / 100;
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return Number.NaN;
  return Math.min(1, Math.max(0, value));
}

/**
 * Vision boxes are page-normalised with a top-left origin (y down).
 * FieldRecord boxes are PDF points with a bottom-left origin.
 */
export function normalisedTopLeftToPdfBox(
  box: { x: number; y: number; w: number; h: number },
  pageWidth: number,
  pageHeight: number,
): FieldRecord['box'] | null {
  const x = clamp01(box.x);
  const y = clamp01(box.y);
  const w = clamp01(box.w);
  const h = clamp01(box.h);
  if (![x, y, w, h, pageWidth, pageHeight].every((n) => Number.isFinite(n))) return null;
  if (w <= 0 || h <= 0 || pageWidth <= 0 || pageHeight <= 0) return null;
  return {
    x: roundPt(x * pageWidth),
    y: roundPt(pageHeight - (y + h) * pageHeight),
    w: roundPt(w * pageWidth),
    h: roundPt(h * pageHeight),
  };
}

export function assignOrder(fields: FieldRecord[]): FieldRecord[] {
  const sorted = [...fields].sort((a, b) => a.page - b.page || b.box.y - a.box.y || a.box.x - b.box.x);
  return sorted.map((field, order) => ({ ...field, order }));
}
