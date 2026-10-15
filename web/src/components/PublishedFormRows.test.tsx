import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { FormVersion } from '../../../shared/forms/types';
import { BANK_VARIES_COPY } from '../lib/schema';
import { PublishedFormRows } from './PublishedFormRows';
import { visiblePublishedForms } from '../lib/publishedForms';

function form(partial: Partial<FormVersion> & Pick<FormVersion, 'status' | 'bankId' | 'journey'>): FormVersion {
  return {
    formId: partial.formId ?? 'stored-row',
    version: 1,
    source: 'acroform',
    pdfPath: 'placeholder://two-page',
    fields: partial.fields ?? [],
    ...partial,
  };
}

describe('PublishedFormRows', () => {
  it('shows the bundled HDFC row when Firestore is empty or unavailable', async () => {
    const { rerender } = render(<PublishedFormRows journey="account_opening" load={async () => null} />);
    expect(await screen.findByText('HDFC')).toBeInTheDocument();
    expect(screen.getByText('Account Opening Form — Individuals')).toBeInTheDocument();
    expect(screen.getByText(BANK_VARIES_COPY)).toBeInTheDocument();

    rerender(<PublishedFormRows journey="kyc_update" load={async () => []} />);
    expect(await screen.findByText('KYC — Resident Individual')).toBeInTheDocument();
    expect(screen.getByText('HDFC')).toBeInTheDocument();
  });

  it('lists published forms and never drafts', async () => {
    const forms = [
      form({ status: 'draft', bankId: 'Draft Bank', journey: 'kyc_update', formId: 'draft-row' }),
      form({ status: 'published', bankId: 'Axis', journey: 'kyc_update', formId: 'axis-row', fields: [] }),
      form({ status: 'published', bankId: 'HDFC', journey: 'rekyc', formId: 'other-journey' }),
      form({ status: 'retired', bankId: 'Retired Bank', journey: 'kyc_update', formId: 'retired-row' }),
    ];
    expect(visiblePublishedForms(forms, 'kyc_update')).toHaveLength(1);

    render(<PublishedFormRows journey="kyc_update" load={async () => forms} />);
    expect(await screen.findByText('Axis')).toBeInTheDocument();
    expect(screen.getByText(BANK_VARIES_COPY)).toBeInTheDocument();
    expect(screen.queryByText('Draft Bank')).not.toBeInTheDocument();
    expect(screen.queryByText('Retired Bank')).not.toBeInTheDocument();
    expect(screen.queryByText('KYC — Resident Individual')).not.toBeInTheDocument();
  });
});
