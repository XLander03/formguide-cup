import { isAadhaarOvd } from '../lib/aadhaarScope';
import { FIELD_GROUPS, SCHEMA } from '../lib/schema';
import type { FormValues } from '../lib/types';
import { FieldInput } from './FieldInput';

interface Props {
  values: FormValues;
  flashIds: Set<string>;
  onChange: (id: string, value: string | boolean | null) => void;
  /** Limit which schema groups render. Omit to show every group. */
  groups?: readonly string[];
}

export function FormSections({ values, flashIds, onChange, groups }: Props) {
  const visible = groups
    ? FIELD_GROUPS.filter((g) => groups.includes(g.id))
    : FIELD_GROUPS;
  return (
    <div className="form-sections">
      {visible.map((g) => {
        const fields = SCHEMA.fields.filter((f) => {
          if (f.group !== g.id || /aadhaar|aadhar/i.test(f.id)) return false;
          if (f.id === 'ovd_poi_number' && isAadhaarOvd(values.ovd_poi_type)) return false;
          if (f.id === 'ovd_poa_number' && isAadhaarOvd(values.ovd_poa_type)) return false;
          return true;
        });
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
