import { SCHEMA, isEffectivelyRequired, isFilled, reviewSections } from '../lib/schema';
import { fieldIssue } from '../lib/validate';
import type { FormValues } from '../lib/types';
import { hindiEnumLabel } from '../lib/utteranceLang';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const GROUP_TITLE: Record<string, string> = {
  identity: 'Identity',
  contact: 'Contact',
  address: 'Address',
  kyc_ovd: 'Proof of identity',
  account_refs: 'Account',
  profile_light: 'Profile',
};

export function displayValue(id: string, value: FormValues[string], hindi = false): string {
  if (value === true) return hindi ? 'हाँ' : 'Yes';
  if (value === false) return hindi ? 'नहीं' : 'No';
  if (typeof value !== 'string' || !value.trim()) return '—';
  if (id === 'dob' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return `${day} ${MONTHS[(month || 1) - 1]} ${year}`;
  }
  if (id === 'pan_number') return value.toUpperCase();
  if (id === 'mobile_registered' && /^\d{10}$/.test(value)) {
    return `${value.slice(0, 5)} ${value.slice(5)}`;
  }
  const text = value.replace(/_/g, ' ');
  return hindi ? hindiEnumLabel(value) : text;
}

export function draftChoiceLabel(journey: string | null | undefined, product: unknown): string {
  if (journey === 'kyc_update') return 'KYC update';
  if (journey === 'rekyc') return 'Re-KYC';
  if (product === 'salary_savings') return 'Salary account';
  if (product === 'bsbda') return 'Basic savings';
  if (product === 'individual_current') return 'Individual current';
  return 'Regular savings';
}

export function requiredProgress(values: FormValues): { filled: number; total: number } {
  const required = SCHEMA.fields.filter(
    (field) => field.group !== 'confirm_gates' && isEffectivelyRequired(field, values),
  );
  return {
    total: required.length,
    filled: required.filter((field) => isFilled(values[field.id])).length,
  };
}

/** Schema required count is 22, including the three confirm gates. Speak shows that, not the live conditional total. */
export function staticRequiredProgress(values: FormValues): { filled: number; total: number } {
  const required = SCHEMA.fields.filter((field) => field.required === true);
  return {
    total: required.length,
    filled: required.filter((field) => isFilled(values[field.id])).length,
  };
}

const SPEAK_GROUPS: { title: string; rows: { id: string; label: string }[] }[] = [
  { title: 'Identity', rows: [{ id: 'applicant_full_name', label: 'Full name' }] },
  {
    title: 'Address',
    rows: [
      { id: 'addr_current_city', label: 'City' },
      { id: 'addr_current_pin', label: 'PIN code' },
    ],
  },
  { title: 'Proof of identity', rows: [{ id: 'ovd_poi_type', label: 'Document type' }] },
];

export function CompactSpeakGroups({
  values,
  flashIds,
  hindi = false,
}: {
  values: FormValues;
  flashIds: Set<string>;
  hindi?: boolean;
}) {
  return (
    <div className="space-y-5">
      {SPEAK_GROUPS.map((group, index) => {
        const confirmed = group.rows.filter(
          (row) => isFilled(values[row.id]) && !flashIds.has(row.id),
        ).length;
        return (
          <section key={group.title} className="fg-rise" style={{ animationDelay: `${index * 80}ms` }}>
            <div className="mb-2 flex items-center justify-between text-[10px] uppercase text-muted-foreground">
              <h3>
                Group {String.fromCharCode(65 + index)} · {group.title}
              </h3>
              <span>
                {confirmed}/{group.rows.length}
              </span>
            </div>
            <div className={`border-l-2 pl-3 ${index === 0 ? 'border-primary' : 'border-foreground/25'}`}>
              {group.rows.map((row) => {
                const filled = isFilled(values[row.id]);
                const filling = flashIds.has(row.id) && filled;
                const state = filling ? 'filling' : filled ? 'confirmed' : 'missing';
                return (
                  <div
                    key={row.id}
                    className="grid grid-cols-[1fr_auto] gap-3 border-b border-foreground/15 py-2.5"
                  >
                    <div>
                      <p className="font-semibold">{row.label}</p>
                      <p className={state === 'missing' ? 'text-muted-foreground' : 'text-foreground/70'}>
                        {displayValue(row.id, values[row.id], hindi)}
                      </p>
                    </div>
                    <span
                      className={`self-start text-[11px] ${
                        state === 'confirmed'
                          ? 'text-primary'
                          : state === 'filling'
                            ? 'text-saffron'
                            : 'text-muted-foreground'
                      }`}
                    >
                      {state === 'confirmed' ? '✓ confirmed' : state === 'filling' ? '✎ filling' : '— awaiting'}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function FieldGroups({
  values,
  flashIds,
  hindi = false,
}: {
  values: FormValues;
  flashIds: Set<string>;
  hindi?: boolean;
}) {
  const groups = reviewSections(values);
  return (
    <div className="space-y-5">
      {groups.map((group, index) => {
        const fields = group.fields;
        const confirmed = fields.filter(
          (field) => isFilled(values[field.id]) && !flashIds.has(field.id),
        ).length;
        return (
          <section key={group.id} className="fg-rise" style={{ animationDelay: `${index * 80}ms` }}>
            <div className="mb-2 flex items-center justify-between text-[10px] uppercase text-muted-foreground">
              <h3>
                Group {String.fromCharCode(65 + index)} · {GROUP_TITLE[group.id] ?? group.title}
              </h3>
              <span>
                {confirmed}/{fields.length}
              </span>
            </div>
            <div className={`border-l-2 pl-3 ${index === 0 ? 'border-primary' : 'border-foreground/25'}`}>
              {fields.map((field) => {
                const filled = isFilled(values[field.id]);
                const issue = fieldIssue(field.id, values[field.id]);
                const filling = flashIds.has(field.id) && filled;
                const state = issue ? 'invalid' : filling ? 'filling' : filled ? 'confirmed' : 'missing';
                return (
                  <div
                    key={field.id}
                    className="grid grid-cols-[1fr_auto] gap-3 border-b border-foreground/15 py-2.5"
                  >
                    <div>
                      <p className="font-semibold">{field.label_en}</p>
                      <p className={state === 'missing' ? 'text-muted-foreground' : 'text-foreground/70'}>
                        {displayValue(field.id, values[field.id], hindi)}
                      </p>
                      {issue ? <p className="text-[11px] font-semibold text-destructive">{issue}</p> : null}
                    </div>
                    <span
                      className={`self-start text-[11px] ${
                        state === 'confirmed'
                          ? 'text-primary'
                          : state === 'invalid'
                            ? 'font-semibold text-destructive'
                            : state === 'filling'
                              ? 'text-saffron'
                              : 'text-muted-foreground'
                      }`}
                    >
                      {state === 'confirmed'
                        ? '✓ confirmed'
                        : state === 'invalid'
                          ? 'fix format'
                          : state === 'filling'
                            ? '✎ filling'
                            : '— awaiting'}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
