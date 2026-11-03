'use client';

// Animation tab: play/pause, speed, idle, actions, sound.

import { Pause, Play, RotateCcw } from 'lucide-react';
import { useSettings } from '@/store/settingsStore';
import { useCatLive } from '@/store/catStateStore';
import { sendCommand } from '../../core/commands';
import { Section, Field } from '../controls';

const ACTIONS: Array<{ action: string; label: string }> = [
  { action: 'sit', label: 'Sit' },
  { action: 'stand', label: 'Stand' },
  { action: 'lie', label: 'Lie down' },
  { action: 'sleep', label: 'Sleep' },
  { action: 'wake', label: 'Wake up' },
  { action: 'stretch', label: 'Stretch' },
  { action: 'yawn', label: 'Yawn' },
  { action: 'walk', label: 'Walk' },
  { action: 'turn', label: 'Turn' },
  { action: 'groom', label: 'Groom' },
  { action: 'knead', label: 'Knead' },
  { action: 'pounce', label: 'Pounce' },
  { action: 'happyjump', label: 'Happy jump' },
  { action: 'play', label: 'Play' },
  { action: 'meow', label: 'Meow' },
  { action: 'chirp', label: 'Chirp' },
  { action: 'purr', label: 'Purr' },
  { action: 'return-idle', label: 'Idle' },
];

export function AnimationTab(): React.ReactElement {
  const paused = useSettings((s) => s.paused);
  const speed = useSettings((s) => s.speed);
  const autoIdle = useSettings((s) => s.autoIdle);
  const lookAtPointer = useSettings((s) => s.lookAtPointer);
  const sound = useSettings((s) => s.sound);
  const masterVolume = useSettings((s) => s.masterVolume);
  const purrVolume = useSettings((s) => s.purrVolume);
  const anim = { paused, speed, autoIdle, lookAtPointer, sound, masterVolume, purrVolume };
  const setAnim = useSettings((s) => s.setAnim);
  const baseState = useCatLive((s) => s.baseState);
  const pushToast = useCatLive((s) => s.pushToast);

  return (
    <div className="space-y-5">
      <Section title="Playback">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAnim({ paused: !anim.paused })}
            aria-label={anim.paused ? 'Play animation' : 'Pause animation'}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500 text-white shadow transition hover:bg-amber-600"
          >
            {anim.paused ? <Play className="h-4 w-4" aria-hidden /> : <Pause className="h-4 w-4" aria-hidden />}
          </button>
          <button
            type="button"
            onClick={() => sendCommand('return-idle')}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-stone-200 px-3 text-xs font-medium text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Return to idle
          </button>
          <span className="ml-auto rounded-md bg-stone-100 px-2 py-1 text-[10px] font-medium text-stone-500 dark:bg-stone-800 dark:text-stone-400">
            {baseState}
          </span>
        </div>
        <Field label={`Speed ${anim.speed.toFixed(2)}×`}>
          <input
            type="range"
            min={0.25}
            max={2}
            step={0.05}
            value={anim.speed}
            onChange={(e) => setAnim({ speed: Number(e.target.value) })}
            className="w-36 accent-amber-500"
            aria-label="Animation speed"
          />
        </Field>
        <p className="text-[10px] text-stone-400">Speed scales animation time only, not voice audio.</p>
      </Section>

      <Section title="Behaviour">
        <Field label="Autonomous idle">
          <input
            type="checkbox"
            checked={anim.autoIdle}
            onChange={(e) => setAnim({ autoIdle: e.target.checked })}
            className="h-4 w-4 accent-amber-500"
            aria-label="Autonomous idle behaviour"
          />
        </Field>
        <Field label="Look at pointer">
          <input
            type="checkbox"
            checked={anim.lookAtPointer}
            onChange={(e) => setAnim({ lookAtPointer: e.target.checked })}
            className="h-4 w-4 accent-amber-500"
            aria-label="Head follows the pointer"
          />
        </Field>
      </Section>

      <Section title="Actions">
        <div className="grid grid-cols-3 gap-1.5">
          {ACTIONS.map((a) => (
            <button
              key={a.action}
              type="button"
              onClick={() => {
                sendCommand(a.action);
                if (a.action === 'purr') pushToast('Purr toggled', 'info');
              }}
              className="rounded-lg border border-stone-200 px-2 py-1.5 text-xs font-medium text-stone-600 transition hover:border-amber-400 hover:bg-amber-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
            >
              {a.label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Sound">
        <Field label="Sound on">
          <input
            type="checkbox"
            checked={anim.sound}
            onChange={(e) => setAnim({ sound: e.target.checked })}
            className="h-4 w-4 accent-amber-500"
            aria-label="Sound on"
          />
        </Field>
        <Field label={`Master ${Math.round(anim.masterVolume * 100)}%`}>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={anim.masterVolume}
            onChange={(e) => setAnim({ masterVolume: Number(e.target.value) })}
            className="w-32 accent-amber-500"
            aria-label="Master volume"
          />
        </Field>
        <Field label={`Purr ${Math.round(anim.purrVolume * 100)}%`}>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={anim.purrVolume}
            onChange={(e) => setAnim({ purrVolume: Number(e.target.value) })}
            className="w-32 accent-amber-500"
            aria-label="Purr volume"
          />
        </Field>
        <p className="text-[10px] text-stone-400">
          All meows, purrs and chirps are synthesised live with Web Audio — no audio files.
        </p>
      </Section>
    </div>
  );
}
