import React, { useState } from 'react';
import {
  Camera,
  Check,
  Cpu,
  Edit3,
  Eye,
  Monitor,
  Palette,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import { EMOTION_PROFILES } from '../data/emotions';
import type {
  AccessoryId,
  BackgroundStyle,
  LinuEmotion,
  LinuSettings,
  MemoryItem,
} from '../types/linu';

interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  settings: LinuSettings;
  onUpdateSettings: (next: LinuSettings) => void;
  memories: MemoryItem[];
  onAddMemory: (category: MemoryItem['category'], content: string) => Promise<void>;
  onUpdateMemory: (id: string, content: string, category: MemoryItem['category']) => Promise<void>;
  onDeleteMemory: (id: string) => Promise<void>;
  onClearMemories: () => Promise<void>;
  hasGeminiKey: boolean;
  currentEmotion: LinuEmotion;
  onPreviewEmotion: (emotion: LinuEmotion) => void;
  onReplayBoot: () => void;
}

type SettingsTab = 'apariencia' | 'accesorios' | 'personalidad' | 'voz' | 'sistema';

const EYE_COLOR_PRESETS = [
  { label: 'Esmeralda Linux', value: '#10B981' },
  { label: 'Lima Terminal', value: '#84CC16' },
  { label: 'Menta Suave', value: '#34D399' },
  { label: 'Cian Hielo', value: '#22D3EE' },
  { label: 'Ámbar Cálido', value: '#FBBF24' },
  { label: 'Coral Claro', value: '#FB7185' },
];

const ACCESSORIES: Array<{ id: AccessoryId; label: string; detail: string }> = [
  { id: 'none', label: 'Sin accesorio', detail: 'Rostro limpio estilo OLED' },
  { id: 'classic_glasses', label: 'Gafas clásicas', detail: 'Montura ligera inteligente' },
  { id: 'tech_visor', label: 'Visor óptico', detail: 'Lente HUD de investigación' },
  { id: 'studio_headphones', label: 'Auriculares', detail: 'Diadema acústica lateral' },
  { id: 'linux_beanie', label: 'Gorro Linux', detail: 'Gorro tejido verde con pompón' },
  { id: 'wifi_antenna', label: 'Antena Wi-Fi', detail: 'Receptor superior con pulso' },
  { id: 'pixel_cap', label: 'Gorra Tech', detail: 'Visera oscura con emblema LED' },
];

const GEMINI_VOICES: Array<{ id: LinuSettings['voice']['geminiVoice']; desc: string }> = [
  { id: 'Puck', desc: 'Ágil, curiosa y expresiva' },
  { id: 'Zephyr', desc: 'Cálida, tranquila y natural' },
  { id: 'Kore', desc: 'Clara, amable y equilibrada' },
  { id: 'Charon', desc: 'Serena y algo grave' },
  { id: 'Fenrir', desc: 'Enérgica y entusiasta' },
];

const CATEGORY_LABELS: Record<MemoryItem['category'], string> = {
  preference: 'Preferencia',
  project: 'Proyecto',
  topic: 'Tema',
  personal: 'Personal',
  fact: 'Dato',
};

export const SettingsDrawer: React.FC<SettingsDrawerProps> = ({
  open,
  onClose,
  settings,
  onUpdateSettings,
  memories,
  onAddMemory,
  onUpdateMemory,
  onDeleteMemory,
  onClearMemories,
  hasGeminiKey,
  currentEmotion,
  onPreviewEmotion,
  onReplayBoot,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('apariencia');
  const [newMemText, setNewMemText] = useState('');
  const [newMemCategory, setNewMemCategory] = useState<MemoryItem['category']>('fact');
  const [editingMemId, setEditingMemId] = useState<string | null>(null);
  const [editingMemText, setEditingMemText] = useState('');

  if (!open) return null;

  const updateAppearance = <K extends keyof LinuSettings['appearance']>(
    key: K,
    val: LinuSettings['appearance'][K]
  ) => {
    onUpdateSettings({
      ...settings,
      appearance: { ...settings.appearance, [key]: val },
    });
  };

  const updatePersonality = <K extends keyof LinuSettings['personality']>(
    key: K,
    val: LinuSettings['personality'][K]
  ) => {
    onUpdateSettings({
      ...settings,
      personality: { ...settings.personality, [key]: val },
    });
  };

  const updateVoice = <K extends keyof LinuSettings['voice']>(
    key: K,
    val: LinuSettings['voice'][K]
  ) => {
    onUpdateSettings({
      ...settings,
      voice: { ...settings.voice, [key]: val },
    });
  };

  const updateSystem = <K extends keyof LinuSettings['system']>(
    key: K,
    val: LinuSettings['system'][K]
  ) => {
    onUpdateSettings({
      ...settings,
      system: { ...settings.system, [key]: val },
    });
  };

  const handleSaveNewMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemText.trim()) return;
    await onAddMemory(newMemCategory, newMemText.trim());
    setNewMemText('');
  };

  const tabs: Array<{ id: SettingsTab; label: string; icon: React.ReactNode }> = [
    { id: 'apariencia', label: 'Apariencia', icon: <Palette className="w-4 h-4" /> },
    { id: 'accesorios', label: 'Accesorios', icon: <Sparkles className="w-4 h-4" /> },
    { id: 'personalidad', label: 'Personalidad', icon: <Eye className="w-4 h-4" /> },
    { id: 'voz', label: 'Voz', icon: <Volume2 className="w-4 h-4" /> },
    { id: 'sistema', label: 'Sistema', icon: <Cpu className="w-4 h-4" /> },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Configuración de LINU"
    >
      <aside
        className="w-full max-w-xl h-full bg-[#0B100D] border-l border-emerald-500/15 text-zinc-100 flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-white">
              Configuración de LINU
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Personaliza su rostro, emociones, voz, memoria y entorno
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
            aria-label="Cerrar configuración"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Category Segmented Tabs */}
        <div className="px-6 py-3 border-b border-white/10 overflow-x-auto">
          <div className="flex items-center gap-1.5 min-w-max">
            {tabs.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                    active
                      ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                      : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/5 border border-transparent'
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto linu-scroll px-6 py-6 space-y-8">
          {/* APARIENCIA */}
          {activeTab === 'apariencia' && (
            <>
              <section className="space-y-4">
                <h3 className="text-sm font-semibold text-zinc-200">Color de los ojos</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {EYE_COLOR_PRESETS.map((preset) => {
                    const selected =
                      settings.appearance.eyeColor.toLowerCase() === preset.value.toLowerCase();
                    return (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => updateAppearance('eyeColor', preset.value)}
                        className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left text-xs transition-colors ${
                          selected
                            ? 'bg-emerald-500/10 border-emerald-500/40 text-white'
                            : 'bg-white/[0.02] border-white/10 text-zinc-300 hover:bg-white/5'
                        }`}
                      >
                        <span
                          className="w-4 h-4 rounded-md shrink-0"
                          style={{ backgroundColor: preset.value }}
                        />
                        <span className="truncate">{preset.label}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between pt-1">
                  <label htmlFor="custom-eye-color" className="text-xs text-zinc-400">
                    Color personalizado
                  </label>
                  <input
                    id="custom-eye-color"
                    type="color"
                    value={settings.appearance.eyeColor}
                    onChange={(e) => updateAppearance('eyeColor', e.target.value)}
                    className="w-10 h-8 rounded bg-transparent cursor-pointer border border-white/15"
                  />
                </div>
              </section>

              <section className="space-y-5 border-t border-white/10 pt-6">
                <h3 className="text-sm font-semibold text-zinc-200">Geometría y óptica</h3>
                <SliderRow
                  label="Intensidad del brillo"
                  value={settings.appearance.glowIntensity}
                  min={0.2}
                  max={1.5}
                  step={0.05}
                  display={`${Math.round(settings.appearance.glowIntensity * 100)}%`}
                  onChange={(v) => updateAppearance('glowIntensity', v)}
                />
                <SliderRow
                  label="Tamaño de ojos"
                  value={settings.appearance.eyeSize}
                  min={0.75}
                  max={1.25}
                  step={0.05}
                  display={`${Math.round(settings.appearance.eyeSize * 100)}%`}
                  onChange={(v) => updateAppearance('eyeSize', v)}
                />
                <SliderRow
                  label="Separación entre ojos"
                  value={settings.appearance.eyeSpacing}
                  min={0.75}
                  max={1.3}
                  step={0.05}
                  display={`${Math.round(settings.appearance.eyeSpacing * 100)}%`}
                  onChange={(v) => updateAppearance('eyeSpacing', v)}
                />
                <SliderRow
                  label="Velocidad de parpadeo"
                  value={settings.appearance.blinkSpeed}
                  min={0.5}
                  max={1.8}
                  step={0.1}
                  display={`${settings.appearance.blinkSpeed.toFixed(1)}x`}
                  onChange={(v) => updateAppearance('blinkSpeed', v)}
                />
                <SliderRow
                  label="Opacidad de ventana"
                  value={settings.appearance.transparency}
                  min={0.65}
                  max={1.0}
                  step={0.05}
                  display={`${Math.round(settings.appearance.transparency * 100)}%`}
                  onChange={(v) => updateAppearance('transparency', v)}
                />
              </section>

              <section className="space-y-4 border-t border-white/10 pt-6">
                <h3 className="text-sm font-semibold text-zinc-200">Ventana y fondo</h3>
                <div className="grid grid-cols-2 gap-2.5">
                  {(
                    [
                      { id: 'oled_deep', label: 'OLED Negro Puro' },
                      { id: 'emerald_mist', label: 'Bruma Esmeralda' },
                      { id: 'carbon_bezel', label: 'Carcasa Carbono' },
                      { id: 'translucent', label: 'Fondo Translúcido' },
                    ] as Array<{ id: BackgroundStyle; label: string }>
                  ).map((bg) => (
                    <button
                      key={bg.id}
                      type="button"
                      onClick={() => updateAppearance('backgroundStyle', bg.id)}
                      className={`px-3 py-2.5 rounded-xl border text-xs text-left transition-colors ${
                        settings.appearance.backgroundStyle === bg.id
                          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                          : 'bg-white/[0.02] border-white/10 text-zinc-300 hover:bg-white/5'
                      }`}
                    >
                      {bg.label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => updateAppearance('windowMode', 'fullscreen')}
                    className={`px-3 py-2.5 rounded-xl border text-xs transition-colors ${
                      settings.appearance.windowMode === 'fullscreen'
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                        : 'bg-white/[0.02] border-white/10 text-zinc-300 hover:bg-white/5'
                    }`}
                  >
                    Pantalla completa
                  </button>
                  <button
                    type="button"
                    onClick={() => updateAppearance('windowMode', 'desktop_pet')}
                    className={`px-3 py-2.5 rounded-xl border text-xs transition-colors ${
                      settings.appearance.windowMode === 'desktop_pet'
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                        : 'bg-white/[0.02] border-white/10 text-zinc-300 hover:bg-white/5'
                    }`}
                  >
                    Mascota flotante movible
                  </button>
                </div>

                <ToggleRow
                  label="Textura sutil de píxeles OLED"
                  checked={settings.appearance.scanlines}
                  onChange={(v) => updateAppearance('scanlines', v)}
                />
                <ToggleRow
                  label="Ocultar controles (modo dispositivo físico)"
                  description="Deja únicamente el pequeño engranaje visible en pantalla"
                  checked={settings.appearance.hideControls}
                  onChange={(v) => updateAppearance('hideControls', v)}
                />
              </section>

              <section className="space-y-3 border-t border-white/10 pt-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-zinc-200">
                    Probar las 20 emociones de LINU
                  </h3>
                  <span className="text-xs text-zinc-400">
                    Actual: {EMOTION_PROFILES[currentEmotion].labelEs}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(Object.keys(EMOTION_PROFILES) as LinuEmotion[]).map((emo) => {
                    const active = currentEmotion === emo;
                    return (
                      <button
                        key={emo}
                        type="button"
                        onClick={() => onPreviewEmotion(emo)}
                        className={`px-2.5 py-2 rounded-lg border text-xs truncate transition-colors ${
                          active
                            ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200'
                            : 'bg-white/[0.02] border-white/10 text-zinc-300 hover:bg-white/5'
                        }`}
                      >
                        {EMOTION_PROFILES[emo].labelEs}
                      </button>
                    );
                  })}
                </div>
              </section>
            </>
          )}

          {/* ACCESORIOS */}
          {activeTab === 'accesorios' && (
            <section className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-zinc-200">
                  Complementos para el rostro de LINU
                </h3>
                <p className="text-xs text-zinc-400 mt-1">
                  Los accesorios siguen el movimiento, inclinación y gestos de la cara en tiempo real.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ACCESSORIES.map((acc) => {
                  const selected = settings.appearance.accessory === acc.id;
                  return (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => updateAppearance('accessory', acc.id)}
                      className={`p-4 rounded-xl border text-left transition-colors ${
                        selected
                          ? 'bg-emerald-500/15 border-emerald-500/45 text-white'
                          : 'bg-white/[0.02] border-white/10 text-zinc-300 hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{acc.label}</span>
                        {selected && <Check className="w-4 h-4 text-emerald-400" />}
                      </div>
                      <p className="text-xs text-zinc-400 mt-1">{acc.detail}</p>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* PERSONALIDAD */}
          {activeTab === 'personalidad' && (
            <section className="space-y-6">
              <div className="space-y-5">
                <h3 className="text-sm font-semibold text-zinc-200">Rasgos de carácter</h3>
                <SliderRow
                  label="Sentido del humor"
                  value={settings.personality.humor}
                  min={0}
                  max={100}
                  step={5}
                  display={`${settings.personality.humor}%`}
                  onChange={(v) => updatePersonality('humor', v)}
                />
                <SliderRow
                  label="Tranquilidad"
                  value={settings.personality.calmness}
                  min={0}
                  max={100}
                  step={5}
                  display={`${settings.personality.calmness}%`}
                  onChange={(v) => updatePersonality('calmness', v)}
                />
                <SliderRow
                  label="Curiosidad"
                  value={settings.personality.curiosity}
                  min={0}
                  max={100}
                  step={5}
                  display={`${settings.personality.curiosity}%`}
                  onChange={(v) => updatePersonality('curiosity', v)}
                />
                <SliderRow
                  label="Entusiasmo"
                  value={settings.personality.enthusiasm}
                  min={0}
                  max={100}
                  step={5}
                  display={`${settings.personality.enthusiasm}%`}
                  onChange={(v) => updatePersonality('enthusiasm', v)}
                />
                <SliderRow
                  label="Sarcasmo moderado"
                  value={settings.personality.mildSarcasm}
                  min={0}
                  max={100}
                  step={5}
                  display={`${settings.personality.mildSarcasm}%`}
                  onChange={(v) => updatePersonality('mildSarcasm', v)}
                />
                <SliderRow
                  label="Amigabilidad"
                  value={settings.personality.friendliness}
                  min={0}
                  max={100}
                  step={5}
                  display={`${settings.personality.friendliness}%`}
                  onChange={(v) => updatePersonality('friendliness', v)}
                />
              </div>

              <div className="space-y-3 border-t border-white/10 pt-6">
                <h3 className="text-sm font-semibold text-zinc-200">Identidad Linux</h3>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'subtle', label: 'Sutil' },
                      { id: 'normal', label: 'Natural' },
                      { id: 'geek', label: 'Muy Linuxero' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => updatePersonality('linuxReferences', opt.id)}
                      className={`px-3 py-2.5 rounded-xl border text-xs font-medium transition-colors ${
                        settings.personality.linuxReferences === opt.id
                          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                          : 'bg-white/[0.02] border-white/10 text-zinc-300 hover:bg-white/5'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3 border-t border-white/10 pt-6">
                <h3 className="text-sm font-semibold text-zinc-200">Idioma de LINU</h3>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => updatePersonality('language', 'es-ES')}
                    className={`px-3 py-2.5 rounded-xl border text-xs font-medium transition-colors ${
                      settings.personality.language === 'es-ES'
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                        : 'bg-white/[0.02] border-white/10 text-zinc-300 hover:bg-white/5'
                    }`}
                  >
                    Español
                  </button>
                  <button
                    type="button"
                    onClick={() => updatePersonality('language', 'en-US')}
                    className={`px-3 py-2.5 rounded-xl border text-xs font-medium transition-colors ${
                      settings.personality.language === 'en-US'
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                        : 'bg-white/[0.02] border-white/10 text-zinc-300 hover:bg-white/5'
                    }`}
                  >
                    English
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* VOZ */}
          {activeTab === 'voz' && (
            <section className="space-y-6">
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-zinc-200">Motor de síntesis de voz</h3>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => updateVoice('engine', 'gemini')}
                    className={`px-3 py-2.5 rounded-xl border text-xs font-medium transition-colors ${
                      settings.voice.engine === 'gemini'
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                        : 'bg-white/[0.02] border-white/10 text-zinc-300 hover:bg-white/5'
                    }`}
                  >
                    Voz Natural IA (Gemini TTS)
                  </button>
                  <button
                    type="button"
                    onClick={() => updateVoice('engine', 'browser')}
                    className={`px-3 py-2.5 rounded-xl border text-xs font-medium transition-colors ${
                      settings.voice.engine === 'browser'
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                        : 'bg-white/[0.02] border-white/10 text-zinc-300 hover:bg-white/5'
                    }`}
                  >
                    Voz local del navegador
                  </button>
                </div>
              </div>

              {settings.voice.engine === 'gemini' && (
                <div className="space-y-3 border-t border-white/10 pt-5">
                  <h3 className="text-sm font-semibold text-zinc-200">Timbre de voz de LINU</h3>
                  <div className="space-y-2">
                    {GEMINI_VOICES.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => updateVoice('geminiVoice', v.id)}
                        className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-left transition-colors ${
                          settings.voice.geminiVoice === v.id
                            ? 'bg-emerald-500/15 border-emerald-500/40 text-white'
                            : 'bg-white/[0.02] border-white/10 text-zinc-300 hover:bg-white/5'
                        }`}
                      >
                        <div>
                          <span className="text-sm font-medium">{v.id}</span>
                          <span className="text-xs text-zinc-400 ml-2.5">· {v.desc}</span>
                        </div>
                        {settings.voice.geminiVoice === v.id && (
                          <Check className="w-4 h-4 text-emerald-400" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-5 border-t border-white/10 pt-5">
                <SliderRow
                  label="Velocidad del habla"
                  value={settings.voice.rate}
                  min={0.75}
                  max={1.35}
                  step={0.05}
                  display={`${settings.voice.rate.toFixed(2)}x`}
                  onChange={(v) => updateVoice('rate', v)}
                />
                <SliderRow
                  label="Volumen"
                  value={settings.voice.volume}
                  min={0}
                  max={1}
                  step={0.05}
                  display={`${Math.round(settings.voice.volume * 100)}%`}
                  onChange={(v) => updateVoice('volume', v)}
                />
                <SliderRow
                  label="Pausa de silencio al terminar de hablar"
                  value={settings.voice.silenceTimeoutMs}
                  min={700}
                  max={2400}
                  step={100}
                  display={`${(settings.voice.silenceTimeoutMs / 1000).toFixed(1)} s`}
                  onChange={(v) => updateVoice('silenceTimeoutMs', v)}
                />
              </div>

              <div className="space-y-3 border-t border-white/10 pt-5">
                <ToggleRow
                  label="Conversación continua automática"
                  description="Vuelve a escuchar automáticamente cuando LINU termina de responder"
                  checked={settings.voice.continuousMode}
                  onChange={(v) => updateVoice('continuousMode', v)}
                />
                <ToggleRow
                  label="Permitir interrumpir a LINU"
                  description="Detiene su voz en el acto si empiezas a hablar encima"
                  checked={settings.voice.bargeInEnabled}
                  onChange={(v) => updateVoice('bargeInEnabled', v)}
                />
              </div>
            </section>
          )}

          {/* SISTEMA */}
          {activeTab === 'sistema' && (
            <section className="space-y-6">
              {/* Connection status */}
              <div className="p-4 rounded-xl border border-white/10 bg-white/[0.02] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-zinc-200">
                    Motor de IA y Búsqueda Web
                  </span>
                  <span
                    className={`text-xs font-medium ${
                      hasGeminiKey ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    {hasGeminiKey ? 'Conectado en servidor' : 'Pendiente de variable de entorno'}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Las peticiones de conversación, investigación en Internet (Google Search) y visión
                  se procesan de forma segura en el backend usando la variable{' '}
                  <code className="font-mono text-emerald-300">GEMINI_API_KEY</code> del entorno.
                </p>
              </div>

              {/* Capabilities & Privacy */}
              <div className="space-y-3 border-t border-white/10 pt-5">
                <h3 className="text-sm font-semibold text-zinc-200">Capacidades y privacidad</h3>
                <ToggleRow
                  label="Investigación real en Internet"
                  description="Activa la búsqueda en vivo con fuentes verificadas y animación de ordenador"
                  checked={settings.system.researchEnabled}
                  onChange={(v) => updateSystem('researchEnabled', v)}
                />
                <ToggleRow
                  label="Autorizar cámara bajo demanda"
                  description="LINU solo abrirá la cámara cuando se lo pidas explícitamente"
                  checked={settings.system.cameraAuthorized}
                  onChange={(v) => updateSystem('cameraAuthorized', v)}
                />
                <ToggleRow
                  label="Mostrar subtítulos y fuentes en pantalla"
                  checked={settings.system.showSubtitles}
                  onChange={(v) => updateSystem('showSubtitles', v)}
                />
                <ToggleRow
                  label="Secuencia de arranque estilo Linux"
                  checked={settings.system.playBootSequence}
                  onChange={(v) => updateSystem('playBootSequence', v)}
                />
                <button
                  type="button"
                  onClick={() => {
                    onReplayBoot();
                    onClose();
                  }}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-white/10 text-xs text-zinc-300 hover:bg-white/5 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reiniciar secuencia de arranque ahora</span>
                </button>
              </div>

              {/* Memory CRUD */}
              <div className="space-y-4 border-t border-white/10 pt-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-200">
                      Memoria persistente ({memories.length})
                    </h3>
                    <p className="text-xs text-zinc-400">
                      Recuerdos reales guardados entre sesiones. Puedes editarlos o eliminarlos.
                    </p>
                  </div>
                  {memories.length > 0 && (
                    <button
                      type="button"
                      onClick={onClearMemories}
                      className="text-xs text-rose-400 hover:text-rose-300 transition-colors"
                    >
                      Borrar todo
                    </button>
                  )}
                </div>

                <ToggleRow
                  label="Activar memoria en conversaciones"
                  checked={settings.system.memoryEnabled}
                  onChange={(v) => updateSystem('memoryEnabled', v)}
                />
                <ToggleRow
                  label="Guardar recuerdos útiles automáticamente"
                  checked={settings.system.autoSaveMemories}
                  onChange={(v) => updateSystem('autoSaveMemories', v)}
                />

                <form onSubmit={handleSaveNewMemory} className="flex gap-2">
                  <select
                    value={newMemCategory}
                    onChange={(e) => setNewMemCategory(e.target.value as MemoryItem['category'])}
                    className="bg-[#121A15] border border-white/15 rounded-xl px-2.5 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
                    aria-label="Categoría del recuerdo"
                  >
                    {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={newMemText}
                    onChange={(e) => setNewMemText(e.target.value)}
                    placeholder="Añadir recuerdo manual (ej. Mi distro favorita es Fedora)"
                    className="flex-1 bg-[#121A15] border border-white/15 rounded-xl px-3 py-2 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    type="submit"
                    className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1 shrink-0 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Guardar</span>
                  </button>
                </form>

                {memories.length === 0 ? (
                  <p className="text-xs text-zinc-500 py-2">
                    Aún no hay recuerdos almacenados.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto linu-scroll pr-1">
                    {memories.map((mem) => (
                      <div
                        key={mem.id}
                        className="p-3 rounded-xl border border-white/10 bg-white/[0.02] flex items-start justify-between gap-3"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                            <span className="text-emerald-400 font-medium">
                              {CATEGORY_LABELS[mem.category]}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {new Date(mem.updatedAt).toLocaleDateString('es-ES', {
                                day: '2-digit',
                                month: 'short',
                              })}
                            </span>
                          </div>
                          {editingMemId === mem.id ? (
                            <div className="mt-1.5 flex gap-2">
                              <input
                                type="text"
                                value={editingMemText}
                                onChange={(e) => setEditingMemText(e.target.value)}
                                className="flex-1 bg-[#121A15] border border-emerald-500/40 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={async () => {
                                  if (editingMemText.trim()) {
                                    await onUpdateMemory(mem.id, editingMemText.trim(), mem.category);
                                  }
                                  setEditingMemId(null);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-xs"
                              >
                                Guardar
                              </button>
                            </div>
                          ) : (
                            <p className="text-xs text-zinc-200 mt-1 break-words">
                              {mem.content}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingMemId(mem.id);
                              setEditingMemText(mem.content);
                            }}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5"
                            aria-label="Editar recuerdo"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteMemory(mem.id)}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-white/5"
                            aria-label="Eliminar recuerdo"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Windows Desktop EXE packaging guide */}
              <div className="space-y-2.5 border-t border-white/10 pt-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
                  <Monitor className="w-4 h-4 text-emerald-400" />
                  <span>Aplicación de escritorio Windows 10 / 11 (.EXE)</span>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  El proyecto incluye configuración nativa de Electron en la carpeta{' '}
                  <code className="font-mono text-emerald-300">electron/</code> para ejecutar LINU
                  como ventana flotante sin bordes, transparente y siempre visible sobre Windows, y
                  generar el instalador <code className="font-mono text-emerald-300">.exe</code>.
                  Consulta <code className="font-mono text-emerald-300">README_WINDOWS.md</code> para
                  los comandos de compilación.
                </p>
                <div className="flex items-center gap-2 text-xs text-zinc-400 pt-1">
                  <Camera className="w-3.5 h-3.5 text-zinc-500" />
                  <span>
                    En Windows Electron, los permisos de micrófono y cámara se conceden de forma nativa.
                  </span>
                </div>
              </div>
            </section>
          )}
        </div>
      </aside>
    </div>
  );
};

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (val: number) => void;
}

const SliderRow: React.FC<SliderRowProps> = ({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}) => (
  <div className="space-y-1.5">
    <div className="flex items-center justify-between text-xs">
      <span className="text-zinc-300">{label}</span>
      <span className="font-mono text-emerald-400 tabular-nums">{display}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full accent-emerald-500 cursor-pointer"
    />
  </div>
);

interface ToggleRowProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (val: boolean) => void;
}

const ToggleRow: React.FC<ToggleRowProps> = ({
  label,
  description,
  checked,
  onChange,
}) => (
  <label className="flex items-center justify-between gap-4 py-1 cursor-pointer">
    <div>
      <div className="text-xs font-medium text-zinc-200">{label}</div>
      {description && <div className="text-[11px] text-zinc-400 mt-0.5">{description}</div>}
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${
        checked ? 'bg-emerald-600' : 'bg-zinc-700'
      }`}
    >
      <span
        className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  </label>
);
