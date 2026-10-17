import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AdminApp } from './AdminApp';
import { resetMockConsole } from './mockConsole';
import { parseAdminLocation } from './routes';

beforeEach(() => {
  resetMockConsole();
  sessionStorage.clear();
  window.history.pushState({}, '', '/admin?mock=1');
});

afterEach(() => {
  window.history.pushState({}, '', '/');
});

describe('AdminApp in mock mode', () => {
  it('opens the console at /admin and moves between Overview and Upload', async () => {
    const user = userEvent.setup();
    render(<AdminApp initial={parseAdminLocation('/admin') ?? { name: 'upload' }} />);

    expect(await screen.findByRole('heading', { name: 'Forms' })).toBeInTheDocument();
    expect(document.title).toBe('Admin console — FormGuide');
    const nav = screen.getByRole('navigation', { name: 'Admin' });
    expect(within(nav).getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
    expect(await screen.findByRole('table', { name: 'Forms' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Customer site/ })).toHaveAttribute('href', '/');

    await user.click(within(nav).getByRole('link', { name: 'Upload' }));
    expect(screen.getByRole('heading', { name: 'Upload a form' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/admin/upload');
    expect(window.location.search).toBe('?mock=1');
    expect(within(nav).getByRole('link', { name: 'Upload' })).toHaveAttribute('aria-current', 'page');

    await user.click(screen.getByRole('button', { name: '← Back to console' }));
    expect(await screen.findByRole('heading', { name: 'Forms' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/admin');
  });

  it('unpublishes a mock form and the list reloads with it as a draft', async () => {
    const user = userEvent.setup();
    render(<AdminApp initial={{ name: 'console' }} />);

    await user.click(await screen.findByRole('button', { name: 'Unpublish ICICI · KYC update' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Unpublish' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Review ICICI · KYC update' })).toBeInTheDocument());
  });
});
