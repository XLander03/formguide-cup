import type { VoiceContext } from '../../../shared/voiceCommands';
import { useFormSession } from '../session/FormSession';
import { BTN_MD, BTN_PRIMARY } from '../ui/buttons';
import { MicIcon, StopIcon } from '../ui/icons';
import { voicePhaseLabel, type VoiceAgent } from '../ui/useVoiceAgent';

/** Voice controls for Review and Confirm: tap to speak once, or hands-free. */
export function VoiceBar({ agent, context, hint }: { agent: VoiceAgent; context: VoiceContext; hint: string }) {
  const session = useFormSession();
  const hindi = session.language === 'hi';
  const handsFree = session.handsFree;
  return (
    <section aria-label="Voice" className="border-2 border-primary p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] uppercase text-primary">Voice</p>
        <button
          type="button"
          aria-pressed={handsFree}
          onClick={() => {
            if (handsFree) agent.stop();
            session.setHandsFree(!handsFree);
          }}
          className={`border px-2 py-0.5 text-[10px] font-bold uppercase ${
            handsFree ? 'border-primary bg-primary text-primary-foreground' : 'border-foreground/40 hover:bg-foreground hover:text-background'
          }`}
        >
          Hands-free {handsFree ? 'on' : 'off'}
        </button>
      </div>
      <button
        type="button"
        className={`${BTN_PRIMARY} ${BTN_MD} mt-3`}
        disabled={session.busy && !agent.running}
        onClick={() => {
          if (agent.running) agent.stop();
          else if (handsFree) void agent.start();
          else void agent.talkOnce(context);
        }}
      >
        {agent.running ? <StopIcon /> : <MicIcon />}
        {agent.running ? voicePhaseLabel(agent.phase, hindi) : handsFree ? 'Carry on hands-free' : 'Speak'}
      </button>
      <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
      <div role="status" aria-live="polite">
        {agent.heard ? <p className="mt-2 text-xs text-foreground/70">You said: “{agent.heard}”</p> : null}
        {agent.reply ? <p className="mt-1 text-sm">{agent.reply}</p> : null}
        {agent.note ? <p className="mt-1 text-xs text-saffron">{agent.note}</p> : null}
      </div>
    </section>
  );
}
