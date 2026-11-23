import React, { useState } from 'react';
import {
  Camera,
  ExternalLink,
  Globe,
  Mic,
  MicOff,
  PhoneOff,
  Send,
  VolumeX,
} from 'lucide-react';
import type { ChatMessage, VoiceCallState } from '../types/linu';

interface ConversationOverlayProps {
  lastLinuMessage: ChatMessage | null;
  liveTranscript: string;
  callActive: boolean;
  callState: VoiceCallState;
  showSubtitles: boolean;
  hideControls: boolean;
  cameraAuthorized: boolean;
  isCameraActive: boolean;
  errorMessage: string | null;
  onToggleCall: () => void;
  onInterruptSpeech: () => void;
  onSendText: (text: string) => void;
  onTriggerVision: () => void;
  onDismissError: () => void;
}

export const ConversationOverlay: React.FC<ConversationOverlayProps> = ({
  lastLinuMessage,
  liveTranscript,
  callActive,
  callState,
  showSubtitles,
  hideControls,
  cameraAuthorized,
  isCameraActive,
  errorMessage,
  onToggleCall,
  onInterruptSpeech,
  onSendText,
  onTriggerVision,
  onDismissError,
}) => {
  const [inputText, setInputText] = useState('');
  const [dockHovered, setDockHovered] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendText(inputText.trim());
    setInputText('');
  };

  const dockVisible = !hideControls || dockHovered || callActive || inputText.length > 0;

  return (
    <>
      {/* Subtle floating subtitle & research source links */}
      {showSubtitles && (lastLinuMessage || liveTranscript || errorMessage) && (
        <div className="pointer-events-none absolute inset-x-0 bottom-20 z-20 flex flex-col items-center px-4">
          {errorMessage && (
            <div className="pointer-events-auto mb-2 max-w-lg px-4 py-2.5 rounded-xl bg-rose-950/90 border border-rose-500/35 text-rose-200 text-xs flex items-center justify-between gap-3">
              <span>{errorMessage}</span>
              <button
                type="button"
                onClick={onDismissError}
                className="text-rose-300 hover:text-white underline shrink-0"
              >
                Cerrar
              </button>
            </div>
          )}

          {liveTranscript && (
            <div className="mb-2 max-w-xl px-4 py-1.5 rounded-xl bg-black/70 border border-emerald-500/25 text-emerald-200 text-xs backdrop-blur-md">
              {liveTranscript}
            </div>
          )}

          {lastLinuMessage && (
            <div className="pointer-events-auto max-w-2xl px-5 py-3 rounded-2xl bg-[#070B09]/82 border border-white/10 backdrop-blur-md text-center shadow-lg">
              <p className="text-sm sm:text-[15px] leading-relaxed text-zinc-100">
                {lastLinuMessage.text}
              </p>

              {/* Grounded Research Sources (only when research was used) */}
              {lastLinuMessage.sources && lastLinuMessage.sources.length > 0 && (
                <div className="mt-2.5 pt-2.5 border-t border-white/10 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs text-zinc-400">
                  <span className="inline-flex items-center gap-1 text-emerald-400">
                    <Globe className="w-3.5 h-3.5" />
                    <span>Fuentes consultadas:</span>
                  </span>
                  {lastLinuMessage.sources.map((src) => (
                    <a
                      key={src.url}
                      href={src.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-zinc-300 hover:text-emerald-300 underline decoration-white/20 underline-offset-2 transition-colors"
                    >
                      <span className="max-w-[180px] truncate">{src.title || src.domain}</span>
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Auto-hiding bottom interaction dock */}
      <div
        className="absolute inset-x-0 bottom-0 z-30 flex justify-center pb-4 px-4"
        onMouseEnter={() => setDockHovered(true)}
        onMouseLeave={() => setDockHovered(false)}
      >
        <div
          className={`flex items-center gap-2 px-3 py-2 rounded-2xl bg-[#0B110E]/88 border border-white/10 backdrop-blur-xl shadow-2xl transition-all duration-200 ${
            dockVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3 pointer-events-none'
          }`}
        >
          {/* Voice Call Start / End */}
          <button
            type="button"
            onClick={onToggleCall}
            className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-medium flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors ${
              callActive
                ? 'bg-rose-600/90 hover:bg-rose-500 text-white'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white'
            }`}
            aria-label={callActive ? 'Finalizar llamada de voz' : 'Iniciar conversación por voz'}
          >
            {callActive ? (
              <>
                <PhoneOff className="w-4 h-4" />
                <span>Finalizar voz</span>
              </>
            ) : (
              <>
                <Mic className="w-4 h-4" />
                <span>Hablar con LINU</span>
              </>
            )}
          </button>

          {/* Interrupt button when LINU is speaking */}
          {callState === 'speaking' && (
            <button
              type="button"
              onClick={onInterruptSpeech}
              className="min-h-[40px] px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-zinc-200 text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
              title="Interrumpir voz"
            >
              <VolumeX className="w-4 h-4" />
              <span>Parar</span>
            </button>
          )}

          {/* Optional quiet text input */}
          <form onSubmit={handleSubmit} className="flex items-center gap-1.5">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Escribe o habla con LINU..."
              className="w-44 sm:w-64 min-h-[40px] bg-black/40 border border-white/10 rounded-xl px-3 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500/50"
            />
            <button
              type="submit"
              disabled={!inputText.trim() || callState === 'processing' || callState === 'researching'}
              className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-white/10 hover:bg-emerald-600 disabled:opacity-40 text-white transition-colors shrink-0"
              aria-label="Enviar mensaje"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>

          {/* Authorized Camera Vision trigger */}
          <button
            type="button"
            onClick={onTriggerVision}
            disabled={isCameraActive}
            title={
              cameraAuthorized
                ? 'Mostrar la cámara a LINU'
                : 'Autorizar cámara para mostrar algo a LINU'
            }
            className={`min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl border transition-colors shrink-0 ${
              isCameraActive
                ? 'bg-amber-500/20 border-amber-400/50 text-amber-300'
                : 'bg-white/5 hover:bg-white/10 border-white/10 text-zinc-300'
            }`}
            aria-label="Usar cámara con LINU"
          >
            <Camera className="w-4 h-4" />
          </button>

          {/* Subtle mic mute hint when idle */}
          {!callActive && (
            <span className="hidden md:inline-flex items-center gap-1 text-[11px] text-zinc-500 px-1.5 whitespace-nowrap">
              <MicOff className="w-3 h-3" />
              <span>Voz en espera</span>
            </span>
          )}
        </div>
      </div>
    </>
  );
};
