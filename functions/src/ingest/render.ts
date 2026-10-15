import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';

export type RenderedPage = {
  page: number;
  png: Buffer;
  width: number;
  height: number;
};

const nodeRequire = createRequire(__filename);

function standardFontDataUrl(): string {
  const pkg = nodeRequire.resolve('pdfjs-dist/package.json');
  const dir = path.join(path.dirname(pkg), 'standard_fonts') + path.sep;
  return pathToFileURL(dir).href;
}

type PdfjsPage = {
  getViewport: (params: { scale: number }) => { width: number; height: number };
  render: (params: { canvasContext: unknown; viewport: unknown }) => { promise: Promise<void> };
};

type PdfjsDoc = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfjsPage>;
  destroy?: () => Promise<void> | void;
};

type PdfjsModule = {
  getDocument: (src: unknown) => { promise: Promise<PdfjsDoc> };
};

let pdfjsPromise: Promise<PdfjsModule> | undefined;

function loadPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs') as unknown as Promise<PdfjsModule>;
  }
  return pdfjsPromise;
}

/** Longest side cap so a 4-page ingest stays inside a small function instance. */
const MAX_EDGE = 1600;
const BASE_SCALE = 1.5;

/**
 * Rasterise each page to PNG. One page at a time; the caller may discard
 * pixel buffers after the Gemini call for that page.
 */
export async function renderPdfPages(bytes: Uint8Array): Promise<RenderedPage[]> {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(bytes.byteLength);
  data.set(bytes);
  const doc = await pdfjs.getDocument({
    data,
    disableWorker: true,
    isEvalSupported: false,
    standardFontDataUrl: standardFontDataUrl(),
    verbosity: 0,
  }).promise;
  const pages: RenderedPage[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      const longest = Math.max(base.width, base.height);
      const scale = longest * BASE_SCALE > MAX_EDGE ? MAX_EDGE / longest : BASE_SCALE;
      const viewport = page.getViewport({ scale });
      const width = Math.max(1, Math.ceil(viewport.width));
      const height = Math.max(1, Math.ceil(viewport.height));
      const canvas = createCanvas(width, height);
      const context = canvas.getContext('2d');
      await page.render({ canvasContext: context, viewport }).promise;
      pages.push({
        page: pageNumber,
        png: canvas.toBuffer('image/png'),
        width,
        height,
      });
    }
  } finally {
    await doc.destroy?.();
  }
  return pages;
}
