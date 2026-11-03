'use client';

// Tiny toast stack for reaction texts + errors.

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useCatLive } from '@/store/catStateStore';

export function ToastStack(): React.ReactElement {
  const toasts = useCatLive((s) => s.toasts);
  const dismiss = useCatLive((s) => s.dismissToast);
  const reactionText = useCatLive((s) => s.lastReactionText);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((t) => setTimeout(() => dismiss(t.id), 4200));
    return () => timers.forEach(clearTimeout);
  }, [toasts, dismiss]);

  useEffect(() => {
    if (!reactionText) return;
    const id = setTimeout(() => useCatLive.getState().pushReactionText(''), 2600);
    return () => clearTimeout(id);
  }, [reactionText]);

  return (
    <div className="pointer-events-none fixed left-1/2 top-4 z-50 flex w-[86%] max-w-sm -translate-x-1/2 flex-col items-center gap-1.5" aria-live="polite">
      {reactionText && toasts.length === 0 && (
        <div className="rounded-full border border-stone-200/60 bg-white/85 px-4 py-1.5 text-xs font-medium text-stone-700 shadow-md backdrop-blur-md dark:border-stone-700/60 dark:bg-stone-900/85 dark:text-stone-200">
          {reactionText}
        </div>
      )}
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium shadow-lg backdrop-blur-md ${
            t.kind === 'error'
              ? 'border-rose-200 bg-rose-50/95 text-rose-700 dark:border-rose-500/30 dark:bg-rose-950/85 dark:text-rose-300'
              : t.kind === 'success'
                ? 'border-emerald-200 bg-emerald-50/95 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-950/85 dark:text-emerald-300'
                : 'border-stone-200 bg-white/95 text-stone-700 dark:border-stone-700 dark:bg-stone-900/95 dark:text-stone-200'
          }`}
        >
          <span>{t.text}</span>
          <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss" className="opacity-50 hover:opacity-100">
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}
