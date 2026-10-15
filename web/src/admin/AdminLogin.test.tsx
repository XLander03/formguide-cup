import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AdminLogin } from './AdminLogin';

describe('AdminLogin', () => {
  it('asks for the Cup admin email and password and shows a plain failure', async () => {
    const user = userEvent.setup();
    const onSignIn = vi.fn(async () => ({ ok: false as const, reason: 'Wrong email or password.' }));
    render(<AdminLogin onSignIn={onSignIn} />);

    await user.type(screen.getByLabelText('Email'), 'someone@example.com');
    await user.type(screen.getByLabelText('Password'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(onSignIn).toHaveBeenCalledWith('someone@example.com', 'secret');
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong email or password.');
    expect(screen.getByText(/does not create it/i)).toBeInTheDocument();
  });
});
