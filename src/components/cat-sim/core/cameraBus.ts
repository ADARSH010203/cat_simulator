'use client';

// Camera preset bus — UI buttons & keyboard shortcuts request presets;
// the CameraRig inside the canvas animates to them.

import { create } from 'zustand';

export interface CameraPreset {
  pos: [number, number, number];
  target: [number, number, number];
}

export const CAMERA_PRESETS: Record<string, CameraPreset> = {
  front: { pos: [0, 0.85, 2.6], target: [0, 0.55, 0] },
  side: { pos: [2.7, 0.95, 0.2], target: [0, 0.5, 0] },
  back: { pos: [0, 1.15, -2.7], target: [0, 0.5, 0] },
  top: { pos: [0, 3.6, 0.05], target: [0, 0, 0] },
  face: { pos: [0, 0.82, 1.25], target: [0, 0.72, 0.05] },
  reset: { pos: [1.9, 1.45, 3.0], target: [0, 0.5, 0] },
};

interface CameraStore {
  preset: string;
  seq: number;
  request: (preset: string) => void;
}

export const useCameraStore = create<CameraStore>((set) => ({
  preset: 'reset',
  seq: 0,
  request: (preset) => set((s) => ({ preset, seq: s.seq + 1 })),
}));
