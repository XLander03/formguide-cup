import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RouteProvider, useRoute } from '../routing/router';
import { FormSessionProvider, useFormSession, type FormSessionValue } from '../session/FormSession';
import type { SpeakMicStart } from '../ui/useMic';
import { ConfirmPage } from './ConfirmPage';
import { ReviewPage } from './ReviewPage';
import { SpeakPage } from './SpeakPage';

/** What the fake mic does on each start: hand over a clip, hear nothing, or keep waiting. */
let micScript: Array<'clip' | 'silence'> = [];

vi.mock('../ui/useMic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../ui/useMic')>();
  const { useRef, useState } = await import('react');
  return {
    ...actual,
    useSpeakMic(_lang: string, onClip: (wav: Blob, lang: string) => void) {
      const [listening, setListening] = useState(false);
      const onClipRef = useRef(onClip);
      onClipRef.current = onClip;
      return {
        listening,
        error: null,
        supported: true,
        async start(options: SpeakMicStart = {}) {
          const next = micScript.shift();
          setListening(true);
          if (next) {
            window.setTimeout(() => {
              setListening(false);
              if (next === 'clip') onClipRef.current(new Blob(['RIFF'], { type: 'audio/wav' }), 'en-IN');
              else options.onNoSpeech?.();
            }, 0);
          }
          return true;
        },
        stop() {
          setListening(false);
        },
        cancel() {
          setListening(false);
        },
      };
    },
  };
});

/** Scripted /api/speak replies, and the context each request was sent with. */
let replies: Array<Record<string, unknown>> = [];
let contexts: string[] = [];

function reply(extra: Record<string, unknown>): Record<string, unknown> {
  return {
    transcript: 'clip',
    reply_lang: 'en',
    field_updates: {},
    missing_required: [],
    next_ask: null,
    gates: { answers: {} },
    completeness: 'demo_ready',
    refuse_live_submit: false,
    source: 'gemini',
    ...extra,
  };
}

function command(name: string, transcript: string) {
  return reply({ transcript, intent: 'command', command: name, source: 'command', reply: null });
}

let session: FormSessionValue;
let path = '';
function Probe() {
  session = useFormSession();
  path = useRoute().path;
  return null;
}

function Pages() {
  const route = useRoute();
  return (
    <>
      <Probe />
      {route.path === '/speak' ? <SpeakPage /> : null}
      {route.path === '/review' ? <ReviewPage /> : null}
      {route.path === '/confirm' ? <ConfirmPage /> : null}
    </>
  );
}

function mount(at: string) {
  window.history.pushState({}, '', at);
  return render(
    <RouteProvider>
      <FormSessionProvider>
        <Pages />
      </FormSessionProvider>
    </RouteProvider>,
  );
}

beforeEach(() => {
  sessionStorage.clear();
  micScript = [];
  replies = [];
  contexts = [];
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: { body?: FormData }) => {
      if (url !== '/api/speak') throw new Error(`unexpected fetch ${url}`);
      contexts.push(String(init?.body?.get('context')));
      const body = replies.shift();
      if (!body) throw new Error('no scripted reply');
      return new Response(JSON.stringify(body), { status: 200 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('hands-free on Speak', () => {
  it('fills from a spoken answer, then pauses after two silences', async () => {
    const user = userEvent.setup();
    mount('/speak');
    micScript = ['clip', 'silence', 'silence'];
    replies = [
      reply({
        transcript: 'My name is Priya Sharma',
        intent: 'answer',
        field_updates: { applicant_full_name: 'Priya Sharma' },
        next_ask: 'What is your date of birth?',
        completeness: 'empty',
      }),
    ];

    await user.click(screen.getByRole('button', { name: 'Hands-free off' }));
    await waitFor(() => expect(session.values.applicant_full_name).toBe('Priya Sharma'));
    expect(contexts).toEqual(['fill']);
    expect(await screen.findByText('Hands-free paused. Tap the mic to carry on.')).toBeInTheDocument();
    expect(screen.getAllByText('“My name is Priya Sharma”').length).toBeGreaterThan(0);
  });

  it('reads back, takes a spoken yes, and saves the draft on Confirm without a tap', async () => {
    const user = userEvent.setup();
    mount('/speak');
    act(() => session.onPriya());
    micScript = ['clip', 'clip'];
    replies = [command('yes', 'Yes, that is correct'), command('save_draft', 'Save my draft')];

    await user.click(screen.getByRole('button', { name: 'Hands-free off' }));
    await waitFor(() => expect(path).toBe('/confirm'));
    expect(session.values.readback_confirmed).toBe(true);
    expect(session.values.draft_only_ack).toBe(true);
    expect(session.values.no_live_submit_ack).toBe(true);

    expect(await screen.findByText('Your draft is ready.')).toBeInTheDocument();
    expect(contexts).toEqual(['readback', 'confirm']);
  });

  it('a "no" at the read-back listens for the change instead of reading again', async () => {
    const user = userEvent.setup();
    mount('/speak');
    act(() => session.onPriya());
    micScript = ['clip', 'clip'];
    replies = [
      command('no', 'No'),
      reply({
        transcript: 'My PIN is 560037',
        intent: 'correction',
        reply: 'Changed your PIN code to 560037.',
        field_updates: { addr_current_pin: '560037' },
      }),
    ];

    await user.click(screen.getByRole('button', { name: 'Hands-free off' }));
    await waitFor(() => expect(session.values.addr_current_pin).toBe('560037'));
    expect(contexts).toEqual(['readback', 'fill']);
    expect(session.values.readback_confirmed).not.toBe(true);
  });
});

describe('voice on Review', () => {
  it('answers a question and applies a correction', async () => {
    const user = userEvent.setup();
    mount('/review');
    act(() => session.onPriya());
    micScript = ['clip', 'clip'];
    replies = [
      reply({
        transcript: 'What is CKYC?',
        intent: 'question',
        reply: 'CKYC is a central record of your KYC, kept so you do not repeat it at every bank.',
      }),
      reply({
        transcript: 'Change the mobile to 9876501234',
        intent: 'correction',
        reply: 'Changed your mobile number to 9876501234.',
        field_updates: { mobile_registered: '9876501234' },
      }),
    ];

    await user.click(screen.getByRole('button', { name: 'Speak' }));
    expect(await screen.findByText(/CKYC is a central record/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Speak' }));
    await waitFor(() => expect(session.values.mobile_registered).toBe('9876501234'));
    expect(screen.getByText('Changed your mobile number to 9876501234.')).toBeInTheDocument();
    expect(contexts).toEqual(['review', 'review']);
  });

  it('"go back" returns to Speak', async () => {
    const user = userEvent.setup();
    mount('/review');
    act(() => session.onPriya());
    micScript = ['clip'];
    replies = [command('go_back', 'Go back')];
    await user.click(screen.getByRole('button', { name: 'Speak' }));
    await waitFor(() => expect(path).toBe('/speak'));
  });
});

describe('voice on Confirm', () => {
  it('"yes" ticks the three gates, then "save my draft" saves', async () => {
    const user = userEvent.setup();
    mount('/confirm');
    act(() => session.onPriya());
    micScript = ['clip', 'clip'];
    replies = [command('yes', 'Yes'), command('save_draft', 'Save my draft')];

    await user.click(screen.getByRole('button', { name: 'Speak' }));
    await waitFor(() => expect(session.confirmGatesOk).toBe(true));
    expect(screen.getByText('Confirmed. Say save my draft.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Speak' }));
    expect(await screen.findByText('Your draft is ready.')).toBeInTheDocument();
  });

  it('"save my draft" before the gates asks for a yes first', async () => {
    const user = userEvent.setup();
    mount('/confirm');
    act(() => session.onPriya());
    micScript = ['clip'];
    replies = [command('save_draft', 'Save my draft')];
    await user.click(screen.getByRole('button', { name: 'Speak' }));
    expect(await screen.findByText('Say yes to confirm the three checks first.')).toBeInTheDocument();
    expect(session.draftReady).toBe(false);
  });
});
