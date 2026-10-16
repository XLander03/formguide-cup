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

function BankFieldInput({
  field,
  value,
  onChange,
}: {
  field: FieldRecord;
  value: FormValues[string];
  onChange: (id: string, value: string | boolean | null) => void;
}) {
  const id = `bank-${field.id}`;
  const marker = field.required ? <span className="ml-1 text-[10px] text-saffron">on form as required</span> : null;
  if (field.type === 'checkbox') {
    return (
      <label htmlFor={id} className="flex cursor-pointer items-start gap-2 py-1.5 text-sm">
        <input
          id={id}
          type="checkbox"
          className="mt-1 accent-primary"
          checked={value === true}
          onChange={(event) => onChange(field.id, event.target.checked)}
        />
        <span>
          {field.label}
          {marker}
        </span>
      </label>
    );
  }
  const text = typeof value === 'string' ? value : '';
  return (
    <div className="py-1.5">
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
          className={`${INPUT} mt-1`}
          value={text}
          maxLength={field.maxChars && field.maxChars > 0 ? field.maxChars : undefined}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => onChange(field.id, event.target.value)}
        />
      )}
    </div>
  );
}

/** Fields only the selected bank's form has. Optional in the draft; they print on that bank's PDF. */
export function BankFields({
  form,
  values,
  onChange,
}: {
  form: FormVersion;
  values: FormValues;
  onChange: (id: string, value: string | boolean | null) => void;
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
          return (
            <details key={section.name} className="border-2 border-foreground/20 open:border-foreground">
              <summary className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm font-semibold">
                <span>{section.name}</span>
                <span className="text-[11px] font-normal text-muted-foreground">
                  {done}/{section.fields.length}
                </span>
              </summary>
              <div className="grid gap-x-4 border-t border-foreground/15 px-3 py-2 sm:grid-cols-2">
                {section.fields.map((field) => (
                  <BankFieldInput key={field.id} field={field} value={values[field.id]} onChange={onChange} />
                ))}
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}
