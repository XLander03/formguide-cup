import { PDFDocument } from 'pdf-lib';
import { MAX_PDF_BYTES, MAX_PDF_PAGES } from '../../../shared/forms/limits';
import type { PageSize } from './geometry';

export const PDF_MAX_BYTES = MAX_PDF_BYTES;
export const PDF_MAX_PAGES = MAX_PDF_PAGES;

export const PDF_CHOOSE = 'Choose a PDF.';
export const PDF_TOO_LARGE = 'This PDF is too large.';
export const PDF_TOO_MANY_PAGES = `This PDF has more than ${PDF_MAX_PAGES} pages.`;
export const PDF_NO_PAGES = 'This PDF has no pages.';
export const PDF_NOT_READABLE = 'This file is not a readable PDF.';

export type PdfCheckId = 'size' | 'page-cap' | 'parses' | 'fillable';

export interface PdfCheckRow {
  id: PdfCheckId;
  label: string;
  state: 'pass' | 'fail';
  detail: string;
}

export interface PdfInspection {
  rows: PdfCheckRow[];
  reason: string | null;
  pageCount: number;
  pages: PageSize[];
  fillable: boolean;
  bytes: Uint8Array;
}

const UNCHECKED: Record<Exclude<PdfCheckId, 'size'>, string> = {
  'page-cap': 'Page cap',
  parses: 'Parses',
  fillable: 'Fillable vs flat',
};

function unfinished(size: PdfCheckRow, reason: string): PdfInspection {
  const rest = (['page-cap', 'parses', 'fillable'] as const).map((id) => ({
    id,
    label: UNCHECKED[id],
    state: 'fail' as const,
    detail: 'Not checked',
  }));
  return {
    rows: [size, ...rest],
    reason,
    pageCount: 0,
    pages: [],
    fillable: false,
    bytes: new Uint8Array(),
  };
}

function readFileBuffer(file: Blob): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('Unreadable file'));
    reader.readAsArrayBuffer(file);
  });
}

function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

export async function inspectPdf(file: File): Promise<PdfInspection> {
  if (!isPdfFile(file) || file.size <= 0) {
    return unfinished(
      { id: 'size', label: 'Size', state: 'fail', detail: 'Not a PDF' },
      PDF_CHOOSE,
    );
  }

  const sizeOk = file.size <= PDF_MAX_BYTES;
  const sizeRow: PdfCheckRow = {
    id: 'size',
    label: 'Size',
    state: sizeOk ? 'pass' : 'fail',
    detail: sizeOk ? 'Within limit' : 'Too large',
  };
  if (!sizeOk) return unfinished(sizeRow, PDF_TOO_LARGE);

  const buffer = await readFileBuffer(file);
  const bytes = new Uint8Array(buffer.slice(0));
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(buffer, { updateMetadata: false });
  } catch {
    return {
      rows: [
        sizeRow,
        { id: 'page-cap', label: 'Page cap', state: 'fail', detail: 'Not checked' },
        { id: 'parses', label: 'Parses', state: 'fail', detail: 'Not a PDF' },
        { id: 'fillable', label: 'Fillable vs flat', state: 'fail', detail: 'Not checked' },
      ],
      reason: PDF_NOT_READABLE,
      pageCount: 0,
      pages: [],
      fillable: false,
      bytes,
    };
  }

  let pdfPages;
  try {
    pdfPages = doc.getPages();
  } catch {
    return {
      rows: [
        sizeRow,
        { id: 'page-cap', label: 'Page cap', state: 'fail', detail: 'Not checked' },
        { id: 'parses', label: 'Parses', state: 'fail', detail: 'Not a PDF' },
        { id: 'fillable', label: 'Fillable vs flat', state: 'fail', detail: 'Not checked' },
      ],
      reason: PDF_NOT_READABLE,
      pageCount: 0,
      pages: [],
      fillable: false,
      bytes,
    };
  }
  const pages = pdfPages.map((page) => {
    const size = page.getSize();
    return { width: size.width, height: size.height };
  });
  const pageCount = pages.length;
  const pageOk = pageCount > 0 && pageCount <= PDF_MAX_PAGES;
  let fillable = false;
  try {
    fillable = doc.getForm().getFields().length > 0;
  } catch {
    fillable = false;
  }

  let reason: string | null = null;
  if (pageCount === 0) reason = PDF_NO_PAGES;
  else if (pageCount > PDF_MAX_PAGES) reason = PDF_TOO_MANY_PAGES;

  return {
    rows: [
      sizeRow,
      {
        id: 'page-cap',
        label: 'Page cap',
        state: pageOk ? 'pass' : 'fail',
        detail: pageCount === 0 ? 'No pages' : pageOk ? `${pageCount} pages` : 'Too many pages',
      },
      { id: 'parses', label: 'Parses', state: 'pass', detail: 'Readable' },
      {
        id: 'fillable',
        label: 'Fillable vs flat',
        state: 'pass',
        detail: fillable ? 'Fillable' : 'Flat',
      },
    ],
    reason,
    pageCount,
    pages,
    fillable,
    bytes,
  };
}

export async function buildPlaceholderPdf(): Promise<File> {
  const doc = await PDFDocument.create();
  const first = doc.addPage([595, 842]);
  doc.addPage([595, 842]);
  const form = doc.getForm();
  form.createTextField('placeholder_name').addToPage(first, { x: 48, y: 760, width: 200, height: 20 });
  const bytes = await doc.save();
  return new File([fileBytes(bytes)], 'placeholder-two-page.pdf', { type: 'application/pdf' });
}

function fileBytes(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer as ArrayBuffer;
}
