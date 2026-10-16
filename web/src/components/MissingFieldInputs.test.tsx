import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MissingFieldInputs } from './MissingFieldInputs';

describe('MissingFieldInputs', () => {
  it('shows only required fields the speak panel does not already show', () => {
    const onChange = vi.fn();
    render(
      <MissingFieldInputs
        missing={['ovd_poi_number', 'photo_consent', 'residential_status', 'addr_permanent_city']}
        shownIds={new Set(['ovd_poi_number'])}
        values={{}}
        onChange={onChange}
      />,
    );
    expect(screen.getByText('3 left')).toBeInTheDocument();
    expect(screen.queryByText(/Document number/)).not.toBeInTheDocument();

    const consent = screen.getByRole('group', { name: /Photograph \/ image capture consent/ });
    fireEvent.click(consent.querySelector('button') as HTMLButtonElement);
    expect(onChange).toHaveBeenCalledWith('photo_consent', true);

    fireEvent.change(screen.getByLabelText(/Residential status/), { target: { value: 'resident_individual' } });
    expect(onChange).toHaveBeenCalledWith('residential_status', 'resident_individual');

    fireEvent.change(screen.getByLabelText(/Permanent city/), { target: { value: 'Pune' } });
    expect(onChange).toHaveBeenCalledWith('addr_permanent_city', 'Pune');
  });

  it('renders nothing when every missing field is already on the panel', () => {
    const { container } = render(
      <MissingFieldInputs missing={['ovd_poi_number']} shownIds={new Set(['ovd_poi_number'])} values={{}} onChange={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a filled field with a format error even though it is not missing', () => {
    const onChange = vi.fn();
    render(
      <MissingFieldInputs
        missing={[]}
        invalid={['customer_id_cif']}
        shownIds={new Set()}
        values={{ customer_id_cif: '12' }}
        onChange={onChange}
      />,
    );
    const input = screen.getByLabelText(/Customer ID \/ CIF/) as HTMLInputElement;
    expect(input.value).toBe('12');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText(/Enter at least 4 characters\. Or clear it if it does not apply\./)).toBeInTheDocument();
    fireEvent.change(input, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith('customer_id_cif', '');
  });
});
