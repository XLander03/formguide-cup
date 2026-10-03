import { useCallback, useEffect, useRef, useState } from 'react';

export function useMic(lang: 'en-IN' | 'hi-IN', onFinal: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [live, setLive] = useState('');
  const recogRef = useRef<SpeechRecognition | null>(null);
  const buf = useRef('');
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  const supported =
    typeof window !== 'undefined' &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => {
    return () => recogRef.current?.abort();
  }, []);

  const stop = useCallback(() => {
    recogRef.current?.stop();
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) return;
    recogRef.current?.abort();
    const recog = new Ctor();
    recog.lang = lang;
    recog.continuous = false;
    recog.interimResults = true;
    recog.onresult = (ev) => {
      let transcript = '';
      for (let i = 0; i < ev.results.length; i++) transcript += ev.results[i][0].transcript;
      buf.current = transcript;
      setLive(transcript);
    };
    recog.onerror = () => setListening(false);
    recog.onend = () => {
      setListening(false);
      const text = buf.current.trim();
      buf.current = '';
      if (text) onFinalRef.current(text);
    };
    recogRef.current = recog;
    setLive('');
    recog.start();
    setListening(true);
  }, [lang]);

  return { listening, live, supported, start, stop };
}
