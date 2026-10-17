import { useCallback, useEffect, useRef, useState } from 'react';
import type { AdminFormRow, AdminFormsResponse, AdminStats } from '../../../shared/forms/admin';
import { BTN_LG, BTN_MD, BTN_OUTLINE, BTN_PRIMARY } from '../ui/buttons';
import { ArrowRightIcon, RotateIcon } from '../ui/icons';
import { consoleApi, type ConsoleApi } from './consoleClient';
import { journeyLabel, publishBlockedReason, relativeTime, sourceLabel, statusLabel } from './consoleFormat';
import { useMinWidth } from './useMinWidth';

const BTN_SM = 'h-8 px-3 text-xs';

type Load =
  | { state: 'loading'; data: AdminFormsResponse | null }
  | { state: 'ready'; data: AdminFormsResponse }
  | { state: 'error'; data: AdminFormsResponse | null; message: string };

type Confirm = { kind: 'unpublish' | 'retire'; row: AdminFormRow };

function rowKey(row: AdminFormRow): string {
  return `${row.formId}@${row.version}`;
}

function rowName(row: AdminFormRow): string {
  return `${row.bankId || 'Bank'} · ${journeyLabel(row.journey)}`;
}

export function ConsolePage({
  api = consoleApi,
  onReview,
  onUpload,
  initialNotice,
  now,
}: {
  api?: ConsoleApi;
  onReview: (row: AdminFormRow) => void;
  onUpload: () => void;
  /** A message carried over from another screen, e.g. after publishing from review. */
  initialNotice?: string;
  /** Fixed clock for tests. */
  now?: number;
}) {
  const wide = useMinWidth(1024);
  const [load, setLoad] = useState<Load>({ state: 'loading', data: null });
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(
    initialNotice ? { tone: 'ok', text: initialNotice } : null,
  );
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const loadSeq = useRef(0);

  const reload = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoad((current) => ({ state: 'loading', data: current.data }));
    try {
      const data = await api.loadForms();
      if (seq === loadSeq.current) setLoad({ state: 'ready', data });
    } catch (error) {
      if (seq !== loadSeq.current) return;
      const message = error instanceof Error ? error.message : 'Could not load forms.';
      setLoad((current) => ({ state: 'error', data: current.data, message }));
    }
  }, [api]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function run(row: AdminFormRow, action: () => Promise<void>, done: string, refresh = true) {
    setBusyKey(rowKey(row));
    setNotice(null);
    try {
      await action();
      if (done) setNotice({ tone: 'ok', text: done });
      if (refresh) await reload();
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'That did not work. Try again.' });
    } finally {
      setBusyKey(null);
    }
  }

  function publish(row: AdminFormRow) {
    void run(row, () => api.publish(row), `Published ${rowName(row)}. It now shows in the journey picker.`);
  }

  function openPdf(row: AdminFormRow) {
    void run(row, () => api.openPdf(row), '', false);
  }

  async function confirmAction() {
    if (!confirm) return;
    const { kind, row } = confirm;
    setConfirm(null);
    await run(
      row,
      () => api.setStatus({ formId: row.formId, version: row.version, status: kind === 'retire' ? 'retired' : 'draft' }),
      kind === 'retire' ? `Retired ${rowName(row)}.` : `Unpublished ${rowName(row)}. It is a draft again.`,
    );
  }

  const data = load.data;
  const forms = data?.forms ?? [];
  const loading = load.state === 'loading';

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">Admin</p>
          <h1 className="mt-2 font-display text-4xl leading-none sm:text-5xl">Forms</h1>
          <p className="mt-3 max-w-xl text-sm text-muted-foreground">
            Every bank form, newest version first. Review drafts, publish them, or take them off the customer list.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`${BTN_OUTLINE} ${BTN_MD}`}
            disabled={loading}
            onClick={() => void reload()}
          >
            <RotateIcon />
            {loading && data ? 'Refreshing…' : 'Refresh'}
          </button>
          <button type="button" className={`${BTN_PRIMARY} ${BTN_MD}`} onClick={onUpload}>
            Upload a form
          </button>
        </div>
      </div>

      <StatTiles stats={data?.stats ?? null} />

      {notice ? (
        <p
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={`mt-6 border-2 px-4 py-3 text-sm ${
            notice.tone === 'error' ? 'border-destructive text-destructive' : 'border-primary text-foreground'
          }`}
        >
          {notice.text}
        </p>
      ) : null}

      {load.state === 'error' ? (
        <div role="alert" className="mt-6 flex flex-wrap items-center justify-between gap-3 border-2 border-destructive px-4 py-3">
          <p className="text-sm text-destructive">Could not load forms. {load.message}</p>
          <button type="button" className={`${BTN_OUTLINE} ${BTN_MD}`} onClick={() => void reload()}>
            Try again
          </button>
        </div>
      ) : null}

      <section aria-labelledby="forms-title" className="mt-8">
        <h2 id="forms-title" className="font-display text-2xl">
          All forms
        </h2>

        {!data && loading ? (
          <p role="status" className="mt-4 border-2 border-foreground bg-card px-4 py-8 text-center text-sm text-muted-foreground">
            Loading forms…
          </p>
        ) : null}

        {data && forms.length === 0 ? (
          <div className="mt-4 border-2 border-dashed border-foreground bg-card px-4 py-10 text-center">
            <p className="font-display text-3xl">No forms yet.</p>
            <p className="mt-2 text-sm text-muted-foreground">Upload a bank PDF to make the first draft.</p>
            <button type="button" className={`${BTN_PRIMARY} ${BTN_LG} mt-5`} onClick={onUpload}>
              Upload a form
            </button>
          </div>
        ) : null}

        {forms.length > 0 ? (
          wide ? (
            <FormsTable
              forms={forms}
              now={now}
              busyKey={busyKey}
              actions={{ onReview, publish, openPdf, ask: setConfirm }}
            />
          ) : (
            <FormCards
              forms={forms}
              now={now}
              busyKey={busyKey}
              actions={{ onReview, publish, openPdf, ask: setConfirm }}
            />
          )
        ) : null}
      </section>

      {confirm ? (
        <ConfirmDialog confirm={confirm} onCancel={() => setConfirm(null)} onConfirm={() => void confirmAction()} />
      ) : null}
    </div>
  );
}

function StatTiles({ stats }: { stats: AdminStats | null }) {
  const tiles: { label: string; value: number | null | undefined }[] = [
    { label: 'Published forms', value: stats?.publishedForms },
    { label: 'Drafts awaiting review', value: stats?.draftForms },
    { label: 'Fields awaiting review', value: stats?.fieldsAwaitingReview },
    { label: 'Voice requests (24h)', value: stats?.voiceRequests24h },
  ];
  return (
    <dl className="mt-6 grid grid-cols-2 gap-px border-2 border-foreground bg-foreground lg:grid-cols-4">
      {tiles.map((tile) => (
        <div key={tile.label} className="flex flex-col-reverse justify-end gap-1 bg-card px-4 py-4">
          <dt className="text-xs font-semibold text-muted-foreground">{tile.label}</dt>
          <dd className="font-display text-4xl leading-none tabular-nums">
            {typeof tile.value === 'number' ? tile.value.toLocaleString() : '—'}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function StatusBadge({ status }: { status: AdminFormRow['status'] }) {
  const tone =
    status === 'published'
      ? 'border-primary bg-primary text-primary-foreground'
      : status === 'retired'
        ? 'border-muted-foreground text-muted-foreground line-through decoration-1'
        : 'border-foreground bg-background text-foreground';
  return (
    <span className={`inline-flex items-center border-2 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${tone}`}>
      {statusLabel(status)}
    </span>
  );
}

interface RowActionHandlers {
  onReview: (row: AdminFormRow) => void;
  publish: (row: AdminFormRow) => void;
  openPdf: (row: AdminFormRow) => void;
  ask: (confirm: Confirm) => void;
}

interface ListProps {
  forms: AdminFormRow[];
  now?: number;
  busyKey: string | null;
  actions: RowActionHandlers;
}

function NeedsReview({ row }: { row: AdminFormRow }) {
  if (row.status !== 'draft') return <span className="text-muted-foreground">—</span>;
  if (row.needsReview === 0) return <span className="font-semibold text-primary">0</span>;
  return <span className="font-semibold text-destructive">{row.needsReview}</span>;
}

function FormsTable({ forms, now, busyKey, actions }: ListProps) {
  return (
    <div className="mt-4 overflow-x-auto border-2 border-foreground">
      <table aria-label="Forms" className="w-full text-left text-sm">
        <thead className="border-b-2 border-foreground bg-card text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 font-semibold">Bank</th>
            <th scope="col" className="px-3 py-2 font-semibold">Journey</th>
            <th scope="col" className="px-3 py-2 font-semibold">Status</th>
            <th scope="col" className="px-3 py-2 font-semibold">Source</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">Fields</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">Shared</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">Needs review</th>
            <th scope="col" className="px-3 py-2 font-semibold">Updated</th>
            <th scope="col" className="px-3 py-2 font-semibold">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {forms.map((row) => (
            <tr key={rowKey(row)} className="border-b-2 border-foreground/15 align-top last:border-b-0">
              <th scope="row" className="px-3 py-3 font-semibold">
                {row.bankId || '—'}
                <span className="block text-[11px] font-normal text-muted-foreground">
                  {row.formId} · {row.version}
                </span>
              </th>
              <td className="px-3 py-3">{journeyLabel(row.journey)}</td>
              <td className="px-3 py-3">
                <StatusBadge status={row.status} />
              </td>
              <td className="px-3 py-3">{sourceLabel(row.source)}</td>
              <td className="px-3 py-3 text-right tabular-nums">{row.fieldCount}</td>
              <td className="px-3 py-3 text-right tabular-nums">{row.sharedCount}</td>
              <td className="px-3 py-3 text-right tabular-nums">
                <NeedsReview row={row} />
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">{relativeTime(row.updatedAt, now)}</td>
              <td className="px-3 py-3">
                <RowActions row={row} busy={busyKey !== null} working={busyKey === rowKey(row)} actions={actions} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FormCards({ forms, now, busyKey, actions }: ListProps) {
  return (
    <ul aria-label="Forms" className="mt-4 grid gap-3">
      {forms.map((row) => (
        <li key={rowKey(row)} className="border-2 border-foreground bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-display text-2xl leading-tight">{row.bankId || '—'}</p>
              <p className="text-sm">{journeyLabel(row.journey)}</p>
            </div>
            <StatusBadge status={row.status} />
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Source</dt>
            <dd>{sourceLabel(row.source)}</dd>
            <dt className="text-muted-foreground">Fields</dt>
            <dd className="tabular-nums">
              {row.fieldCount} · {row.sharedCount} shared
            </dd>
            <dt className="text-muted-foreground">Needs review</dt>
            <dd className="tabular-nums">
              <NeedsReview row={row} />
            </dd>
            <dt className="text-muted-foreground">Updated</dt>
            <dd>{relativeTime(row.updatedAt, now)}</dd>
          </dl>
          <div className="mt-4">
            <RowActions row={row} busy={busyKey !== null} working={busyKey === rowKey(row)} actions={actions} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function RowActions({
  row,
  busy,
  working,
  actions,
}: {
  row: AdminFormRow;
  busy: boolean;
  working: boolean;
  actions: RowActionHandlers;
}) {
  const name = rowName(row);
  const blockedReason = publishBlockedReason(row);
  const reasonId = `publish-reason-${row.formId}-${row.version}`.replace(/[^\w-]/g, '_');

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-2">
        {row.status === 'draft' ? (
          <>
            <button
              type="button"
              aria-label={`Review ${name}`}
              className={`${BTN_OUTLINE} ${BTN_SM}`}
              disabled={busy}
              onClick={() => actions.onReview(row)}
            >
              Review
            </button>
            <button
              type="button"
              aria-label={`Publish ${name}`}
              aria-describedby={blockedReason ? reasonId : undefined}
              title={blockedReason ?? undefined}
              className={`${BTN_PRIMARY} ${BTN_SM}`}
              disabled={busy || blockedReason !== null}
              onClick={() => actions.publish(row)}
            >
              Publish
            </button>
          </>
        ) : null}
        {row.status === 'published' ? (
          <button
            type="button"
            aria-label={`Unpublish ${name}`}
            className={`${BTN_OUTLINE} ${BTN_SM}`}
            disabled={busy}
            onClick={() => actions.ask({ kind: 'unpublish', row })}
          >
            Unpublish
          </button>
        ) : null}
        {row.status !== 'retired' ? (
          <button
            type="button"
            aria-label={`Retire ${name}`}
            className={`${BTN_OUTLINE} ${BTN_SM} hover:border-destructive hover:bg-destructive`}
            disabled={busy}
            onClick={() => actions.ask({ kind: 'retire', row })}
          >
            Retire
          </button>
        ) : null}
        <button
          type="button"
          aria-label={`Source PDF for ${name}`}
          className={`${BTN_OUTLINE} ${BTN_SM}`}
          disabled={busy}
          onClick={() => actions.openPdf(row)}
        >
          Source PDF
        </button>
        {row.status === 'published' ? (
          <a
            href="/journey"
            target="_blank"
            rel="noopener"
            aria-label={`Open ${name} in the app`}
            className={`${BTN_OUTLINE} ${BTN_SM}`}
          >
            Open in app
            <ArrowRightIcon />
          </a>
        ) : null}
      </div>
      {blockedReason ? (
        <p id={reasonId} className="text-xs text-muted-foreground">
          {blockedReason}
        </p>
      ) : null}
      {working ? (
        <p role="status" className="text-xs text-muted-foreground">
          Working…
        </p>
      ) : null}
    </div>
  );
}

function ConfirmDialog({
  confirm,
  onCancel,
  onConfirm,
}: {
  confirm: Confirm;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const name = rowName(confirm.row);
  const retire = confirm.kind === 'retire';
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-foreground/40 px-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="console-confirm-title"
        aria-describedby="console-confirm-body"
        className="w-full max-w-md border-2 border-foreground bg-card p-5"
      >
        <h2 id="console-confirm-title" className="font-display text-3xl">
          {retire ? 'Retire this form?' : 'Unpublish this form?'}
        </h2>
        <p className="mt-1 text-sm font-semibold">{name}</p>
        <p id="console-confirm-body" className="mt-2 text-sm text-muted-foreground">
          {retire
            ? 'A retired form leaves the customer list and can never be published again. Upload the PDF again to start over. This cannot be undone.'
            : 'It leaves the customer journey list right away and goes back to draft. You can review and publish it again later.'}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button ref={cancelRef} type="button" className={`${BTN_OUTLINE} ${BTN_MD}`} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={
              retire
                ? `${BTN_PRIMARY} ${BTN_MD} border-destructive bg-destructive hover:border-foreground`
                : `${BTN_PRIMARY} ${BTN_MD}`
            }
            onClick={onConfirm}
          >
            {retire ? 'Retire form' : 'Unpublish'}
          </button>
        </div>
      </div>
    </div>
  );
}
