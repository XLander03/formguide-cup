import type { FormValues, SchemaField } from '../lib/types';
import { enumsFor, isEffectivelyRequired, isFieldApplicable, isFilled } from '../lib/schema';

interface Props {
  field: SchemaField;
  value: FormValues[string];
  values: FormValues;
  highlight?: boolean;
  onChange: (id: string, value: string | boolean | null) => void;
}

export function FieldInput({ field, value, values, highlight, onChange }: Props) {
  if (field.required_if && !isFieldApplicable(field, values)) {
    return null;
  }

  const required = isEffectivelyRequired(field, values);
  const filled = isFilled(value);
  const enums = enumsFor(field);
  const cls = `field${filled ? ' filled' : ''}${highlight ? ' flash' : ''}${
    field.type === 'boolean' ? ' bool' : ''
  }`;

  if (field.type === 'boolean') {
    const checked = value === true;
    return (
      <div className={cls}>
        <input
          id={field.id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(field.id, e.target.checked)}
        />
        <label htmlFor={field.id}>
          {field.label_en}
          {required ? <span className="req">*</span> : null}
        </label>
      </div>
    );
  }

  if (field.type === 'enum' && enums) {
    return (
      <div className={cls}>
        <label htmlFor={field.id}>
          {field.label_en}
          {required ? <span className="req">*</span> : null}
        </label>
        <select
          id={field.id}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(field.id, e.target.value)}
        >
          <option value="">— select —</option>
          {enums.map((opt) => (
            <option key={opt} value={opt}>
              {opt.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </div>
    );
  }

  const inputType = field.type === 'date' ? 'date' : 'text';
  return (
    <div className={cls}>
      <label htmlFor={field.id}>
        {field.label_en}
        {required ? <span className="req">*</span> : null}
      </label>
      <input
        id={field.id}
        type={inputType}
        value={typeof value === 'string' || typeof value === 'number' ? String(value) : ''}
        onChange={(e) => onChange(field.id, e.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
    </div>
  );
}
