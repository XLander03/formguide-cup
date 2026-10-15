import type { FormVersion } from '../../../shared/forms/types';
import { firebaseWebConfig } from '../admin/firebaseConfig';
import { HDFC_V1 } from '../forms/hdfcV1';
import { loadPublishedFormVersions } from '../forms/loadPublished';
import { JOURNEY_IDS } from './journeys';

/** Bundled demo form. Its journey is the schema form type `aof_kyc`, and it covers every demo journey. */
const BUNDLED_FORM_ID = 'aof_kyc_demo_v1';

export interface PublishedFormRow {
  key: string;
  bankName: string;
  detail: string;
}

function isDemoJourney(journey: string): boolean {
  return (JOURNEY_IDS as readonly string[]).includes(journey);
}

/** A published row is visible when its journey matches, or it is the bundled HDFC v1 on a demo journey. */
export function appliesToJourney(form: FormVersion, journey: string): boolean {
  if (form.formId === BUNDLED_FORM_ID && isDemoJourney(journey)) return true;
  return form.journey === journey;
}

export function hdfcFallbackRows(journey: string): PublishedFormRow[] {
  const bundled = visiblePublishedForms([HDFC_V1], journey);
  if (bundled && bundled.length > 0) return rowsFromPublished(bundled);
  return [{ key: `hdfc-${journey}`, bankName: HDFC_V1.bankId, detail: 'Bundled form' }];
}

/** Drafts and other journeys never become rows. Null means the catalog could not be read. */
export function visiblePublishedForms(forms: FormVersion[] | null, journey: string): FormVersion[] | null {
  if (!forms) return null;
  return forms.filter((form) => form.status === 'published' && appliesToJourney(form, journey));
}

export function rowsFromPublished(forms: FormVersion[]): PublishedFormRow[] {
  return forms.map((form) => ({
    key: `${form.formId}@${form.version}`,
    bankName: form.bankId || 'Bank',
    detail: `${form.fields.length} fields`,
  }));
}

/**
 * Published versions from the FormVersion loader (`forms/{id}/versions/{v}`).
 * With no Firebase web config, or if the read fails, the loader returns bundled HDFC v1.
 */
export async function listPublishedForms(journey: string): Promise<FormVersion[] | null> {
  const config = firebaseWebConfig();
  const forms = await loadPublishedFormVersions(config?.projectId ? { projectId: config.projectId } : {});
  return visiblePublishedForms(forms, journey);
}
