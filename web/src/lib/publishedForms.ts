import type { FormVersion } from '../../../shared/forms/types';
import { firebaseWebConfig } from '../admin/firebaseConfig';
import { JOURNEYS } from './journeys';

export const FORM_VERSIONS_COLLECTION = 'formVersions';

export interface PublishedFormRow {
  key: string;
  bankName: string;
  detail: string;
}

export function hdfcFallbackRows(journey: string): PublishedFormRow[] {
  const match = JOURNEYS.find((item) => item.id === journey);
  const hdfc = match?.corpus.filter((item) => item.bank === 'HDFC') ?? [];
  if (hdfc.length === 0) {
    return [{ key: `hdfc-${journey}`, bankName: 'HDFC', detail: 'Bundled form' }];
  }
  return hdfc.map((item) => ({
    key: `hdfc-${journey}-${item.title}`,
    bankName: item.bank,
    detail: item.title,
  }));
}

/** Drafts and other journeys never become rows. Null means Firestore was unavailable. */
export function visiblePublishedForms(forms: FormVersion[] | null, journey: string): FormVersion[] | null {
  if (!forms) return null;
  return forms.filter((form) => form.status === 'published' && form.journey === journey);
}

export function rowsFromPublished(forms: FormVersion[]): PublishedFormRow[] {
  return forms.map((form) => ({
    key: `${form.formId}@${form.version}`,
    bankName: form.bankId || 'Bank',
    detail: `${form.fields.length} fields`,
  }));
}

export async function listPublishedForms(journey: string): Promise<FormVersion[] | null> {
  const config = firebaseWebConfig();
  if (!config) return null;
  try {
    const { initializeApp, getApps } = await import('firebase/app');
    const { collection, getDocs, getFirestore, query, where } = await import('firebase/firestore');
    const app = getApps().length ? getApps()[0] : initializeApp(config);
    const snap = await getDocs(
      query(collection(getFirestore(app), FORM_VERSIONS_COLLECTION), where('status', '==', 'published')),
    );
    const forms = snap.docs.map((doc) => doc.data() as FormVersion);
    return visiblePublishedForms(forms, journey) ?? [];
  } catch {
    return null;
  }
}
