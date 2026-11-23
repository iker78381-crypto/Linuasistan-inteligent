export type LinuEmotion =
  | 'happiness'
  | 'sadness'
  | 'surprise'
  | 'curiosity'
  | 'anger'
  | 'confusion'
  | 'embarrassment'
  | 'fear'
  | 'enthusiasm'
  | 'boredom'
  | 'calm'
  | 'pride'
  | 'concentration'
  | 'doubt'
  | 'extreme_joy'
  | 'frustration'
  | 'amusement'
  | 'admiration'
  | 'sleepy'
  | 'affection';

export type LinuAnimation =
  | 'idle_breathe'
  | 'celebrate_bounce'
  | 'lean_in'
  | 'look_around'
  | 'head_tilt'
  | 'nod_yes'
  | 'shake_no'
  | 'shiver_worry'
  | 'sparkle_gaze'
  | 'sleep_drift'
  | 'giggle_jiggle'
  | 'focus_scan';

export type LinuExpression =
  | 'happy_arcs'
  | 'droopy_soft'
  | 'wide_eyes'
  | 'tilted_curious'
  | 'sharp_brows'
  | 'asymmetric_squint'
  | 'shy_blush'
  | 'worried_oval'
  | 'bright_stars'
  | 'half_lids'
  | 'relaxed_oval'
  | 'confident_smirk'
  | 'narrow_focus'
  | 'side_glance'
  | 'euphoric_crescents'
  | 'tense_squint'
  | 'playful_wink'
  | 'awestruck_glow'
  | 'sleepy_lines'
  | 'warm_hearts';

export type AccessoryId =
  | 'none'
  | 'classic_glasses'
  | 'tech_visor'
  | 'studio_headphones'
  | 'linux_beanie'
  | 'wifi_antenna'
  | 'pixel_cap';

export type BackgroundStyle = 'oled_deep' | 'emerald_mist' | 'carbon_bezel' | 'translucent';

export interface AppearanceSettings {
  eyeColor: string;
  accentColor: string;
  glowIntensity: number; // 0.2 to 1.5
  eyeSize: number; // 0.75 to 1.3
  eyeSpacing: number; // 0.75 to 1.35
  blinkSpeed: number; // 0.5 to 1.8
  backgroundStyle: BackgroundStyle;
  scanlines: boolean;
  windowMode: 'fullscreen' | 'desktop_pet';
  petSize: 'compact' | 'medium' | 'large';
  hideControls: boolean;
  transparency: number; // 0.65 to 1
  accessory: AccessoryId;
}

export interface PersonalitySettings {
  humor: number; // 0 to 100
  calmness: number; // 0 to 100
  curiosity: number; // 0 to 100
  enthusiasm: number; // 0 to 100
  mildSarcasm: number; // 0 to 100
  friendliness: number; // 0 to 100
  linuxReferences: 'subtle' | 'normal' | 'geek';
  language: 'es-ES' | 'en-US';
}

export interface VoiceSettings {
  engine: 'gemini' | 'browser';
  geminiVoice: 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr';
  rate: number; // 0.75 to 1.35
  volume: number; // 0 to 1
  continuousMode: boolean;
  bargeInEnabled: boolean;
  silenceTimeoutMs: number;
}

export interface SystemSettings {
  researchEnabled: boolean;
  cameraAuthorized: boolean;
  memoryEnabled: boolean;
  autoSaveMemories: boolean;
  showSubtitles: boolean;
  playBootSequence: boolean;
}

export interface LinuSettings {
  appearance: AppearanceSettings;
  personality: PersonalitySettings;
  voice: VoiceSettings;
  system: SystemSettings;
}

export interface MemoryItem {
  id: string;
  category: 'preference' | 'project' | 'topic' | 'personal' | 'fact';
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface ResearchSource {
  title: string;
  url: string;
  domain: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'linu';
  text: string;
  emotion?: LinuEmotion;
  intensity?: number;
  sources?: ResearchSource[];
  timestamp: string;
  usedVision?: boolean;
  usedResearch?: boolean;
}

export interface LinuAIResponse {
  emotion: LinuEmotion;
  intensity: number;
  expression: LinuExpression;
  animation: LinuAnimation;
  response: string;
  shouldResearch?: boolean;
  researchQuery?: string;
  needsCamera?: boolean;
  cameraPrompt?: string;
  memoryCandidate?: {
    category: MemoryItem['category'];
    content: string;
  } | null;
  sources?: ResearchSource[];
  distinctionNote?: string;
}

export type VoiceCallState =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'researching'
  | 'speaking'
  | 'error';
