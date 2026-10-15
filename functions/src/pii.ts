/**
 * aof_kyc_demo_v1's own schema notes require Aadhaar to be stored masked
 * (last 4 digits only) and never logged in full. This is the single choke
 * point for that rule on the client — applied wherever a value can enter
 * form state, so it never reaches sessionStorage, the screen, or a
 * downloaded file unmasked.
 */

const AADHAAR_TYPE = 'proof_of_possession_of_aadhaar';

export function maskAadhaarLike(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return raw;
  const last4 = digits.slice(-4).padStart(4, '•');
  return `•••• •••• ${last4}`;
}

function isAadhaarNumber(fieldId: string, values: Record<string, unknown>): boolean {
  if (fieldId === 'ovd_poi_number') return values.ovd_poi_type === AADHAAR_TYPE;
  if (fieldId === 'ovd_poa_number') return values.ovd_poa_type === AADHAAR_TYPE;
  return false;
}

const DEFAULT_AADHAAR_PARTIAL_IDS = ['ovd_poi_number', 'ovd_poa_number'] as const;

/** Quoted "said" text for an Aadhaar document number is redacted, not just the stored value. */
export function shouldRedactAadhaarQuote(
  fieldId: string,
  poiType: unknown,
  poaType: unknown,
  partialIds: readonly string[] = DEFAULT_AADHAAR_PARTIAL_IDS,
): boolean {
  if (!partialIds.includes(fieldId)) return false;
  return isAadhaarNumber(fieldId, { ovd_poi_type: poiType, ovd_poa_type: poaType });
}

/**
 * Mask in place. `updates` is the (possibly sparse) object being mutated;
 * `resolved` is the fully-merged values to resolve OVD type from — the type
 * may have been set in an earlier turn and absent from `updates` itself.
 * Defaults `resolved` to `updates` for the common case where both are the
 * same already-merged object.
 */
export function maskSensitiveFields(
  updates: Record<string, unknown>,
  resolved: Record<string, unknown> = updates,
  partialIds: readonly string[] = DEFAULT_AADHAAR_PARTIAL_IDS,
): void {
  for (const fieldId of partialIds) {
    const value = updates[fieldId];
    if (typeof value === 'string' && value && isAadhaarNumber(fieldId, resolved)) {
      updates[fieldId] = maskAadhaarLike(value);
    }
  }
}
