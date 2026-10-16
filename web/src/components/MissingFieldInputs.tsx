import { SCHEMA, enumsFor } from '../lib/schema';
import type { FormValues } from '../lib/types';
import { fieldIssue } from '../lib/validate';

/**
 * Fields the speak panel does not show that block review: required ones still empty
 * (yes/no declarations, residential status, permanent address when it differs...) and
 * filled ones with a format error (a CIF heard as two digits). Without these the draft
 * is stuck on a field the user has no way to see or fix except by voice.
 */
export function MissingFieldInputs({
  missing,
  invalid = [],
  shownIds,
  values,
  onChange,
}: {
  missing: string[];
  invalid?: string[];
  shownIds: Set<string>;
  values: FormValues;
  onChange: (id: string, value: string | boolean | null) => void;
}) {
  const ids = [...invalid, ...missing.filter((id) => !invalid.includes(id))];
  const fields = ids
    .filter((id) => !shownIds.has(id))
    .map((id) => SCHEMA.fields.find((field) => field.id === id))
    .filter((field): field is NonNullable<typeof field> => Boolean(field));
  if (fields.length === 0) return null;

  return (
    <section aria-label="Still needed" className="border-2 border-saffron">
      <header className="flex items-center justify-between border-b-2 border-saffron bg-saffron/15 px-4 py-2">
        <h2 className="text-sm font-bold uppercase tracking-wide">Still needed</h2>
        <span className="text-[10px]">{fields.length} left</span>
      </header>
      <div className="grid sm:grid-cols-2">
        {fields.map((field) => {
          const inputId = `missing-field-${field.id}`;
          const value = values[field.id];
          const options = enumsFor(field);
          const issue = fieldIssue(field.id, value);
          return (
            <div key={field.id} className="border-b border-r border-foreground/15 px-4 py-3">
              <label htmlFor={inputId} className="block text-[10px] uppercase text-muted-foreground">
                {field.label_en}
                {missing.includes(field.id) ? <span className="text-destructive"> *</span> : null}
              </label>
              {field.type === 'boolean' ? (
                <div id={inputId} role="group" aria-label={field.label_en} className="mt-1 flex gap-2">
                  {([true, false] as const).map((answer) => (
                    <button
                      key={String(answer)}
                      type="button"
                      aria-pressed={value === answer}
                      onClick={() => onChange(field.id, answer)}
                      className={`border-2 px-3 py-1 text-xs font-semibold ${
                        value === answer
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-foreground/30 hover:border-foreground'
                      }`}
                    >
                      {answer ? 'Yes' : 'No'}
                    </button>
                  ))}
                </div>
              ) : options ? (
                <select
                  id={inputId}
                  value={typeof value === 'string' ? value : ''}
                  onChange={(event) => onChange(field.id, event.target.value)}
                  className="mt-1 min-h-6 w-full bg-transparent font-semibold outline-none"
                >
                  <option value="">Select…</option>
                  {options.map((option) => (
                    <option key={option} value={option}>
                      {option.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id={inputId}
                  type={field.type === 'date' ? 'date' : 'text'}
                  value={typeof value === 'string' ? value : ''}
                  onChange={(event) => onChange(field.id, event.target.value)}
                  spellCheck={false}
                  aria-invalid={issue ? true : undefined}
                  className="mt-1 min-h-6 w-full bg-transparent font-semibold outline-none"
                />
              )}
              {issue ? (
                <p className="mt-1 text-[10px] font-semibold text-destructive">
                  {issue}
                  {field.required ? '' : ' Or clear it if it does not apply.'}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
