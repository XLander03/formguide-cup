import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';
import { HDFC_SAMPLE_LINE, fillHdfcKycPdf } from './pdfFill';

const templatePath = resolve(__dirname, '../../public/forms/HDFC_KYC_Resident_Individual.pdf');
const template = new Uint8Array(readFileSync(templatePath));

describe('HDFC KYC draft PDF', () => {
  it('prints the sample line on every page and fits the full gender value in its box', async () => {
    const source = await PDFDocument.load(template.slice());
    const gender = source.getForm().getTextField('txt_Self_Gender').acroField.getWidgets()[0].getRectangle();
    const right = gender.x + gender.width;

    const filled = await fillHdfcKycPdf(template.slice(), { gender: 'female' });
    const pdf = await getDocument({ data: filled, disableWorker: true } as Parameters<typeof getDocument>[0]).promise;
    expect(pdf.numPages).toBe(source.getPageCount());

    const pageText = async (pageNumber: number) => {
      const page = await pdf.getPage(pageNumber);
      return (await page.getTextContent()).items.flatMap((item) => ('str' in item ? [item] : []));
    };

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const text = (await pageText(pageNumber)).map((item) => item.str).join('\n');
      expect(text).toContain(HDFC_SAMPLE_LINE);
    }

    const genderText = (await pageText(1)).filter((item) => item.str === 'Female');
    expect(genderText.length).toBeGreaterThan(0);
    for (const item of genderText) {
      expect(item.str).toBe('Female');
      expect(item.transform[4] + item.width).toBeLessThanOrEqual(right + 0.6);
    }
  });
});
