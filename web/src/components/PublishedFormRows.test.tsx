import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { FormVersion } from '../../../shared/forms/types';
import { HDFC_V1 } from '../forms/hdfcV1';
import { BANK_VARIES_COPY, NOT_SELECTABLE_COPY } from '../lib/schema';
import { listPublishedForms, visiblePublishedForms } from '../lib/publishedForms';
import { PublishedFormRows } from './PublishedFormRows';

function form(partial: Partial<FormVersion> & Pick<FormVersion, 'status' | 'bankId' | 'journey'>): FormVersion {
  return {
    formId: partial.formId ?? 'stored-row',
    version: 'v1',
    source: 'acroform',
    pdfPath: 'placeholder://two-page',
    fields: partial.fields ?? [],
    ...partial,
  };
}

describe('PublishedFormRows', () => {
  it('shows the bundled HDFC v1 row when Firestore is empty or unavailable', async () => {
    const detail = `${HDFC_V1.fields.length} fields`;
    const { rerender } = render(<PublishedFormRows journey="account_opening" load={async () => null} />);
    expect(await screen.findByText('HDFC')).toBeInTheDocument();
    expect(screen.getByText(detail)).toBeInTheDocument();
    expect(screen.getByText(BANK_VARIES_COPY)).toBeInTheDocument();
    expect(screen.queryByText('Account Opening Form — Individuals')).not.toBeInTheDocument();

    rerender(<PublishedFormRows journey="kyc_update" load={async () => []} />);
    expect(await screen.findByText(detail)).toBeInTheDocument();
    expect(screen.getByText('HDFC')).toBeInTheDocument();
    expect(screen.queryByText('KYC — Resident Individual')).not.toBeInTheDocument();
  });

  it('loads bundled HDFC v1 for each demo journey when Firebase web config is unset', async () => {
    for (const journey of ['account_opening', 'kyc_update', 'rekyc']) {
      const forms = await listPublishedForms(journey);
      expect(forms?.map((item) => `${item.formId}@${item.version}`)).toEqual(['aof_kyc_demo_v1@v1']);
      expect(forms?.[0]?.bankId).toBe('HDFC');
    }
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
    expect(screen.getByText('HDFC')).toBeInTheDocument();
    expect(screen.getByText(BANK_VARIES_COPY)).toBeInTheDocument();
    expect(screen.queryByText('Draft Bank')).not.toBeInTheDocument();
    expect(screen.queryByText('Retired Bank')).not.toBeInTheDocument();
    expect(screen.queryByText('KYC — Resident Individual')).not.toBeInTheDocument();
  });

  it('keeps HDFC first and selectable when another bank is published, and marks the other bank not selectable', async () => {
    const axis = form({
      status: 'published',
      bankId: 'Axis',
      journey: 'account_opening',
      formId: 'axis-aof',
      fields: Array.from({ length: 298 }, (_, i) => ({ id: `f${i}` }) as FormVersion['fields'][number]),
    });
    render(<PublishedFormRows journey="account_opening" load={async () => [axis]} />);

    const axisName = await screen.findByText('Axis');
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('HDFC');
    expect(items[0]).toHaveTextContent(`${HDFC_V1.fields.length} fields`);
    expect(items[0]).toHaveTextContent(BANK_VARIES_COPY);
    expect(items[0]).not.toHaveAttribute('aria-disabled');
    expect(axisName.closest('li')).toBe(items[1]);
    expect(items[1]).toHaveTextContent('298 fields');
    expect(items[1]).toHaveTextContent(NOT_SELECTABLE_COPY);
    expect(items[1]).toHaveAttribute('aria-disabled', 'true');
  });

  it('does not duplicate HDFC when the catalog also returns the bundled form', async () => {
    render(<PublishedFormRows journey="rekyc" load={async () => [HDFC_V1]} />);
    await screen.findByText('HDFC');
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.queryByText(NOT_SELECTABLE_COPY)).not.toBeInTheDocument();
  });
});
