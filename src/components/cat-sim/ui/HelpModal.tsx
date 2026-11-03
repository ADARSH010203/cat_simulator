'use client';

// "What can I do?" + "What can I get out of this?" help modal.
// Kid-friendly language, big emoji, grouped cards. Also lists the outputs
// (recordings, screenshots, coat JSON, mood log…) the app can generate.

import { useEffect } from 'react';
import { X } from 'lucide-react';

interface HelpModalProps {
  open: boolean;
  onClose: () => void;
}

interface Card {
  emoji: string;
  title: string;
  lines: string[];
}

const FUN_CARDS: Card[] = [
  {
    emoji: '🐾',
    title: 'Pet & Play',
    lines: [
      'Tap her head, cheeks, chin, ears, paws, tail or nose.',
      'Hold your finger on her → she purrs.',
      'Drag across her back → arches and purrs.',
      '6 quick pokes → she walks away annoyed!',
    ],
  },
  {
    emoji: '🗣️',
    title: 'Talk to her',
    lines: [
      'Open the Voice tab and turn on Echo Mode.',
      'Hold the mic, speak, let go — she repeats in a tiny cat voice.',
      'Works in any language!',
      'Add a meow at the end for fun.',
    ],
  },
  {
    emoji: '🎨',
    title: 'Dress her up',
    lines: [
      '9 ready coats: Orange tabby, Calico, Tuxedo, Siamese…',
      'Pick eye colour — green, amber, blue, gold…',
      'Add a collar+bell or a bow.',
      '"Surprise me" gives a brand new random look!',
    ],
  },
  {
    emoji: '🌍',
    title: 'Change the world',
    lines: [
      '7 worlds: Garden, Living room, Studio, Bedroom, Forest, Beach, Night sky.',
      'Visit all 7 to unlock the Explorer sticker!',
    ],
  },
  {
    emoji: '🎬',
    title: 'Make her do tricks',
    lines: [
      'Sit, Stand, Lie, Sleep, Stretch, Yawn, Groom, Knead.',
      'Pounce, Happy jump, Walk, Turn.',
      'Meow, Chirp, Purr on command.',
    ],
  },
  {
    emoji: '📷',
    title: 'Move the camera',
    lines: [
      'Drag empty space to orbit, pinch/scroll to zoom.',
      'Quick views: Front, Side, Back, Top, Face close-up.',
      'Double-click empty space to refocus on her.',
    ],
  },
];

const OUTCOME_CARDS: Card[] = [
  {
    emoji: '🖼️',
    title: 'A screenshot of your cat',
    lines: [
      'Press your device screenshot key.',
      'Her colours, world, and pose are exactly what you set.',
      'Great for wallpapers, profile pics, classroom art.',
    ],
  },
  {
    emoji: '💾',
    title: 'A coat save-file (.json)',
    lines: [
      'Look tab → Save coat → downloads `<name>-coat.json`.',
      'Re-load it later or share with friends.',
      'Holds name, colours, eye colour, accessory — the whole look.',
    ],
  },
  {
    emoji: '🎙️',
    title: 'A funny voice clip',
    lines: [
      'Echo Mode replays your voice in a tiny cat pitch.',
      'Record your screen / use the mic output to capture it.',
      'Use it for ringtones, memes, language practice.',
    ],
  },
  {
    emoji: '🏆',
    title: 'A sticker collection',
    lines: [
      '12 collectable stickers as you play.',
      'Saved on this device — open Stickers to see them.',
      'Each sticker is a little goal (pet 50 times, visit all worlds…).',
    ],
  },
  {
    emoji: '😺',
    title: 'A mood + state read-out',
    lines: [
      'Top-left chips show her mood, affection %, energy %.',
      'Calm mode keeps her still — good for winding down.',
      'Useful as a calming / focus / emotional-regulation tool.',
    ],
  },
  {
    emoji: '🌈',
    title: 'A custom scene',
    lines: [
      'Combine a coat + a world + a pose + a camera view.',
      'Each combination is a brand new picture.',
      'Press Reset (↺) any time to start fresh.',
    ],
  },
];

export function HelpModal({ open, onClose }: HelpModalProps): React.ReactElement | null {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-stone-900/55 p-3 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="What can I do with Mochi?"
    >
      <div
        className="kid-modal max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-3xl border-2 border-amber-300 bg-gradient-to-b from-amber-50 to-orange-100 p-5 shadow-2xl nice-scroll"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xl font-extrabold text-stone-800">
            <span aria-hidden>🐾</span> What can I do with Mochi?
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close help"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-stone-500 shadow-sm hover:bg-stone-100"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <section className="mb-5">
          <h3 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-amber-700">🎉 Fun things to do</h3>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {FUN_CARDS.map((c) => (
              <Card key={c.title} {...c} />
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-amber-700">🎁 What you can get out</h3>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {OUTCOME_CARDS.map((c) => (
              <Card key={c.title} {...c} accent />
            ))}
          </div>
        </section>

        <div className="mt-4 rounded-xl bg-amber-500/10 p-3 text-center text-[11px] font-semibold text-amber-700">
          Tip: all your settings and stickers are saved on this device. Close the tab and come back later — Mochi will be waiting! 🐾
        </div>
      </div>
    </div>
  );
}

function Card({ emoji, title, lines, accent }: Card & { accent?: boolean }): React.ReactElement {
  return (
    <div
      className={`rounded-2xl border-2 p-3 shadow-sm ${
        accent
          ? 'border-emerald-300 bg-emerald-50/70'
          : 'border-amber-300 bg-white/80'
      }`}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-2xl" aria-hidden>{emoji}</span>
        <span className="text-sm font-extrabold text-stone-800">{title}</span>
      </div>
      <ul className="space-y-1 text-[11px] leading-snug text-stone-600">
        {lines.map((l) => (
          <li key={l} className="flex gap-1.5">
            <span className="text-amber-500" aria-hidden>•</span>
            <span>{l}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
