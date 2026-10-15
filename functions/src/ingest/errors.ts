export const MAX_PDF_BYTES = 10 * 1024 * 1024;
export const MAX_PDF_PAGES = 4;
/** Fields below this must have checked=true before publish. */
export const PUBLISH_CONFIDENCE = 0.8;
/** Minimum label/name similarity that may claim a shared library id. */
export const MATCH_MIN = 0.66;

export class IngestError extends Error {
  constructor(
    readonly code: string,
    readonly httpStatus: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(code);
    this.name = 'IngestError';
  }
}
