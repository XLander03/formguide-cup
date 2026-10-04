import { maskSensitive } from './mask';
import { SFE_FIELDS, sfeIsFilled, type SfeFormValues } from './schema';

/**
 * Builds the spoken read-back script shown/spoken on the Review page,
 * e.g. "Your name is Ananya Rao. Your date of birth is 12 March 1992...".
 * Always in English — the deployed UI reads the draft back in English
 * regardless of the input language ("Read in English").
 */
export function sfeBuildReadback(values: SfeFormValues): string {
  const parts: string[] = [];
  for (const f of SFE_FIELDS) {
    const v = values[f.id];
    if (!sfeIsFilled(v)) continue;
    const spoken = f.sensitive ? maskSensitive(String(v)) : String(v);
    parts.push(`Your ${f.label.toLowerCase()} is ${spoken}.`);
  }
  if (parts.length === 0) return 'Nothing is filled yet. Speak your details to begin.';
  return parts.join(' ');
}
