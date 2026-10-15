import { useState } from 'react';
import type { FormVersion } from '../../../shared/forms/types';
import { BTN_LG, BTN_MD, BTN_OUTLINE, BTN_PRIMARY } from '../ui/buttons';
import { ADMIN_BANKS, ADMIN_JOURNEYS } from './banks';
import type { PageSize } from './geometry';
import { ingestForm, type IngestFormInput } from './ingestClient';
import { mockIngestRequested } from './mockQuery';
import {
  PDF_NOT_READABLE,
  buildPlaceholderPdf,
  inspectPdf,
  type PdfInspection,
} from './pdfChecks';

const selectClass = 'h-10 w-full min-w-0 border-2 border-foreground bg-background px-3 text-sm font-normal';

export function UploadPage({
  mock = mockIngestRequested(),
  inspect = inspectPdf,
  ingest = ingestForm,
  onReady,
}: {
  mock?: boolean;
  inspect?: (file: File) => Promise<PdfInspection>;
  ingest?: (input: IngestFormInput) => Promise<FormVersion>;
  onReady: (form: FormVersion, pages: PageSize[], bytes: Uint8Array) => void;
}) {
  const [bankId, setBankId] = useState<string>(ADMIN_BANKS[0]);
  const [journey, setJourney] = useState<string>(ADMIN_JOURNEYS[0].id);
  const [file, setFile] = useState<File | null>(null);
  const [inspection, setInspection] = useState<PdfInspection | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  async function takeFile(next: File | null) {
    setReason('');
    setFile(next);
    if (!next) {
      setInspection(null);
      return;
    }
    try {
      const result = await inspect(next);
      setInspection(result);
      setReason(result.reason ?? '');
    } catch {
      setInspection(null);
      setReason(PDF_NOT_READABLE);
    }
  }

  async function usePlaceholder() {
    await takeFile(await buildPlaceholderPdf());
  }

  async function continueIngest() {
    if (!file || !inspection || inspection.reason || busy) return;
    setBusy(true);
    setReason('');
    try {
      const form = await ingest({
        file,
        bytes: inspection.bytes,
        bankId,
        journey,
        fillable: inspection.fillable,
      });
      onReady(form, inspection.pages, inspection.bytes);
    } catch (error) {
      setReason(error instanceof Error ? error.message : 'Ingest is not available yet.');
    } finally {
      setBusy(false);
    }
  }

  const blocked = !inspection || !!inspection.reason || busy;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">Admin</p>
      <h1 className="mt-2 font-display text-4xl leading-none sm:text-5xl">Upload a form</h1>
      <p className="mt-3 max-w-xl text-sm text-muted-foreground">
        Drop a bank PDF. A bad file stops here, with one plain reason.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-semibold">
          Bank
          <select className={selectClass} value={bankId} onChange={(event) => setBankId(event.target.value)}>
            {ADMIN_BANKS.map((bank) => (
              <option key={bank} value={bank}>
                {bank}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Journey
          <select className={selectClass} value={journey} onChange={(event) => setJourney(event.target.value)}>
            {ADMIN_JOURNEYS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label
        className={`mt-4 flex min-h-40 cursor-pointer flex-col items-center justify-center border-2 border-dashed px-4 py-8 text-center ${
          dragOver ? 'border-primary bg-primary/10' : 'border-foreground bg-card'
        }`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          const dropped = event.dataTransfer.files[0] ?? null;
          void takeFile(dropped);
        }}
      >
        <input
          aria-label="PDF file"
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          onChange={(event) => {
            const chosen = event.target.files?.[0] ?? null;
            void takeFile(chosen);
          }}
        />
        <span className="font-semibold">{file ? file.name : 'Drop a PDF here'}</span>
        <span className="mt-1 text-sm text-muted-foreground">or choose a file</span>
      </label>

      {mock ? (
        <button type="button" className={`${BTN_OUTLINE} ${BTN_MD} mt-3`} onClick={() => void usePlaceholder()}>
          Use a 2-page placeholder PDF
        </button>
      ) : null}

      {inspection ? (
        <ul aria-label="PDF checks" className="mt-4 grid gap-px border-2 border-foreground bg-foreground">
          {inspection.rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 bg-background px-3 py-2 text-sm">
              <span>{row.label}</span>
              <span className={row.state === 'pass' ? 'font-semibold text-primary' : 'font-semibold text-destructive'}>
                {checkText(row)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {reason ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {reason}
        </p>
      ) : null}

      <button type="button" className={`${BTN_PRIMARY} ${BTN_LG} mt-6`} disabled={blocked} onClick={() => void continueIngest()}>
        {busy ? 'Reading…' : 'Continue'}
      </button>
    </div>
  );
}

function checkText(row: { id: string; state: 'pass' | 'fail'; detail: string }): string {
  if (row.id === 'fillable' && row.state === 'pass') return row.detail;
  if (row.state === 'pass') return row.detail ? `Pass · ${row.detail}` : 'Pass';
  return row.detail ? `Fail · ${row.detail}` : 'Fail';
}
