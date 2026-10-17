import { bankFieldSections, sharedFieldsOnForm } from '../forms/activeForm';
import type { FieldRecord, FormVersion } from '../forms/types';
import { isFilled } from '../lib/schema';
import type { FormValues } from '../lib/types';

const INPUT =
  'min-w-0 w-full border-2 border-foreground/30 bg-background px-2 py-1.5 text-sm outline-none focus:border-primary';

function inputType(field: FieldRecord): string {
  if (field.type === 'date') return 'date';
  if (field.type === 'email') return 'email';
  if (field.type === 'phone') return 'tel';
  return 'text';
}

/** Voice provenance for one box: filled from speech, the sentence it came from, and whether it just landed. */
export interface BankFieldHeard {
  heard: boolean;
  quote: string;
  filling: boolean;
}

/** True when the current value came from the speak call (not typed, not a sample). */
function heardByVoice(value: FormValues[string], source: string | undefined): boolean {
  return source === 'gemini' && isFilled(value) && value !== false;
}

function HeardNote({ heard }: { heard: BankFieldHeard }) {
  if (!heard.heard) return null;
  return (
    <span className="mt-0.5 block truncate text-[10px] italic text-muted-foreground">
      <span className="not-italic font-semibold text-primary">✓ heard</span>
      {heard.quote ? ` · “${heard.quote}”` : ''}
    </span>
  );
}

function BankFieldInput({
  field,
  value,
  onChange,
  heard,
}: {
  field: FieldRecord;
  value: FormValues[string];
  onChange: (id: string, value: string | boolean | null) => void;
  heard: BankFieldHeard;
}) {
  const id = `bank-${field.id}`;
  const marker = field.required ? <span className="ml-1 text-[10px] text-saffron">on form as required</span> : null;
  const flash = `transition-colors duration-700 ${heard.filling ? 'bg-saffron/30' : ''}`;
  if (field.type === 'checkbox') {
    return (
      <label htmlFor={id} className={`flex cursor-pointer items-start gap-2 py-1.5 text-sm ${flash}`}>
        <input
          id={id}
          type="checkbox"
          className="mt-1 accent-primary"
          checked={value === true}
          onChange={(event) => onChange(field.id, event.target.checked)}
        />
        <span className="min-w-0">
          {field.label}
          {marker}
          <HeardNote heard={heard} />
        </span>
      </label>
    );
  }
  const text = typeof value === 'string' ? value : '';
  return (
    <div className={`py-1.5 ${flash}`}>
      <label htmlFor={id} className="block text-xs font-semibold">
        {field.label}
        {marker}
      </label>
      {field.type === 'choice' && field.options && field.options.length > 0 ? (
        <select id={id} className={`${INPUT} mt-1`} value={text} onChange={(event) => onChange(field.id, event.target.value)}>
          <option value="">— select —</option>
          {field.options.map((option) => (
            <option key={option} value={option}>
              {option.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          type={inputType(field)}
          className={`${INPUT} mt-1 ${heard.filling ? 'fg-rise' : ''}`}
          value={text}
          maxLength={field.maxChars && field.maxChars > 0 ? field.maxChars : undefined}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => onChange(field.id, event.target.value)}
        />
      )}
      <HeardNote heard={heard} />
    </div>
  );
}

/** Fields only the selected bank's form has. Optional in the draft; they print on that bank's PDF. */
export function BankFields({
  form,
  values,
  onChange,
  flashIds,
  said = {},
  fieldSource = {},
}: {
  form: FormVersion;
  values: FormValues;
  onChange: (id: string, value: string | boolean | null) => void;
  /** Ids that just landed from speech, highlighted the same way as the shared fields. */
  flashIds?: Set<string>;
  said?: Record<string, string>;
  fieldSource?: Record<string, string>;
}) {
  const sections = bankFieldSections(form);
  if (sections.length === 0) return null;
  const shared = sharedFieldsOnForm(form).length;
  return (
    <section aria-label={`${form.bankId} form fields`} className="mt-8 border-t-2 border-foreground pt-5">
      <p className="text-[10px] uppercase text-primary">{form.bankId} form</p>
      <h3 className="mt-2 font-display text-3xl leading-none">Extra boxes on this bank’s form</h3>
      <p className="mt-2 max-w-md text-xs text-muted-foreground">
        {shared} of your answers above are copied onto the {form.bankId} form. These boxes are specific to it. Fill
        what applies to you; they stay optional in this draft.
      </p>
      <div className="mt-4 space-y-2">
        {sections.map((section) => {
          const done = section.fields.filter((field) => isFilled(values[field.id]) && values[field.id] !== false).length;
          const heardIds = section.fields.filter((field) => heardByVoice(values[field.id], fieldSource[field.id]));
          return (
            // A section opens by itself once voice fills one of its boxes, so the fill is visible.
            <details
              key={section.name}
              open={heardIds.length > 0 || undefined}
              className="border-2 border-foreground/20 open:border-foreground"
            >
              <summary className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm font-semibold">
                <span>{section.name}</span>
                <span className="text-[11px] font-normal text-muted-foreground">
                  {heardIds.length > 0 ? <span className="mr-2 text-primary">✓ {heardIds.length} heard</span> : null}
                  {done}/{section.fields.length}
                </span>
              </summary>
              <div className="grid gap-x-4 border-t border-foreground/15 px-3 py-2 sm:grid-cols-2">
                {section.fields.map((field) => (
                  <BankFieldInput
                    key={field.id}
                    field={field}
                    value={values[field.id]}
                    onChange={onChange}
                    heard={{
                      heard: heardByVoice(values[field.id], fieldSource[field.id]),
                      quote: said[field.id] ?? '',
                      filling: Boolean(flashIds?.has(field.id)) && isFilled(values[field.id]),
                    }}
                  />
                ))}
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}
