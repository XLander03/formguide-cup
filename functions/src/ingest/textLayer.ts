/**
 * The PDF's own text layer, used to check where the vision model put each field.
 * Gemini's boxes drift by different amounts in different parts of a page (seen on
 * the Axis Re-KYC form: right near the top, ~100pt high further down). When the page
 * carries real text, the printed label's exact position is known, so the model's
 * label-vs-actual offset is measured per field and the input box is moved by it.
 *
 * All boxes here use the page as a unit square, origin top-left, y down, the same
 * frame as the OCR boxes.
 */

export type UnitBox = { x: number; y: number; w: number; h: number };

export type TextWord = UnitBox & {
  /** Lowercased letters and digits only. Never empty. */
  norm: string;
  /** The word as printed (case and punctuation kept), when read from a PDF. */
  text?: string;
};

export type PageText = {
  /** Page size in points (unrotated viewport at scale 1). */
  width: number;
  height: number;
  /** Words in reading order: lines top to bottom, left to right within a line. */
  words: TextWord[];
};

/** Below this, a page is treated as scanned and the model's boxes stand as returned. */
const MIN_WORDS_FOR_TEXT_LAYER = 1;

export function hasTextLayer(text: PageText | undefined): text is PageText {
  return Boolean(text && text.words.length >= MIN_WORDS_FOR_TEXT_LAYER);
}

export function normToken(raw: string): string {
  return raw.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function labelTokens(label: string): string[] {
  // Split on whitespace only, as page words are: "Non-Matric" and "A/C" stay one token.
  return label.split(/\s+/).map(normToken).filter(Boolean);
}

type PdfjsTextItem = { str?: unknown; transform?: unknown; width?: unknown };
type Viewport = {
  width: number;
  height: number;
  convertToViewportPoint: (x: number, y: number) => number[];
};

/** Raw word rectangles in viewport points (top-left origin). */
type RawWord = { text: string; x0: number; y0: number; x1: number; y1: number };

function wordsFromItem(item: PdfjsTextItem, viewport: Viewport): RawWord[] {
  if (typeof item.str !== 'string' || !item.str.trim()) return [];
  const t = item.transform;
  if (!Array.isArray(t) || t.length < 6 || !t.every((n) => typeof n === 'number' && Number.isFinite(n))) return [];
  const [a, b, c, d, e, f] = t as number[];
  const runScale = Math.hypot(a, b);
  const fontSize = Math.hypot(c, d);
  const width = typeof item.width === 'number' && Number.isFinite(item.width) ? item.width : 0;
  if (runScale <= 0 || fontSize <= 0 || width <= 0) return [];
  const ux = a / runScale;
  const uy = b / runScale;
  const vx = c / fontSize;
  const vy = d / fontSize;
  // Glyphs sit roughly 0.2em below to 0.8em above the baseline.
  const below = 0.2 * fontSize;
  const above = 0.8 * fontSize;
  const str = item.str;
  const words: RawWord[] = [];
  const pattern = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(str))) {
    const start = (match.index / str.length) * width;
    const end = ((match.index + match[0].length) / str.length) * width;
    const xs: number[] = [];
    const ys: number[] = [];
    for (const along of [start, end]) {
      for (const up of [-below, above]) {
        const px = e + ux * along + vx * up;
        const py = f + uy * along + vy * up;
        const [vxp, vyp] = viewport.convertToViewportPoint(px, py);
        xs.push(vxp);
        ys.push(vyp);
      }
    }
    words.push({
      text: match[0],
      x0: Math.min(...xs),
      y0: Math.min(...ys),
      x1: Math.max(...xs),
      y1: Math.max(...ys),
    });
  }
  return words;
}

/** Order words into lines (top to bottom) and left to right within each line. */
function readingOrder(words: TextWord[]): TextWord[] {
  const byCentre = [...words].sort((p, q) => p.y + p.h / 2 - (q.y + q.h / 2) || p.x - q.x);
  const lines: TextWord[][] = [];
  let current: TextWord[] = [];
  let lineCentre = 0;
  let lineHeight = 0;
  for (const word of byCentre) {
    const centre = word.y + word.h / 2;
    if (current.length && Math.abs(centre - lineCentre) <= 0.5 * Math.min(lineHeight, word.h)) {
      current.push(word);
      continue;
    }
    if (current.length) lines.push(current);
    current = [word];
    lineCentre = centre;
    lineHeight = word.h;
  }
  if (current.length) lines.push(current);
  return lines.flatMap((line) => line.sort((p, q) => p.x - q.x));
}

/** Words from a pdfjs page's `getTextContent()` items, in unit-square coordinates. */
export function pageTextFromItems(items: readonly unknown[], viewport: Viewport): PageText {
  const width = viewport.width;
  const height = viewport.height;
  const words: TextWord[] = [];
  if (width > 0 && height > 0) {
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      for (const raw of wordsFromItem(item as PdfjsTextItem, viewport)) {
        const norm = normToken(raw.text);
        if (!norm) continue;
        const x0 = Math.max(0, raw.x0 / width);
        const y0 = Math.max(0, raw.y0 / height);
        const x1 = Math.min(1, raw.x1 / width);
        const y1 = Math.min(1, raw.y1 / height);
        if (x1 <= x0 || y1 <= y0) continue;
        words.push({ norm, text: raw.text, x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
      }
    }
  }
  return { width, height, words: readingOrder(words) };
}

/** Token equality, tolerating a trailing plural/possessive ("employer" vs "employers"). */
function sameToken(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 4 && long.startsWith(short) && long.length - short.length <= 2;
}

type Run = { start: number; length: number; first: number };

/** Maximal runs where consecutive label tokens equal consecutive page words. */
function labelRuns(tokens: string[], words: TextWord[]): Run[] {
  const runs: Run[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    for (let j = 0; j < words.length; j += 1) {
      if (!sameToken(tokens[i], words[j].norm)) continue;
      if (i > 0 && j > 0 && sameToken(tokens[i - 1], words[j - 1].norm)) continue;
      let length = 1;
      while (i + length < tokens.length && j + length < words.length && sameToken(tokens[i + length], words[j + length].norm)) {
        length += 1;
      }
      const enough = length === tokens.length || length >= 2 || tokens[i].length >= 4;
      if (enough) runs.push({ start: i, length, first: j });
    }
  }
  return runs;
}

function union(words: TextWord[]): UnitBox {
  const x0 = Math.min(...words.map((w) => w.x));
  const y0 = Math.min(...words.map((w) => w.y));
  const x1 = Math.max(...words.map((w) => w.x + w.w));
  const y1 = Math.max(...words.map((w) => w.y + w.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Largest label-vs-predicted offset accepted as the same label, in points. */
export const MAX_LABEL_SHIFT_PT = 60;
/** Points of distance a fully matched label is preferred over a half-matched one. */
const PARTIAL_PENALTY_PT = 25;

export type Anchor = {
  /** The input box, moved by the measured label offset (unclamped). */
  box: UnitBox;
  /** Printed label position found in the text layer. */
  label: UnitBox;
  /** Height of one line of the printed label (the label may wrap over several). */
  lineH: number;
  /** Applied offset, in points. */
  shiftPt: { dx: number; dy: number };
};

export type LabelledBox = { label: string; box: UnitBox; labelBox?: UnitBox };

/** Without a label box, the label is assumed to end this far left of the input box. */
const PROXY_LABEL_GAP_PT = 4;

/**
 * Where the model put the label. Legacy replies have no label box, so the label is
 * taken to end just left of the input box on its line (the usual bank-form layout);
 * only that right edge and the vertical centre mean anything then.
 */
function predictedLabel(field: LabelledBox, width: number): { box: UnitBox; proxy: boolean } {
  if (field.labelBox) return { box: field.labelBox, proxy: false };
  const right = field.box.x - PROXY_LABEL_GAP_PT / width;
  return { box: { x: right, y: field.box.y + field.box.h / 2, w: 0, h: 0 }, proxy: true };
}

/**
 * Offset from the predicted label to a printed run: left edges when the run starts
 * the label, right edges when it ends it (always, for a proxy), centres otherwise;
 * vertical centres always.
 */
function runOffset(run: Run, tokenCount: number, rect: UnitBox, predicted: UnitBox, proxy: boolean): { dx: number; dy: number } {
  let dx: number;
  if (proxy || (run.start > 0 && run.start + run.length === tokenCount)) dx = rect.x + rect.w - (predicted.x + predicted.w);
  else if (run.start === 0) dx = rect.x - predicted.x;
  else dx = rect.x + rect.w / 2 - (predicted.x + predicted.w / 2);
  return { dx, dy: rect.y + rect.h / 2 - (predicted.y + predicted.h / 2) };
}

/**
 * For a label printed exactly once, in full, on the page: the point where the model
 * put it and the point where it is printed. Unambiguous whatever the drift, so these
 * pairs are what the page-wide drift fit uses.
 */
export function uniqueLabelPair(
  field: LabelledBox,
  text: PageText,
): { predicted: { x: number; y: number }; actual: { x: number; y: number } } | null {
  const tokens = labelTokens(field.label);
  if (tokens.join('').length < 4) return null;
  const full = labelRuns(tokens, text.words).filter((run) => run.length === tokens.length);
  if (full.length !== 1) return null;
  const rect = union(text.words.slice(full[0].first, full[0].first + full[0].length));
  const { box, proxy } = predictedLabel(field, text.width);
  return {
    predicted: { x: proxy ? box.x + box.w : box.x, y: box.y + box.h / 2 },
    actual: { x: proxy ? rect.x + rect.w : rect.x, y: rect.y + rect.h / 2 },
  };
}

/**
 * Find the field's printed label near where the model said it was. The nearest
 * matching label within MAX_LABEL_SHIFT_PT of the predicted label wins, and the
 * input box moves by that label's predicted-vs-actual offset. `proxy` marks an
 * anchor made without a model label box (legacy replies), which is weaker evidence.
 * Null when no printed label is close enough.
 */
export function anchorToLabel(field: LabelledBox, text: PageText): (Anchor & { proxy: boolean }) | null {
  const tokens = labelTokens(field.label);
  if (!tokens.length || !text.words.length) return null;
  const { width, height } = text;
  const { box: predicted, proxy } = predictedLabel(field, width);
  let best: { score: number; anchor: Anchor & { proxy: boolean } } | null = null;
  for (const run of labelRuns(tokens, text.words)) {
    const runWords = text.words.slice(run.first, run.first + run.length);
    const rect = union(runWords);
    const { dx, dy } = runOffset(run, tokens.length, rect, predicted, proxy);
    const distance = Math.hypot(dx * width, dy * height);
    if (distance > MAX_LABEL_SHIFT_PT) continue;
    const score = distance + PARTIAL_PENALTY_PT * (1 - run.length / tokens.length);
    if (!best || score < best.score) {
      best = {
        score,
        anchor: {
          box: { x: field.box.x + dx, y: field.box.y + dy, w: field.box.w, h: field.box.h },
          label: rect,
          lineH: Math.min(...runWords.map((w) => w.h)),
          shiftPt: { dx: dx * width, dy: dy * height },
          proxy,
        },
      };
    }
  }
  return best ? best.anchor : null;
}
