import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { withAutoAccept } from '../../../shared/forms/review';
import type { FieldRecord, FormVersion } from '../../../shared/forms/types';
import { BTN_LG, BTN_MD, BTN_OUTLINE, BTN_PRIMARY } from '../ui/buttons';
import { boxStyle, moveBox, resizeBox, type PageSize } from './geometry';
import { paperPageDataUrl } from './paperImage';
import { AUTO_ACCEPT_ABOVE, isAutoAccepted, needsConfidenceCheck, publishBlocked } from './reviewRules';
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

const THRESHOLD_PCT = Math.round(AUTO_ACCEPT_ABOVE * 100);

const inputClass = 'h-9 w-full min-w-0 border-2 border-foreground bg-background px-2 text-sm';

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

function byLowestConfidence(a: Row, b: Row): number {
  return a.field.confidence - b.field.confidence || a.field.order - b.field.order || a.key - b.key;
}

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
  const [rows, setRows] = useState<Row[]>(() =>
    withAutoAccept(form.fields).map((field, key) => ({ key, field })),
  );
  const [removed, setRemoved] = useState<Row[]>([]);
  const [selectedKey, setSelectedKey] = useState<number | null>(null);
  const [showAutoBoxes, setShowAutoBoxes] = useState(false);
  const [autoOpen, setAutoOpen] = useState(false);
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

  const reviewRows = rows.filter((row) => !isAutoAccepted(row.field.confidence)).sort(byLowestConfidence);
  const autoRows = rows.filter((row) => isAutoAccepted(row.field.confidence)).sort(byLowestConfidence);
  const remaining = reviewRows.filter((row) => needsConfidenceCheck(row.field)).length;
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
    for (const node of document.querySelectorAll(`[data-field-key="${selectedKey}"], [data-row-key="${selectedKey}"]`)) {
      node.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    }
  }, [selectedKey]);

  function select(key: number) {
    setSelectedKey(key);
    const row = rows.find((item) => item.key === key);
    if (row && isAutoAccepted(row.field.confidence)) setAutoOpen(true);
  }

  function update(key: number, patch: Partial<FieldRecord>) {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, field: { ...row.field, ...patch } } : row)),
    );
  }

  function remove(key: number) {
    const row = rows.find((item) => item.key === key);
    if (!row) return;
    setRows((current) => current.filter((item) => item.key !== key));
    setRemoved((current) => [...current, row]);
    if (selectedKey === key) setSelectedKey(null);
  }

  function undoRemove() {
    const last = removed[removed.length - 1];
    if (!last) return;
    setRemoved((current) => current.slice(0, -1));
    setRows((current) => [...current, last]);
    setSelectedKey(last.key);
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
    select(row.key);
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
    select(row.key);
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

  function fieldList(list: Row[], label: string, auto: boolean) {
    if (list.length === 0) return null;
    if (wide) {
      return (
        <table aria-label={label} className="w-full table-fixed border-2 border-foreground text-left text-sm">
          <colgroup>
            <col className="w-[30%]" />
            <col className="w-[15%]" />
            <col className="w-[22%]" />
            <col className="w-[7%]" />
            <col className="w-[6%]" />
            <col className="w-[8%]" />
            <col className="w-[12%]" />
          </colgroup>
          <thead className="bg-muted text-[10px] uppercase tracking-wide">
            <tr>
              <th className="px-1.5 py-2">Label</th>
              <th className="px-1.5 py-2">Type</th>
              <th className="px-1.5 py-2">Shared id</th>
              <th className="px-1.5 py-2">Req.</th>
              <th className="px-1.5 py-2">PII</th>
              <th className="px-1.5 py-2">Conf.</th>
              <th className="px-1.5 py-2">{auto ? 'Remove' : 'Confirm'}</th>
            </tr>
          </thead>
          <tbody>
            {list.map((row) => (
              <tr
                key={row.key}
                data-row-key={row.key}
                aria-selected={row.key === selectedKey}
                className={`border-t border-foreground/20 ${row.key === selectedKey ? 'bg-primary/10' : 'bg-background'}`}
                onClick={() => select(row.key)}
              >
                <FieldCells row={row} update={update} remove={remove} auto={auto} />
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    return (
      <ul aria-label={label} className="grid gap-3">
        {list.map((row) => (
          <li
            key={row.key}
            data-row-key={row.key}
            aria-selected={row.key === selectedKey}
            className={`grid gap-2 border-2 p-3 ${row.key === selectedKey ? 'border-primary bg-primary/10' : 'border-foreground bg-background'}`}
            onClick={() => select(row.key)}
          >
            <FieldCells row={row} update={update} remove={remove} auto={auto} stacked />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col">
      <div className="grid grid-cols-1 items-start xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section
          aria-label="Form pages"
          className="min-w-0 border-b-2 border-foreground px-4 py-6 xl:border-b-0 xl:border-r-2"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">Pages</p>
          <h1 className="mt-2 font-display text-3xl leading-none sm:text-4xl">
            {form.bankId} · {journeyTitle(form.journey)}
          </h1>
          <p className="mt-2 text-xs text-muted-foreground">
            Boxes show fields at or below {THRESHOLD_PCT}% confidence. Select one to drag or resize it.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block size-3 border-2 border-saffron bg-saffron/30" />
              To confirm
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block size-3 border-2 border-primary/60 bg-primary/10" />
              Confirmed
            </span>
            <label className="flex items-center gap-1.5 font-semibold">
              <input
                type="checkbox"
                checked={showAutoBoxes}
                onChange={(event) => setShowAutoBoxes(event.target.checked)}
              />
              Show auto-accepted boxes
            </label>
          </div>
          <div className="mt-4 grid gap-4">
            {pageNumbers.map((pageNumber) => {
              const page = pageFor(pageNumber);
              const onPage = rows.filter(
                (row) =>
                  row.field.page === pageNumber &&
                  (showAutoBoxes || row.key === selectedKey || !isAutoAccepted(row.field.confidence)),
              );
              return (
                <div
                  key={pageNumber}
                  ref={(node) => {
                    pageRefs.current[pageNumber] = node;
                  }}
                  className="relative isolate overflow-hidden border-2 border-foreground bg-card"
                  style={{ aspectRatio: `${page.width} / ${page.height}` }}
                >
                  <img
                    src={images[pageNumber - 1] ?? paperPageDataUrl(pageNumber, page)}
                    alt={`Page ${pageNumber}`}
                    className="pointer-events-none absolute inset-0 h-full w-full"
                  />
                  {onPage.map((row) => {
                    const selected = row.key === selectedKey;
                    const auto = isAutoAccepted(row.field.confidence);
                    const tone = selected
                      ? 'z-10 border-2 border-primary bg-primary/25'
                      : auto
                        ? 'border border-dashed border-foreground/40'
                        : row.field.checked
                          ? 'border-2 border-primary/60 bg-primary/10'
                          : 'border-2 border-saffron bg-saffron/30';
                    return (
                      <div
                        key={row.key}
                        data-field-key={row.key}
                        className={`absolute scroll-mb-28 scroll-mt-4 ${selected ? 'z-10' : ''}`}
                        style={boxStyle(row.field.box, page)}
                      >
                        <button
                          type="button"
                          aria-label={`${row.field.label} field`}
                          aria-pressed={selected}
                          className={`absolute inset-0 ${tone}`}
                          onClick={() => select(row.key)}
                          onPointerDown={(event) => startMove(event, row)}
                        />
                        {selected ? (
                          <button
                            type="button"
                            aria-label={`Resize ${row.field.label}`}
                            className="absolute bottom-0 right-0 z-20 size-2.5 cursor-se-resize bg-primary"
                            onPointerDown={(event) => startResize(event, row)}
                          />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </section>

        <section
          aria-label="Fields"
          className="min-w-0 px-4 py-6 xl:sticky xl:top-0 xl:max-h-[calc(100vh-6.5rem)] xl:overflow-y-auto"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">
            Lowest confidence first
          </p>
          <h2 className="mt-2 font-display text-3xl leading-none">Needs review</h2>
          <p className="mt-2 text-xs text-muted-foreground">
            {reviewRows.length === 0
              ? `Every field scored above ${THRESHOLD_PCT}%. Nothing to confirm.`
              : `${remaining} of ${reviewRows.length} at or below ${THRESHOLD_PCT}% left to confirm. Edit, confirm or remove each one.`}
          </p>
          {removed.length > 0 ? (
            <p className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              Removed {removed.length} field{removed.length === 1 ? '' : 's'}.
              <button type="button" className="font-semibold underline" onClick={undoRemove}>
                Undo
              </button>
            </p>
          ) : null}
          <div className="mt-4">{fieldList(reviewRows, 'Fields needing review', false)}</div>

          {autoRows.length > 0 ? (
            <details
              className="mt-6 border-2 border-foreground"
              open={autoOpen}
              onToggle={(event) => setAutoOpen((event.currentTarget as HTMLDetailsElement).open)}
            >
              <summary className="cursor-pointer bg-muted px-3 py-2 text-sm font-semibold">
                Auto-accepted · {autoRows.length} field{autoRows.length === 1 ? '' : 's'} above {THRESHOLD_PCT}%
              </summary>
              <div className="p-2">
                <p className="mb-2 text-xs text-muted-foreground">
                  Already on the form. Open one to edit it, or remove it.
                </p>
                {fieldList(autoRows, 'Auto-accepted fields', true)}
              </div>
            </details>
          ) : null}
        </section>
      </div>

      <div className="sticky bottom-0 z-30 mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 border-t-2 border-foreground bg-background px-4 py-4 sm:px-6">
        <button
          type="button"
          className={`${BTN_PRIMARY} ${BTN_LG}`}
          disabled={blocked || busy || published}
          onClick={() => setConfirming(true)}
        >
          Publish
        </button>
        <p className="text-xs text-muted-foreground">
          {blocked
            ? `Confirm or remove ${remaining} more field${remaining === 1 ? '' : 's'} at or below ${THRESHOLD_PCT}% confidence.`
            : `${rows.length} fields ready: ${autoRows.length} auto-accepted, ${reviewRows.length} confirmed.`}
        </p>
        {message ? (
          <p role="status" className="w-full text-sm">
            {message}
          </p>
        ) : null}
      </div>

      {confirming ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-foreground/40 px-4">
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
  remove,
  auto,
  stacked = false,
}: {
  row: Row;
  update: (key: number, patch: Partial<FieldRecord>) => void;
  remove: (key: number) => void;
  auto: boolean;
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
  const confirm = auto ? null : (
    <input
      aria-label={`Confirm ${field.label}`}
      type="checkbox"
      checked={field.checked}
      onChange={(event) => update(key, { checked: event.target.checked })}
    />
  );
  const removeButton = (
    <button
      type="button"
      aria-label={`Remove ${field.label}`}
      title="Remove field"
      className="grid size-6 place-items-center border border-foreground/40 text-xs leading-none hover:border-foreground hover:bg-foreground hover:text-background"
      onClick={(event) => {
        event.stopPropagation();
        remove(key);
      }}
    >
      ✕
    </button>
  );

  if (!stacked) {
    return (
      <>
        <td className="px-1.5 py-1.5">{label}</td>
        <td className="px-1.5 py-1.5">{type}</td>
        <td className="px-1.5 py-1.5">{sharedId}</td>
        <td className="px-1.5 py-1.5">{required}</td>
        <td className="px-1.5 py-1.5">{pii}</td>
        <td className="px-1.5 py-1.5">{confidence}</td>
        <td className="px-1.5 py-1.5">
          <span className="flex items-center gap-2">
            {confirm}
            {removeButton}
          </span>
        </td>
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
        {confirm ? (
          <label className="flex items-center gap-2 font-semibold">
            {confirm}
            Confirmed
          </label>
        ) : null}
        {confidence}
        {removeButton}
      </div>
    </>
  );
}

function ConfidencePill({ confidence }: { confidence: number }) {
  const low = !isAutoAccepted(confidence);
  return (
    <span
      className={`inline-flex px-1.5 py-0.5 text-[10px] font-semibold ${
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
