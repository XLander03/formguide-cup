import { useEffect, useState } from 'react';
import { BTN_LG, BTN_PRIMARY } from '../ui/buttons';
import { pdfBytesFor, readAdminDraft } from './draftStore';
import { FieldReview } from './FieldReview';
import { publishForm } from './publishClient';
import { renderPdfPageImages } from './renderPdfPages';

export function FieldReviewPage({ formId, onUpload }: { formId: string; onUpload: () => void }) {
  const draft = readAdminDraft(formId);
  const [pageImages, setPageImages] = useState<string[] | undefined>(undefined);

  useEffect(() => {
    const bytes = pdfBytesFor(formId);
    if (!bytes || formId === 'local-placeholder') return;
    let cancelled = false;
    void renderPdfPageImages(bytes)
      .then((images) => {
        if (!cancelled && images.length > 0) setPageImages(images);
      })
      .catch(() => {
        // The paper page image stays in place when the PDF cannot be painted.
      });
    return () => {
      cancelled = true;
    };
  }, [formId]);

  if (!draft) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-10">
        <h1 className="font-display text-4xl">This draft is not on this device.</h1>
        <button type="button" className={`${BTN_PRIMARY} ${BTN_LG} mt-6`} onClick={onUpload}>
          Back to upload
        </button>
      </div>
    );
  }

  return <FieldReview form={draft.form} pages={draft.pages} pageImages={pageImages} publish={publishForm} />;
}
