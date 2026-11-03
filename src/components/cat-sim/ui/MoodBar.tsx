'use client';

// Subtle mood / needs indicators — never cover the cat (top-left chips).
// Kid-friendly: bigger emoji + word + name, brighter pills.

import { useCatLive, type Mood } from '@/store/catStateStore';
import { useSettings } from '@/store/settingsStore';
import { useKid } from '@/store/kidStore';

const MOOD_FACE: Record<Mood, string> = {
  playful: '😺',
  happy: '😻',
  calm: '🐱',
  sleepy: '😴',
  annoyed: '😼',
  startled: '🙀',
  neutral: '🐱',
};

const MOOD_LABEL: Record<Mood, string> = {
  playful: 'playful',
  happy: 'happy',
  calm: 'calm',
  sleepy: 'sleepy',
  annoyed: 'annoyed',
  startled: 'startled',
  neutral: 'chilling',
};

const MOOD_BG: Record<Mood, string> = {
  playful: 'from-rose-100 to-amber-100 text-rose-700',
  happy: 'from-pink-100 to-amber-100 text-pink-700',
  calm: 'from-sky-100 to-emerald-100 text-sky-700',
  sleepy: 'from-indigo-100 to-sky-100 text-indigo-700',
  annoyed: 'from-orange-100 to-amber-100 text-orange-700',
  startled: 'from-amber-100 to-rose-100 text-amber-700',
  neutral: 'from-stone-100 to-amber-100 text-stone-700',
};

export function MoodBar(): React.ReactElement {
  const mood = useCatLive((s) => s.mood);
  const affection = useCatLive((s) => s.affection);
  const energy = useCatLive((s) => s.energy);
  const state = useCatLive((s) => s.baseState);
  const fps = useCatLive((s) => s.fps);
  const catName = useSettings((s) => s.catName);
  const unlocked = useKid((s) => s.unlocked.length);

  return (
    <div className="pointer-events-none fixed left-3 top-3 z-30 flex flex-col items-start gap-1.5" aria-hidden>
      <div
        className={`kid-mood-pill flex items-center gap-2 rounded-full border-2 border-white bg-gradient-to-r px-3.5 py-1.5 text-sm font-extrabold shadow-md ${MOOD_BG[mood]}`}
      >
        <span className="text-xl" aria-hidden>{MOOD_FACE[mood]}</span>
        <span>
          {catName} is <span className="underline decoration-2 underline-offset-2">{MOOD_LABEL[mood]}</span>
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className="rounded-full border border-white bg-white/85 px-2.5 py-1 text-[11px] font-bold text-rose-600 shadow-sm backdrop-blur-md dark:bg-stone-900/70"
          title="Affection"
        >
          ❤️ {Math.round(affection)}%
        </span>
        <span
          className="rounded-full border border-white bg-white/85 px-2.5 py-1 text-[11px] font-bold text-amber-600 shadow-sm backdrop-blur-md dark:bg-stone-900/70"
          title="Energy"
        >
          ⚡ {Math.round(energy)}%
        </span>
        <span
          className="rounded-full border border-white bg-white/85 px-2.5 py-1 text-[11px] font-bold text-emerald-600 shadow-sm backdrop-blur-md dark:bg-stone-900/70"
          title="Stickers"
        >
          🏆 {unlocked}/12
        </span>
      </div>
      <div className="rounded-full bg-white/50 px-2 py-0.5 text-[10px] font-medium text-stone-400 backdrop-blur-md dark:bg-stone-900/50 dark:text-stone-500">
        {state} · {Math.round(fps)} fps
      </div>
    </div>
  );
}
