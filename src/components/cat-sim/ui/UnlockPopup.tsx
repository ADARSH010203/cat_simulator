'use client';

// Unlock popup — pops in for ~3.5 s whenever a new sticker is earned.
// Uses the React "adjust state when a prop changes" pattern (set state during
// render based on a tracked previous value, schedule the hide in an effect).

import { useEffect, useState } from 'react';
import { useKid, STICKERS } from '@/store/kidStore';

export function UnlockPopup(): React.ReactElement | null {
  const lastUnlock = useKid((s) => s.lastUnlock);
  const [shown, setShown] = useState<string | null>(null);
  const [prevLastUnlock, setPrevLastUnlock] = useState<string | null>(null);

  // adjust state when the store reports a new unlock — done during render so
  // it doesn't trigger cascading renders (React's recommended pattern).
  if (lastUnlock && lastUnlock !== prevLastUnlock) {
    setPrevLastUnlock(lastUnlock);
    const sticker = STICKERS.find((s) => s.id === lastUnlock);
    if (sticker) setShown(lastUnlock);
  }

  // hide after a short delay
  useEffect(() => {
    if (!shown) return;
    const t = window.setTimeout(() => setShown(null), 3800);
    return () => window.clearTimeout(t);
  }, [shown]);

  if (!shown) return null;
  const sticker = STICKERS.find((s) => s.id === shown);
  if (!sticker) return null;

  return (
    <div
      key={shown}
      className="pointer-events-none fixed inset-0 z-[90] flex items-center justify-center"
      aria-live="assertive"
    >
      <div className="kid-unlock-pop flex flex-col items-center gap-2 rounded-3xl border-4 border-amber-300 bg-white px-8 py-6 text-center shadow-2xl">
        <div className="text-xs font-extrabold uppercase tracking-widest text-amber-600">✨ Sticker unlocked! ✨</div>
        <div className="kid-sticker-pop text-7xl" aria-hidden>
          {sticker.emoji}
        </div>
        <div className="text-lg font-extrabold text-stone-800">{sticker.name}</div>
        <div className="text-[11px] font-semibold text-stone-500">{sticker.hint}</div>
      </div>
    </div>
  );
}
