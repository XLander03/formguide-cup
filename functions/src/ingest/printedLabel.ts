/**
 * Printed labels for AcroForm widgets that carry no /TU tooltip. Bank PDFs name
 * their fields internally (`per_in_cust_mobile`, `Text7`), so the words printed
 * next to each box on the page are what tell the admin and the matcher what it is.
 *
 * Works on the page text layer (textLayer.ts) in points, top-left origin, y down.
 * Order of evidence, per widget:
 *   1. text to the LEFT on the same line (to the RIGHT first for a tick box);
 *   2. text directly ABOVE, within a small gap, not already a left label;
 *   3. a narrow title box left of a wide name box hands the row label to the wide
 *      box and becomes "<label> (prefix)";
 *   4. a comb cell inherits the label of the cell just left of it, and a box
 *      stacked under a labelled box continues it ("Address (line 2)").
 * Another widget always blocks the search, and text printed inside any widget
 * (cell digits, placeholders) is never a label.
 */
import { hasTextLayer, type PageText, type UnitBox } from './textLayer';

export type LabelWidget = {
  /** Unit-square box, top-left origin (the text layer's frame). */
  box: UnitBox;
  checkbox?: boolean;
};

type Rect = { x0: number; y0: number; x1: number; y1: number };
type Word = Rect & { text: string };

/** Farthest a left label may end from its box. */
const MAX_LEFT_GAP_PT = 60;
/** Farthest a tick box's label may start right of it. */
const MAX_RIGHT_GAP_PT = 20;
/** Farthest a label line may sit above its box. */
const MAX_ABOVE_GAP_PT = 10;
/** Largest gap between words of one label. */
const MIN_WORD_GAP_PT = 8;
/** Comb cells of one value sit this close together. */
const MAX_COMB_GAP_PT = 6;
/** A stacked continuation box starts this close below the box above it. */
const MAX_STACK_GAP_PT = 8;
/** An above label may reach this far past either side of its box. */
const MAX_ABOVE_OVERHANG_PT = 24;
/** ...unless it is this many words long: then it is a sentence or heading. */
const MAX_ABOVE_RUN_WORDS = 6;
/** A title box sits this close left of the name box it belongs to... */
const MAX_PREFIX_GAP_PT = 24;
/** ...and is under this fraction of its width. */
const PREFIX_WIDTH_RATIO = 0.5;
/** Longest label kept, in words (the ones nearest the box). */
const MAX_LABEL_WORDS = 12;
/** Fraction of the shorter height two rects must share to count as one line. */
const LINE_OVERLAP = 0.3;

function toRect(box: UnitBox, width: number, height: number): Rect {
  return { x0: box.x * width, y0: box.y * height, x1: (box.x + box.w) * width, y1: (box.y + box.h) * height };
}

function vOverlap(a: Rect, b: Rect): number {
  return Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
}

function sameLine(a: Rect, b: Rect): boolean {
  return vOverlap(a, b) >= LINE_OVERLAP * Math.min(a.y1 - a.y0, b.y1 - b.y0);
}

function hOverlaps(a: Rect, b: Rect): boolean {
  return Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0;
}

function inside(word: Rect, box: Rect): boolean {
  const cx = (word.x0 + word.x1) / 2;
  const cy = (word.y0 + word.y1) / 2;
  return cx > box.x0 && cx < box.x1 && cy > box.y0 && cy < box.y1;
}

function hasLetters(text: string): boolean {
  return /[a-z]/i.test(text);
}

function wordGap(word: Rect): number {
  return Math.max(MIN_WORD_GAP_PT, 0.9 * (word.y1 - word.y0));
}

/** Words in reading order: lines top to bottom, then left to right. */
function ordered(words: Word[]): Word[] {
  const sorted = [...words].sort((a, b) => a.y0 + a.y1 - (b.y0 + b.y1));
  const lines: Word[][] = [];
  for (const word of sorted) {
    const line = lines[lines.length - 1];
    if (line && sameLine(line[0], word)) line.push(word);
    else lines.push([word]);
  }
  return lines.flatMap((line) => line.sort((a, b) => a.x0 - b.x0));
}

/** "*Customer Name:" -> "Customer Name"; "Full Name (Please leave space...)" -> "Full Name". */
export function cleanLabel(raw: string): string | undefined {
  const letters = (value: string) => value.replace(/[^a-z]/gi, '').length;
  let text = raw.replace(/\s+/g, ' ').trim();
  // Bracketed instructions are dropped unless they are the whole label ("(Off):").
  const bare = text.replace(/\([^)]*\)?/g, ' ').replace(/\s+/g, ' ').trim();
  if (letters(bare) >= 2) text = bare;
  text = text.replace(/^[\s*•#.:\-–—]+/, '').replace(/[\s*:.\-–—]+$/, '').replace(/^[(]+|[)]+$/g, '').trim();
  return letters(text) >= 2 ? text : undefined;
}

function joinWords(words: Word[]): string | undefined {
  let out = '';
  let prev: Word | undefined;
  for (const word of ordered(words)) {
    // Glyph runs split mid-word ("Ro" "ad") touch; real word breaks leave a space.
    const glued = prev && sameLine(prev, word) && word.x0 - prev.x1 < 0.12 * (word.y1 - word.y0);
    out += (out && !glued ? ' ' : '') + word.text;
    prev = word;
  }
  return cleanLabel(out);
}

/** Grow a cluster outward from the word nearest the box. `words` is sorted nearest first. */
function cluster(words: Word[], side: 'left' | 'right', maxFirstGap: number, edge: number): Word[] {
  if (!words.length) return [];
  const first = words[0];
  const firstGap = side === 'left' ? edge - first.x1 : first.x0 - edge;
  if (firstGap > maxFirstGap) return [];
  let picked = [first];
  let reach = side === 'left' ? first.x0 : first.x1;
  for (const word of words.slice(1)) {
    if (picked.length >= MAX_LABEL_WORDS) break;
    const joins = side === 'left' ? word.x1 >= reach - wordGap(word) : word.x0 <= reach + wordGap(word);
    if (!joins) {
      // "Mobile*   +91 [____]": digits printed in front of the box are not the label;
      // the word across the gap is, if it is still close enough.
      const gap = side === 'left' ? edge - word.x1 : word.x0 - edge;
      if (!picked.some((w) => hasLetters(w.text)) && gap <= maxFirstGap) {
        picked = [word];
        reach = side === 'left' ? word.x0 : word.x1;
        continue;
      }
      break;
    }
    picked.push(word);
    reach = side === 'left' ? Math.min(reach, word.x0) : Math.max(reach, word.x1);
  }
  return picked;
}

function sideLabel(index: number, rects: Rect[], words: Word[], side: 'left' | 'right'): Word[] {
  const box = rects[index];
  const tol = 2;
  let barrier = side === 'left' ? -Infinity : Infinity;
  rects.forEach((other, j) => {
    if (j === index || !sameLine(other, box)) return;
    if (side === 'left' && other.x1 <= box.x0 + tol) barrier = Math.max(barrier, other.x1);
    if (side === 'right' && other.x0 >= box.x1 - tol) barrier = Math.min(barrier, other.x0);
  });
  const candidates = words.filter((word) => {
    if (!sameLine(word, box)) return false;
    if (side === 'left') return word.x1 <= box.x0 + tol && word.x0 >= barrier - tol;
    return word.x0 >= box.x1 - tol && word.x1 <= barrier + tol;
  });
  candidates.sort((a, b) => (side === 'left' ? b.x1 - a.x1 : a.x0 - b.x0));
  const maxGap = side === 'left' ? MAX_LEFT_GAP_PT : MAX_RIGHT_GAP_PT;
  return cluster(candidates, side, maxGap, side === 'left' ? box.x0 : box.x1);
}

function aboveLabel(index: number, rects: Rect[], words: Word[]): Word[] {
  const box = rects[index];
  const tol = 2;
  let barrier = -Infinity;
  rects.forEach((other, j) => {
    if (j !== index && hOverlaps(other, box) && other.y1 <= box.y0 + tol) barrier = Math.max(barrier, other.y1);
  });
  // Words centred over the box: a column header over the box next door is not its label.
  const candidates = words.filter((word) => {
    const cx = (word.x0 + word.x1) / 2;
    return cx >= box.x0 && cx <= box.x1
      && word.y1 <= box.y0 + tol
      && box.y0 - word.y1 <= MAX_ABOVE_GAP_PT
      && word.y0 >= barrier - tol;
  });
  if (!candidates.length) return [];
  const nearest = candidates.reduce((a, b) => (b.y1 > a.y1 ? b : a));
  const line = words.filter((word) => sameLine(word, nearest) && word.y1 <= box.y0 + tol).sort((a, b) => a.x0 - b.x0);
  const hits = line.map((word, k) => (candidates.includes(word) && sameLine(word, nearest) ? k : -1)).filter((k) => k >= 0);
  const span = (joinGap: (a: Word, b: Word) => boolean): [number, number] => {
    let first = Math.min(...hits);
    let last = Math.max(...hits);
    while (first > 0 && joinGap(line[first - 1], line[first])) first -= 1;
    while (last < line.length - 1 && joinGap(line[last], line[last + 1])) last += 1;
    return [first, last];
  };
  // A printed run reaching well past the box is a heading or a sentence, not its label.
  const [wideFirst, wideLast] = span((a, b) => b.x0 - a.x1 <= wordGap(b));
  const overhangs = line[wideFirst].x0 < box.x0 - MAX_ABOVE_OVERHANG_PT || line[wideLast].x1 > box.x1 + MAX_ABOVE_OVERHANG_PT;
  if (overhangs && wideLast - wideFirst + 1 >= MAX_ABOVE_RUN_WORDS) return [];
  // Glyph runs cut at the box edge ("P" + "refix") still belong to the label.
  const [first, last] = span((a, b) => b.x0 - a.x1 < 0.3 * (b.y1 - b.y0));
  return line.slice(first, last + 1).slice(0, MAX_LABEL_WORDS);
}

/** A widget with another widget left of it on the same line (not the first box of a row). */
function leftNeighbour(index: number, rects: Rect[], maxGap = Infinity): number | undefined {
  const box = rects[index];
  let best: number | undefined;
  rects.forEach((other, j) => {
    if (j === index || !sameLine(other, box) || other.x1 > box.x0 + 1 || box.x0 - other.x1 > maxGap) return;
    if (best === undefined || other.x1 > rects[best].x1) best = j;
  });
  return best;
}

/**
 * The printed label for each widget on one page, or undefined where none is found.
 * `widgets` are all of the page's widgets (fields with and without tooltips), so
 * every one of them blocks the search for the others.
 */
export function findPrintedLabels(widgets: readonly LabelWidget[], text: PageText | undefined): (string | undefined)[] {
  const labels: (string | undefined)[] = widgets.map(() => undefined);
  if (!hasTextLayer(text) || text.width <= 0 || text.height <= 0) return labels;
  const rects = widgets.map((widget) => toRect(widget.box, text.width, text.height));
  const words: Word[] = text.words
    .map((word) => ({ ...toRect(word, text.width, text.height), text: word.text ?? word.norm }))
    .filter((word) => !rects.some((rect) => inside(word, rect)));

  // 1. Same line: left of a text box; right (then left) of a tick box.
  const claimed = new Set<Word>();
  const fromLeft = new Set<number>();
  widgets.forEach((widget, i) => {
    let found: Word[] = [];
    if (widget.checkbox) found = sideLabel(i, rects, words, 'right');
    if (!found.length) {
      found = sideLabel(i, rects, words, 'left');
      if (found.length) fromLeft.add(i);
    }
    const label = found.length ? joinWords(found) : undefined;
    if (!label) {
      fromLeft.delete(i);
      return;
    }
    labels[i] = label;
    for (const word of found) claimed.add(word);
  });

  // 2. Directly above, from words no box claimed as its left label.
  const free = words.filter((word) => !claimed.has(word));
  widgets.forEach((widget, i) => {
    if (labels[i] || widget.checkbox) return;
    const found = aboveLabel(i, rects, free);
    if (found.length) labels[i] = joinWords(found);
  });

  // 3. "Name: [Mr] [________]": a narrow title box takes the row label first, but
  //    the label names the wide box after it; the narrow one is its prefix.
  widgets.forEach((widget, i) => {
    if (widget.checkbox || fromLeft.has(i)) return;
    const a = leftNeighbour(i, rects, MAX_PREFIX_GAP_PT);
    if (a === undefined || widgets[a].checkbox || !fromLeft.has(a) || !labels[a]) return;
    const aw = rects[a].x1 - rects[a].x0;
    const bw = rects[i].x1 - rects[i].x0;
    if (aw >= PREFIX_WIDTH_RATIO * bw || /\(prefix\)$/.test(labels[a] as string)) return;
    labels[i] = labels[a];
    labels[a] = `${labels[a]} (prefix)`;
  });

  // 4. Comb cells and stacked continuation lines, in reading order so chains resolve.
  const order = widgets.map((_, i) => i).sort((a, b) => rects[a].y0 - rects[b].y0 || rects[a].x0 - rects[b].x0);
  const base = new Map<number, { label: string; line: number }>();
  for (const i of order) {
    if (widgets[i].checkbox) continue;
    const box = rects[i];
    if (labels[i]) {
      base.set(i, { label: labels[i] as string, line: 1 });
      continue;
    }
    const left = leftNeighbour(i, rects);
    if (left !== undefined) {
      // A comb cell: same size as the labelled cell just left of it.
      const cell = rects[left];
      const similar = Math.abs(cell.x1 - cell.x0 - (box.x1 - box.x0)) <= 0.3 * (box.x1 - box.x0)
        && Math.abs(cell.y1 - cell.y0 - (box.y1 - box.y0)) <= 0.3 * (box.y1 - box.y0);
      if (labels[left] && !widgets[left].checkbox && similar && box.x0 - cell.x1 <= MAX_COMB_GAP_PT) {
        labels[i] = labels[left];
        const from = base.get(left);
        if (from) base.set(i, from);
      }
      continue;
    }
    // First box of its row, right under a labelled box: the next line of the same value.
    const over = order.find((j) => j !== i && base.has(j) && !widgets[j].checkbox
      && Math.abs(rects[j].x0 - box.x0) <= 4 && rects[j].y1 <= box.y0 + 1 && box.y0 - rects[j].y1 <= MAX_STACK_GAP_PT);
    if (over !== undefined) {
      const from = base.get(over) as { label: string; line: number };
      const next = { label: from.label, line: from.line + 1 };
      base.set(i, next);
      labels[i] = `${next.label} (line ${next.line})`;
    }
  }
  return labels;
}
