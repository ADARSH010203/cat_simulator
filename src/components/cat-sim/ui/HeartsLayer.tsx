'use client';

// Hearts + sparkles on positive strokes (throttled) — spec 2.3 feedback polish.

import { useEffect, useRef, useState } from 'react';
import { runtime } from '../core/runtime';

interface Heart {
  id: number;
  x: number;
  y: number;
  size: number;
  dur: number;
}

let heartId = 0;

/** Called by the interaction layer on positive reactions (throttled inside). */
const heartBus = { last: -10 };
export function spawnHeart(t: number): void {
  if (t - heartBus.last < 1.8) return;
  heartBus.last = t;
}

export function HeartsLayer(): React.ReactElement {
  const [hearts, setHearts] = useState<Heart[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timer.current = setInterval(() => {
      if (runtime.affection > 0 && (runtime.reaction?.hold || runtime.pettingSince !== null)) {
        const h: Heart = {
          id: ++heartId,
          x: Math.min(92, Math.max(8, runtime.screenPos.x + (Math.random() - 0.5) * 10)),
          y: Math.min(88, Math.max(10, runtime.screenPos.y + (Math.random() - 0.5) * 8)),
          size: 14 + Math.random() * 14,
          dur: 1.4 + Math.random() * 0.8,
        };
        setHearts((prev) => [...prev.slice(-5), h]);
        window.setTimeout(() => {
          setHearts((prev) => prev.filter((x) => x.id !== h.id));
        }, h.dur * 1000);
      }
    }, 2200);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-20 overflow-hidden" aria-hidden>
      {hearts.map((h) => (
        <span
          key={h.id}
          className="heart-float absolute select-none"
          style={{
            left: `${h.x}%`,
            top: `${h.y}%`,
            fontSize: h.size,
            animationDuration: `${h.dur}s`,
          }}
        >
          {Math.random() > 0.6 ? '✨' : '💕'}
        </span>
      ))}
    </div>
  );
}
