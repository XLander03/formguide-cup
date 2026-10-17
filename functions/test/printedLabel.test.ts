import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PDFDocument, PDFName, PDFString } from 'pdf-lib';
import type { FieldRecord } from '../../shared/forms/types';
import { loadPdf, readAcroFormFields } from '../src/ingest/acroform';
import { draftFromPdf } from '../src/ingest/draft';
import { cleanLabel, findPrintedLabels } from '../src/ingest/printedLabel';
import type { PageText, TextWord } from '../src/ingest/textLayer';
import { acroPdf, labelledAcroPdf } from './pdfSamples';

const noOcr = async () => {
  throw new Error('gemini must not run for acroform');
};

function byField(fields: FieldRecord[]): Map<string, FieldRecord> {
  return new Map(fields.map((field) => [field.pdfField as string, field]));
}

const W = 595;
const H = 842;

function word(text: string, x: number, y: number, w: number, h = 9): TextWord {
  return { norm: text.toLowerCase().replace(/[^a-z0-9]/g, ''), text, x: x / W, y: y / H, w: w / W, h: h / H };
}

function box(x: number, y: number, w: number, h = 13) {
  return { box: { x: x / W, y: y / H, w: w / W, h: h / H } };
}

describe('printed labels for AcroForm widgets', () => {
  it('labels widgets from the page text: left, above, comb cells, stacked lines', async () => {
    const draft = await draftFromPdf(await labelledAcroPdf(), noOcr);
    assert.equal(draft.source, 'acroform');
    const fields = byField(draft.fields);
    const get = (name: string) => {
      const field = fields.get(name);
      assert.ok(field, name);
      return field;
    };

    // Left of the box, "*" and ":" stripped, shared ids matched on the printed label.
    assert.equal(get('Text1').label, 'Mobile');
    assert.equal(get('Text1').id, 'mobile_registered');
    assert.equal(get('Text2').label, 'E-mail ID');
    assert.equal(get('Text2').id, 'email');
    // The widget keeps its internal name for filling.
    assert.equal(get('Text1').pdfField, 'Text1');

    // Repeated rows each read their own label; only the first takes the shared id.
    assert.equal(get('per_in_cust').label, 'Customer ID');
    assert.equal(get('per_in_cust').id, 'customer_id_cif');
    assert.equal(get('per_in_cust1').label, 'Customer ID');
    assert.equal(get('per_in_cust2').label, 'Customer ID');
    assert.ok(get('per_in_cust1').id.startsWith('custom_'));
    assert.ok(get('per_in_cust1').confidence < 0.85, 'a repeated row is never auto-accepted');

    // Above the box, bracketed instructions dropped.
    assert.equal(get('Text3').label, 'Prefix');
    assert.equal(get('Text4').label, 'Full Name');
    assert.equal(get('Text4').id, 'applicant_full_name');

    // A box stacked under a labelled one continues it.
    assert.equal(get('per_in_cust_add').label, 'Address');
    assert.equal(get('per_in_cust_add').id, 'addr_current_line1');
    assert.equal(get('per_in_cust_add1').label, 'Address (line 2)');
    assert.equal(get('per_in_cust_add1').id, 'addr_current_line2');

    // One box per digit: every cell carries the label printed left of the first.
    for (let i = 1; i <= 6; i += 1) assert.equal(get(`pin_digit_${i}`).label, 'PIN Code');
    assert.equal(get('pin_digit_1').id, 'addr_current_pin');

    // Text printed inside a box (its date format) is never its label.
    assert.equal(get('Text5').label, 'DOB');
    assert.equal(get('Text5').id, 'dob');

    // A bare printed "PIN Code" never takes the id a field's own name matches outright.
    assert.equal(get('Text6').label, 'PIN Code');
    assert.ok(get('Text6').id.startsWith('custom_'));
    assert.equal(get('permanent_pin_code').id, 'addr_permanent_pin');

    // Nothing printed nearby: the internal name still matches.
    assert.equal(get('pan_number').id, 'pan_number');
    assert.equal(get('pan_number').label, 'PAN number');
  });

  it('never scores a printed label above its match score', async () => {
    const draft = await draftFromPdf(await labelledAcroPdf(), noOcr);
    const mobile = draft.fields.find((field) => field.pdfField === 'Text1');
    assert.equal(mobile?.confidence, 0.97, 'exact alias score, as matchLibrary gives it');
  });

  it('falls back to the internal name without page text, as before', async () => {
    const { doc } = await loadPdf(await labelledAcroPdf());
    const fields = byField(readAcroFormFields(doc));
    assert.equal(fields.get('Text1')?.label, 'Text1');
    assert.ok(fields.get('Text1')?.id.startsWith('custom_'));
    assert.equal(fields.get('pan_number')?.id, 'pan_number');
  });

  it('keeps a real /TU tooltip ahead of page text, but not one that repeats the name', async () => {
    const doc = await PDFDocument.load(await labelledAcroPdf());
    const form = doc.getForm();
    form.getField('Text2').acroField.dict.set(PDFName.of('TU'), PDFString.of('Email address'));
    form.getField('Text1').acroField.dict.set(PDFName.of('TU'), PDFString.of('Text1'));
    const draft = await draftFromPdf(await doc.save(), noOcr);
    const fields = byField(draft.fields);
    assert.equal(fields.get('Text2')?.label, 'Email address');
    assert.equal(fields.get('Text1')?.label, 'Mobile');
  });

  it('leaves a PDF without printed labels as it was', async () => {
    const draft = await draftFromPdf(await acroPdf(), noOcr);
    const ids = draft.fields.map((field) => field.id);
    assert.ok(ids.includes('applicant_full_name'));
    assert.ok(ids.includes('dob'));
  });
});

describe('findPrintedLabels', () => {
  const page = (words: TextWord[]): PageText => ({ width: W, height: H, words });

  it('stops at another widget instead of reading past it', () => {
    const labels = findPrintedLabels(
      [box(62, 250, 155), box(268, 250, 280)],
      page([word('*Mobile:', 23, 252, 33)]),
    );
    assert.deepEqual(labels, ['Mobile', undefined]);
  });

  it('ignores text farther than the left gap and a heading over many boxes', () => {
    const labels = findPrintedLabels(
      [box(300, 250, 100), box(168, 300, 120)],
      page([
        word('Remarks', 20, 252, 40),
        ...'I wish to update the following details.'.split(' ').map((w, k) => word(w, 25 + k * 22, 287, 20)),
      ]),
    );
    assert.deepEqual(labels, [undefined, undefined]);
  });

  it('skips a +91 prefix printed before the box', () => {
    const labels = findPrintedLabels([box(86, 673, 140)], page([word('Mobile*', 21, 675, 21), word('9', 61, 675, 5), word('1', 75, 675, 5)]));
    assert.deepEqual(labels, ['Mobile']);
  });

  it('gives a narrow title box the prefix and the wide box after it the row label', () => {
    const labels = findPrintedLabels([box(74, 97, 41), box(130, 97, 340)], page([word('Name*', 21, 99, 18)]));
    assert.deepEqual(labels, ['Name (prefix)', 'Name']);
  });

  it('reads a tick box label to its right', () => {
    const labels = findPrintedLabels(
      [{ ...box(98, 393, 11, 11), checkbox: true }, { ...box(149, 393, 10, 11), checkbox: true }],
      page([word('Occupation', 20, 394, 50), word('Salaried', 112, 394, 30), word('Retired', 162, 394, 28)]),
    );
    assert.deepEqual(labels, ['Salaried', 'Retired']);
  });

  it('returns nothing for a page without text', () => {
    assert.deepEqual(findPrintedLabels([box(10, 10, 10)], page([])), [undefined]);
    assert.deepEqual(findPrintedLabels([box(10, 10, 10)], undefined), [undefined]);
  });

  it('cleans printed labels', () => {
    assert.equal(cleanLabel('*Customer Name:'), 'Customer Name');
    assert.equal(cleanLabel('Full Name (Please leave space between two words)'), 'Full Name');
    assert.equal(cleanLabel('(Off):'), 'Off');
    assert.equal(cleanLabel('- :'), undefined);
  });
});
