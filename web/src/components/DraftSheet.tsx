import { FIELD_GROUPS, SCHEMA, fieldLabel, isFilled } from '../lib/schema';
import type { FormValues } from '../lib/types';
import { hindiEnumLabel } from '../lib/utteranceLang';
import { maskAadhaarLike } from '../lib/pii';
import type { ShellLanguage } from '../session/FormSession';

function displayValue(
  fieldId: string,
  value: FormValues[string],
  values: FormValues,
  language: ShellLanguage | null,
): string {
  if (value === true) return language === 'hi' ? 'हाँ' : 'Yes';
  if (value === false) return language === 'hi' ? 'नहीं' : 'No';
  if (typeof value !== 'string') return '';
  let trimmed = value.trim();
  if (!trimmed) return '';
  // Defense in depth: mask here too even though state is already masked
  // upstream, in case a future code path writes a raw value directly.
  const aadhaarField =
    (fieldId === 'ovd_poi_number' && values.ovd_poi_type === 'proof_of_possession_of_aadhaar') ||
    (fieldId === 'ovd_poa_number' && values.ovd_poa_type === 'proof_of_possession_of_aadhaar');
  if (aadhaarField && /\d/.test(trimmed)) trimmed = maskAadhaarLike(trimmed);
  return language === 'hi' ? hindiEnumLabel(trimmed) : trimmed.replace(/_/g, ' ');
}

export function DraftSheet({
  values,
  language,
  omitGroups = ['confirm_gates'],
}: {
  values: FormValues;
  language: ShellLanguage | null;
  omitGroups?: readonly string[];
}) {
  const groups = FIELD_GROUPS.filter((group) => !omitGroups.includes(group.id));

  return (
    <div className="draft-sheet">
      {groups.map((group) => {
        const rows = SCHEMA.fields
          .filter((field) => field.group === group.id && isFilled(values[field.id]))
          .map((field) => ({
            id: field.id,
            label: fieldLabel(field.id),
            value: displayValue(field.id, values[field.id], values, language),
          }));
        return (
          <section key={group.id} className="draft-group">
            <h3>{group.title}</h3>
            {rows.length === 0 ? (
              <p className="draft-empty">Nothing captured in this section yet.</p>
            ) : (
              <dl>
                {rows.map((row) => (
                  <div key={row.id}>
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
        );
      })}
    </div>
  );
}
