import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AUTO_ACCEPT_ABOVE } from '../../shared/forms/review';
import { draftFromPdf } from '../src/ingest/draft';
import { fitAxis, placePageFields } from '../src/ingest/snap';
import { parseBox2d, parseOcrFields, type OcrField } from '../src/ingest/geminiOcr';
import { clampUnitBox, normalisedTopLeftToPdfBox } from '../src/ingest/geom';
import { anchorToLabel, pageTextFromItems, type PageText, type TextWord } from '../src/ingest/textLayer';
import { addressPdf, manyPages } from './pdfSamples';
import './support';

const W = 595;
const H = 841;

/** A word given in points from the top-left, as pdftotext -bbox prints it. */
function word(norm: string, x: number, y: number, w: number, h = 9): TextWord {
  return { norm, x: x / W, y: y / H, w: w / W, h: h / H };
}

/** Points (top-left origin) to a unit box. */
function pt(x: number, y: number, w: number, h: number) {
  return { x: x / W, y: y / H, w: w / W, h: h / H };
}

function toPt(box: { x: number; y: number; w: number; h: number }) {
  return { x: box.x * W, y: box.y * H, w: box.w * W, h: box.h * H };
}

function placeOne(field: Pick<OcrField, 'label' | 'box' | 'labelBox' | 'repaired'>, text: PageText | undefined) {
  return placePageFields([field], text)[0];
}

/** The drift seen in the stored Axis Re-KYC Gemini boxes: x about ×1.12, y about ×0.79. */
function drift(box: { x: number; y: number; w: number; h: number }) {
  return { x: box.x * 1.12, y: box.y * 0.79 + 0.004, w: box.w * 1.12, h: box.h * 0.79 };
}

/** Axis Re-KYC page 1 contact block, positions from pdftotext -bbox. */
const contactPage: PageText = {
  width: W,
  height: H,
  words: [
    word('communication', 16.4, 546.5, 52.3),
    word('address', 70.4, 546.4, 25.3),
    word('address', 21.6, 597.1, 26.5),
    word('city', 35.1, 655.9, 13.1),
    word('pincode', 473.6, 655.9, 26),
    word('state', 31.4, 671.5, 16.8),
    word('permanent', 16.4, 690, 40),
    word('address', 58, 690, 25),
    word('address', 21.6, 719.9, 26.5),
    word('city', 35.1, 778.7, 13.1),
    word('pincode', 473.6, 778.7, 26),
    word('state', 31.4, 794.3, 16.8),
  ],
};

describe('gemini box_2d parsing', () => {
  it('reads [ymin, xmin, ymax, xmax] in 0-1000 as a top-left unit box', () => {
    const parsed = parseBox2d([100, 200, 150, 600]);
    assert.ok(parsed);
    assert.equal(parsed.repaired, false);
    assert.ok(Math.abs(parsed.box.x - 0.2) < 1e-9);
    assert.ok(Math.abs(parsed.box.y - 0.1) < 1e-9);
    assert.ok(Math.abs(parsed.box.w - 0.4) < 1e-9);
    assert.ok(Math.abs(parsed.box.h - 0.05) < 1e-9);
  });

  it('swaps inverted corners and clamps out-of-range values, marking the box repaired', () => {
    const inverted = parseBox2d([150, 600, 100, 200]);
    assert.ok(inverted);
    assert.equal(inverted.repaired, true);
    assert.ok(Math.abs(inverted.box.x - 0.2) < 1e-9 && Math.abs(inverted.box.w - 0.4) < 1e-9);
    const off = parseBox2d([900, 100, 1100, 1200]);
    assert.ok(off);
    assert.equal(off.repaired, true);
    assert.ok(off.box.x + off.box.w <= 1 && off.box.y + off.box.h <= 1);
  });

  it('reads unit-square floats as repaired and rejects garbage and empty boxes', () => {
    const floats = parseBox2d([0.1, 0.2, 0.15, 0.6]);
    assert.ok(floats);
    assert.equal(floats.repaired, true);
    assert.ok(Math.abs(floats.box.x - 0.2) < 1e-9);
    assert.equal(parseBox2d([100, 200, 100, 600]), null);
    assert.equal(parseBox2d([100, 200, 150]), null);
    assert.equal(parseBox2d(['100', 200, 150, 600]), null);
    assert.equal(parseBox2d({ x: 1 }), null);
    assert.equal(parseBox2d([1200, 0, 1300, 100]), null, 'nothing left on the page');
  });

  it('parses box_2d with label_box_2d and falls back to the legacy box', () => {
    const fields = parseOcrFields(JSON.stringify({
      fields: [
        { label: 'City', type: 'text', required: false, box_2d: [780, 85, 790, 470], label_box_2d: [780, 59, 790, 81], confidence: 0.9 },
        { label: 'State', type: 'text', required: false, box: { x: 0.1, y: 0.2, w: 0.3, h: 0.1 }, confidence: 0.9 },
        { label: 'PIN', type: 'pin', required: false, box_2d: 'nope', box: { x: 0.8, y: 0.5, w: 0.1, h: 0.02 }, confidence: 0.9 },
        { label: 'Broken', type: 'text', required: false, box_2d: [5, 5, 5, 5], confidence: 0.9 },
      ],
    }));
    assert.deepEqual(fields.map((f) => f.label), ['City', 'State', 'PIN']);
    assert.ok(fields[0].labelBox);
    assert.ok(Math.abs(fields[0].box.x - 0.085) < 1e-9);
    assert.ok(Math.abs(fields[0].labelBox!.x - 0.059) < 1e-9);
    assert.equal(fields[0].repaired, undefined);
    assert.deepEqual(fields[1].box, { x: 0.1, y: 0.2, w: 0.3, h: 0.1 });
    assert.equal(fields[1].labelBox, undefined);
    assert.equal(fields[2].type, 'pin');
  });

  it('marks a legacy box that runs off the page as repaired and cuts it to the page', () => {
    const [field] = parseOcrFields(JSON.stringify({
      fields: [{ label: 'Address', type: 'text', required: false, box: { x: 0.1, y: 0.4, w: 0.99, h: 0.03 }, confidence: 0.95 }],
    }));
    assert.equal(field.repaired, true);
    assert.ok(Math.abs(field.box.x + field.box.w - 1) < 1e-9);
  });
});

describe('page clamp', () => {
  it('never lets x+w or y+h pass the page edge', () => {
    // The real Axis failure: x=59.97, w=587 on a 595pt page.
    const box = normalisedTopLeftToPdfBox({ x: 59.97 / W, y: 0.6, w: 587 / W, h: 0.03 }, W, H);
    assert.ok(box);
    assert.ok(box.x + box.w <= W + 0.01, `x+w = ${box.x + box.w}`);
    const low = normalisedTopLeftToPdfBox({ x: 0.2, y: 0.98, w: 0.1, h: 0.05 }, W, H);
    assert.ok(low);
    assert.ok(low.y >= 0 && low.h <= 0.02 * H + 0.01);
  });

  it('reports whether a box had to be cut', () => {
    assert.equal(clampUnitBox({ x: 0.1, y: 0.1, w: 0.3, h: 0.1 })?.clamped, false);
    assert.equal(clampUnitBox({ x: 0.8, y: 0.1, w: 0.3, h: 0.1 })?.clamped, true);
    assert.equal(clampUnitBox({ x: -0.1, y: 0.1, w: 0.3, h: 0.1 })?.clamped, true);
    // Wholly off the right edge (the Axis "Money Lender" tick box came back at x=595pt):
    // slid back on so the admin can still see and move it.
    const off = clampUnitBox({ x: 1.2, y: 0.1, w: 0.3, h: 0.1 });
    assert.equal(off?.clamped, true);
    assert.ok(off && Math.abs(off.box.x - 0.7) < 1e-9 && Math.abs(off.box.w - 0.3) < 1e-9);
    assert.equal(clampUnitBox({ x: 0.1, y: 0.1, w: 0, h: 0.1 }), null);
  });
});

describe('label snapping', () => {
  it('moves the input box by the label offset and picks the nearer of two printed labels', () => {
    // Model put the permanent-address City label 30pt high and 10pt left; the input box
    // carries the same error.
    const anchor = anchorToLabel({
      label: 'City',
      labelBox: pt(25.1, 748.7, 13.1, 9),
      box: pt(50, 746, 380, 12),
    }, contactPage);
    assert.ok(anchor);
    assert.ok(Math.abs(anchor.shiftPt.dx - 10) < 0.01);
    assert.ok(Math.abs(anchor.shiftPt.dy - 30) < 0.01);
    const moved = toPt(anchor.box);
    assert.ok(Math.abs(moved.x - 60) < 0.01 && Math.abs(moved.y - 776) < 0.01);
    assert.ok(Math.abs(anchor.label.y * H - 778.7) < 0.01, 'the permanent City, not the communication one');
  });

  it('matches a multi-word label split across items and lines, and a label with extra words', () => {
    const anchor = anchorToLabel({
      label: '*Communication Address',
      labelBox: pt(18, 544, 78, 10),
      box: pt(60, 595, 500, 40),
    }, contactPage);
    assert.ok(anchor);
    assert.ok(Math.abs(anchor.label.x * W - 16.4) < 0.01 && Math.abs((anchor.label.x + anchor.label.w) * W - 95.7) < 0.01);
    // "Pincode (6 digits)": only the first word is printed; still anchored on it.
    const pin = anchorToLabel({ label: 'Pincode (6 digits)', labelBox: pt(470, 650, 40, 9), box: pt(505, 650, 80, 12) }, contactPage);
    assert.ok(pin);
    assert.ok(Math.abs(pin.label.y * H - 655.9) < 0.01);
  });

  it('refuses a label that is too far from where the model said it was, or not printed at all', () => {
    assert.equal(anchorToLabel({ label: 'City', labelBox: pt(35, 560, 13, 9), box: pt(60, 560, 380, 12) }, contactPage), null);
    assert.equal(anchorToLabel({ label: 'Landmark', labelBox: pt(16, 638, 31, 9), box: pt(60, 638, 380, 12) }, contactPage), null);
  });

  it('snaps a legacy reply by assuming the label ends just left of the box, but still holds it', () => {
    // Model put State's input box 12pt low; the printed "State" ends at 48.2pt.
    const anchor = anchorToLabel({ label: 'State', box: pt(60, 682, 300, 12) }, contactPage);
    assert.ok(anchor);
    assert.equal(anchor.proxy, true);
    const moved = toPt(anchor.box);
    assert.ok(Math.abs(moved.x - 52.2) < 0.01, `x ${moved.x}`);
    assert.ok(Math.abs(moved.y + 6 - 676) < 0.01, `centre ${moved.y + 6}`);
    const legacy = placeOne({ label: 'State', box: pt(60, 682, 300, 12) }, contactPage);
    assert.equal(legacy?.anchored, true);
    assert.equal(legacy?.doubtful, true, 'a guessed label place is not enough to skip review');
  });

  it('builds words from pdfjs text items in reading order', () => {
    const viewport = {
      width: W,
      height: H,
      convertToViewportPoint: (x: number, y: number) => [x, H - y],
    };
    const text = pageTextFromItems([
      { str: 'City', transform: [9, 0, 0, 9, 35, 841 - 663], width: 13 },
      { str: '*Communication Address', transform: [9, 0, 0, 9, 16, 841 - 555], width: 80 },
      { str: '   ', transform: [9, 0, 0, 9, 0, 0], width: 5 },
      { type: 'beginMarkedContent' },
    ], viewport);
    assert.deepEqual(text.words.map((w) => w.norm), ['communication', 'address', 'city']);
    const city = text.words[2];
    assert.ok(Math.abs(city.x * W - 35) < 0.01);
    assert.ok(Math.abs((city.y + city.h) * H - (663 + 1.8)) < 0.01, 'bottom sits 0.2em under the baseline');
  });
});

describe('page drift', () => {
  /** Unique printed labels with the input box right of each, positions in points. */
  const truth = [
    { label: 'Branch Sol ID', at: [17.3, 67.3, 42, 9], input: [62, 66, 100, 11] },
    { label: 'CKYC ID', at: [180.4, 67.3, 27, 9], input: [232, 66, 200, 11] },
    { label: 'Customer Id', at: [16.3, 135, 41, 9], input: [77, 134, 120, 11] },
    { label: 'Nationality', at: [254.6, 517.1, 34, 9], input: [295, 516, 60, 11] },
    { label: 'Landmark', at: [16.5, 638.3, 31.7, 9], input: [54, 637, 270, 11] },
    { label: 'Pincode', at: [473.6, 655.9, 26, 9], input: [506, 655, 72, 9] },
    { label: 'Country', at: [484.2, 671.5, 26.4, 9], input: [515, 670, 63, 9] },
  ];
  const text: PageText = {
    width: W,
    height: H,
    words: truth.flatMap(({ label, at }) => {
      const parts = label.split(' ');
      const step = at[2] / parts.length;
      return parts.map((part, i) => word(part.toLowerCase(), at[0] + i * step, at[1], step - 1, at[3]));
    }),
  };

  it('fits a scale-and-offset drift per axis and rejects an outlier', () => {
    const pairs: Array<[number, number]> = [0.1, 0.2, 0.4, 0.6, 0.8].map((p) => [p * 1.12, p]);
    pairs.push([0.5, 0.9]);
    const fit = fitAxis(pairs, W);
    assert.ok(fit);
    assert.ok(Math.abs(fit.a - 1 / 1.12) < 1e-6 && Math.abs(fit.b) < 1e-6);
    assert.equal(fitAxis(pairs.slice(0, 3), W), null, 'too few labels to trust');
  });

  it('undoes a 100pt+ drift with label boxes, then snaps each field onto its label', () => {
    const found = truth.map(({ label, at, input }) => ({
      label,
      labelBox: drift(pt(at[0], at[1], at[2], at[3])),
      box: drift(pt(input[0], input[1], input[2], input[3])),
    }));
    const placed = placePageFields(found, text);
    for (const [i, { label, input }] of truth.entries()) {
      const p = placed[i];
      assert.ok(p, label);
      assert.equal(p.anchored, true, label);
      assert.equal(p.doubtful, false, label);
      const got = toPt(p.box);
      assert.ok(Math.abs(got.x - input[0]) < 1.5 && Math.abs(got.y - input[1]) < 1.5, `${label}: ${JSON.stringify(got)}`);
      assert.ok(Math.abs(got.w - input[2]) < 1.5, `${label} width ${got.w}`);
    }
  });

  it('undoes the same drift for a legacy reply without label boxes, and holds every field', () => {
    const found = truth.map(({ label, input }) => ({ label, box: drift(pt(input[0], input[1], input[2], input[3])) }));
    const placed = placePageFields(found, text);
    for (const [i, { label, input }] of truth.entries()) {
      const p = placed[i];
      assert.ok(p, label);
      const got = toPt(p.box);
      assert.ok(Math.abs(got.y + got.h / 2 - (input[1] + input[3] / 2)) < 3, `${label} y ${got.y}`);
      assert.equal(p.doubtful, true, label);
    }
  });
});

describe('placement confidence', () => {
  const base: Pick<OcrField, 'label' | 'box' | 'labelBox' | 'repaired'> = {
    label: 'City',
    labelBox: pt(35.1, 655.9, 13.1, 9),
    box: pt(55, 654, 380, 12),
  };

  it('trusts an anchored box and doubts an unanchored one on a page with text', () => {
    assert.deepEqual(placeOne(base, contactPage)?.doubtful, false);
    const lost = placeOne({ ...base, label: 'Landmark' }, contactPage);
    assert.equal(lost?.anchored, false);
    assert.equal(lost?.doubtful, true);
  });

  it('keeps the model box on a scanned page and doubts repaired or clamped boxes', () => {
    const scanned = placeOne({ ...base, label: 'Landmark' }, { width: W, height: H, words: [] });
    assert.equal(scanned?.doubtful, false);
    assert.deepEqual(scanned?.box, base.box);
    assert.equal(placeOne({ ...base, repaired: true }, contactPage)?.doubtful, true);
    assert.equal(placeOne({ ...base, label: 'Landmark', box: pt(60, 600, 587, 12) }, undefined)?.doubtful, true);
  });

  it('snaps through draftFromPdf on a real text layer and holds unanchored fields for review', async () => {
    const bytes = await addressPdf();
    const draft = await draftFromPdf(bytes, async () => [
      // Permanent City: printed at x=35 with its baseline 440pt from the top. The model
      // put both the label and the box ~21pt too high.
      {
        label: 'City', type: 'text', required: false, confidence: 0.95,
        labelBox: pt(35, 412, 16, 9), box: pt(60, 410, 380, 12),
      },
      { label: 'Landmark', type: 'text', required: false, confidence: 0.95, box: pt(60, 420, 380, 12), labelBox: pt(20, 420, 35, 9) },
      { label: 'Address', type: 'text', required: false, confidence: 0.95, box: pt(60, 200, 590, 20), labelBox: pt(20, 193, 30, 9) },
    ]);
    const city = draft.fields.find((f) => f.label === 'City');
    assert.ok(city);
    assert.equal(city.confidence, 0.95);
    assert.equal(city.checked, true);
    // Glyphs 432.8–441.8 from the top, centre 437.3; predicted centre 416.5, so the box
    // moves down 20.8pt: top-down 430.8, PDF y = 841 - 430.8 - 12.
    assert.ok(Math.abs(city.box.y - (841 - 430.8 - 12)) < 0.5, `city y ${city.box.y}`);
    assert.equal(city.box.x, 60);
    const landmark = draft.fields.find((f) => f.label === 'Landmark');
    assert.ok(landmark);
    assert.ok(landmark.confidence <= AUTO_ACCEPT_ABOVE);
    assert.equal(landmark.checked, false);
    const address = draft.fields.find((f) => f.label === 'Address');
    assert.ok(address);
    assert.ok(address.box.x + address.box.w <= 595 + 0.01, 'cut to the page');
    assert.ok(address.confidence <= AUTO_ACCEPT_ABOVE, 'a cut box waits for review');
  });

  it('keeps model boxes and confidence on a page with no text layer', async () => {
    const bytes = await manyPages(1);
    const draft = await draftFromPdf(bytes, async () => [
      { label: 'City', type: 'text', required: false, confidence: 0.95, box: { x: 0.1, y: 0.2, w: 0.4, h: 0.05 }, labelBox: { x: 0.02, y: 0.2, w: 0.05, h: 0.02 } },
    ]);
    assert.equal(draft.fields[0].confidence, 0.95);
    assert.deepEqual(draft.fields[0].box, { x: 61.2, y: 594, w: 244.8, h: 39.6 });
  });
});
