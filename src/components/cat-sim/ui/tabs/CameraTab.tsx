'use client';

// Camera tab: presets, auto-rotate, double-click hint.

import { useSettings } from '@/store/settingsStore';
import { useCameraStore, CAMERA_PRESETS } from '../../core/cameraBus';
import { Section, Field } from '../controls';

const PRESET_BUTTONS: Array<{ id: string; label: string }> = [
  { id: 'front', label: 'Front' },
  { id: 'side', label: 'Side' },
  { id: 'back', label: 'Back' },
  { id: 'top', label: 'Top' },
  { id: 'face', label: 'Face close-up' },
  { id: 'reset', label: 'Reset' },
];

export function CameraTab(): React.ReactElement {
  const autoRotate = useSettings((s) => s.autoRotate);
  const setAutoRotate = useSettings((s) => s.setAutoRotate);
  const request = useCameraStore((s) => s.request);
  const preset = useCameraStore((s) => s.preset);

  return (
    <div className="space-y-5">
      <Section title="Views">
        <div className="grid grid-cols-3 gap-1.5">
          {PRESET_BUTTONS.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => request(b.id)}
              aria-pressed={preset === b.id}
              className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition ${
                preset === b.id
                  ? 'border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-300'
                  : 'border-stone-200 text-stone-600 hover:border-amber-300 dark:border-stone-700 dark:text-stone-300'
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-stone-400">
          Transitions take ~0.8 s. Double-click empty space to refocus on her.
        </p>
      </Section>

      <Section title="Orbit">
        <Field label="Auto-rotate">
          <input
            type="checkbox"
            checked={autoRotate}
            onChange={(e) => setAutoRotate(e.target.checked)}
            className="h-4 w-4 accent-amber-500"
            aria-label="Camera auto rotate"
          />
        </Field>
        <p className="text-[10px] text-stone-400">
          Drag empty space to orbit · pinch or scroll to zoom · two fingers to pan.
        </p>
      </Section>

      <Section title="Debug">
        <p className="text-[10px] text-stone-400">
          Preset targets: {Object.keys(CAMERA_PRESETS).join(' · ')}
        </p>
      </Section>
    </div>
  );
}
