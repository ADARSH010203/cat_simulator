// Pure base-state machine: transition table + path resolution (spec 3.1).
// No three.js / React imports — unit-testable in isolation.

import type { CatStateId } from './runtime';

export const TRANSITIONS: Partial<Record<CatStateId, CatStateId[]>> = {
  sleep: ['wake', 'loaf'],
  wake: ['stretch', 'idle-stand', 'idle-sit'],
  stretch: ['idle-stand'],
  yawn: ['idle-stand', 'idle-sit'],
  groom: ['idle-sit', 'idle-stand'],
  knead: ['idle-sit', 'loaf', 'lie-side'],
  pounce: ['idle-stand', 'idle-sit', 'zoomies'],
  zoomies: ['idle-stand', 'idle-sit', 'walk'],
  walk: ['idle-stand', 'idle-sit', 'turn', 'zoomies'],
  turn: ['idle-stand', 'walk', 'idle-sit'],
  'idle-stand': ['idle-sit', 'walk', 'turn', 'loaf', 'lie-side', 'groom', 'stretch', 'yawn', 'knead', 'pounce', 'zoomies'],
  'idle-sit': ['idle-stand', 'walk', 'turn', 'loaf', 'lie-side', 'groom', 'stretch', 'yawn', 'knead', 'pounce'],
  loaf: ['idle-stand', 'idle-sit', 'lie-side', 'sleep'],
  'lie-side': ['loaf', 'sleep', 'idle-stand', 'idle-sit'],
};

export const LYING: CatStateId[] = ['loaf', 'lie-side', 'sleep'];

/** Resolve a path of states from `current` to `desired` (spec 3.1 rules). */
export function resolvePath(current: CatStateId, desired: CatStateId): CatStateId[] {
  if (current === desired) return [desired];
  const allowed = TRANSITIONS[current] ?? ['idle-stand'];
  if (allowed.includes(desired)) return [desired];

  // cats fall asleep by lying down first (spec: never sleep straight from standing)
  if (desired === 'sleep' && (current === 'idle-stand' || current === 'idle-sit')) {
    return ['lie-side', 'sleep'];
  }

  if (current === 'sleep') {
    if (desired === 'loaf') return ['loaf'];
    if (desired === 'lie-side') return ['wake', 'stretch', 'idle-stand', 'lie-side'];
    return ['wake', 'stretch', 'idle-stand', desired];
  }
  if (current === 'lie-side' || current === 'loaf') {
    return ['idle-stand', desired];
  }
  if (current === 'wake') return ['stretch', 'idle-stand', desired];
  // generic: go through a neutral state
  return ['idle-stand', desired];
}

export const STATE_DUR: Record<CatStateId, () => number> = {
  'idle-stand': () => 3 + Math.random() * 3,
  'idle-sit': () => 5 + Math.random() * 5,
  loaf: () => 8 + Math.random() * 7,
  'lie-side': () => 6 + Math.random() * 6,
  sleep: () => 24 + Math.random() * 18,
  wake: () => 1.4,
  stretch: () => 2.4,
  yawn: () => 1.8,
  groom: () => 3.5 + Math.random() * 1.5,
  knead: () => 4,
  pounce: () => 1.3,
  zoomies: () => 3.5 + Math.random() * 1.5,
  walk: () => 12,
  turn: () => 0.9,
};

export const AFTER_STATE: Partial<Record<CatStateId, CatStateId>> = {
  wake: 'stretch',
  stretch: 'idle-stand',
  yawn: 'idle-sit',
  turn: 'idle-stand',
  pounce: 'idle-stand',
  groom: 'idle-sit',
  knead: 'loaf',
  zoomies: 'idle-stand',
};
