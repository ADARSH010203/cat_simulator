'use client';

// Environment tab: 7 procedural presets + light intensity.

import { useEffect } from 'react';
import { useSettings } from '@/store/settingsStore';
import { Section, Field } from '../controls';
import { ENVIRONMENTS } from '../../environments';
import { useKid } from '@/store/kidStore';

export function EnvironmentTab(): React.ReactElement {
  const environment = useSettings((s) => s.environment);
  const setEnvironment = useSettings((s) => s.setEnvironment);
  const light = useSettings((s) => s.envLightIntensity);
  const setLight = useSettings((s) => s.setEnvLightIntensity);

  useEffect(() => {
    useKid.getState().visitWorld(environment);
  }, [environment]);

  return (
    <div className="space-y-5">
      <Section title="World">
        <div className="grid grid-cols-2 gap-1.5">
          {ENVIRONMENTS.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => setEnvironment(e.id)}
              aria-pressed={environment === e.id}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition ${
                environment === e.id
                  ? 'border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-300'
                  : 'border-stone-200 text-stone-600 hover:border-amber-300 hover:bg-amber-50/50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800'
              }`}
            >
              <span className="text-base" aria-hidden>
                {e.emoji}
              </span>
              {e.label}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-stone-400">
          Switching worlds never moves the cat or resets her colours.
        </p>
      </Section>

      <Section title="Brightness">
        <Field label="Intensity">
          <input
            type="range"
            min={0.3}
            max={2}
            step={0.05}
            value={light}
            onChange={(e) => setLight(Number(e.target.value))}
            className="w-36 accent-amber-500"
            aria-label="Light intensity"
          />
        </Field>
        <p className="text-[10px] text-stone-400">
          Makes the whole world darker or brighter — even the sky.
        </p>
      </Section>
    </div>
  );
}
