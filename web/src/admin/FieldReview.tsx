import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { FieldRecord, FormVersion } from '../../../shared/forms/types';
import { BTN_LG, BTN_MD, BTN_OUTLINE, BTN_PRIMARY } from '../ui/buttons';
import { boxStyle, moveBox, resizeBox, type PageSize } from './geometry';
import { paperPageDataUrl } from './paperImage';
import { CONFIDENCE_CHECK_BELOW, publishBlocked } from './reviewRules';
import { useMinWidth } from './useMinWidth';

const FIELD_TYPES: FieldRecord['type'][] = [
  'text',
  'date',
  'number',
  'phone',
  'email',
  'pin',
  'checkbox',
  'choice',
  'partial',
];

const inputClass = 'h-10 w-full min-w-0 border-2 border-foreground bg-background px-2 text-sm';

interface Row {
  key: number;
  field: FieldRecord;
}

type Drag =
  | {
      key: number;
      mode: 'move';
      page: number;
      offsetX: number;
      offsetY: number;
    }
  | {
      key: number;
      mode: 'resize';
      page: number;
      left: number;
      top: number;
    };

export function FieldReview({
  form,
  pages,
  pageImages,
  publish,
}: {
  form: FormVersion;
  pages: PageSize[];
  pageImages?: string[];
  publish: (form: FormVersion) => Promise<void>;
}) {
  const wide = useMinWidth(1280);
  const [rows, setRows] = useState<Row[]>(() => form.fields.map((field, key) => ({ key, field })));
  const [selectedKey, setSelectedKey] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [published, setPublished] = useState(false);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const dragRef = useRef<Drag | null>(null);
  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  const images =
    pageImages ??
    pages.map((page, index) => paperPageDataUrl(index + 1, page));

  const ordered = [...rows].sort(
    (a, b) => a.field.confidence - b.field.confidence || a.field.order - b.field.order || a.key - b.key,
  );
  const blocked = publishBlocked(rows.map((row) => row.field));

  useEffect(() => {
    function onMove(event: PointerEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      const node = pageRefs.current[drag.page];
      if (!node) return;
      const rect = node.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const page = pagesRef.current[drag.page - 1] ?? pagesRef.current[0];
      if (!page) return;
      const point = {
        x: ((event.clientX - rect.left) / rect.width) * page.width,
        y: (1 - (event.clientY - rect.top) / rect.height) * page.height,
      };
      setRows((current) =>
        current.map((row) => {
          if (row.key !== drag.key) return row;
          const box =
            drag.mode === 'move'
              ? moveBox(row.field.box, point, drag.offsetX, drag.offsetY, page)
              : resizeBox(drag.left, drag.top, point, page);
          return { ...row, field: { ...row.field, box } };
        }),
      );
    }
    function onUp() {
      dragRef.current = null;
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, []);

  useEffect(() => {
    if (selectedKey === null) return;
    const node = document.querySelector(`[data-field-key="${selectedKey}"]`);
    node?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [selectedKey]);

  function update(key: number, patch: Partial<FieldRecord>) {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, field: { ...row.field, ...patch } } : row)),
    );
  }

  function pageFor(pageNumber: number): PageSize {
    return pages[pageNumber - 1] ?? pages[0] ?? { width: 595, height: 842 };
  }

  function pointerPdf(event: ReactPointerEvent, pageNumber: number) {
    const node = pageRefs.current[pageNumber];
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const page = pageFor(pageNumber);
    const x = ((event.clientX - rect.left) / rect.width) * page.width;
    const y = (1 - (event.clientY - rect.top) / rect.height) * page.height;
    return { x, y, page };
  }

  function startMove(event: ReactPointerEvent, row: Row) {
    setSelectedKey(row.key);
    const point = pointerPdf(event, row.field.page);
    if (!point) return;
    dragRef.current = {
      key: row.key,
      mode: 'move',
      page: row.field.page,
      offsetX: point.x - row.field.box.x,
      offsetY: point.y - row.field.box.y,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function startResize(event: ReactPointerEvent, row: Row) {
    event.stopPropagation();
    setSelectedKey(row.key);
    const point = pointerPdf(event, row.field.page);
    if (!point) return;
    dragRef.current = {
      key: row.key,
      mode: 'resize',
      page: row.field.page,
      left: row.field.box.x,
      top: row.field.box.y + row.field.box.h,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  async function confirmPublish() {
    setBusy(true);
    setMessage('');
    try {
      const next: FormVersion = {
        ...form,
        fields: [...rows].sort((a, b) => a.key - b.key).map((row) => row.field),
      };
      await publish(next);
      setPublished(true);
      setConfirming(false);
      setMessage('Published.');
    } catch (error) {
      setConfirming(false);
      setMessage(error instanceof Error ? error.message : 'Publish is not available yet.');
    } finally {
      setBusy(false);
    }
  }

  const pageNumbers = pages.map((_, index) => index + 1);

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col">
      <div className="grid grid-cols-1 xl:grid-cols-2">
        <section
          aria-label="Form pages"
          className="border-b-2 border-foreground px-4 py-6 xl:border-b-0 xl:border-r-2"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">Pages</p>
          <h1 className="mt-2 font-display text-3xl leading-none sm:text-4xl">
            {form.bankId} · {journeyTitle(form.journey)}
          </h1>
          <p className="mt-2 text-xs text-muted-foreground">Drag and resize. Boxes snap inside the page.</p>
          <div className="mt-4 grid gap-4">
            {pageNumbers.map((pageNumber) => {
              const page = pageFor(pageNumber);
              const onPage = rows.filter((row) => row.field.page === pageNumber);
              return (
                <div
                  key={pageNumber}
                  ref={(node) => {
                    pageRefs.current[pageNumber] = node;
                  }}
                  className="relative border-2 border-foreground bg-card"
                  style={{ aspectRatio: `${page.width} / ${page.height}` }}
                >
                  <img
                    src={images[pageNumber - 1] ?? paperPageDataUrl(pageNumber, page)}
                    alt={`Page ${pageNumber}`}
                    className="pointer-events-none absolute inset-0 h-full w-full"
                  />
                  {onPage.map((row) => {
                    const selected = row.key === selectedKey;
                    return (
                      <div
                        key={row.key}
                        data-field-key={row.key}
                        className="absolute"
                        style={boxStyle(row.field.box, page)}
                      >
                        <button
                          type="button"
                          aria-label={`${row.field.label} field`}
                          aria-pressed={selected}
                          className={`absolute inset-0 border-2 ${
                            selected ? 'z-10 border-primary bg-primary/25' : 'border-foreground/50 bg-saffron/25'
                          }`}
                          onClick={() => setSelectedKey(row.key)}
                          onPointerDown={(event) => startMove(event, row)}
                        />
                        <button
                          type="button"
                          aria-label={`Resize ${row.field.label}`}
                          className="absolute -bottom-1 -right-1 z-20 size-4 bg-foreground"
                          onPointerDown={(event) => startResize(event, row)}
                        />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </section>

        <section aria-label="Fields" className="px-4 py-6">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">Lowest confidence first</p>
          <h2 className="mt-2 font-display text-3xl leading-none">Fields</h2>
          {wide ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-2 border-foreground text-left text-sm">
                <thead className="bg-muted text-[10px] uppercase tracking-wide">
                  <tr>
                    <th className="px-2 py-2">Label</th>
                    <th className="px-2 py-2">Type</th>
                    <th className="px-2 py-2">Shared id</th>
                    <th className="px-2 py-2">Required</th>
                    <th className="px-2 py-2">PII</th>
                    <th className="px-2 py-2">Confidence</th>
                    <th className="px-2 py-2">Checked</th>
                  </tr>
                </thead>
                <tbody>
                  {ordered.map((row) => (
                    <tr
                      key={row.key}
                      aria-selected={row.key === selectedKey}
                      className={row.key === selectedKey ? 'bg-primary/10' : 'bg-background'}
                      onClick={() => setSelectedKey(row.key)}
                    >
                      <FieldCells row={row} update={update} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <ul aria-label="Fields" className="mt-4 grid gap-3">
              {ordered.map((row) => (
                <li
                  key={row.key}
                  aria-selected={row.key === selectedKey}
                  className={`grid gap-2 border-2 p-3 ${row.key === selectedKey ? 'border-primary bg-primary/10' : 'border-foreground bg-background'}`}
                  onClick={() => setSelectedKey(row.key)}
                >
                  <FieldCells row={row} update={update} stacked />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="sticky bottom-0 mt-auto border-t-2 border-foreground bg-background px-4 py-4 sm:px-6">
        <button
          type="button"
          className={`${BTN_PRIMARY} ${BTN_LG}`}
          disabled={blocked || busy || published}
          onClick={() => setConfirming(true)}
        >
          Publish
        </button>
        {blocked ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Check every field under {Math.round(CONFIDENCE_CHECK_BELOW * 100)}% confidence.
          </p>
        ) : null}
        {message ? (
          <p role="status" className="mt-2 text-sm">
            {message}
          </p>
        ) : null}
      </div>

      {confirming ? (
        <div className="fixed inset-0 z-20 grid place-items-center bg-foreground/40 px-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="publish-title"
            className="w-full max-w-md border-2 border-foreground bg-card p-5"
          >
            <h2 id="publish-title" className="font-display text-3xl">
              Publish this form?
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Published forms show in the journey picker. Drafts stay hidden.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <button type="button" className={`${BTN_OUTLINE} ${BTN_MD}`} onClick={() => setConfirming(false)}>
                Cancel
              </button>
              <button type="button" className={`${BTN_PRIMARY} ${BTN_MD}`} disabled={busy} onClick={() => void confirmPublish()}>
                Publish
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FieldCells({
  row,
  update,
  stacked = false,
}: {
  row: Row;
  update: (key: number, patch: Partial<FieldRecord>) => void;
  stacked?: boolean;
}) {
  const { field, key } = row;
  const label = (
    <input
      aria-label="Label"
      className={inputClass}
      value={field.label}
      onChange={(event) => update(key, { label: event.target.value })}
    />
  );
  const type = (
    <select
      aria-label="Type"
      className={inputClass}
      value={field.type}
      onChange={(event) => update(key, { type: event.target.value as FieldRecord['type'] })}
    >
      {FIELD_TYPES.map((item) => (
        <option key={item} value={item}>
          {item}
        </option>
      ))}
    </select>
  );
  const sharedId = (
    <input
      aria-label="Shared id"
      className={inputClass}
      value={field.id}
      onChange={(event) => update(key, { id: event.target.value })}
    />
  );
  const required = (
    <input
      aria-label="Required"
      type="checkbox"
      checked={field.required}
      onChange={(event) => update(key, { required: event.target.checked })}
    />
  );
  const pii = (
    <input
      aria-label="PII"
      type="checkbox"
      checked={field.pii}
      onChange={(event) => update(key, { pii: event.target.checked })}
    />
  );
  const confidence = <ConfidencePill confidence={field.confidence} />;
  const checked = (
    <input
      aria-label="Checked"
      type="checkbox"
      checked={field.checked}
      onChange={(event) => update(key, { checked: event.target.checked })}
    />
  );

  if (!stacked) {
    return (
      <>
        <td className="px-2 py-2">{label}</td>
        <td className="px-2 py-2">{type}</td>
        <td className="px-2 py-2">{sharedId}</td>
        <td className="px-2 py-2">{required}</td>
        <td className="px-2 py-2">{pii}</td>
        <td className="px-2 py-2">{confidence}</td>
        <td className="px-2 py-2">{checked}</td>
      </>
    );
  }

  return (
    <>
      <label className="grid gap-1 text-xs font-semibold">
        Label
        {label}
      </label>
      <label className="grid gap-1 text-xs font-semibold">
        Type
        {type}
      </label>
      <label className="grid gap-1 text-xs font-semibold">
        Shared id
        {sharedId}
      </label>
      <div className="flex flex-wrap items-center gap-4 text-xs">
        <label className="flex items-center gap-2 font-semibold">
          {required}
          Required
        </label>
        <label className="flex items-center gap-2 font-semibold">
          {pii}
          PII
        </label>
        <label className="flex items-center gap-2 font-semibold">
          {checked}
          Checked
        </label>
        {confidence}
      </div>
    </>
  );
}

function ConfidencePill({ confidence }: { confidence: number }) {
  const low = confidence < CONFIDENCE_CHECK_BELOW;
  return (
    <span
      className={`inline-flex px-2 py-0.5 text-[10px] font-semibold ${
        low ? 'bg-saffron/30 text-foreground' : 'bg-primary/15 text-primary'
      }`}
    >
      {Math.round(confidence * 100)}%
    </span>
  );
}

function journeyTitle(journey: string): string {
  if (journey === 'account_opening') return 'Account opening';
  if (journey === 'kyc_update') return 'KYC update';
  if (journey === 'rekyc') return 'Re-KYC';
  return journey;
}
