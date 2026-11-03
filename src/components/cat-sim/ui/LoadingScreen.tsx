'use client';

// Loading screen with an animated paw (everything is procedural, so this is
// a short branded intro rather than an asset download bar).

import { useEffect, useState } from 'react';

export function LoadingScreen(): React.ReactElement | null {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setFading(true), 900);
    const t2 = setTimeout(() => setVisible(false), 1400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-amber-50 to-orange-100 transition-opacity duration-500 dark:from-stone-900 dark:to-stone-800 ${
        fading ? 'opacity-0' : 'opacity-100'
      }`}
      aria-hidden={fading}
    >
      <div className="paw-bounce text-6xl">🐾</div>
      <div className="text-lg font-bold tracking-tight text-stone-700 dark:text-stone-200">
        Waking up Mochi…
      </div>
      <div className="h-1.5 w-40 overflow-hidden rounded-full bg-stone-200/70 dark:bg-stone-700">
        <div className="load-bar h-full w-1/3 rounded-full bg-amber-500" />
      </div>
    </div>
  );
}
