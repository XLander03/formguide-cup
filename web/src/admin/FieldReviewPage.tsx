import { useEffect, useState } from 'react';
import type { FormVersion } from '../../../shared/forms/types';
import { BTN_LG, BTN_MD, BTN_OUTLINE, BTN_PRIMARY } from '../ui/buttons';
import { loadAdminForm, loadAdminFormPdf } from './consoleClient';
import { statusLabel } from './consoleFormat';
import { pdfBytesFor, readAdminDraft, type AdminDraft } from './draftStore';
import { FieldReview } from './FieldReview';
import type { PageSize } from './geometry';
import { inspectPdf, type PdfInspection } from './pdfChecks';
import { PLACEHOLDER_FORM_ID } from './placeholderForm';
import { publishForm } from './publishClient';
import { renderPdfPageImages } from './renderPdfPages';

export interface ReviewLoaders {
  loadForm: (formId: string, version?: string) => Promise<FormVersion>;
  loadPdf: (formId: string, version?: string) => Promise<Blob>;
  inspect: (file: File) => Promise<PdfInspection>;
  render: (bytes: Uint8Array) => Promise<string[]>;
  publish: (form: FormVersion) => Promise<void>;
}

const defaultLoaders: ReviewLoaders = {
  loadForm: loadAdminForm,
  loadPdf: loadAdminFormPdf,
  inspect: inspectPdf,
  render: renderPdfPageImages,
  publish: publishForm,
};

type Loaded =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'ready'; draft: AdminDraft; bytes: Uint8Array | null };

/** The draft this tab ingested, when it matches the route. */
function sessionDraft(formId: string, version?: string): Loaded | null {
  const draft = readAdminDraft(formId);
  if (!draft || (version && draft.form.version !== version)) return null;
  return { state: 'ready', draft, bytes: pdfBytesFor(formId) };
}

async function serverDraft(formId: string, version: string | undefined, loaders: ReviewLoaders): Promise<Loaded> {
  const [form, blob] = await Promise.all([loaders.loadForm(formId, version), loaders.loadPdf(formId, version)]);
  const file = new File([blob], `${form.formId}.pdf`, { type: 'application/pdf' });
  const inspection = await loaders.inspect(file);
  const pages: PageSize[] = inspection.pages;
  if (pages.length === 0) throw new Error(inspection.reason ?? 'The source PDF could not be read.');
  return { state: 'ready', draft: { form, pages }, bytes: inspection.bytes };
}

export function FieldReviewPage({
  formId,
  version,
  onConsole,
  onPublished,
  loaders: overrides,
}: {
  formId: string;
  version?: string;
  onConsole: () => void;
  onPublished?: (form: FormVersion) => void;
  loaders?: Partial<ReviewLoaders>;
}) {
  const loaders = { ...defaultLoaders, ...overrides };
  const [loaded, setLoaded] = useState<Loaded>(() => sessionDraft(formId, version) ?? { state: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [pageImages, setPageImages] = useState<string[] | undefined>(undefined);

  // Session draft first (fast path after upload); otherwise read the stored version and its PDF.
  useEffect(() => {
    const local = sessionDraft(formId, version);
    if (local) {
      setLoaded(local);
      return;
    }
    let cancelled = false;
    setLoaded({ state: 'loading' });
    serverDraft(formId, version, loaders)
      .then((next) => {
        if (!cancelled) setLoaded(next);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoaded({ state: 'error', message: error instanceof Error ? error.message : 'Could not load this form.' });
        }
      });
    return () => {
      cancelled = true;
    };
    // loaders are fixed for a page's life, so they are not dependencies.
  }, [formId, version, attempt]);

  const bytes = loaded.state === 'ready' ? loaded.bytes : null;
  useEffect(() => {
    setPageImages(undefined);
    if (!bytes || formId === PLACEHOLDER_FORM_ID) return;
    let cancelled = false;
    void loaders
      .render(bytes)
      .then((images) => {
        if (!cancelled && images.length > 0) setPageImages(images);
      })
      .catch(() => {
        // The paper page image stays in place when the PDF cannot be painted.
      });
    return () => {
      cancelled = true;
    };
    // loaders are fixed for a page's life, so they are not dependencies.
  }, [bytes, formId]);

  if (loaded.state === 'loading') {
    return (
      <p role="status" className="mx-auto w-full max-w-xl px-4 py-10 text-sm text-muted-foreground">
        Loading the form and its source PDF…
      </p>
    );
  }

  if (loaded.state === 'error') {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-10">
        <h1 className="font-display text-4xl">This form could not be opened.</h1>
        <p role="alert" className="mt-3 text-sm text-destructive">
          {loaded.message}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" className={`${BTN_PRIMARY} ${BTN_LG}`} onClick={onConsole}>
            Back to console
          </button>
          <button type="button" className={`${BTN_OUTLINE} ${BTN_LG}`} onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  const { form, pages } = loaded.draft;

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b-2 border-foreground px-4 py-2 text-sm sm:px-6">
        <button type="button" className={`${BTN_OUTLINE} ${BTN_MD}`} onClick={onConsole}>
          Back to console
        </button>
        <span className="text-muted-foreground">
          {form.formId} · {form.version}
        </span>
        {form.status !== 'draft' ? (
          <span role="note" className="w-full text-muted-foreground sm:w-auto">
            {statusLabel(form.status)} —{' '}
            {form.status === 'retired'
              ? 'retired forms cannot be published again.'
              : 'publishing again replaces the live fields.'}
          </span>
        ) : null}
      </div>
      <FieldReview
        key={`${form.formId}@${form.version}`}
        form={form}
        pages={pages}
        pageImages={pageImages}
        publish={loaders.publish}
        onPublished={onPublished}
      />
    </>
  );
}
