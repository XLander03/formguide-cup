import { useCallback, useEffect, useRef, useState } from 'react';
import type { VoiceCommand, VoiceContext } from '../../../shared/voiceCommands';
import { stopSpeaking } from '../lib/tts';
import { voiceErrorLine } from '../lib/voiceLines';
import { useFormSession, type VoiceTurnResult } from '../session/FormSession';
import { useSpeakMic } from './useMic';

export type VoicePhase = 'idle' | 'speaking' | 'listening' | 'thinking';

/** The turn just handled, passed to `prepare` so a page knows what to say next. */
export interface LastTurn {
  context: VoiceContext;
  intent: VoiceTurnResult['intent'];
  command?: VoiceCommand | null;
  /** Something was said back (a reply, the next question, or a command's line). */
  spoke: boolean;
}

export interface VoiceAgentOptions {
  /**
   * Hands-free only. Say whatever comes before listening (the next question, the read-back)
   * and return where to listen, or null to stop. `last` is null on the first ask and on a
   * re-ask after silence or an error.
   */
  prepare: (last: LastTurn | null) => Promise<VoiceContext | null>;
  /**
   * Carry out a spoken command. Resolve to a line to say back, or null when the handler
   * spoke (or navigated) itself.
   */
  onCommand: (command: VoiceCommand, context: VoiceContext) => Promise<string | null> | string | null;
  /** Hands-free may start on this page now (e.g. a language and journey are chosen). */
  enabled?: boolean;
}

type Recorded = { kind: 'clip'; wav: Blob } | { kind: 'silence' } | { kind: 'failed' } | { kind: 'cancelled' };

const MAX_MISSES = 2;
const nextTick = () => new Promise<void>((resolve) => window.setTimeout(resolve, 0));

/**
 * The voice agent behind hands-free mode and tap-to-talk commands: ask aloud, listen until
 * the speaker goes quiet, send the clip through the speak function, say the reply, repeat.
 * It reads the session through a ref because one loop spans many renders.
 */
export function useVoiceAgent(options: VoiceAgentOptions) {
  const session = useFormSession();
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  // Read through a ref: the language flips to Hindi as soon as one is heard, and a loop that
  // depended on it would restart mid-turn, cutting off the question being spoken.
  const hindiRef = useRef(session.readbackLang === 'hi');
  hindiRef.current = session.readbackLang === 'hi';

  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [running, setRunning] = useState(false);
  const [heard, setHeard] = useState('');
  /** Voice turns sent, for the page's turn counter. */
  const [turns, setTurns] = useState(0);
  /** The last thing said back after a turn (an answer, a change, a command's line). */
  const [reply, setReply] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const runRef = useRef(0);
  const pendingRef = useRef<((result: Recorded) => void) | null>(null);

  const settle = (result: Recorded) => {
    const resolve = pendingRef.current;
    pendingRef.current = null;
    resolve?.(result);
  };

  const mic = useSpeakMic(session.micLang, (wav) => settle({ kind: 'clip', wav }));
  const micRef = useRef(mic);
  micRef.current = mic;

  const record = useCallback(
    () =>
      new Promise<Recorded>((resolve) => {
        settle({ kind: 'cancelled' });
        pendingRef.current = resolve;
        void micRef.current
          .start({ autoStop: true, onNoSpeech: () => settle({ kind: 'silence' }) })
          .then((started) => {
            if (!started) settle({ kind: 'failed' });
          });
      }),
    [],
  );

  /** Send one clip, then say the reply or run the command. Null means stop the loop. */
  const handleClip = useCallback(
    async (wav: Blob, context: VoiceContext, alive: () => boolean): Promise<LastTurn | { error: string; stop: boolean } | null> => {
      setPhase('thinking');
      const result = await sessionRef.current.voiceTurn(wav, context);
      if (!alive()) return null;
      setTurns((count) => count + 1);
      if (result.transcript) setHeard(result.transcript);
      if (result.error) {
        const { line, stop } = voiceErrorLine(result.error, result.replyLang === 'hi');
        setNote(line);
        setReply('');
        setPhase('speaking');
        await sessionRef.current.say(line, result.replyLang);
        return { error: result.error, stop };
      }
      if (result.intent === 'command' && result.command) {
        const line = await optionsRef.current.onCommand(result.command, context);
        if (!alive()) return null;
        if (line) {
          setReply(line);
          setPhase('speaking');
          // The page wrote this line in the conversation's language, which a one-word "yes"
          // in English does not change; speak it in that language, not the clip's.
          await sessionRef.current.say(line);
        }
        return { context, intent: 'command', command: result.command, spoke: true };
      }
      if (result.spoken) {
        setReply(result.spoken);
        setPhase('speaking');
        await sessionRef.current.sayTurn(result);
      }
      return { context, intent: result.intent, spoke: Boolean(result.spoken) };
    },
    [],
  );

  const halt = useCallback(() => {
    runRef.current += 1;
    settle({ kind: 'cancelled' });
    micRef.current.cancel();
    setRunning(false);
    setPhase('idle');
  }, []);

  /** The hands-free loop. A newer run, stop() or unmount ends it at the next await. */
  const run = useCallback(async () => {
    const id = ++runRef.current;
    const alive = () => runRef.current === id;
    setRunning(true);
    setNote(null);
    let last: LastTurn | null = null;
    let misses = 0;
    try {
      while (alive()) {
        // Let React commit the last turn's field updates before the page reads them.
        await nextTick();
        if (!alive()) return;
        setPhase('speaking');
        const context = await optionsRef.current.prepare(last);
        if (!alive() || !context) return;
        setPhase('listening');
        const recorded = await record();
        if (!alive()) return;
        if (recorded.kind === 'cancelled') return;
        if (recorded.kind === 'failed') {
          setNote(micRef.current.error ?? 'The microphone did not start.');
          return;
        }
        if (recorded.kind === 'silence') {
          misses += 1;
          if (misses >= MAX_MISSES) {
            setNote(hindiRef.current ? 'हैंड्स-फ़्री रुका है। जारी रखने के लिए माइक दबाइए।' : 'Hands-free paused. Tap the mic to carry on.');
            return;
          }
          last = null;
          continue;
        }
        const outcome = await handleClip(recorded.wav, context, alive);
        if (!outcome) return;
        if ('error' in outcome) {
          misses += 1;
          if (outcome.stop || misses >= MAX_MISSES) return;
          last = null;
          continue;
        }
        misses = 0;
        last = outcome;
      }
    } finally {
      if (runRef.current === id) {
        setRunning(false);
        setPhase('idle');
      }
    }
  }, [record, handleClip]);

  /** Tap-to-talk: one turn that stops on silence, without the loop. */
  const talkOnce = useCallback(
    async (context: VoiceContext) => {
      const id = ++runRef.current;
      const alive = () => runRef.current === id;
      setRunning(true);
      setNote(null);
      try {
        setPhase('listening');
        const recorded = await record();
        if (!alive()) return;
        if (recorded.kind === 'failed') setNote(micRef.current.error ?? 'The microphone did not start.');
        else if (recorded.kind === 'silence') setNote(hindiRef.current ? 'कुछ सुनाई नहीं दिया।' : 'I did not hear anything.');
        else if (recorded.kind === 'clip') await handleClip(recorded.wav, context, alive);
      } finally {
        if (runRef.current === id) {
          setRunning(false);
          setPhase('idle');
        }
      }
    },
    [record, handleClip],
  );

  /** Stop listening and speaking now. Hands-free stays switched on but paused. */
  const stop = useCallback(() => {
    halt();
    stopSpeaking();
  }, [halt]);

  const enabled = options.enabled !== false;
  useEffect(() => {
    if (!session.handsFree || !enabled) return;
    void run();
    return halt;
  }, [session.handsFree, enabled, run, halt]);

  useEffect(() => halt, [halt]);

  return { phase, running, heard, turns, reply, note, listening: mic.listening, start: run, talkOnce, stop };
}

export type VoiceAgent = ReturnType<typeof useVoiceAgent>;

/** Short status for the mic button and screen readers. */
export function voicePhaseLabel(phase: VoicePhase, hindi: boolean): string {
  if (phase === 'listening') return hindi ? 'सुन रहे हैं… बस बोलिए' : 'Listening… just talk';
  if (phase === 'thinking') return hindi ? 'भर रहे हैं…' : 'Filling…';
  if (phase === 'speaking') return hindi ? 'बोल रहे हैं…' : 'Speaking…';
  return hindi ? 'रुका है' : 'Paused';
}
