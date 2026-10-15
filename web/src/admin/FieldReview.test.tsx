import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FieldReview } from './FieldReview';
import { placeholderFormVersion } from './placeholderForm';
import { setViewport } from '../test/viewport';

function pointerAt(type: string, clientX: number, clientY: number): MouseEvent {
  const event = document.createEvent('MouseEvent');
  event.initMouseEvent(
    type,
    true,
    true,
    null as unknown as Window,
    0,
    clientX,
    clientY,
    clientX,
    clientY,
    false,
    false,
    false,
    false,
    0,
    null,
  );
  return event;
}

const pages = [
  { width: 595, height: 842 },
  { width: 595, height: 842 },
];

function renderReview(width: number) {
  setViewport(width);
  const publish = vi.fn(async () => {});
  const form = placeholderFormVersion({ bankId: 'HDFC', journey: 'account_opening', fillable: true });
  function Harness() {
    const [key] = useState(width);
    return <FieldReview key={key} form={form} pages={pages} publish={publish} />;
  }
  render(<Harness />);
  return { publish, form };
}

describe('FieldReview', () => {
  beforeEach(() => setViewport(1365));

  it('sorts lowest confidence first and links rows with boxes at 1365px', async () => {
    const user = userEvent.setup();
    renderReview(1365);

    expect(screen.getByRole('table')).toBeInTheDocument();
    const labels = screen.getAllByRole('textbox', { name: 'Label' });
    expect(labels[0]).toHaveValue('Annual income');
    expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled();

    fireEvent.click(labels[0].closest('tr') as HTMLElement);
    expect(screen.getByRole('button', { name: 'Annual income field' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Full name field' }));
    expect(screen.getByDisplayValue('Full name').closest('tr')).toHaveAttribute('aria-selected', 'true');
  });

  it('drags a box and snaps it inside the page', async () => {
    renderReview(1365);
    const page = screen.getByRole('img', { name: 'Page 1' }).parentElement as HTMLDivElement;
    vi.spyOn(page, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 595,
      bottom: 842,
      width: 595,
      height: 842,
      toJSON() {
        return {};
      },
    });

    const box = screen.getByRole('button', { name: 'Full name field' });
    await act(async () => {
      box.dispatchEvent(pointerAt('pointerdown', 188, 70));
      window.dispatchEvent(pointerAt('pointermove', 228, 70));
      window.dispatchEvent(pointerAt('pointerup', 228, 70));
    });

    const positioned = box.parentElement as HTMLDivElement;
    expect(positioned.style.left).toBe(`${(88 / 595) * 100}%`);
  });

  it('publishes only after low-confidence rows are checked and confirmed', async () => {
    const user = userEvent.setup();
    const { publish } = renderReview(1365);
    const publishButton = screen.getByRole('button', { name: 'Publish' });
    expect(publishButton).toBeDisabled();

    const checks = screen.getAllByRole('checkbox', { name: 'Checked' });
    await user.click(checks[0]);
    expect(publishButton).toBeDisabled();

    for (const check of checks) {
      if (!(check as HTMLInputElement).checked) await user.click(check);
    }
    expect(publishButton).toBeEnabled();
    await user.click(publishButton);

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Publish this form?');
    await user.click(within(dialog).getByRole('button', { name: 'Publish' }));
    expect(publish).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('status')).toHaveTextContent('Published.');
  });

  it('stacks the field list at about 400px', async () => {
    const user = userEvent.setup();
    renderReview(400);

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Fields' });
    expect(list).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Page 1' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Page 2' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'PAN field' }));
    const card = screen.getByDisplayValue('PAN').closest('li');
    expect(card).toHaveAttribute('aria-selected', 'true');
  });
});
