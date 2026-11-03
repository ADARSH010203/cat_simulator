'use client';

// Kid mode store: counts every fun action the child does and unlocks stickers.
// Persisted in localStorage so the sticker collection survives reloads.

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface Sticker {
  id: string;
  emoji: string;
  name: string;
  hint: string; // how to earn it (kid-friendly)
}

// 12 stickers covering the whole app — gives a clear "what can I do" map too.
export const STICKERS: Sticker[] = [
  { id: 'first-pet',    emoji: '🐾', name: 'First Pet',     hint: 'Tap the Pet button once.' },
  { id: 'pet-10',       emoji: '💖', name: 'Pet Lover',     hint: 'Pet Mochi 10 times.' },
  { id: 'pet-50',       emoji: '😻', name: 'Best Friend',   hint: 'Pet Mochi 50 times.' },
  { id: 'first-talk',   emoji: '🗣️', name: 'Hello!',        hint: 'Try Talking Echo Mode once.' },
  { id: 'first-meow',   emoji: '🐱', name: 'Meow Maker',    hint: 'Make her meow once.' },
  { id: 'first-play',   emoji: '🎾', name: 'Playmate',       hint: 'Press Play once.' },
  { id: 'first-sleep',  emoji: '💤', name: 'Sweet Dreams',   hint: 'Send her to sleep once.' },
  { id: 'all-worlds',   emoji: '🌍', name: 'Explorer',       hint: 'Visit all 7 worlds.' },
  { id: 'coats-5',      emoji: '🎨', name: 'Stylist',        hint: 'Try 5 different coats.' },
  { id: 'surprise-3',   emoji: '✨', name: 'Surprise!',      hint: 'Use Surprise me 3 times.' },
  { id: 'echo-repeat',  emoji: '🔁', name: 'Echo Master',     hint: 'Talk to her 5 times.' },
  { id: 'strokes-100',  emoji: '🌟', name: 'Magic Hands',    hint: 'Stroke her 100 times.' },
];

const STICKER_IDS = new Set(STICKERS.map((s) => s.id));

export interface KidState {
  petCount: number;
  strokeCount: number;
  playCount: number;
  sleepCount: number;
  meowCount: number;
  talkCount: number;
  surpriseCount: number;
  coatsTried: number;
  worldsVisited: string[];
  unlocked: string[];
  lastUnlock: string | null; // sticker id, for the popup
  bumpPet: () => void;
  bumpStroke: (n?: number) => void;
  bumpPlay: () => void;
  bumpSleep: () => void;
  bumpMeow: () => void;
  bumpTalk: () => void;
  bumpSurprise: () => void;
  setCoatsTried: (n: number) => void;
  visitWorld: (id: string) => void;
  reset: () => void;
}

function checkUnlocks(state: KidState): { unlocked: string[]; lastUnlock: string | null } {
  const earned = new Set(state.unlocked);
  const before = earned.size;
  const tryUnlock = (id: string, cond: boolean): void => {
    if (cond && !earned.has(id) && STICKER_IDS.has(id)) earned.add(id);
  };
  tryUnlock('first-pet',   state.petCount >= 1);
  tryUnlock('pet-10',     state.petCount >= 10);
  tryUnlock('pet-50',      state.petCount >= 50);
  tryUnlock('first-talk',  state.talkCount >= 1);
  tryUnlock('first-meow',  state.meowCount >= 1);
  tryUnlock('first-play',  state.playCount >= 1);
  tryUnlock('first-sleep', state.sleepCount >= 1);
  tryUnlock('all-worlds',  state.worldsVisited.length >= 7);
  tryUnlock('coats-5',     state.coatsTried >= 5);
  tryUnlock('surprise-3',  state.surpriseCount >= 3);
  tryUnlock('echo-repeat', state.talkCount >= 5);
  tryUnlock('strokes-100', state.strokeCount >= 100);
  const after = earned.size;
  // newest sticker is the highest-index newly-earned one
  let lastUnlock: string | null = state.lastUnlock;
  if (after > before) {
    const newlyEarned = STICKERS.filter((s) => earned.has(s.id) && !state.unlocked.includes(s.id));
    if (newlyEarned.length > 0) lastUnlock = newlyEarned[newlyEarned.length - 1].id;
  }
  return { unlocked: Array.from(earned), lastUnlock };
}

export const useKid = create<KidState>()(
  persist(
    (set) => ({
      petCount: 0,
      strokeCount: 0,
      playCount: 0,
      sleepCount: 0,
      meowCount: 0,
      talkCount: 0,
      surpriseCount: 0,
      coatsTried: 0,
      worldsVisited: [],
      unlocked: [],
      lastUnlock: null,
      bumpPet: () =>
        set((s) => {
          const next = { ...s, petCount: s.petCount + 1 };
          return { ...next, ...checkUnlocks(next) };
        }),
      bumpStroke: (n = 1) =>
        set((s) => {
          const next = { ...s, strokeCount: s.strokeCount + n };
          return { ...next, ...checkUnlocks(next) };
        }),
      bumpPlay: () =>
        set((s) => {
          const next = { ...s, playCount: s.playCount + 1 };
          return { ...next, ...checkUnlocks(next) };
        }),
      bumpSleep: () =>
        set((s) => {
          const next = { ...s, sleepCount: s.sleepCount + 1 };
          return { ...next, ...checkUnlocks(next) };
        }),
      bumpMeow: () =>
        set((s) => {
          const next = { ...s, meowCount: s.meowCount + 1 };
          return { ...next, ...checkUnlocks(next) };
        }),
      bumpTalk: () =>
        set((s) => {
          const next = { ...s, talkCount: s.talkCount + 1 };
          return { ...next, ...checkUnlocks(next) };
        }),
      bumpSurprise: () =>
        set((s) => {
          const next = { ...s, surpriseCount: s.surpriseCount + 1 };
          return { ...next, ...checkUnlocks(next) };
        }),
      setCoatsTried: (n) =>
        set((s) => {
          const next = { ...s, coatsTried: Math.max(s.coatsTried, n) };
          return { ...next, ...checkUnlocks(next) };
        }),
      visitWorld: (id) =>
        set((s) => {
          if (s.worldsVisited.includes(id)) return s;
          const next = { ...s, worldsVisited: [...s.worldsVisited, id] };
          return { ...next, ...checkUnlocks(next) };
        }),
      reset: () =>
        set({
          petCount: 0,
          strokeCount: 0,
          playCount: 0,
          sleepCount: 0,
          meowCount: 0,
          talkCount: 0,
          surpriseCount: 0,
          coatsTried: 0,
          worldsVisited: [],
          unlocked: [],
          lastUnlock: null,
        }),
    }),
    {
      name: 'cat-sim-kid',
      version: 1,
      storage: createJSONStorage(() => localStorage),
    }
  )
);
