'use client';

// Small shared building blocks for the control panel tabs.

import type { ReactNode } from 'react';

export function Section({ title, children }: { title: string; children: ReactNode }): React.ReactElement {
  return (
    <div className="space-y-3">
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }): React.ReactElement {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span className="shrink-0 font-medium text-stone-600 dark:text-stone-300">
        {label}
        {hint && <span className="ml-1 text-[10px] font-normal text-stone-400">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export function ColorDot({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}): React.ReactElement {
  return (
    <span className="relative inline-flex" title={label}>
      <input
        type="color"
        aria-label={label}
        value={/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value) ? value : '#cccccc'}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-9 cursor-pointer rounded-md border border-stone-200 bg-transparent p-0.5 dark:border-stone-600"
      />
    </span>
  );
}
