import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FormVersion } from '../../../shared/forms/types';
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

  it('lists only the fields to review, lowest first, and links rows with boxes at 1365px', async () => {
    const user = userEvent.setup();
    renderReview(1365);

    const review = screen.getByRole('table', { name: 'Fields to review' });
    const labels = within(review).getAllByRole('textbox', { name: 'Label' });
    expect(labels).toHaveLength(8);
    expect(labels[0]).toHaveValue('Annual income');
    // Auto-accepted fields are not listed anywhere, only counted.
    expect(screen.queryByDisplayValue('Full name')).not.toBeInTheDocument();
    expect(screen.getByText(/4 other fields were read with high confidence/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled();

    fireEvent.click(labels[0].closest('tr') as HTMLElement);
    expect(screen.getByRole('button', { name: 'Annual income field' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'PAN field' }));
    expect(within(review).getByDisplayValue('PAN').closest('tr')).toHaveAttribute('aria-selected', 'true');
  });

  it('draws only the boxes to review, and a resize handle only on the selected box', async () => {
    const user = userEvent.setup();
    renderReview(1365);

    expect(screen.queryByRole('button', { name: 'Full name field' })).not.toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: /^Resize / })).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'PAN field' }));
    expect(screen.getAllByRole('button', { name: /^Resize / }).map((node) => node.getAttribute('aria-label'))).toEqual([
      'Resize PAN',
    ]);

    expect(screen.queryByRole('checkbox', { name: /auto-accepted/i })).not.toBeInTheDocument();
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

    // Mobile box at x 48, 200pt wide, y 700-724: screen top 118.
    const box = screen.getByRole('button', { name: 'Mobile field' });
    await act(async () => {
      box.dispatchEvent(pointerAt('pointerdown', 148, 130));
      window.dispatchEvent(pointerAt('pointermove', 188, 130));
      window.dispatchEvent(pointerAt('pointerup', 188, 130));
    });

    const positioned = box.parentElement as HTMLDivElement;
    expect(positioned.style.left).toBe(`${(88 / 595) * 100}%`);
  });

  it('publishes once every low-confidence field is confirmed or removed', async () => {
    const user = userEvent.setup();
    const { publish } = renderReview(1365);
    const publishButton = screen.getByRole('button', { name: 'Publish' });
    expect(publishButton).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Remove Annual income' }));
    expect(screen.queryByDisplayValue('Annual income')).not.toBeInTheDocument();
    expect(publishButton).toBeDisabled();

    const checks = screen.getAllByRole('checkbox', { name: /^Confirm / });
    expect(checks).toHaveLength(7);
    for (const check of checks.slice(0, -1)) await user.click(check);
    expect(publishButton).toBeDisabled();
    await user.click(checks[checks.length - 1]);
    expect(publishButton).toBeEnabled();
    await user.click(publishButton);

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Publish this form?');
    await user.click(within(dialog).getByRole('button', { name: 'Publish' }));
    expect(publish).toHaveBeenCalledTimes(1);
    const sent = (publish.mock.calls[0] as unknown as [FormVersion])[0];
    expect(sent.fields).toHaveLength(11);
    expect(sent.fields.some((field) => field.id === 'annual_income')).toBe(false);
    expect(sent.fields.every((field) => field.checked)).toBe(true);
    expect(await screen.findByRole('status')).toHaveTextContent('Published.');
  });

  it('brings a removed field back with Undo', async () => {
    const user = userEvent.setup();
    renderReview(1365);
    await user.click(screen.getByRole('button', { name: 'Remove PAN' }));
    expect(screen.queryByDisplayValue('PAN')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByDisplayValue('PAN')).toBeInTheDocument();
  });

  it('stacks the field list at about 400px', async () => {
    const user = userEvent.setup();
    renderReview(400);

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Fields to review' });
    expect(list).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Page 1' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Page 2' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'PAN field' }));
    const card = screen.getByDisplayValue('PAN').closest('li');
    expect(card).toHaveAttribute('aria-selected', 'true');
  });
});
