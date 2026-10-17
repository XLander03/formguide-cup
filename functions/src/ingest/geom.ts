import type { FieldRecord } from '../../../shared/forms/types';

export function roundPt(value: number): number {
  return Math.round(value * 100) / 100;
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return Number.NaN;
  return Math.min(1, Math.max(0, value));
}

type UnitBox = { x: number; y: number; w: number; h: number };

/** Below this many page-units of change, a clamp is float noise, not a repair. */
const CLAMP_EPSILON = 1e-6;

/** A box that starts past an edge is slid back onto the page along that axis. */
function slideOnto(start: number, size: number): number {
  if (start >= 1) return 1 - Math.min(size, 1);
  if (start + size <= 0) return 0;
  return start;
}

/**
 * Keep a unit-square box on the page: the box is cut to the page, so x+w ≤ 1 and
 * y+h ≤ 1 (clamping x and w separately once let an Axis address box run 587pt from
 * x=60 on a 595pt page). A box lying wholly off the page is slid back to the nearest
 * edge, so the admin still sees it to move. `clamped` says the box had to be changed.
 * Null for a non-finite or empty box.
 */
export function clampUnitBox(box: UnitBox): { box: UnitBox; clamped: boolean } | null {
  if (![box.x, box.y, box.w, box.h].every((n) => Number.isFinite(n))) return null;
  if (box.w <= 0 || box.h <= 0) return null;
  const sx = slideOnto(box.x, box.w);
  const sy = slideOnto(box.y, box.h);
  const x0 = clamp01(sx);
  const y0 = clamp01(sy);
  const x1 = clamp01(sx + box.w);
  const y1 = clamp01(sy + box.h);
  if (x1 <= x0 || y1 <= y0) return null;
  const out = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  const clamped = Math.abs(out.x - box.x) > CLAMP_EPSILON
    || Math.abs(out.y - box.y) > CLAMP_EPSILON
    || Math.abs(out.w - box.w) > CLAMP_EPSILON
    || Math.abs(out.h - box.h) > CLAMP_EPSILON;
  return clamped ? { box: out, clamped } : { box: { ...box }, clamped };
}

/**
 * Vision boxes are page-normalised with a top-left origin (y down).
 * FieldRecord boxes are PDF points with a bottom-left origin. The result always
 * lies on the page.
 */
export function normalisedTopLeftToPdfBox(
  box: UnitBox,
  pageWidth: number,
  pageHeight: number,
): FieldRecord['box'] | null {
  if (!Number.isFinite(pageWidth) || !Number.isFinite(pageHeight) || pageWidth <= 0 || pageHeight <= 0) return null;
  const kept = clampUnitBox(box);
  if (!kept) return null;
  const { x, y, w, h } = kept.box;
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
