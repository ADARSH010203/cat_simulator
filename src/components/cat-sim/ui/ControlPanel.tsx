'use client';

// Control panel: right side on desktop, bottom sheet on mobile.
// Tabs: Appearance / Position / Environment / Camera / Animation / Voice.
// Kid-friendly: bigger tabs with emoji + clear labels, brighter active state.

import { useEffect, useState } from 'react';
import { Palette, Move3d, Trees, Camera, Clapperboard, AudioLines, Sun, Moon, ChevronUp, ChevronDown } from 'lucide-react';
import { useSettings } from '@/store/settingsStore';
import { AppearanceTab } from './tabs/AppearanceTab';
import { PositionTab } from './tabs/PositionTab';
import { EnvironmentTab } from './tabs/EnvironmentTab';
import { CameraTab } from './tabs/CameraTab';
import { AnimationTab } from './tabs/AnimationTab';
import { VoiceTab } from './tabs/VoiceTab';

const TABS = [
  { id: 'appearance', label: 'Colours', emoji: '🎨', icon: Palette, comp: AppearanceTab },
  { id: 'position', label: 'Move', emoji: '📍', icon: Move3d, comp: PositionTab },
  { id: 'environment', label: 'World', emoji: '🌍', icon: Trees, comp: EnvironmentTab },
  { id: 'camera', label: 'Camera', emoji: '📷', icon: Camera, comp: CameraTab },
  { id: 'animation', label: 'Actions', emoji: '🎬', icon: Clapperboard, comp: AnimationTab },
  { id: 'voice', label: 'Talk', emoji: '🗣️', icon: AudioLines, comp: VoiceTab },
];

const TAB_COLORS: Record<string, string> = {
  appearance: 'kid-tab-rose',
  position: 'kid-tab-amber',
  environment: 'kid-tab-emerald',
  camera: 'kid-tab-sky',
  animation: 'kid-tab-fuchsia',
  voice: 'kid-tab-indigo',
};

export function ControlPanel(): React.ReactElement {
  const panelOpen = useSettings((s) => s.panelOpen);
  const activeTab = useSettings((s) => s.activeTab);
  const setUI = useSettings((s) => s.setUI);
  const reducedMotion = useSettings((s) => s.reducedMotion);
  const [dark, setDark] = useState(false);
  const [sheetHeight, setSheetHeight] = useState<'peek' | 'half' | 'full'>('half');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  const ActiveComp = TABS.find((t) => t.id === activeTab)?.comp ?? AppearanceTab;

  return (
    <aside
      aria-label="Cat controls"
      className={`
        fixed z-40 flex flex-col overflow-hidden border-stone-200/70 bg-white/85 shadow-xl backdrop-blur-xl transition-transform duration-300 dark:border-stone-700/60 dark:bg-stone-900/85
        inset-x-0 bottom-0 rounded-t-3xl border-t-2 border-amber-300/60
        md:inset-y-3 md:right-3 md:left-auto md:bottom-3 md:w-[360px] md:rounded-3xl md:border-2
        ${panelOpen ? 'translate-y-0 md:translate-x-0' : 'translate-y-full md:translate-x-[calc(100%+1rem)]'}
      `}
      style={{
        maxHeight: '70dvh',
        height: sheetHeight === 'peek' ? '3.25rem' : sheetHeight === 'half' ? '50dvh' : '70dvh',
      }}
    >
      {/* header */}
      <div className="flex items-center gap-2 border-b border-stone-200/70 px-3 py-2 dark:border-stone-700/60">
        <button
          type="button"
          className="flex h-8 items-center gap-1 text-xs font-bold text-stone-500 md:hidden"
          onClick={() => setSheetHeight(sheetHeight === 'full' ? 'half' : sheetHeight === 'half' ? 'peek' : 'half')}
          aria-label="Change sheet height"
        >
          {sheetHeight === 'full' ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronUp className="h-4 w-4" aria-hidden />}
          <span className="rounded-full bg-amber-100 px-2 py-0.5 font-extrabold text-amber-700">📋 Settings</span>
        </button>
        <span className="hidden text-xs font-extrabold text-stone-500 md:inline dark:text-stone-400">📋 Settings</span>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setUI({ reducedMotion: !reducedMotion })}
            aria-pressed={reducedMotion}
            title="Calm mode — keeps her still"
            className={`rounded-full px-2.5 py-1 text-[10px] font-bold transition ${
              reducedMotion
                ? 'bg-amber-500 text-white'
                : 'bg-stone-100 text-stone-500 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-400'
            }`}
          >
            😌 calm
          </button>
          <button
            type="button"
            onClick={() => setDark(!dark)}
            aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
            className="flex h-8 w-8 items-center justify-center rounded-full text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
          >
            {dark ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
          </button>
          <button
            type="button"
            onClick={() => setUI({ panelOpen: false })}
            aria-label="Hide panel"
            className="flex h-8 w-8 items-center justify-center rounded-full text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            ✕
          </button>
        </div>
      </div>

      {/* tabs — bigger, brighter, with emoji */}
      <div className="grid grid-cols-3 gap-1.5 p-2" role="tablist" aria-label="Setting categories">
        {TABS.map((t, i) => {
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setUI({ activeTab: t.id })}
              className={`flex items-center justify-center gap-1 rounded-xl px-1.5 py-2 text-xs font-extrabold transition ${
                active
                  ? `${TAB_COLORS[t.id]} text-white shadow-md`
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300'
              }`}
            >
              <span className="text-base" aria-hidden>{t.emoji}</span>
              <span>{t.label}</span>
              <kbd className="hidden rounded bg-black/10 px-1 text-[9px] font-mono md:inline dark:bg-white/10">{i + 1}</kbd>
            </button>
          );
        })}
      </div>

      {/* body */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3 nice-scroll">
        <div role="tabpanel">
          <ActiveComp />
        </div>
      </div>
    </aside>
  );
}
