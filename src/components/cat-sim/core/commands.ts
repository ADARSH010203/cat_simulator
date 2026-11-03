'use client';

// Tiny command bus: UI buttons → runtime.command (consumed by the animation
// loop). Avoids React state for per-frame concerns.

import { runtime } from './runtime';
import { useKid } from '@/store/kidStore';

let cmdId = 0;

const COUNTERS: Record<string, keyof ReturnType<typeof useKid.getState>> = {
  pet: 'bumpPet',
  play: 'bumpPlay',
  sleep: 'bumpSleep',
  meow: 'bumpMeow',
  chirp: 'bumpMeow',
  purr: 'bumpMeow',
};

export function sendCommand(action: string): void {
  runtime.command = { id: ++cmdId, action };
  const counter = COUNTERS[action];
  if (counter) {
    const fn = useKid.getState()[counter] as () => void;
    if (typeof fn === 'function') fn();
  }
}
