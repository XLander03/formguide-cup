import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { AdminFormRow, AdminFormsResponse, AdminStats } from '../../../shared/forms/admin';
import { BTN_LG, BTN_MD, BTN_OUTLINE, BTN_PRIMARY } from '../ui/buttons';
import { ArrowRightIcon, RotateIcon } from '../ui/icons';
import { consoleApi, type ConsoleApi } from './consoleClient';
import { badgeLabel, versionSummary } from './consoleFormat';
import {
  defaultFilter,
  FILTERS,
  fieldsToReview,
  filterCounts,
  groupForms,
  inFilter,
  primaryAction,
  type ConsoleFilter,
  type FormGroup,
} from './consoleGroups';

/** Where customers pick a bank form. */
export const CUSTOMER_JOURNEY_PATH = '/journey';

type Load =
  | { state: 'loading'; data: AdminFormsResponse | null }
  | { state: 'ready'; data: AdminFormsResponse }
  | { state: 'error'; data: AdminFormsResponse | null; message: string };

type Notice = { tone: 'ok' | 'error'; text: string };

interface Confirm {
  title: string;
  name: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  run: () => void;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'That did not work. Try again.';
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

const EMPTY_FILTER_TEXT: Record<ConsoleFilter, string> = {
  review: 'Nothing needs review.',
  ready: 'Nothing is waiting to be published.',
  live: 'No forms are live yet.',
  retired: 'No retired forms.',
  all: 'No forms yet.',
};

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
  const [load, setLoad] = useState<Load>({ state: 'loading', data: null });
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(initialNotice ? { tone: 'ok', text: initialNotice } : null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  // null until the admin picks one: then the default follows the data.
  const [picked, setPicked] = useState<ConsoleFilter | null>(null);
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

  const data = load.data;
  const loading = load.state === 'loading';
  const groups = useMemo(() => groupForms(data?.forms ?? []), [data]);
  const counts = useMemo(() => filterCounts(groups), [groups]);
  const filter = picked ?? defaultFilter(groups);
  const shown = groups.filter((group) => inFilter(group, filter));

  /** Runs one group's action, shows what happened, then reloads the list. */
  async function perform(group: FormGroup, work: () => Promise<Notice | null>, refresh = true) {
    setBusyKey(group.key);
    setNotice(null);
    try {
      const result = await work();
      if (result) setNotice(result);
    } catch (error) {
      setNotice({ tone: 'error', text: errorText(error) });
    } finally {
      if (refresh) await reload();
      setBusyKey(null);
    }
  }

  const actions: GroupActions = {
    review: onReview,
    openPdf: (group, row) =>
      void perform(
        group,
        async () => {
          await api.openPdf(row);
          return null;
        },
        false,
      ),
    publish: (group, row) =>
      void perform(group, async () => {
        await api.publish(row);
        return { tone: 'ok', text: `Published ${group.title}. Customers can pick it now.` };
      }),
    replace: (group, row) =>
      setConfirm({
        title: 'Publish and replace the live form?',
        name: group.title,
        body: `Customers will see the new version from now on. The version live today is retired and leaves the customer list, so there is still only one ${group.title} form to pick.`,
        confirmLabel: 'Publish & replace',
        run: () => void perform(group, () => publishAndReplace(api, group, row)),
      }),
    unpublish: (group, row) =>
      setConfirm({
        title: 'Unpublish this form?',
        name: group.title,
        body: 'It leaves the customer journey list right away and goes back to draft. You can review and publish it again later.',
        confirmLabel: 'Unpublish',
        run: () =>
          void perform(group, async () => {
            await api.setStatus({ formId: row.formId, version: row.version, status: 'draft' });
            return { tone: 'ok', text: `Unpublished ${group.title}. It is a draft again.` };
          }),
      }),
    retire: (group, row) =>
      setConfirm({
        title: 'Retire this form?',
        name: `${group.title} · ${badgeLabel(row.status).toLowerCase()} version`,
        body: 'A retired form leaves the customer list and can never be published again. Upload the PDF again to start over. This cannot be undone.',
        confirmLabel: 'Retire form',
        danger: true,
        run: () =>
          void perform(group, async () => {
            await api.setStatus({ formId: row.formId, version: row.version, status: 'retired' });
            return { tone: 'ok', text: `Retired a version of ${group.title}.` };
          }),
      }),
    clearOlder: (group) =>
      setConfirm({
        title: 'Clear older drafts?',
        name: group.title,
        body: `Retires ${plural(group.olderDrafts.length, 'older draft')}. The newest draft and the live form stay as they are. Retired drafts can never be published. This cannot be undone.`,
        confirmLabel: 'Clear older drafts',
        danger: true,
        run: () => void perform(group, () => clearOlderDrafts(api, group)),
      }),
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">Admin</p>
          <h1 className="mt-2 font-display text-4xl leading-none sm:text-5xl">Forms</h1>
          <p className="mt-3 max-w-xl text-sm text-muted-foreground">
            One card per bank and journey. Check new uploads, publish them, and keep one live form for each.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={`${BTN_OUTLINE} ${BTN_MD}`} disabled={loading} onClick={() => void reload()}>
            <RotateIcon />
            {loading && data ? 'Refreshing…' : 'Refresh'}
          </button>
          <button type="button" className={`${BTN_PRIMARY} ${BTN_MD}`} onClick={onUpload}>
            Upload a form
          </button>
        </div>
      </div>

      <StatTiles
        stats={data?.stats ?? null}
        counts={data ? counts : null}
        fields={fieldsToReview(groups)}
        filter={filter}
        onFilter={setPicked}
      />

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

      <section aria-label="Forms by bank and journey" className="mt-8">
        {!data && loading ? (
          <p role="status" className="border-2 border-foreground bg-card px-4 py-8 text-center text-sm text-muted-foreground">
            Loading forms…
          </p>
        ) : null}

        {data && groups.length === 0 ? (
          <div className="border-2 border-dashed border-foreground bg-card px-4 py-10 text-center">
            <p className="font-display text-3xl">No forms yet.</p>
            <p className="mt-2 text-sm text-muted-foreground">Upload a bank PDF to make the first draft.</p>
            <button type="button" className={`${BTN_PRIMARY} ${BTN_LG} mt-5`} onClick={onUpload}>
              Upload a form
            </button>
          </div>
        ) : null}

        {groups.length > 0 ? (
          <>
            <FilterBar filter={filter} counts={counts} onFilter={setPicked} />
            {shown.length === 0 ? (
              <p className="mt-4 border-2 border-dashed border-foreground/40 px-4 py-8 text-center text-sm text-muted-foreground">
                {EMPTY_FILTER_TEXT[filter]}
              </p>
            ) : (
              <ul aria-label="Forms" className="mt-4 grid gap-3">
                {shown.map((group) => (
                  <li key={group.key}>
                    <GroupCard
                      group={group}
                      showRetired={filter === 'retired'}
                      now={now}
                      busy={busyKey !== null}
                      working={busyKey === group.key}
                      actions={actions}
                    />
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : null}
      </section>

      {confirm ? (
        <ConfirmDialog
          confirm={confirm}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null);
            confirm.run();
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * Publishes the group's draft, then retires every previously live version so customers
 * only ever see one form for this bank and journey. Retired, not unpublished: an old
 * version left as a draft would be offered for publish again over the new one.
 */
async function publishAndReplace(api: ConsoleApi, group: FormGroup, draft: AdminFormRow): Promise<Notice> {
  try {
    await api.publish(draft);
  } catch (error) {
    return { tone: 'error', text: `Could not publish ${group.title}: ${errorText(error)} The live form is unchanged.` };
  }
  const failures: string[] = [];
  for (const old of group.live) {
    try {
      await api.setStatus({ formId: old.formId, version: old.version, status: 'retired' });
    } catch (error) {
      failures.push(errorText(error));
    }
  }
  if (failures.length > 0) {
    return {
      tone: 'error',
      text: `Published the new ${group.title}, but could not take the old version off the customer list (${failures[0]}). Both are live now. Unpublish the old one from More.`,
    };
  }
  return {
    tone: 'ok',
    text: `Published the new ${group.title}. The old version is retired and customers see only the new one.`,
  };
}

async function clearOlderDrafts(api: ConsoleApi, group: FormGroup): Promise<Notice> {
  let cleared = 0;
  let firstError: string | null = null;
  for (const row of group.olderDrafts) {
    try {
      await api.setStatus({ formId: row.formId, version: row.version, status: 'retired' });
      cleared += 1;
    } catch (error) {
      firstError ??= errorText(error);
    }
  }
  if (firstError) {
    return {
      tone: 'error',
      text: `Cleared ${cleared} of ${group.olderDrafts.length} older drafts of ${group.title}. ${firstError}`,
    };
  }
  return { tone: 'ok', text: `Cleared ${plural(cleared, 'older draft')} of ${group.title}.` };
}

function StatTiles({
  stats,
  counts,
  fields,
  filter,
  onFilter,
}: {
  stats: AdminStats | null;
  counts: Record<ConsoleFilter, number> | null;
  fields: number;
  filter: ConsoleFilter;
  onFilter: (filter: ConsoleFilter) => void;
}) {
  const voice = stats?.voiceRequests24h;
  const tiles: { label: string; value: string; muted?: boolean; sub?: string; filter?: ConsoleFilter }[] = [
    { label: 'Live forms', value: counts ? String(counts.live) : '—', filter: 'live' },
    {
      label: 'Need review',
      value: counts ? String(counts.review) : '—',
      sub: counts ? plural(fields, 'field') : undefined,
      filter: 'review',
    },
    { label: 'Ready to publish', value: counts ? String(counts.ready) : '—', filter: 'ready' },
    {
      label: 'Voice requests (24h)',
      value: !stats ? '—' : typeof voice === 'number' ? voice.toLocaleString() : 'Not available',
      muted: Boolean(stats) && typeof voice !== 'number',
    },
  ];
  return (
    <div role="group" aria-label="Summary" className="mt-6 grid grid-cols-2 gap-px border-2 border-foreground bg-foreground lg:grid-cols-4">
      {tiles.map((tile) => {
        const body = (
          <>
            <span className="block text-xs font-semibold text-muted-foreground">{tile.label}</span>
            <span
              className={
                tile.muted
                  ? 'mt-2 block text-sm font-semibold text-muted-foreground'
                  : 'mt-1 block font-display text-4xl leading-none tabular-nums'
              }
            >
              {tile.value}
            </span>
            {tile.sub ? <span className="mt-1 block text-xs text-muted-foreground">{tile.sub}</span> : null}
          </>
        );
        if (!tile.filter) {
          return (
            <div key={tile.label} className="bg-card px-4 py-4">
              {body}
            </div>
          );
        }
        const active = filter === tile.filter;
        const target = tile.filter;
        return (
          <button
            key={tile.label}
            type="button"
            aria-pressed={active}
            onClick={() => onFilter(target)}
            className={`flex cursor-pointer flex-col items-start justify-start px-4 py-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
              active ? 'bg-background shadow-[inset_0_-4px_0_var(--color-primary)]' : 'bg-card hover:bg-background'
            }`}
          >
            {body}
          </button>
        );
      })}
    </div>
  );
}

function FilterBar({
  filter,
  counts,
  onFilter,
}: {
  filter: ConsoleFilter;
  counts: Record<ConsoleFilter, number>;
  onFilter: (filter: ConsoleFilter) => void;
}) {
  return (
    <div role="group" aria-label="Show forms" className="flex flex-wrap gap-2">
      {FILTERS.map((item) => {
        const active = item.id === filter;
        return (
          <button
            key={item.id}
            type="button"
            aria-pressed={active}
            onClick={() => onFilter(item.id)}
            className={`inline-flex h-9 cursor-pointer items-center gap-2 border-2 px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
              active
                ? 'border-foreground bg-foreground text-background'
                : 'border-foreground/30 bg-background text-foreground hover:border-foreground'
            }`}
          >
            {item.label}
            <span className={`tabular-nums text-xs ${active ? 'text-background/80' : 'text-muted-foreground'}`}>
              {counts[item.id]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function StatusBadge({ status }: { status: AdminFormRow['status'] }) {
  const tone =
    status === 'published'
      ? 'border-primary bg-primary text-primary-foreground'
      : status === 'retired'
        ? 'border-muted-foreground text-muted-foreground'
        : 'border-foreground bg-background text-foreground';
  return (
    <span
      className={`inline-flex w-16 shrink-0 items-center justify-center border-2 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone}`}
    >
      {badgeLabel(status)}
    </span>
  );
}

interface GroupActions {
  review: (row: AdminFormRow) => void;
  openPdf: (group: FormGroup, row: AdminFormRow) => void;
  publish: (group: FormGroup, row: AdminFormRow) => void;
  replace: (group: FormGroup, row: AdminFormRow) => void;
  unpublish: (group: FormGroup, row: AdminFormRow) => void;
  retire: (group: FormGroup, row: AdminFormRow) => void;
  clearOlder: (group: FormGroup) => void;
}

function VersionLine({ row, now }: { row: AdminFormRow; now?: number }) {
  return (
    <li className="flex min-w-0 items-center gap-2 text-sm">
      <StatusBadge status={row.status} />
      <span className="min-w-0 text-muted-foreground" title={`${row.formId} · ${row.version}`}>
        {versionSummary(row, now)}
      </span>
    </li>
  );
}

function GroupCard({
  group,
  showRetired,
  now,
  busy,
  working,
  actions,
}: {
  group: FormGroup;
  showRetired: boolean;
  now?: number;
  busy: boolean;
  working: boolean;
  actions: GroupActions;
}) {
  const titleId = useId();
  const primary = primaryAction(group);
  const versions = [...group.live, ...(group.draft ? [group.draft] : []), ...(showRetired ? group.retired : [])];
  const olderCount = group.olderDrafts.length;

  const menu: MenuItem[] = [];
  const many = (rows: AdminFormRow[], row: AdminFormRow) => (rows.length > 1 ? ` ${rows.indexOf(row) + 1}` : '');
  if (group.draft && primary?.kind !== 'review') menu.push({ label: 'Review draft', onSelect: () => actions.review(group.draft!) });
  for (const live of group.live) {
    menu.push({ label: `Review live version${many(group.live, live)}`, onSelect: () => actions.review(live) });
  }
  if (group.draft && group.live.length > 0) menu.push({ label: 'View on site', href: CUSTOMER_JOURNEY_PATH });
  for (const live of group.live) {
    menu.push({ label: `Unpublish live version${many(group.live, live)}`, onSelect: () => actions.unpublish(group, live) });
  }
  if (group.draft) menu.push({ label: 'Source PDF (draft)', onSelect: () => actions.openPdf(group, group.draft!) });
  for (const live of group.live) {
    menu.push({ label: `Source PDF (live${many(group.live, live)})`, onSelect: () => actions.openPdf(group, live) });
  }
  if (showRetired) {
    for (const old of group.retired) {
      menu.push({ label: `Source PDF (retired${many(group.retired, old)})`, onSelect: () => actions.openPdf(group, old) });
    }
  }
  if (group.draft) menu.push({ label: 'Retire draft', danger: true, onSelect: () => actions.retire(group, group.draft!) });
  for (const live of group.live) {
    menu.push({ label: `Retire live version${many(group.live, live)}`, danger: true, onSelect: () => actions.retire(group, live) });
  }

  return (
    <article aria-labelledby={titleId} className="border-2 border-foreground bg-card p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 id={titleId} className="font-display text-2xl leading-tight">
            {group.title}
          </h2>
          {versions.length > 0 ? (
            <ul aria-label={`Versions of ${group.title}`} className="mt-2 grid gap-1.5">
              {versions.map((row) => (
                <VersionLine key={`${row.formId}@${row.version}`} row={row} now={now} />
              ))}
            </ul>
          ) : null}
          {group.live.length > 1 ? (
            <p className="mt-2 text-sm font-semibold text-destructive">
              Customers see {group.live.length} live versions. Unpublish all but one from More.
            </p>
          ) : null}
          {olderCount > 0 ? (
            <p className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              <span>{plural(olderCount, 'older draft')}</span>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => actions.clearOlder(group)}
                className="cursor-pointer font-semibold text-foreground underline underline-offset-2 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                Clear older drafts
              </button>
            </p>
          ) : null}
          {working ? (
            <p role="status" className="mt-2 text-xs text-muted-foreground">
              Working…
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-start gap-2">
          {primary ? (
            primary.kind === 'view' ? (
              <a
                href={CUSTOMER_JOURNEY_PATH}
                target="_blank"
                rel="noopener"
                className={`${BTN_OUTLINE} ${BTN_MD} flex-1 sm:flex-none`}
              >
                {primary.label}
                <ArrowRightIcon />
              </a>
            ) : (
              <button
                type="button"
                disabled={busy}
                className={`${BTN_PRIMARY} ${BTN_MD} flex-1 sm:flex-none`}
                onClick={() => {
                  if (primary.kind === 'review') actions.review(primary.row);
                  else if (primary.kind === 'publish') actions.publish(group, primary.row);
                  else actions.replace(group, primary.row);
                }}
              >
                {primary.label}
              </button>
            )
          ) : null}
          {menu.length > 0 ? <MoreMenu label={`More actions for ${group.title}`} items={menu} disabled={busy} /> : null}
        </div>
      </div>
    </article>
  );
}

type MenuItem = { label: string; danger?: boolean } & ({ onSelect: () => void; href?: never } | { href: string; onSelect?: never });

/** A small disclosure menu: Escape or a click outside closes it, arrow keys move between items. */
export function MoreMenu({ label, items, disabled }: { label: string; items: MenuItem[]; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [open]);

  function close() {
    setOpen(false);
    buttonRef.current?.focus();
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const nodes = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const index = nodes.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      nodes[(index + 1) % nodes.length]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      nodes[(index - 1 + nodes.length) % nodes.length]?.focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      nodes[0]?.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      nodes[nodes.length - 1]?.focus();
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  }

  const itemClass = (danger?: boolean) =>
    `block w-full cursor-pointer px-3 py-2 text-left text-sm focus-visible:outline-none ${
      danger
        ? 'text-destructive hover:bg-destructive hover:text-primary-foreground focus:bg-destructive focus:text-primary-foreground'
        : 'text-foreground hover:bg-foreground hover:text-background focus:bg-foreground focus:text-background'
    }`;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        className={`${BTN_OUTLINE} ${BTN_MD}`}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && open) {
            event.preventDefault();
            close();
          }
        }}
      >
        More
        <span aria-hidden="true" className="text-xs">
          ▾
        </span>
      </button>
      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onKeyDown}
          className="absolute right-0 top-full z-20 mt-1 w-60 border-2 border-foreground bg-card py-1 shadow-[4px_4px_0_var(--color-foreground)]"
        >
          {items.map((item) =>
            item.href ? (
              <a
                key={item.label}
                role="menuitem"
                tabIndex={-1}
                href={item.href}
                target="_blank"
                rel="noopener"
                className={itemClass(item.danger)}
                onClick={() => setOpen(false)}
              >
                {item.label}
              </a>
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                tabIndex={-1}
                className={itemClass(item.danger)}
                onClick={() => {
                  setOpen(false);
                  item.onSelect?.();
                }}
              >
                {item.label}
              </button>
            ),
          )}
        </div>
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
          {confirm.title}
        </h2>
        <p className="mt-1 text-sm font-semibold">{confirm.name}</p>
        <p id="console-confirm-body" className="mt-2 text-sm text-muted-foreground">
          {confirm.body}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button ref={cancelRef} type="button" className={`${BTN_OUTLINE} ${BTN_MD}`} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={
              confirm.danger
                ? `${BTN_PRIMARY} ${BTN_MD} border-destructive bg-destructive hover:border-foreground`
                : `${BTN_PRIMARY} ${BTN_MD}`
            }
            onClick={onConfirm}
          >
            {confirm.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
