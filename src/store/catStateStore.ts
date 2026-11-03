'use client';

// Live cat state — low-frequency values surfaced to React UI (mood, needs, echo).
// NOT persisted. Written at most a few times per second from the animation loop.

import { create } from 'zustand';
import type { CatStateId, EchoStateId, ReactionId } from '@/components/cat-sim/core/runtime';

export type Mood = 'playful' | 'happy' | 'calm' | 'sleepy' | 'annoyed' | 'startled' | 'neutral';

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error' | 'success';
}

export interface CatLiveState {
  mood: Mood;
  affection: number;
  energy: number;
  baseState: CatStateId;
  echoState: EchoStateId;
  reaction: ReactionId | null;
  subtitle: string;
  micLevel: number;
  listening: boolean;
  speaking: boolean;
  permission: 'granted' | 'denied' | 'prompt' | 'unsupported';
  micError: string;
  ttsSupported: boolean;
  fps: number;
  lastReactionText: string;
  toasts: Toast[];
  setLive: (patch: Partial<Omit<CatLiveState, 'setLive' | 'pushToast' | 'dismissToast' | 'pushReactionText'>>) => void;
  pushToast: (text: string, kind?: Toast['kind']) => void;
  dismissToast: (id: number) => void;
  pushReactionText: (text: string) => void;
}

let toastId = 1;

export const useCatLive = create<CatLiveState>((set) => ({
  mood: 'calm',
  affection: 55,
  energy: 70,
  baseState: 'idle-sit',
  echoState: 'EchoOff',
  reaction: null,
  subtitle: '',
  micLevel: 0,
  listening: false,
  speaking: false,
  permission: 'prompt',
  micError: '',
  ttsSupported: false,
  fps: 60,
  lastReactionText: '',
  toasts: [],
  setLive: (patch) => set(patch),
  pushToast: (text, kind = 'info') =>
    set((s) => ({
      toasts: [...s.toasts.slice(-2), { id: toastId++, text, kind }],
    })),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  pushReactionText: (text) => set({ lastReactionText: text }),
}));
