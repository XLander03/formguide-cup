/** Aadhaar may be chosen as an ID type. Never store a number or a consent flag. */

export const AADHAAR_OVD = 'proof_of_possession_of_aadhaar';

export function isAadhaarOvd(value: unknown): boolean {
  return value === AADHAAR_OVD;
}

function isAadhaarKey(key: string): boolean {
  return /aadhaar|aadhar/i.test(key);
}

/** Remove Aadhaar number and consent keys. The document-type value is kept. */
export function omitAadhaarKeys<T extends Record<string, unknown>>(values: T): T {
  const next = { ...values };
  for (const key of Object.keys(next)) {
    if (isAadhaarKey(key)) delete next[key];
  }
  return next;
}

/**
 * Full draft: drop Aadhaar keys, and drop a document number when that
 * document's type is Aadhaar so the choice records only the type.
 */
export function withoutAadhaarNumbers<T extends Record<string, unknown>>(values: T): T {
  const next = omitAadhaarKeys(values);
  if (isAadhaarOvd(next.ovd_poi_type)) delete next.ovd_poi_number;
  if (isAadhaarOvd(next.ovd_poa_type)) delete next.ovd_poa_number;
  return next;
}
