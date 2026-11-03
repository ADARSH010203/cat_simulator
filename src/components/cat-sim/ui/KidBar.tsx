'use client';

// KidBar — a big colorful bottom action bar with the 6 most fun one-tap actions.
// Sits above the small FloatingButtons and the mobile sheet; designed for small
// fingers (≈64 px tall, wide rounded buttons, emoji + label).

import { useEffect, useState } from 'react';
import { Trophy, HelpCircle } from 'lucide-react';
import { useSettings, surpriseCoat } from '@/store/settingsStore';
import { useKid } from '@/store/kidStore';
import { sendCommand } from '../core/commands';
import { useCatLive } from '@/store/catStateStore';

interface KidBarProps {
  onOpenStickers: () => void;
  onOpenHelp: () => void;
}

interface BarBtnProps {
  label: string;
  emoji: string;
  color: string;
  onClick: () => void;
  hideOnSmall?: boolean;
}

function BarBtn({ label, emoji, color, onClick, hideOnSmall }: BarBtnProps): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`kid-bar-btn flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-2 text-white shadow-md transition hover:scale-105 active:scale-95 ${color} ${
        hideOnSmall ? 'hidden sm:flex' : ''
      }`}
    >
      <span className="text-xl leading-none sm:text-2xl" aria-hidden>
        {emoji}
      </span>
      <span className="text-[10px] font-extrabold leading-none drop-shadow-sm sm:text-[11px]">{label}</span>
    </button>
  );
}

const STICKER_TOTAL = 12;

export function KidBar({ onOpenStickers, onOpenHelp }: KidBarProps): React.ReactElement | null {
  const setUI = useSettings((s) => s.setUI);
  const setVoice = useSettings((s) => s.setVoice);
  const setCoat = useSettings((s) => s.setCoat);
  const pushToast = useCatLive((s) => s.pushToast);
  const unlocked = useKid((s) => s.unlocked.length);
  const panelOpen = useSettings((s) => s.panelOpen);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const update = (): void => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // on phones the settings sheet takes over the bottom — hide the bar so the
  // two never fight for space (closing the sheet brings it straight back)
  if (panelOpen && isMobile) return null;

  return (
    <div className="pointer-events-auto fixed inset-x-0 bottom-0 z-40 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1 md:bottom-3 md:left-3 md:right-auto md:w-[350px] md:px-0 md:pb-0">
      <div className="flex items-stretch gap-1.5 rounded-3xl border-2 border-white/70 bg-white/85 p-1.5 shadow-lg backdrop-blur-md dark:border-stone-700/60 dark:bg-stone-900/85">
        <BarBtn label="Pet" emoji="🐾" color="kid-bar-rose" onClick={() => sendCommand('pet')} />
        <BarBtn label="Play" emoji="🎾" color="kid-bar-amber" onClick={() => sendCommand('play')} />
        <BarBtn label="Sleep" emoji="💤" color="kid-bar-indigo" onClick={() => sendCommand('sleep')} />
        <BarBtn
          label="Talk"
          emoji="🗣️"
          color="kid-bar-emerald"
          onClick={() => {
            setVoice({ echoOn: true });
            setUI({ activeTab: 'voice', panelOpen: true });
          }}
        />
        <BarBtn
          label="Surprise"
          emoji="🎲"
          color="kid-bar-fuchsia"
          onClick={() => {
            setCoat(surpriseCoat());
            useKid.getState().bumpSurprise();
            pushToast('New surprise look! 🎉', 'success');
          }}
        />
        {/* Stickers button hidden on phones (<640px) — the trophy chip right below
            opens the same modal, and 6 buttons don't fit a 390px screen */}
        <BarBtn label="Stickers" emoji="🏆" color="kid-bar-orange" onClick={onOpenStickers} hideOnSmall />
      </div>
      {/* tiny progress + help row */}
      <div className="mt-1 flex items-center justify-between gap-2 px-2 text-[10px] font-bold text-stone-500 dark:text-stone-400">
        <button
          type="button"
          onClick={onOpenStickers}
          className="flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-1 shadow-sm dark:bg-stone-800/80"
          aria-label={`Sticker collection ${unlocked} of ${STICKER_TOTAL}`}
        >
          <Trophy className="h-3 w-3" aria-hidden />
          {unlocked}/{STICKER_TOTAL}
        </button>
        <button
          type="button"
          onClick={onOpenHelp}
          className="flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-1 shadow-sm dark:bg-stone-800/80"
          aria-label="What can I do?"
        >
          <HelpCircle className="h-3 w-3" aria-hidden />
          What can I do?
        </button>
      </div>
    </div>
  );
}
