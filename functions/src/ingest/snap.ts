import { clampUnitBox } from './geom';
import type { OcrField } from './geminiOcr';
import { anchorToLabel, hasTextLayer, uniqueLabelPair, type PageText, type UnitBox } from './textLayer';

/**
 * Per-axis linear drift, predicted → actual: actual = a * predicted + b (unit square).
 * The stored Gemini boxes for the Axis Re-KYC form drift like this (x about ×1.12,
 * y about ×0.79): right near the top-left, 100+pt out further down, too far for a
 * local snap to bridge on its own.
 */
export type Drift = { ax: number; bx: number; ay: number; by: number };

export const NO_DRIFT: Drift = { ax: 1, bx: 0, ay: 1, by: 0 };

/** Fewer unambiguous labels than this and the page is left uncorrected. */
const MIN_PAIRS = 4;
/** A fitted scale outside this range is treated as a bad fit, not a real drift. */
const SCALE_RANGE: [number, number] = [0.6, 1.6];
/** Residuals within this many points are never rejected as outliers. */
const INLIER_FLOOR_PT = 8;

function leastSquares(pairs: Array<[number, number]>): { a: number; b: number } | null {
  const n = pairs.length;
  const mx = pairs.reduce((s, [p]) => s + p, 0) / n;
  const my = pairs.reduce((s, [, q]) => s + q, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (const [p, q] of pairs) {
    sxx += (p - mx) * (p - mx);
    sxy += (p - mx) * (q - my);
  }
  if (sxx < 1e-6) return null;
  const a = sxy / sxx;
  return { a, b: my - a * mx };
}

/**
 * Robust 1-D fit: least squares, then drop pairs whose residual is over three times
 * the median residual (and over INLIER_FLOOR_PT), twice. Pairs from a field labelled
 * like a printed word elsewhere (e.g. a second ID-proof row reusing the header) fall
 * out here. Null when too few pairs, too little spread, or an implausible scale.
 */
export function fitAxis(pairs: Array<[number, number]>, pagePt: number): { a: number; b: number } | null {
  let kept = pairs;
  let fit: { a: number; b: number } | null = null;
  for (let round = 0; round < 3; round += 1) {
    if (kept.length < MIN_PAIRS) return null;
    fit = leastSquares(kept);
    if (!fit) return null;
    const current = fit;
    const residuals = kept.map(([p, q]) => Math.abs(current.a * p + current.b - q));
    const sorted = [...residuals].sort((m, n) => m - n);
    const median = sorted[Math.floor(sorted.length / 2)];
    const limit = Math.max(3 * median, INLIER_FLOOR_PT / pagePt);
    const next = kept.filter((_, i) => residuals[i] <= limit);
    if (next.length === kept.length) break;
    kept = next;
  }
  if (!fit || kept.length < MIN_PAIRS) return null;
  if (fit.a < SCALE_RANGE[0] || fit.a > SCALE_RANGE[1]) return null;
  return fit;
}

/**
 * Page-wide drift from labels printed exactly once; identity on any axis that will not
 * fit. Fields without a model label box add to the y fit only: their label is assumed
 * to sit on the input box's line, which holds, but its x is a guess that biased the
 * x fit by ~40pt on the stored Axis reply (tick boxes sit left of their labels).
 */
export function fitPageDrift(found: ReadonlyArray<Pick<OcrField, 'label' | 'box' | 'labelBox'>>, text: PageText): Drift {
  const xs: Array<[number, number]> = [];
  const ys: Array<[number, number]> = [];
  for (const field of found) {
    const pair = uniqueLabelPair(field, text);
    if (!pair) continue;
    if (field.labelBox) xs.push([pair.predicted.x, pair.actual.x]);
    ys.push([pair.predicted.y, pair.actual.y]);
  }
  const fx = fitAxis(xs, text.width);
  const fy = fitAxis(ys, text.height);
  return {
    ax: fx ? fx.a : 1,
    bx: fx ? fx.b : 0,
    ay: fy ? fy.a : 1,
    by: fy ? fy.b : 0,
  };
}

export function applyDrift(box: UnitBox, drift: Drift): UnitBox {
  return { x: drift.ax * box.x + drift.bx, y: drift.ay * box.y + drift.by, w: drift.ax * box.w, h: drift.ay * box.h };
}

/** Points of slack when checking that an input box sits on its label's line. */
const LINE_SLACK_PT = 2;
/** Widest gap between a label's end and an input box that still reads as "beside" it. */
const BESIDE_GAP_PT = 40;
/** A repaired box is at least this many label line heights tall. */
const MIN_ROW_LINES = 2;

/**
 * Snapping moves the input box by its label's offset, so it keeps wherever the model
 * put the box relative to its own label. On the HDFC account opening form a reply put
 * every left-column box one row (~14pt) under its label, and some only 1.7pt tall:
 * City then printed on the State row with full confidence. The printed label is known
 * exactly, so check the box against it: a box that starts just right of its label
 * (the label-beside-input layout) must cross the label's line (its middle, for a
 * label wrapped over lines) and be at least one text line tall. If it does not, centre
 * it on the label, tall enough to write in, and report it moved so the field is held
 * for review. Boxes below, above or left of their label (stacked layouts, tick boxes)
 * are left alone.
 */
export function alignBesideLabel(
  box: UnitBox,
  label: UnitBox,
  lineH: number,
  text: Pick<PageText, 'width' | 'height'>,
): { box: UnitBox; moved: boolean } {
  const gapPt = (box.x - (label.x + label.w)) * text.width;
  if (gapPt < -LINE_SLACK_PT || gapPt > BESIDE_GAP_PT) return { box, moved: false };
  const centre = label.y + label.h / 2;
  const slack = LINE_SLACK_PT / text.height;
  const onLine = centre >= box.y - slack && centre <= box.y + box.h + slack;
  if (onLine && box.h >= lineH) return { box, moved: false };
  const h = Math.max(box.h, MIN_ROW_LINES * lineH);
  return { box: { x: box.x, y: centre - h / 2, w: box.w, h }, moved: true };
}

export type Placement = {
  /** Input box on the page, unit square, top-left origin. */
  box: UnitBox;
  /** The printed label was found and the box moved onto it. */
  anchored: boolean;
  /** Placement is not trustworthy enough to skip admin review. */
  doubtful: boolean;
};

/**
 * Place every OCR field of one page. On a page with a text layer: undo the page-wide
 * drift, then snap each field by its own printed label. A field is doubtful when its
 * label is not found, when it was found only by guessing the label's place (no model
 * label box), when the box had to be moved onto its label's line (alignBesideLabel),
 * or when the box had to be repaired or cut to the page. Scanned pages
 * keep the model's boxes, doubtful only if repaired or cut. Null entries are fields
 * with no usable box.
 */
export function placePageFields(
  found: ReadonlyArray<Pick<OcrField, 'label' | 'box' | 'labelBox' | 'repaired'>>,
  text: PageText | undefined,
): Array<Placement | null> {
  const withText = hasTextLayer(text);
  const drift = withText ? fitPageDrift(found, text) : NO_DRIFT;
  return found.map((raw) => {
    const box = applyDrift(raw.box, drift);
    const labelBox = raw.labelBox ? applyDrift(raw.labelBox, drift) : undefined;
    const anchor = withText ? anchorToLabel({ label: raw.label, box, labelBox }, text) : null;
    // A proxy anchor already centres the box on the label's line.
    const aligned = withText && anchor && !anchor.proxy ? alignBesideLabel(anchor.box, anchor.label, anchor.lineH, text) : null;
    const kept = clampUnitBox(aligned ? aligned.box : anchor ? anchor.box : box);
    if (!kept) return null;
    const unanchored = withText && (!anchor || anchor.proxy);
    return {
      box: kept.box,
      anchored: Boolean(anchor),
      doubtful: Boolean(raw.repaired) || kept.clamped || unanchored || Boolean(aligned?.moved),
    };
  });
}
