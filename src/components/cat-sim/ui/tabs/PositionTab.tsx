'use client';

// Position tab: X/Y/Z, rotation, scale, presets, bring-back.

import { useSettings } from '@/store/settingsStore';
import { Section, Field } from '../controls';

const PRESETS: Record<string, { x: number; z: number }> = {
  Center: { x: 0, z: 0 },
  Left: { x: -0.9, z: 0 },
  Right: { x: 0.9, z: 0 },
  Front: { x: 0, z: 1.1 },
  Back: { x: 0, z: -0.9 },
};

export function PositionTab(): React.ReactElement {
  const position = useSettings((s) => s.position);
  const setPosition = useSettings((s) => s.setPosition);
  const outOfView = Math.abs(position.x) > 2.6 || Math.abs(position.z) > 2.6 || position.y > 1.2 || position.y < -1;

  return (
    <div className="space-y-5">
      <Section title="Presets">
        <div className="grid grid-cols-3 gap-1.5">
          {Object.entries(PRESETS).map(([name, p]) => (
            <button
              key={name}
              type="button"
              onClick={() => setPosition({ x: p.x, z: p.z })}
              className="rounded-lg border border-stone-200 px-2 py-1.5 text-xs font-medium text-stone-600 transition hover:border-amber-400 hover:bg-amber-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
            >
              {name}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Transform">
        <Field label="X">
          <input
            type="range"
            min={-3}
            max={3}
            step={0.05}
            value={position.x}
            onChange={(e) => setPosition({ x: Number(e.target.value) })}
            className="w-36 accent-amber-500"
            aria-label="X position"
          />
        </Field>
        <Field label="Y">
          <input
            type="range"
            min={-1}
            max={1.5}
            step={0.05}
            value={position.y}
            onChange={(e) => setPosition({ y: Number(e.target.value) })}
            className="w-36 accent-amber-500"
            aria-label="Y position"
          />
        </Field>
        <Field label="Z">
          <input
            type="range"
            min={-3}
            max={3}
            step={0.05}
            value={position.z}
            onChange={(e) => setPosition({ z: Number(e.target.value) })}
            className="w-36 accent-amber-500"
            aria-label="Z position"
          />
        </Field>
        <Field label={`Rotation ${Math.round(position.rotY)}°`}>
          <input
            type="range"
            min={0}
            max={360}
            step={5}
            value={position.rotY}
            onChange={(e) => setPosition({ rotY: Number(e.target.value) })}
            className="w-36 accent-amber-500"
            aria-label="Rotation"
          />
        </Field>
        <Field label={`Scale ${position.scale.toFixed(2)}×`}>
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.05}
            value={position.scale}
            onChange={(e) => setPosition({ scale: Number(e.target.value) })}
            className="w-36 accent-amber-500"
            aria-label="Scale"
          />
        </Field>
        <p className="text-[10px] text-stone-400">
          x {position.x.toFixed(2)} · y {position.y.toFixed(2)} · z {position.z.toFixed(2)}
        </p>
      </Section>

      <Section title="Safety">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setPosition({ x: 0, y: 0, z: 0 })}
            className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            Move to centre
          </button>
          <button
            type="button"
            onClick={() => setPosition({ x: 0, y: 0, z: 0, rotY: 0, scale: 1 })}
            className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            Reset position
          </button>
          {outOfView && (
            <button
              type="button"
              onClick={() => setPosition({ x: 0, y: 0, z: 0 })}
              className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-100 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300"
            >
              Bring her back!
            </button>
          )}
        </div>
        {outOfView && (
          <p className="text-[11px] text-rose-500">She may be outside the camera view — bring her back.</p>
        )}
      </Section>
    </div>
  );
}
