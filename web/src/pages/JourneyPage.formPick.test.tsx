import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HDFC_V1 } from '../forms/hdfcV1';
import type { FormVersion } from '../forms/types';
import { RouteProvider } from '../routing/router';
import { FormSessionProvider, useFormSession, type FormSessionValue } from '../session/FormSession';
import { JourneyPage } from './JourneyPage';

const AXIS_REKYC: FormVersion = {
  formId: 'axis_rekyc',
  version: 'v1',
  bankId: 'Axis',
  journey: 'rekyc',
  status: 'published',
  source: 'ocr',
  pdfPath: 'forms/axis_rekyc/versions/v1/source.pdf',
  fields: [],
};

vi.mock('../lib/publishedForms', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/publishedForms')>();
  return {
    ...actual,
    listPublishedForms: async (journey: string) => actual.visiblePublishedForms([AXIS_REKYC], journey),
  };
});

let session: FormSessionValue;
function Probe() {
  session = useFormSession();
  return null;
}

function mount() {
  sessionStorage.clear();
  window.history.pushState({}, '', '/journey');
  render(
    <RouteProvider>
      <FormSessionProvider>
        <Probe />
        <JourneyPage />
      </FormSessionProvider>
    </RouteProvider>,
  );
}

describe('JourneyPage form pick', () => {
  it('starts the draft on the picked published form', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Re-KYC/ }));
    fireEvent.click((await screen.findByText('Axis')).closest('button') as HTMLButtonElement);
    const start = screen.getByRole('button', { name: /Start filling Re-KYC · Axis/ });
    fireEvent.click(start);
    expect(session.form).toBe(AXIS_REKYC);
    expect(session.journey).toBe('rekyc');
  });

  it('falls back to HDFC when the picked form does not cover the chosen journey', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Re-KYC/ }));
    fireEvent.click((await screen.findByText('Axis')).closest('button') as HTMLButtonElement);
    fireEvent.click(screen.getByRole('button', { name: /KYC update/ }));
    fireEvent.click(screen.getByRole('button', { name: /Start filling KYC update · HDFC/ }));
    expect(session.form).toBe(HDFC_V1);
  });
});
