import { describe, expect, it } from 'vitest';
import type { FormVersion } from '../../../shared/forms/types';
import { HDFC_V1 } from '../forms/hdfcV1';
import { journeyRows, publishedBundledBankForm, visiblePublishedForms } from './publishedForms';

/** As PublishedFormRows calls it: the catalog filtered to the journey first. */
const rowsFor = (forms: FormVersion[], journey: string) => journeyRows(visiblePublishedForms(forms, journey), journey);

function published(formId: string, bankId: string, journey: string): FormVersion {
  return { formId, version: 'v1', bankId, journey, status: 'published', source: 'ocr', pdfPath: `forms/${formId}`, fields: [] };
}

const HDFC_AOF = published('form_hdfc_aof', 'HDFC', 'account_opening');
const HDFC_REKYC = published('form_hdfc_rekyc', 'HDFC', 'rekyc');
const AXIS_AOF = published('form_axis_aof', 'Axis', 'account_opening');

describe('default form for a journey', () => {
  it("lists HDFC's published form first, in place of the bundled KYC form", () => {
    const rows = rowsFor([AXIS_AOF, HDFC_AOF, HDFC_REKYC], 'account_opening');
    expect(rows.map((row) => row.form.formId)).toEqual(['form_hdfc_aof', 'form_axis_aof']);
    expect(rows.some((row) => row.form === HDFC_V1)).toBe(false);
  });

  it('keeps the bundled HDFC form first when HDFC has nothing published for the journey', () => {
    const rows = rowsFor([AXIS_AOF, HDFC_REKYC], 'kyc_update');
    expect(rows[0].form).toBe(HDFC_V1);
    expect(rowsFor([AXIS_AOF], 'account_opening').map((row) => row.form.formId)).toEqual([HDFC_V1.formId, 'form_axis_aof']);
  });

  it('only counts a published HDFC form for this journey', () => {
    expect(publishedBundledBankForm([HDFC_REKYC, AXIS_AOF], 'account_opening')).toBeNull();
    expect(publishedBundledBankForm([HDFC_REKYC], 'rekyc')).toBe(HDFC_REKYC);
    expect(publishedBundledBankForm([{ ...HDFC_REKYC, status: 'draft' }], 'rekyc')).toBeNull();
    expect(publishedBundledBankForm(null, 'rekyc')).toBeNull();
  });

  it("defaults a card reissue to a bank's card form, since the bundled form has no card PDF", () => {
    const DBS_CARD = published('form_dbs_card', 'DBS', 'debit_reissue');
    const rows = rowsFor([DBS_CARD, AXIS_AOF], 'debit_reissue');
    expect(rows.map((row) => row.form.formId)).toEqual(['form_dbs_card', HDFC_V1.formId]);
    expect(rowsFor([AXIS_AOF], 'debit_reissue')[0].form).toBe(HDFC_V1);
  });
});
