import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RouteProvider } from '../routing/router';
import { FormSessionProvider } from '../session/FormSession';
import { SpeakPage } from './SpeakPage';

describe('Speak page copy', () => {
  it('does not show debug labels on the customer screen', () => {
    window.history.pushState({}, '', '/speak');
    render(
      <RouteProvider>
        <FormSessionProvider>
          <SpeakPage />
        </FormSessionProvider>
      </RouteProvider>,
    );
    expect(screen.queryByRole('button', { name: /Fake prefill/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/one dump can fill many/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/FAKE PREFILL/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Load sample draft/i })).toBeInTheDocument();
  });
});
