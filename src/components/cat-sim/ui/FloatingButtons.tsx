'use client';

// Floating quick actions for advanced users (Pet / Play / Sleep / Reset / Panel).
// On mobile the KidBar at the bottom already exposes the big fun actions, so
// this stack lives on the right edge and is mostly used for the panel toggle
// and the reset shortcut.

import { useState } from 'react';
import { Hand, Zap, Moon, RotateCcw, Settings2 } from 'lucide-react';
import { useSettings } from '@/store/settingsStore';
import { sendCommand } from '../core/commands';
import { useCatLive } from '@/store/catStateStore';

export function FloatingButtons(): React.ReactElement {
  const setUI = useSettings((s) => s.setUI);
  const panelOpen = useSettings((s) => s.panelOpen);
  const resetAll = useSettings((s) => s.resetAll);
  const pushToast = useCatLive((s) => s.pushToast);
  const [confirmReset, setConfirmReset] = useState(false);

  const act = (action: string): void => {
    sendCommand(action);
  };

  return (
    // when the desktop panel is open, shift this stack left of it — the panel
    // (z-40) would otherwise sit on top of the buttons and swallow their clicks
    <div
      className={`fixed right-4 top-16 z-30 flex flex-col items-end gap-2 transition-[right] duration-300 md:top-3 ${
        panelOpen ? 'md:right-[379px]' : 'md:right-3'
      }`}
    >
      <button
        type="button"
        aria-label="Pet the cat"
        onClick={() => act('pet')}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-rose-500 shadow-md transition hover:scale-105 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 dark:bg-stone-800/90 dark:text-rose-300"
      >
        <Hand className="h-5 w-5" aria-hidden />
      </button>
      <button
        type="button"
        aria-label="Play with the cat"
        onClick={() => act('play')}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-amber-500 shadow-md transition hover:scale-105 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 dark:bg-stone-800/90 dark:text-amber-300"
      >
        <Zap className="h-5 w-5" aria-hidden />
      </button>
      <button
        type="button"
        aria-label="Send the cat to sleep"
        onClick={() => act('sleep')}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-indigo-400 shadow-md transition hover:scale-105 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 dark:bg-stone-800/90 dark:text-indigo-300"
      >
        <Moon className="h-5 w-5" aria-hidden />
      </button>
      <button
        type="button"
        aria-label="Reset all settings"
        onClick={() => {
          if (!confirmReset) {
            setConfirmReset(true);
            pushToast('Tap reset again to confirm — everything goes back to defaults.', 'info');
            setTimeout(() => setConfirmReset(false), 3000);
            return;
          }
          resetAll();
          setConfirmReset(false);
          pushToast('All settings restored to defaults.', 'success');
        }}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-stone-500 shadow-md transition hover:scale-105 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 dark:bg-stone-800/90 dark:text-stone-300"
      >
        <RotateCcw className="h-5 w-5" aria-hidden />
      </button>

      {/* panel toggle */}
      <button
        type="button"
        aria-label={panelOpen ? 'Hide controls' : 'Show controls'}
        aria-pressed={panelOpen}
        onClick={() => setUI({ panelOpen: !panelOpen })}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-800 text-amber-300 shadow-md transition hover:scale-105 hover:bg-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
      >
        <Settings2 className="h-5 w-5" aria-hidden />
      </button>
    </div>
  );
}
