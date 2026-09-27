import { FIELD_GROUPS, SCHEMA } from '../lib/schema';
import type { FormValues } from '../lib/types';
import { FieldInput } from './FieldInput';

interface Props {
  values: FormValues;
  flashIds: Set<string>;
  onChange: (id: string, value: string | boolean | null) => void;
}

export function FormSections({ values, flashIds, onChange }: Props) {
  return (
    <div className="form-sections">
      {FIELD_GROUPS.map((g) => {
        const fields = SCHEMA.fields.filter((f) => f.group === g.id);
        return (
          <section key={g.id} className="section" id={`group-${g.id}`}>
            <div className="section-head">
              <div>
                <h3>{g.title}</h3>
                <p>{g.blurb}</p>
              </div>
            </div>
            <div className="section-body">
              {fields.map((f) => (
                <FieldInput
                  key={f.id}
                  field={f}
                  value={values[f.id]}
                  values={values}
                  highlight={flashIds.has(f.id)}
                  onChange={onChange}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
