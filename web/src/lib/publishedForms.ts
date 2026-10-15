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
  /** Only the bundled HDFC v1 is carried through questions, review, voice and PDF today. */
  selectable: boolean;
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
  return [{ key: `hdfc-${journey}`, bankName: HDFC_V1.bankId, detail: 'Bundled form', selectable: true }];
}

/**
 * The bundled HDFC row always comes first, because it is the form every later step fills.
 * Other published banks are listed after it but are not selectable yet.
 */
export function journeyRows(published: FormVersion[] | null, journey: string): PublishedFormRow[] {
  const others = (published ?? []).filter((form) => form.formId !== BUNDLED_FORM_ID);
  return [...hdfcFallbackRows(journey), ...rowsFromPublished(others)];
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
    selectable: form.formId === BUNDLED_FORM_ID,
  }));
}

/**
 * Published versions written by ingest and publish.
 * With no Firebase web config, or if the catalog request fails, the bundled HDFC v1 is used.
 * Firestore rules are not required: the list comes from the Admin SDK function.
 */
export async function listPublishedForms(journey: string): Promise<FormVersion[] | null> {
  const config = firebaseWebConfig();
  if (config?.projectId) {
    try {
      const response = await fetch('/api/publishedForms');
      if (response.ok) {
        const body = (await response.json()) as { forms?: FormVersion[] };
        if (Array.isArray(body.forms)) return visiblePublishedForms(body.forms, journey);
      }
    } catch {
      // The journey page keeps the bundled HDFC row when the catalog is down.
    }
  }
  const forms = await loadPublishedFormVersions({});
  return visiblePublishedForms(forms, journey);
}
