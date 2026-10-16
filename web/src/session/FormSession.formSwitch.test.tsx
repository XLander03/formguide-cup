import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HDFC_V1 } from '../forms/hdfcV1';
import type { FieldRecord, FormVersion } from '../forms/types';
import { FormSessionProvider, useFormSession, type FormSessionValue } from './FormSession';

function field(id: string, type: FieldRecord['type'] = 'text'): FieldRecord {
  return {
    id,
    label: id,
    type,
    required: false,
    pii: false,
    order: 0,
    confidence: 1,
    checked: true,
    page: 1,
    box: { x: 10, y: 10, w: 100, h: 12 },
  };
}

function published(formId: string, journey: string, ids: string[]): FormVersion {
  return {
    formId,
    version: 'v1',
    bankId: 'Axis',
    journey,
    status: 'published',
    source: 'ocr',
    pdfPath: `forms/${formId}/versions/v1/source.pdf`,
    fields: [field('applicant_full_name'), ...ids.map((id) => field(id))],
  };
}

const REKYC = published('axis_rekyc', 'rekyc', ['custom_city_of_birth', 'custom_id_no']);
const AOF = published('axis_aof', 'account_opening', ['custom_id_no', 'custom_tenure_months']);

let session: FormSessionValue;
function Probe() {
  session = useFormSession();
  return null;
}

function mount() {
  return render(
    <FormSessionProvider>
      <Probe />
    </FormSessionProvider>,
  );
}

describe('FormSession active form', () => {
  beforeEach(() => {
    sessionStorage.clear();
    window.history.pushState({}, '', '/speak');
  });

  it('starts on the bundled HDFC form', () => {
    mount();
    expect(session.form).toBe(HDFC_V1);
  });

  it('keeps shared answers and drops the previous bank-only answers when the form changes', () => {
    mount();
    act(() => session.onChange('applicant_full_name', 'Priya Sharma'));
    act(() => session.selectForm(REKYC));
    expect(session.form).toBe(REKYC);
    expect(session.values.custom_city_of_birth).toBe('');

    act(() => {
      session.onChange('custom_city_of_birth', 'Pune');
      session.onChange('custom_id_no', 'DL-0420');
    });
    expect(session.values.custom_id_no).toBe('DL-0420');

    // Selecting the same form again is a no-op.
    act(() => session.selectForm({ ...REKYC }));
    expect(session.values.custom_city_of_birth).toBe('Pune');

    act(() => session.selectForm(AOF));
    expect(session.values.applicant_full_name).toBe('Priya Sharma');
    expect(session.values).not.toHaveProperty('custom_city_of_birth');
    // Same id on a different bank's form is a different box: it starts empty.
    expect(session.values.custom_id_no).toBe('');
    expect(session.fieldSource).not.toHaveProperty('custom_id_no');

    act(() => session.selectForm(HDFC_V1));
    expect(session.values).not.toHaveProperty('custom_id_no');
    expect(session.values.applicant_full_name).toBe('Priya Sharma');
  });

  it('restores the selected form and its bank-only answers after a reload', () => {
    const first = mount();
    act(() => session.selectForm(REKYC));
    act(() => session.onChange('custom_city_of_birth', 'Pune'));
    first.unmount();

    mount();
    expect(session.form.formId).toBe('axis_rekyc');
    expect(session.values.custom_city_of_birth).toBe('Pune');
  });

  it('keeps the journey of a selected bank form when speech or the demo names another', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    mount();
    act(() => session.selectJourney('rekyc'));
    act(() => session.selectForm(REKYC));
    await act(async () => {
      await session.onSubmitUtterance('I want to open a new savings account. My name is Priya Sharma.');
    });
    expect(session.values.applicant_full_name).toBe('Priya Sharma');
    expect(session.values.journey_mode).toBe('rekyc');
    expect(session.journey).toBe('rekyc');

    act(() => session.onPriya());
    expect(session.values.journey_mode).toBe('rekyc');
    expect(session.journey).toBe('rekyc');
    expect(session.missing).not.toContain('account_product_intent');
    vi.unstubAllGlobals();
  });

  it('still lets speech change the journey on the bundled HDFC form', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    mount();
    act(() => session.selectJourney('rekyc'));
    await act(async () => {
      await session.onSubmitUtterance('I want to open a new savings account.');
    });
    expect(session.journey).toBe('account_opening');
    vi.unstubAllGlobals();
  });

  it('fills from the transcript when the speak field model is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/speak') {
          return new Response(
            JSON.stringify({ transcript: 'My driving license number is MH1220110012345.', error: 'fields_503_unavailable' }),
            { status: 503 },
          );
        }
        throw new Error('offline');
      }),
    );
    mount();
    let result: Awaited<ReturnType<FormSessionValue['onSubmitSpeakClip']>> | undefined;
    await act(async () => {
      result = await session.onSubmitSpeakClip(new Blob(['x'], { type: 'audio/wav' }));
    });
    expect(result).toEqual({ transcript: 'My driving license number is MH1220110012345.', error: null, fallback: true });
    expect(session.values.ovd_poi_number).toBe('MH1220110012345');
    expect(session.values.ovd_poi_type).toBe('driving_licence');
    vi.unstubAllGlobals();
  });

  it('keeps the picked language as preferred_language when a sentence mixes Hindi and English', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    mount();
    act(() => session.selectLanguage('bn'));
    expect(session.values.preferred_language).toBe('Bengali');
    await act(async () => {
      await session.onSubmitUtterance('मेरा नाम Priya Sharma है, mobile 9876543210');
    });
    expect(session.values.mobile_registered).toBe('9876543210');
    expect(session.values.preferred_language).toBe('Bengali');

    act(() => session.selectLanguage('en'));
    await act(async () => {
      await session.onSubmitUtterance('मुझे अपनी सैलरी के लिए नया अकाउंट खुलवाना है');
    });
    expect(session.values.preferred_language).toBe('English');
    vi.unstubAllGlobals();
  });
});
