import { useCallback, useEffect, useRef, useState } from 'react';
import type { LinuEmotion, VoiceCallState, VoiceSettings } from '../types/linu';
import { safeFetchJson } from '../utils/api';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

interface UseVoiceCallOptions {
  voiceSettings: VoiceSettings;
  language: 'es-ES' | 'en-US';
  onUserUtterance: (transcript: string) => Promise<void>;
}

export function useVoiceCall({
  voiceSettings,
  language,
  onUserUtterance,
}: UseVoiceCallOptions) {
  const [callActive, setCallActive] = useState(false);
  const [callState, setCallState] = useState<VoiceCallState>('idle');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [speechLevel, setSpeechLevel] = useState(0);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const callActiveRef = useRef(false);
  const callStateRef = useRef<VoiceCallState>('idle');
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadRafRef = useRef<number>(0);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const useRecorderFallbackRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const voiceActiveFramesRef = useRef(0);
  const silenceSinceRef = useRef<number | null>(null);
  const isRecordingUtteranceRef = useRef(false);
  const bufferTranscriptRef = useRef('');
  const silenceTimerRef = useRef<number | null>(null);
  const isSubmittingRef = useRef(false);

  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const playbackRafRef = useRef<number>(0);
  const bargeInFramesRef = useRef(0);

  const voiceSettingsRef = useRef(voiceSettings);
  voiceSettingsRef.current = voiceSettings;

  const languageRef = useRef(language);
  languageRef.current = language;

  const onUserUtteranceRef = useRef(onUserUtterance);
  onUserUtteranceRef.current = onUserUtterance;

  const setSyncedState = useCallback((next: VoiceCallState) => {
    callStateRef.current = next;
    setCallState(next);
  }, []);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current !== null) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const stopSpeaking = useCallback(() => {
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current.src = '';
      activeAudioRef.current = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (playbackRafRef.current) {
      cancelAnimationFrame(playbackRafRef.current);
      playbackRafRef.current = 0;
    }
    setSpeechLevel(0);
  }, []);

  const startRecognition = useCallback(() => {
    if (!callActiveRef.current) return;

    const SpeechRecCtor =
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike })
        .webkitSpeechRecognition;

    if (!SpeechRecCtor) {
      // Enable MediaRecorder + Gemini Transcribe VAD fallback automatically
      useRecorderFallbackRef.current = true;
      return;
    }
    useRecorderFallbackRef.current = false;

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
    }

    const rec = new SpeechRecCtor();
    rec.lang = languageRef.current;
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (event) => {
      if (!callActiveRef.current) return;

      // Barge-in if LINU is currently speaking
      if (callStateRef.current === 'speaking' && voiceSettingsRef.current.bargeInEnabled) {
        stopSpeaking();
        setSyncedState('listening');
      }

      if (callStateRef.current === 'processing' || callStateRef.current === 'researching') {
        return;
      }

      let interim = '';
      let finalChunk = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const text = res[0]?.transcript ?? '';
        if (res.isFinal) {
          finalChunk += text + ' ';
        } else {
          interim += text;
        }
      }

      if (finalChunk.trim()) {
        bufferTranscriptRef.current = `${bufferTranscriptRef.current} ${finalChunk}`.trim();
      }

      const combined = `${bufferTranscriptRef.current} ${interim}`.trim();
      setLiveTranscript(combined);

      clearSilenceTimer();
      if (combined.length > 0) {
        const timeout = Math.max(600, voiceSettingsRef.current.silenceTimeoutMs);
        silenceTimerRef.current = window.setTimeout(async () => {
          const textToSend = bufferTranscriptRef.current.trim() || combined.trim();
          if (!textToSend || isSubmittingRef.current) return;

          bufferTranscriptRef.current = '';
          setLiveTranscript('');
          isSubmittingRef.current = true;
          try {
            setSyncedState('processing');
            await onUserUtteranceRef.current(textToSend);
          } finally {
            isSubmittingRef.current = false;
          }
        }, timeout);
      }
    };

    rec.onerror = (ev) => {
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
        setVoiceError('Permiso de micrófono denegado.');
        callActiveRef.current = false;
        setCallActive(false);
        setSyncedState('error');
      }
    };

    rec.onend = () => {
      if (callActiveRef.current) {
        window.setTimeout(() => {
          if (callActiveRef.current) {
            try {
              rec.start();
            } catch {
              // ignore restart race
            }
          }
        }, 180);
      }
    };

    try {
      rec.start();
      recognitionRef.current = rec;
    } catch {
      // ignore if already started
    }
  }, [clearSilenceTimer, setSyncedState, stopSpeaking]);

  // Monitor microphone RMS for barge-in interruption and VAD fallback recording
  const startVadLoop = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const data = new Uint8Array(analyser.fftSize);

    const finalizeFallbackRecording = () => {
      const rec = mediaRecorderRef.current;
      if (rec && rec.state === 'recording') {
        rec.stop();
      }
      isRecordingUtteranceRef.current = false;
      voiceActiveFramesRef.current = 0;
      silenceSinceRef.current = null;
    };

    const beginFallbackRecording = () => {
      if (!micStreamRef.current || isRecordingUtteranceRef.current) return;
      try {
        const mimeType = MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4';
        const mr = new MediaRecorder(micStreamRef.current, { mimeType });
        recordedChunksRef.current = [];
        mr.ondataavailable = (ev) => {
          if (ev.data.size > 0) recordedChunksRef.current.push(ev.data);
        };
        mr.onstop = async () => {
          const blob = new Blob(recordedChunksRef.current, { type: mimeType });
          recordedChunksRef.current = [];
          if (blob.size < 1800 || isSubmittingRef.current || !callActiveRef.current) return;

          isSubmittingRef.current = true;
          setSyncedState('processing');
          try {
            const base64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => {
                const res = String(reader.result || '');
                resolve(res.split(',')[1] || '');
              };
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
            const tr = await safeFetchJson<{ text?: string }>('/api/linu/transcribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ audioBase64: base64, mimeType }),
            });
            const text = (tr.text ?? '').trim();
            if (text) {
              await onUserUtteranceRef.current(text);
            } else if (callActiveRef.current) {
              setSyncedState('listening');
            }
          } catch {
            if (callActiveRef.current) setSyncedState('listening');
          } finally {
            isSubmittingRef.current = false;
          }
        };
        mr.start();
        mediaRecorderRef.current = mr;
        isRecordingUtteranceRef.current = true;
        silenceSinceRef.current = null;
      } catch {
        // ignore unsupported MediaRecorder
      }
    };

    const check = () => {
      if (!callActiveRef.current) return;
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);

      if (
        callStateRef.current === 'speaking' &&
        voiceSettingsRef.current.bargeInEnabled &&
        rms > 0.085
      ) {
        bargeInFramesRef.current += 1;
        if (bargeInFramesRef.current >= 5) {
          bargeInFramesRef.current = 0;
          stopSpeaking();
          setSyncedState('listening');
        }
      } else {
        bargeInFramesRef.current = 0;
      }

      // Fallback VAD recording loop when Web Speech API is absent
      if (useRecorderFallbackRef.current && callStateRef.current === 'listening') {
        if (rms > 0.045) {
          voiceActiveFramesRef.current += 1;
          silenceSinceRef.current = null;
          if (voiceActiveFramesRef.current >= 4 && !isRecordingUtteranceRef.current) {
            beginFallbackRecording();
          }
        } else if (isRecordingUtteranceRef.current) {
          if (silenceSinceRef.current === null) {
            silenceSinceRef.current = performance.now();
          } else if (
            performance.now() - silenceSinceRef.current >
            Math.max(800, voiceSettingsRef.current.silenceTimeoutMs)
          ) {
            finalizeFallbackRecording();
          }
        }
      }

      vadRafRef.current = requestAnimationFrame(check);
    };

    vadRafRef.current = requestAnimationFrame(check);
  }, [setSyncedState, stopSpeaking]);

  const startCall = useCallback(async () => {
    setVoiceError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      micStreamRef.current = stream;

      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analyserRef.current = analyser;

      callActiveRef.current = true;
      setCallActive(true);
      setSyncedState('listening');
      bufferTranscriptRef.current = '';
      setLiveTranscript('');

      startVadLoop();
      startRecognition();
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'No se pudo acceder al micrófono.';
      setVoiceError(`Micrófono no disponible: ${msg}`);
      setSyncedState('error');
    }
  }, [setSyncedState, startRecognition, startVadLoop]);

  const endCall = useCallback(() => {
    callActiveRef.current = false;
    setCallActive(false);
    clearSilenceTimer();
    stopSpeaking();

    if (vadRafRef.current) {
      cancelAnimationFrame(vadRafRef.current);
      vadRafRef.current = 0;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    isRecordingUtteranceRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    bufferTranscriptRef.current = '';
    setLiveTranscript('');
    setSyncedState('idle');
  }, [clearSilenceTimer, setSyncedState, stopSpeaking]);

  const speak = useCallback(
    async (text: string, emotion: LinuEmotion) => {
      if (!text.trim()) return;
      stopSpeaking();
      setSyncedState('speaking');

      const vs = voiceSettingsRef.current;

      const finishSpeech = () => {
        setSpeechLevel(0);
        if (callActiveRef.current) {
          setSyncedState(vs.continuousMode ? 'listening' : 'idle');
        } else {
          setSyncedState('idle');
        }
      };

      const speakWithBrowser = () => {
        if (!('speechSynthesis' in window)) {
          finishSpeech();
          return;
        }
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = languageRef.current;
        utter.rate = vs.rate;
        utter.volume = vs.volume;
        const voices = window.speechSynthesis.getVoices();
        const preferred = voices.find((v) =>
          v.lang.toLowerCase().startsWith(languageRef.current.slice(0, 2).toLowerCase())
        );
        if (preferred) utter.voice = preferred;

        const simInterval = window.setInterval(() => {
          setSpeechLevel(0.35 + Math.random() * 0.45);
        }, 90);

        utter.onend = () => {
          window.clearInterval(simInterval);
          finishSpeech();
        };
        utter.onerror = () => {
          window.clearInterval(simInterval);
          finishSpeech();
        };
        window.speechSynthesis.speak(utter);
      };

      if (vs.engine === 'browser') {
        speakWithBrowser();
        return;
      }

      try {
        const data = await safeFetchJson<{ audioBase64?: string; mimeType?: string }>(
          '/api/linu/tts',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text,
              voiceName: vs.geminiVoice,
              emotion,
              language: languageRef.current,
            }),
          }
        );
        if (!data.audioBase64) {
          speakWithBrowser();
          return;
        }

        const audio = new Audio(`data:${data.mimeType ?? 'audio/wav'};base64,${data.audioBase64}`);
        audio.volume = vs.volume;
        audio.playbackRate = vs.rate;
        activeAudioRef.current = audio;

        const pulseLoop = () => {
          if (!activeAudioRef.current || activeAudioRef.current.paused) return;
          setSpeechLevel(0.3 + Math.abs(Math.sin(performance.now() * 0.014)) * 0.55);
          playbackRafRef.current = requestAnimationFrame(pulseLoop);
        };

        audio.onplay = () => {
          playbackRafRef.current = requestAnimationFrame(pulseLoop);
        };
        audio.onended = () => {
          if (playbackRafRef.current) cancelAnimationFrame(playbackRafRef.current);
          activeAudioRef.current = null;
          finishSpeech();
        };
        audio.onerror = () => {
          if (playbackRafRef.current) cancelAnimationFrame(playbackRafRef.current);
          activeAudioRef.current = null;
          speakWithBrowser();
        };

        await audio.play();
      } catch {
        speakWithBrowser();
      }
    },
    [setSyncedState, stopSpeaking]
  );

  useEffect(() => {
    return () => {
      endCall();
    };
  }, [endCall]);

  return {
    callActive,
    callState,
    setCallState: setSyncedState,
    liveTranscript,
    speechLevel,
    voiceError,
    startCall,
    endCall,
    speak,
    stopSpeaking,
  };
}
