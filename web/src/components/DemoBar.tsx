import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExtractResponse, FormValues } from '../lib/types';

interface Props {
  busy: boolean;
  onSubmitUtterance: (text: string) => Promise<void>;
  onPriya: () => void;
  onClear: () => void;
  onReadback: () => void;
  onTryLiveSubmit: () => void;
  last: ExtractResponse | null;
  missing: string[];
  completeness: string;
  canReadback: boolean;
}

export function DemoBar({
  busy,
  onSubmitUtterance,
  onPriya,
  onClear,
  onReadback,
  onTryLiveSubmit,
  last,
  missing,
  completeness,
  canReadback,
}: Props) {
  const [text, setText] = useState(
    'Hi, I want to open a savings account. My name is Ananya Reddy, DOB 15/08/1992, PAN ABCDE1234F, mobile 9876501234. I live at 22 MG Road, Bengaluru, Karnataka 560001.',
  );
  const [listening, setListening] = useState(false);
  const recogRef = useRef<SpeechRecognition | null>(null);

  const speechSupported =
    typeof window !== 'undefined' &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => {
    return () => {
      recogRef.current?.abort();
    };
  }, []);

  const toggleMic = useCallback(() => {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) return;
    if (listening && recogRef.current) {
      recogRef.current.stop();
      setListening(false);
      return;
    }
    const r = new Ctor();
    r.lang = 'en-IN';
    r.continuous = false;
    r.interimResults = true;
    r.onresult = (ev) => {
      let transcript = '';
      for (let i = 0; i < ev.results.length; i++) {
        transcript += ev.results[i][0].transcript;
      }
      setText(transcript);
    };
    r.onerror = () => setListening(false);
    r.onend = () => setListening(false);
    recogRef.current = r;
    r.start();
    setListening(true);
  }, [listening]);

  const filledHint =
    completeness === 'demo_ready' || completeness === 'full_bank_packet'
      ? Math.max(0, 100 - missing.length * 3)
      : completeness === 'partial_core'
        ? 45
        : Math.min(30, (10 - Math.min(missing.length, 10)) * 3);

  return (
    <aside className="panel demo-bar">
      <h2>Demo bar — English voice / text</h2>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Speak or type multi-field English…"
        aria-label="Utterance"
      />
      <div className="row">
        <button
          className="btn primary"
          disabled={busy || !text.trim()}
          onClick={() => onSubmitUtterance(text)}
        >
          {busy ? 'Extracting…' : 'Fill from text'}
        </button>
        <button
          className={`btn ${listening ? 'mic-on' : ''}`}
          disabled={!speechSupported || busy}
          onClick={toggleMic}
          title={speechSupported ? 'Web Speech API' : 'Speech not supported in this browser'}
        >
          {listening ? 'Stop mic' : 'Mic'}
        </button>
        <button className="btn teal" disabled={busy} onClick={onPriya}>
          Fill Priya Sharma demo
        </button>
        <button className="btn ghost" disabled={busy} onClick={onClear}>
          Clear
        </button>
      </div>
      <div className="row" style={{ marginTop: '0.5rem' }}>
        <button className="btn" disabled={!canReadback || busy} onClick={onReadback}>
          TTS read-back
        </button>
        <button className="btn danger" disabled={busy} onClick={onTryLiveSubmit}>
          Try live bank submit
        </button>
      </div>

      <div className="progress">
        <div className="progress-bar">
          <span style={{ width: `${Math.min(100, filledHint)}%` }} />
        </div>
        <div className="progress-meta">
          <span>Completeness: {completeness}</span>
          <span>{missing.length} required missing</span>
        </div>
      </div>

      {missing.length > 0 && (
        <ul className="missing-list" aria-label="Missing required fields">
          {missing.slice(0, 12).map((id) => (
            <li key={id}>{id}</li>
          ))}
          {missing.length > 12 ? <li>+{missing.length - 12} more</li> : null}
        </ul>
      )}

      {last?.assistant_message && (
        <div className="assistant" role="status">
          <span className="label">Assistant · {last.source}</span>
          {last.assistant_message}
        </div>
      )}

      {last?.gates && (
        <div className="gates">
          <div>Gates (Choice / Score / Noul shapes)</div>
          <pre>{JSON.stringify(last.gates.answers, null, 2)}</pre>
        </div>
      )}
    </aside>
  );
}

// silence unused FormValues if tree-shaken oddly
export type _Keep = FormValues;
