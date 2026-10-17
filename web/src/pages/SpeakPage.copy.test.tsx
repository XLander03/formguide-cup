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
    // Demo helpers are hidden from customers.
    expect(screen.queryByRole('button', { name: /Load sample draft/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Try a sample phrase/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Read back$/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Sample person/i)).not.toBeInTheDocument();
  });

  it('shows the demo helpers with ?demo=1, and keeps them after the query string is gone', () => {
    sessionStorage.clear();
    window.history.pushState({}, '', '/speak?demo=1');
    const first = render(
      <RouteProvider>
        <FormSessionProvider>
          <SpeakPage />
        </FormSessionProvider>
      </RouteProvider>,
    );
    expect(screen.getByRole('button', { name: /Load sample draft/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Try a sample phrase/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Read back$/i })).toBeInTheDocument();
    first.unmount();

    window.history.pushState({}, '', '/speak');
    render(
      <RouteProvider>
        <FormSessionProvider>
          <SpeakPage />
        </FormSessionProvider>
      </RouteProvider>,
    );
    expect(screen.getByRole('button', { name: /Load sample draft/i })).toBeInTheDocument();
    sessionStorage.clear();
  });
});
