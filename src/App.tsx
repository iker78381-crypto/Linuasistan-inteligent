import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Settings } from 'lucide-react';
import { ConversationOverlay } from './components/ConversationOverlay';
import { LinuFace } from './components/LinuFace';
import { SettingsDrawer } from './components/SettingsDrawer';
import { DEFAULT_LINU_SETTINGS } from './data/emotions';
import { useCameraVision } from './hooks/useCameraVision';
import { useVoiceCall } from './hooks/useVoiceCall';
import { safeFetchJson } from './utils/api';
import type {
  ChatMessage,
  LinuAIResponse,
  LinuAnimation,
  LinuEmotion,
  LinuSettings,
  MemoryItem,
} from './types/linu';

export default function App() {
  const [settings, setSettings] = useState<LinuSettings>(DEFAULT_LINU_SETTINGS);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [hasGeminiKey, setHasGeminiKey] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Boot animation
  const [showBoot, setShowBoot] = useState(true);

  // Emotional & animation state
  const [emotion, setEmotion] = useState<LinuEmotion>('calm');
  const [intensity, setIntensity] = useState(0.8);
  const [animation, setAnimation] = useState<LinuAnimation>('idle_breathe');

  // Research & camera state
  const [isResearching, setIsResearching] = useState(false);
  const [researchQuery, setResearchQuery] = useState<string | undefined>(undefined);
  const [cameraConsentPrompt, setCameraConsentPrompt] = useState<string | null>(null);

  // Conversation state
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Desktop pet movable & resizable state
  const [petPos, setPetPos] = useState({ x: 36, y: 36 });
  const [petSize, setPetSize] = useState({ width: 460, height: 320 });
  const dragStateRef = useRef<{
    dragging: boolean;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const resizeStateRef = useRef<{
    resizing: boolean;
    startX: number;
    startY: number;
    origW: number;
    origH: number;
  } | null>(null);

  const lastInteractionRef = useRef<number>(Date.now());
  const historyRef = useRef<ChatMessage[]>(history);
  historyRef.current = history;
  const emotionRef = useRef<LinuEmotion>(emotion);
  emotionRef.current = emotion;
  const settingsRef = useRef<LinuSettings>(settings);
  settingsRef.current = settings;

  const { isCameraActive, cameraError, captureSnapshot } = useCameraVision();

  // Load initial state and health from server
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [h, st] = await Promise.all([
          safeFetchJson<{ hasGeminiKey: boolean }>('/api/linu/health'),
          safeFetchJson<{ settings: LinuSettings; memories: MemoryItem[] }>('/api/linu/state'),
        ]);
        if (mounted) {
          setHasGeminiKey(h.hasGeminiKey);
          setSettings(st.settings);
          setMemories(st.memories);
          setShowBoot(st.settings.system.playBootSequence);
        }
      } catch {
        // Keep defaults if offline or server restarting
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (cameraError) {
      setErrorMessage(cameraError);
    }
  }, [cameraError]);

  const refreshMemories = useCallback(async () => {
    try {
      const list = await safeFetchJson<MemoryItem[]>('/api/linu/memories');
      setMemories(list);
    } catch {
      // ignore
    }
  }, []);

  const handleUpdateSettings = useCallback(async (next: LinuSettings) => {
    setSettings(next);
    try {
      await safeFetchJson('/api/linu/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
    } catch {
      // ignore transient save error
    }
  }, []);

  const handleAddMemory = useCallback(
    async (category: MemoryItem['category'], content: string) => {
      await safeFetchJson('/api/linu/memories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, content }),
      });
      await refreshMemories();
    },
    [refreshMemories]
  );

  const handleUpdateMemory = useCallback(
    async (id: string, content: string, category: MemoryItem['category']) => {
      await safeFetchJson(`/api/linu/memories/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, category }),
      });
      await refreshMemories();
    },
    [refreshMemories]
  );

  const handleDeleteMemory = useCallback(
    async (id: string) => {
      await safeFetchJson(`/api/linu/memories/${id}`, { method: 'DELETE' });
      await refreshMemories();
    },
    [refreshMemories]
  );

  const handleClearMemories = useCallback(async () => {
    await safeFetchJson('/api/linu/memories', { method: 'DELETE' });
    setMemories([]);
  }, []);

  const runVisionFlow = useCallback(
    async (
      prompt: string,
      speakFn: (text: string, emo: LinuEmotion) => Promise<void>
    ) => {
      const dataUrl = await captureSnapshot();
      if (!dataUrl) {
        setEmotion('sadness');
        setAnimation('head_tilt');
        return;
      }

      setEmotion('curiosity');
      setAnimation('lean_in');

      const data = await safeFetchJson<LinuAIResponse>('/api/linu/vision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: dataUrl,
          mimeType: 'image/jpeg',
          prompt,
        }),
      });
      setEmotion(data.emotion || 'curiosity');
      setIntensity(data.intensity ?? 0.85);
      setAnimation(data.animation || 'nod_yes');

      const linuMsg: ChatMessage = {
        id: `msg_${Date.now()}_v`,
        role: 'linu',
        text: data.response,
        emotion: data.emotion,
        intensity: data.intensity,
        timestamp: new Date().toISOString(),
        usedVision: true,
      };
      setHistory((prev) => [...prev.slice(-24), linuMsg]);
      await speakFn(data.response, data.emotion);
    },
    [captureSnapshot]
  );

  // Core message pipeline (used by both continuous voice and typed text)
  const speakRef = useRef<(text: string, emo: LinuEmotion) => Promise<void>>(
    async () => {}
  );
  const setCallStateRef = useRef<(s: 'idle' | 'listening' | 'processing' | 'researching' | 'speaking' | 'error') => void>(
    () => {}
  );
  const callActiveRef = useRef(false);

  const processUserMessage = useCallback(
    async (userText: string) => {
      lastInteractionRef.current = Date.now();
      setErrorMessage(null);

      const userMsg: ChatMessage = {
        id: `msg_${Date.now()}_u`,
        role: 'user',
        text: userText,
        timestamp: new Date().toISOString(),
      };
      const updatedHistory = [...historyRef.current.slice(-24), userMsg];
      setHistory(updatedHistory);

      // Show attentive curiosity while thinking
      setEmotion('curiosity');
      setAnimation('head_tilt');

      try {
        const aiData = await safeFetchJson<LinuAIResponse>('/api/linu/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: userText,
            history: updatedHistory.map((m) => ({
              role: m.role,
              text: m.text,
              emotion: m.emotion,
            })),
            currentEmotion: emotionRef.current,
          }),
        });

        if (aiData.memoryCandidate) {
          await refreshMemories();
        }

        // Handle Camera Vision request
        if (aiData.needsCamera) {
          if (!settingsRef.current.system.cameraAuthorized) {
            setEmotion('curiosity');
            setAnimation('head_tilt');
            setCameraConsentPrompt(aiData.cameraPrompt || userText);
            const askText =
              'Para poder ver lo que tienes delante necesito que autorices la cámara primero.';
            setHistory((prev) => [
              ...prev.slice(-24),
              {
                id: `msg_${Date.now()}_camask`,
                role: 'linu',
                text: askText,
                emotion: 'curiosity',
                timestamp: new Date().toISOString(),
              },
            ]);
            await speakRef.current(askText, 'curiosity');
            return;
          }
          await runVisionFlow(aiData.cameraPrompt || userText, speakRef.current);
          return;
        }

        // Handle Real Internet Research request
        if (aiData.shouldResearch && settingsRef.current.system.researchEnabled) {
          const query = aiData.researchQuery || userText;
          setIsResearching(true);
          setResearchQuery(query);
          setCallStateRef.current('researching');
          setEmotion('concentration');
          setAnimation('focus_scan');

          try {
            const researchData = await safeFetchJson<LinuAIResponse>('/api/linu/research', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                query,
                originalMessage: userText,
              }),
            });
            setIsResearching(false);
            setResearchQuery(undefined);

            setEmotion(researchData.emotion || 'enthusiasm');
            setIntensity(researchData.intensity ?? 0.85);
            setAnimation(researchData.animation || 'nod_yes');

            const linuMsg: ChatMessage = {
              id: `msg_${Date.now()}_r`,
              role: 'linu',
              text: researchData.response,
              emotion: researchData.emotion,
              intensity: researchData.intensity,
              sources: researchData.sources,
              timestamp: new Date().toISOString(),
              usedResearch: true,
            };
            setHistory((prev) => [...prev.slice(-24), linuMsg]);
            await speakRef.current(researchData.response, researchData.emotion);
            return;
          } catch (err) {
            setIsResearching(false);
            setResearchQuery(undefined);
            throw err;
          }
        }

        // Standard conversational response with emotional expression
        setEmotion(aiData.emotion || 'calm');
        setIntensity(aiData.intensity ?? 0.8);
        setAnimation(aiData.animation || 'idle_breathe');

        const linuMsg: ChatMessage = {
          id: `msg_${Date.now()}_l`,
          role: 'linu',
          text: aiData.response,
          emotion: aiData.emotion,
          intensity: aiData.intensity,
          timestamp: new Date().toISOString(),
        };
        setHistory((prev) => [...prev.slice(-24), linuMsg]);
        await speakRef.current(aiData.response, aiData.emotion);
      } catch (err) {
        const raw = err instanceof Error ? err.message : 'Error de comunicación con LINU.';
        const friendly =
          raw.includes('503') || raw.toLowerCase().includes('unavailable')
            ? 'El servicio de IA tiene alta demanda temporal (503). Inténtalo de nuevo en unos segundos.'
            : raw;
        setErrorMessage(friendly);
        setEmotion('fear');
        setAnimation('shiver_worry');
        setCallStateRef.current(callActiveRef.current ? 'listening' : 'idle');
      }
    },
    [refreshMemories, runVisionFlow]
  );

  const {
    callActive,
    callState,
    setCallState,
    liveTranscript,
    speechLevel,
    voiceError,
    startCall,
    endCall,
    speak,
    stopSpeaking,
  } = useVoiceCall({
    voiceSettings: settings.voice,
    language: settings.personality.language,
    onUserUtterance: processUserMessage,
  });

  speakRef.current = speak;
  setCallStateRef.current = setCallState;
  callActiveRef.current = callActive;

  useEffect(() => {
    if (voiceError) setErrorMessage(voiceError);
  }, [voiceError]);

  // Natural emotional decay back to calm / sleepy when idle
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (isResearching || callState === 'speaking' || callState === 'processing') return;
      const idleMs = Date.now() - lastInteractionRef.current;
      if (idleMs > 95000 && emotionRef.current !== 'sleepy') {
        setEmotion('sleepy');
        setAnimation('sleep_drift');
      } else if (idleMs > 22000 && idleMs <= 95000 && emotionRef.current !== 'calm') {
        setEmotion('calm');
        setAnimation('idle_breathe');
      }
    }, 4000);
    return () => window.clearInterval(timer);
  }, [isResearching, callState]);

  // Movable & Resizable desktop pet window mouse handlers
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (dragStateRef.current?.dragging) {
        const dx = e.clientX - dragStateRef.current.startX;
        const dy = e.clientY - dragStateRef.current.startY;
        setPetPos({
          x: Math.max(8, Math.min(window.innerWidth - 180, dragStateRef.current.origX + dx)),
          y: Math.max(8, Math.min(window.innerHeight - 140, dragStateRef.current.origY + dy)),
        });
      }
      if (resizeStateRef.current?.resizing) {
        const dx = e.clientX - resizeStateRef.current.startX;
        const dy = e.clientY - resizeStateRef.current.startY;
        setPetSize({
          width: Math.max(300, Math.min(window.innerWidth - 40, resizeStateRef.current.origW + dx)),
          height: Math.max(220, Math.min(window.innerHeight - 40, resizeStateRef.current.origH + dy)),
        });
      }
    };
    const onUp = () => {
      dragStateRef.current = null;
      resizeStateRef.current = null;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const handleToggleCall = () => {
    lastInteractionRef.current = Date.now();
    if (callActive) {
      endCall();
    } else {
      startCall();
    }
  };

  const handleTriggerVision = async () => {
    lastInteractionRef.current = Date.now();
    if (!settings.system.cameraAuthorized) {
      setCameraConsentPrompt('¿Qué ves delante de la cámara?');
      return;
    }
    try {
      await runVisionFlow('Describe lo que aparece en la cámara con naturalidad.', speak);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Error de cámara.');
    }
  };

  const handleConfirmCameraConsent = async () => {
    const prompt = cameraConsentPrompt || 'Describe lo que ves delante de la cámara.';
    setCameraConsentPrompt(null);
    const updated: LinuSettings = {
      ...settings,
      system: { ...settings.system, cameraAuthorized: true },
    };
    await handleUpdateSettings(updated);
    try {
      await runVisionFlow(prompt, speak);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Error de cámara.');
    }
  };

  const lastLinuMessage =
    [...history].reverse().find((m) => m.role === 'linu') ?? null;

  const isPetMode = settings.appearance.windowMode === 'desktop_pet';

  return (
    <main className="relative w-screen h-screen bg-[#070A08] overflow-hidden flex items-center justify-center">
      {/* Main Face Container: Fullscreen OR Movable/Resizable Desktop Pet */}
      <div
        style={
          isPetMode
            ? {
                position: 'fixed',
                left: petPos.x,
                top: petPos.y,
                width: petSize.width,
                height: petSize.height,
              }
            : undefined
        }
        className={
          isPetMode
            ? 'z-10 shadow-2xl rounded-[48px]'
            : 'relative w-full h-full'
        }
      >
        {/* Drag handle when in Desktop Pet mode */}
        {isPetMode && !settings.appearance.hideControls && (
          <div
            onMouseDown={(e) => {
              dragStateRef.current = {
                dragging: true,
                startX: e.clientX,
                startY: e.clientY,
                origX: petPos.x,
                origY: petPos.y,
              };
            }}
            title="Arrastra para mover a LINU por el escritorio"
            className="absolute top-2 left-1/2 -translate-x-1/2 z-30 w-20 h-3 rounded-full cursor-grab active:cursor-grabbing flex items-center justify-center group"
          >
            <span className="w-10 h-1 rounded-full bg-white/15 group-hover:bg-emerald-400/50 transition-colors" />
          </div>
        )}

        <LinuFace
          emotion={emotion}
          intensity={intensity}
          animation={animation}
          isListening={callActive && callState === 'listening'}
          isSpeaking={callState === 'speaking'}
          isResearching={isResearching}
          isCameraActive={isCameraActive}
          researchQuery={researchQuery}
          speechLevel={speechLevel}
          appearance={settings.appearance}
          showBoot={showBoot}
          onBootComplete={() => {
            setShowBoot(false);
            setEmotion('happiness');
            setAnimation('nod_yes');
            setHistory((prev) =>
              prev.length > 0
                ? prev
                : [
                    {
                      id: 'msg_boot_welcome',
                      role: 'linu',
                      text: '¡Kernel cargado! Hola, soy LINU. Puedes hablar conmigo pulsando «Hablar con LINU» o escribirme aquí abajo.',
                      emotion: 'happiness',
                      timestamp: new Date().toISOString(),
                    },
                  ]
            );
          }}
          onFaceClick={() => {
            lastInteractionRef.current = Date.now();
            if (!isResearching && callState === 'idle') {
              setEmotion('amusement');
              setAnimation('giggle_jiggle');
            }
          }}
        />

        {/* Resize corner handle in Desktop Pet mode */}
        {isPetMode && !settings.appearance.hideControls && (
          <div
            onMouseDown={(e) => {
              e.stopPropagation();
              resizeStateRef.current = {
                resizing: true,
                startX: e.clientX,
                startY: e.clientY,
                origW: petSize.width,
                origH: petSize.height,
              };
            }}
            title="Arrastra para cambiar el tamaño"
            className="absolute bottom-3 right-3 z-30 w-5 h-5 cursor-nwse-resize flex items-end justify-end p-1 opacity-40 hover:opacity-100 transition-opacity"
          >
            <span className="w-2.5 h-2.5 border-r-2 border-b-2 border-emerald-400/70 rounded-br-sm" />
          </div>
        )}

        {/* Subtitles & Interaction Dock */}
        <ConversationOverlay
          lastLinuMessage={lastLinuMessage}
          liveTranscript={liveTranscript}
          callActive={callActive}
          callState={callState}
          showSubtitles={settings.system.showSubtitles}
          hideControls={settings.appearance.hideControls}
          cameraAuthorized={settings.system.cameraAuthorized}
          isCameraActive={isCameraActive}
          errorMessage={errorMessage}
          onToggleCall={handleToggleCall}
          onInterruptSpeech={stopSpeaking}
          onSendText={processUserMessage}
          onTriggerVision={handleTriggerVision}
          onDismissError={() => setErrorMessage(null)}
        />
      </div>

      {/* ONLY permanent button in the UI: subtle Gear icon */}
      <button
        type="button"
        onClick={() => setSettingsOpen(true)}
        aria-label="Abrir configuración de LINU"
        title="Configuración de LINU"
        className="fixed top-4 right-4 z-40 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-2xl text-zinc-400/70 hover:text-emerald-300 hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
      >
        <Settings className="w-5 h-5" />
      </button>

      {/* Camera Consent Modal (only when user requests vision without prior authorization) */}
      {cameraConsentPrompt !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="max-w-sm w-full rounded-2xl bg-[#0D1410] border border-emerald-500/25 p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-semibold text-white">
              Autorizar cámara para LINU
            </h3>
            <p className="text-xs text-zinc-300 leading-relaxed">
              LINU solo abrirá la cámara un instante para capturar una imagen cuando se lo pidas
              y la cerrará inmediatamente después. Nunca graba en segundo plano.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setCameraConsentPrompt(null)}
                className="px-3.5 py-2 rounded-xl text-xs text-zinc-400 hover:text-white hover:bg-white/5"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmCameraConsent}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium"
              >
                Autorizar y mirar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Comprehensive 5-tab Settings Drawer */}
      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        memories={memories}
        onAddMemory={handleAddMemory}
        onUpdateMemory={handleUpdateMemory}
        onDeleteMemory={handleDeleteMemory}
        onClearMemories={handleClearMemories}
        hasGeminiKey={hasGeminiKey}
        currentEmotion={emotion}
        onPreviewEmotion={(emo) => {
          lastInteractionRef.current = Date.now();
          setIsResearching(false);
          setEmotion(emo);
          setIntensity(0.9);
          setAnimation('idle_breathe');
        }}
        onReplayBoot={() => setShowBoot(true)}
      />
    </main>
  );
}
