/**
 * Masks sensitive values (document_number, pan) for the "said vs filled"
 * receipt, e.g. "P7412345621" -> "P•••••21".
 */
export function maskSensitive(value: string): string {
  const v = value.trim();
  if (v.length <= 3) return v.length ? `${v[0]}${'•'.repeat(Math.max(0, v.length - 1))}` : v;
  const head = v.slice(0, 1);
  const tail = v.slice(-2);
  const middle = '•'.repeat(v.length - 3);
  return `${head}${middle}${tail}`;
}
