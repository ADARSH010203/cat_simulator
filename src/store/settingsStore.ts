'use client';

// Persisted settings store — everything the user can tweak in the panel.
// Per-frame animation values live in `runtime`, never here (spec rule 0.6).

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type PatternType = 'solid' | 'tabby' | 'spots' | 'patches' | 'tuxedo' | 'colorpoint';
export type Accessory = 'none' | 'collar' | 'bow';
export type EnvironmentId =
  | 'garden'
  | 'livingroom'
  | 'studio'
  | 'bedroom'
  | 'forest'
  | 'beach'
  | 'nightsky';
export type FurQuality = 'low' | 'medium' | 'high';
export type EchoEngineId = 'recorded' | 'tts' | 'auto';
export type InputStyle = 'hold' | 'handsfree';

export interface CoatSettings {
  baseColor: string;
  patternColor: string;
  patternType: PatternType;
  patternIntensity: number; // 0..1
  bellyColor: string;
  pawColor: string;
  maskColor: string;
  innerEarColor: string;
  noseColor: string;
}

export interface EyeSettings {
  colorL: string;
  colorR: string;
  oddEyed: boolean;
}

export interface PositionSettings {
  x: number;
  y: number;
  z: number;
  rotY: number; // degrees
  scale: number; // 0.5..2
}

export interface VoiceSettings {
  echoOn: boolean;
  inputStyle: InputStyle;
  engine: EchoEngineId;
  pitch: number; // playbackRate 1.0..2.2
  speed: number;
  volume: number;
  repeatTwice: boolean;
  meowAtEnd: boolean;
  subtitles: boolean;
  language: string;
  sensitivity: number; // 0..1
  micId: string;
}

export interface SettingsState {
  schemaVersion: number;
  // appearance
  catName: string;
  coat: CoatSettings;
  eyes: EyeSettings;
  accessory: Accessory;
  // position
  position: PositionSettings;
  // environment
  environment: EnvironmentId;
  envLightIntensity: number;
  // camera
  autoRotate: boolean;
  // animation
  paused: boolean;
  speed: number; // 0.25..2
  autoIdle: boolean;
  lookAtPointer: boolean;
  sound: boolean;
  masterVolume: number; // 0..1
  purrVolume: number; // 0..1
  // voice
  voice: VoiceSettings;
  // ui
  panelOpen: boolean;
  activeTab: string;
  reducedMotion: boolean;
  haptics: boolean;
  // quality
  furQuality: FurQuality;
  setCatName: (v: string) => void;
  setCoat: (patch: Partial<CoatSettings>) => void;
  setEyes: (patch: Partial<EyeSettings>) => void;
  setAccessory: (v: Accessory) => void;
  setPosition: (patch: Partial<PositionSettings>) => void;
  setEnvironment: (v: EnvironmentId) => void;
  setEnvLightIntensity: (v: number) => void;
  setAutoRotate: (v: boolean) => void;
  setAnim: (patch: Partial<Pick<SettingsState, 'paused' | 'speed' | 'autoIdle' | 'lookAtPointer' | 'sound' | 'masterVolume' | 'purrVolume'>>) => void;
  setVoice: (patch: Partial<VoiceSettings>) => void;
  setUI: (patch: Partial<Pick<SettingsState, 'panelOpen' | 'activeTab' | 'reducedMotion' | 'haptics'>>) => void;
  setFurQuality: (v: FurQuality) => void;
  resetAll: () => void;
}

export const COAT_PRESETS: Record<string, CoatSettings> = {
  White: {
    baseColor: '#f5efe6', patternColor: '#e8dfd2', patternType: 'solid', patternIntensity: 0.3,
    bellyColor: '#fbf8f2', pawColor: '#fbf8f2', maskColor: '#f5efe6', innerEarColor: '#f2b8c6', noseColor: '#e88ca0',
  },
  Black: {
    baseColor: '#2e2a2e', patternColor: '#262229', patternType: 'solid', patternIntensity: 0.3,
    bellyColor: '#3a343a', pawColor: '#2e2a2e', maskColor: '#2e2a2e', innerEarColor: '#c98d9d', noseColor: '#b06a78',
  },
  'Orange tabby': {
    baseColor: '#e8963c', patternColor: '#c26a1e', patternType: 'tabby', patternIntensity: 0.85,
    bellyColor: '#f7e3c3', pawColor: '#f7e3c3', maskColor: '#f2d3a7', innerEarColor: '#f2b8c6', noseColor: '#e07d8a',
  },
  'Gray tabby': {
    baseColor: '#9aa0a8', patternColor: '#6b7178', patternType: 'tabby', patternIntensity: 0.8,
    bellyColor: '#e8ebee', pawColor: '#e8ebee', maskColor: '#d9dee3', innerEarColor: '#f0b6c2', noseColor: '#d98a95',
  },
  Brown: {
    baseColor: '#8a6a4f', patternColor: '#6e4f38', patternType: 'solid', patternIntensity: 0.4,
    bellyColor: '#c4a984', pawColor: '#c4a984', maskColor: '#b59a75', innerEarColor: '#eab0ba', noseColor: '#c9767f',
  },
  Cream: {
    baseColor: '#eddcbe', patternColor: '#dfc9a4', patternType: 'solid', patternIntensity: 0.25,
    bellyColor: '#f8efe0', pawColor: '#f8efe0', maskColor: '#f8efe0', innerEarColor: '#f4bcc8', noseColor: '#e592a0',
  },
  Calico: {
    baseColor: '#f2ead9', patternColor: '#d9822b', patternType: 'patches', patternIntensity: 0.95,
    bellyColor: '#faf5ec', pawColor: '#faf5ec', maskColor: '#f2ead9', innerEarColor: '#f2b8c6', noseColor: '#e08e9b',
  },
  Tuxedo: {
    baseColor: '#2b272b', patternColor: '#2b272b', patternType: 'tuxedo', patternIntensity: 0.9,
    bellyColor: '#f5f2ec', pawColor: '#f5f2ec', maskColor: '#f5f2ec', innerEarColor: '#cf93a1', noseColor: '#c97a88',
  },
  'Siamese point': {
    baseColor: '#e9ddc8', patternColor: '#5b4a42', patternType: 'colorpoint', patternIntensity: 0.9,
    bellyColor: '#f2ebdc', pawColor: '#5b4a42', maskColor: '#5b4a42', innerEarColor: '#d9a3ad', noseColor: '#b06a78',
  },
};

export const EYE_PRESETS: Array<{ label: string; color: string }> = [
  { label: 'Green', color: '#5da644' },
  { label: 'Amber', color: '#d99a2b' },
  { label: 'Blue', color: '#5aa7c9' },
  { label: 'Copper', color: '#b5622a' },
  { label: 'Gold', color: '#e0b83d' },
];

const DEFAULT_COAT: CoatSettings = COAT_PRESETS['Orange tabby'];

const DEFAULTS = {
  schemaVersion: 1,
  catName: 'Mochi',
  coat: { ...DEFAULT_COAT },
  eyes: { colorL: '#5da644', colorR: '#5da644', oddEyed: false },
  accessory: 'none' as Accessory,
  position: { x: 0, y: 0, z: 0, rotY: 0, scale: 1 },
  environment: 'garden' as EnvironmentId,
  envLightIntensity: 1,
  autoRotate: false,
  paused: false,
  speed: 1,
  autoIdle: true,
  lookAtPointer: true,
  sound: true,
  masterVolume: 0.8,
  purrVolume: 0.7,
  voice: {
    echoOn: false,
    inputStyle: 'hold' as InputStyle,
    engine: 'auto' as EchoEngineId,
    pitch: 1.5,
    speed: 1.1,
    volume: 0.9,
    repeatTwice: false,
    meowAtEnd: true,
    subtitles: true,
    language: 'en-IN',
    sensitivity: 0.5,
    micId: '',
  },
  // first paint: desktop opens the panel, mobile keeps the cat unobstructed
  panelOpen: typeof window !== 'undefined' ? window.innerWidth >= 768 : true,
  activeTab: 'appearance',
  reducedMotion: false,
  haptics: true,
  furQuality: 'high' as FurQuality,
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      setCatName: (v) => set({ catName: v.slice(0, 20) }),
      setCoat: (patch) => set((s) => ({ coat: { ...s.coat, ...patch } })),
      setEyes: (patch) => set((s) => ({ eyes: { ...s.eyes, ...patch } })),
      setAccessory: (v) => set({ accessory: v }),
      setPosition: (patch) => set((s) => ({ position: { ...s.position, ...patch } })),
      setEnvironment: (v) => set({ environment: v }),
      setEnvLightIntensity: (v) => set({ envLightIntensity: v }),
      setAutoRotate: (v) => set({ autoRotate: v }),
      setAnim: (patch) => set((s) => ({ ...patch })),
      setVoice: (patch) => set((s) => ({ voice: { ...s.voice, ...patch } })),
      setUI: (patch) => set((s) => ({ ...patch })),
      setFurQuality: (v) => set({ furQuality: v }),
      resetAll: () =>
        set((s) => ({
          ...structuredClone(DEFAULTS),
          // keep UI preferences that are device-specific
          panelOpen: s.panelOpen,
          activeTab: s.activeTab,
          furQuality: s.furQuality,
        })),
    }),
    {
      name: 'cat-sim-settings',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      migrate: (state: unknown, _version: number) => state as SettingsState,
    }
  )
);

/** CSS HSL (degrees, %, %) → #rrggbb. Keeps every stored coat colour a plain
 *  hex string so <input type="color"> shows it and canvas gradient alpha
 *  appends stay valid (hsl() strings crashed the 3D texture generator). */
const hslToHex = (h: number, s: number, l: number): string => {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number): number => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l / 100 - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)))));
  };
  return `#${[f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};

export const surpriseCoat = (): Partial<CoatSettings> => {
  const patterns: PatternType[] = ['solid', 'tabby', 'spots', 'patches', 'tuxedo', 'colorpoint'];
  const hue = Math.floor(Math.random() * 360);
  const sat = 15 + Math.random() * 45;
  const light = 35 + Math.random() * 40;
  return {
    baseColor: hslToHex(hue, sat, light),
    patternColor: hslToHex(hue + randHue(), sat + 8, Math.max(12, light - 18)),
    bellyColor: hslToHex(hue, sat - 8, Math.min(94, light + 32)),
    pawColor: hslToHex(hue, sat - 8, Math.min(94, light + 32)),
    maskColor: hslToHex(hue + randHue(), sat - 5, Math.min(90, light + 22)),
    innerEarColor: hslToHex(350, 55, 74),
    noseColor: hslToHex(348, 50 + Math.random() * 15, 62),
    patternType: patterns[Math.floor(Math.random() * patterns.length)],
    patternIntensity: 0.5 + Math.random() * 0.5,
  };
};

const randHue = (): number => (Math.random() - 0.5) * 40;
