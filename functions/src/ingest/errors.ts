export { MAX_PDF_BYTES, MAX_PDF_PAGES } from '../../../shared/forms/limits';
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
