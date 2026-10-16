import { useEffect, useState } from 'react';
import type { FormVersion } from '../../../shared/forms/types';
import { formKey } from '../forms/activeForm';
import { BANK_VARIES_COPY } from '../lib/schema';
import {
  hdfcFallbackRows,
  journeyRows,
  listPublishedForms,
  visiblePublishedForms,
  type PublishedFormRow,
} from '../lib/publishedForms';
import { CheckIcon } from '../ui/icons';

export function PublishedFormRows({
  journey,
  load = listPublishedForms,
  selected,
  onSelect,
}: {
  journey: string;
  load?: (journey: string) => Promise<FormVersion[] | null>;
  /** formKey of the chosen form. */
  selected?: string;
  onSelect?: (form: FormVersion) => void;
}) {
  const [rows, setRows] = useState<PublishedFormRow[]>(() => hdfcFallbackRows(journey));

  useEffect(() => {
    let cancelled = false;
    setRows(hdfcFallbackRows(journey));
    void load(journey).then((forms) => {
      if (cancelled) return;
      setRows(journeyRows(visiblePublishedForms(forms, journey), journey));
    });
    return () => {
      cancelled = true;
    };
  }, [journey, load]);

  return (
    <ul aria-label="Published forms" className="mt-4 grid gap-2">
      {rows.map((row) => {
        const on = selected === formKey(row.form);
        return (
          <li key={row.key}>
            <button
              type="button"
              aria-pressed={on}
              onClick={() => onSelect?.(row.form)}
              className={`flex w-full flex-col gap-1 border-2 px-3 py-2 text-left sm:flex-row sm:items-center sm:justify-between ${
                on ? 'border-primary bg-primary/10' : 'border-foreground/20 hover:border-foreground'
              }`}
            >
              <span>
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  {on ? <CheckIcon className="size-4 text-primary" /> : null}
                  {row.bankName}
                </span>
                <span className="block text-xs text-muted-foreground">{row.detail}</span>
              </span>
              <span className="text-xs text-muted-foreground">{on ? 'Selected' : BANK_VARIES_COPY}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
