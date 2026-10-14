/** Aadhaar may be chosen as an ID type. Never store a number or a consent flag. */

export const AADHAAR_OVD = 'proof_of_possession_of_aadhaar';

export function isAadhaarOvd(value: unknown): boolean {
  return value === AADHAAR_OVD;
}

/** Drop a document number when that document's type is Aadhaar. */
export function dropAadhaarNumbers<T extends Record<string, unknown>>(
  current: T,
  updates: T,
): T {
  const next = { ...updates };
  for (const key of Object.keys(next)) {
    if (/aadhaar|aadhar/i.test(key)) delete next[key];
  }
  const poi = next.ovd_poi_type ?? current.ovd_poi_type;
  const poa = next.ovd_poa_type ?? current.ovd_poa_type;
  if (isAadhaarOvd(poi)) delete next.ovd_poi_number;
  if (isAadhaarOvd(poa)) delete next.ovd_poa_number;
  return next;
}
