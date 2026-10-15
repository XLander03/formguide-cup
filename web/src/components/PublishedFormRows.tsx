import { useEffect, useState } from 'react';
import type { FormVersion } from '../../../shared/forms/types';
import { BANK_VARIES_COPY } from '../lib/schema';
import {
  hdfcFallbackRows,
  listPublishedForms,
  rowsFromPublished,
  visiblePublishedForms,
  type PublishedFormRow,
} from '../lib/publishedForms';

export function PublishedFormRows({
  journey,
  load = listPublishedForms,
}: {
  journey: string;
  load?: (journey: string) => Promise<FormVersion[] | null>;
}) {
  const [rows, setRows] = useState<PublishedFormRow[]>(() => hdfcFallbackRows(journey));

  useEffect(() => {
    let cancelled = false;
    setRows(hdfcFallbackRows(journey));
    void load(journey).then((forms) => {
      if (cancelled) return;
      const published = visiblePublishedForms(forms, journey);
      if (!published || published.length === 0) {
        setRows(hdfcFallbackRows(journey));
        return;
      }
      setRows(rowsFromPublished(published));
    });
    return () => {
      cancelled = true;
    };
  }, [journey, load]);

  return (
    <ul aria-label="Published forms" className="mt-4 grid gap-2">
      {rows.map((row) => (
        <li
          key={row.key}
          className="flex flex-col gap-1 border border-foreground/20 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
        >
          <span>
            <span className="block text-sm font-semibold">{row.bankName}</span>
            <span className="block text-xs text-muted-foreground">{row.detail}</span>
          </span>
          <span className="text-xs text-muted-foreground">{BANK_VARIES_COPY}</span>
        </li>
      ))}
    </ul>
  );
}
