'use client';

// Sticker book modal — shows the 12 collectable stickers, earned + locked.
// Tap a sticker to read its hint. The collection persists in localStorage.

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useKid, STICKERS, type Sticker } from '@/store/kidStore';

interface StickerBookProps {
  open: boolean;
  onClose: () => void;
}

export function StickerBook({ open, onClose }: StickerBookProps): React.ReactElement | null {
  const unlocked = useKid((s) => s.unlocked);
  const petCount = useKid((s) => s.petCount);
  const strokeCount = useKid((s) => s.strokeCount);
  const talkCount = useKid((s) => s.talkCount);
  const worldsVisited = useKid((s) => s.worldsVisited.length);
  const coatsTried = useKid((s) => s.coatsTried);
  const surpriseCount = useKid((s) => s.surpriseCount);

  // close on ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const earned = new Set(unlocked);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-stone-900/55 p-3 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Sticker book"
    >
      <div
        className="kid-modal max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-3xl border-2 border-amber-300 bg-gradient-to-b from-amber-50 to-orange-100 p-5 shadow-2xl nice-scroll"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xl font-extrabold text-stone-800">
            <span aria-hidden>🏆</span> My Stickers
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sticker book"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-stone-500 shadow-sm hover:bg-stone-100"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="mb-4 rounded-2xl bg-white/70 p-3 text-xs font-semibold text-stone-600">
          <div className="mb-1 text-sm font-extrabold text-amber-700">
            {earned.size} / {STICKERS.length} collected!
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
            <span>🐾 Pets: <strong className="text-stone-800">{petCount}</strong></span>
            <span>💖 Strokes: <strong className="text-stone-800">{strokeCount}</strong></span>
            <span>🗣️ Talks: <strong className="text-stone-800">{talkCount}</strong></span>
            <span>🌍 Worlds: <strong className="text-stone-800">{worldsVisited}/7</strong></span>
            <span>🎨 Coats: <strong className="text-stone-800">{coatsTried}</strong></span>
            <span>✨ Surprises: <strong className="text-stone-800">{surpriseCount}</strong></span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          {STICKERS.map((s: Sticker) => {
            const isEarned = earned.has(s.id);
            return (
              <div
                key={s.id}
                className={`flex flex-col items-center gap-1 rounded-2xl border-2 p-2 text-center transition ${
                  isEarned
                    ? 'kid-sticker-earned border-amber-400 bg-white shadow-md'
                    : 'border-stone-200 bg-stone-100/80 opacity-70'
                }`}
                title={s.hint}
              >
                <div
                  className={`text-4xl ${isEarned ? '' : 'grayscale'}`}
                  aria-hidden
                  style={{ filter: isEarned ? 'none' : 'grayscale(1) opacity(0.45)' }}
                >
                  {s.emoji}
                </div>
                <div className={`text-[11px] font-extrabold leading-tight ${isEarned ? 'text-stone-800' : 'text-stone-500'}`}>
                  {s.name}
                </div>
                <div className="text-[9px] leading-tight text-stone-500">
                  {isEarned ? '✅ Earned' : s.hint}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 rounded-xl bg-amber-500/10 p-2 text-center text-[11px] font-semibold text-amber-700">
          Keep playing with Mochi to unlock them all! 💝
        </div>
      </div>
    </div>
  );
}
