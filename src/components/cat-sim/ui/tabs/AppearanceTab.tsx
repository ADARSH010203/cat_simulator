'use client';

// Appearance tab: coat presets, pattern, colours, eyes, accessory, fur quality.

import { useEffect, useRef } from 'react';
import { Sparkles } from 'lucide-react';
import { useSettings, COAT_PRESETS, EYE_PRESETS, surpriseCoat, type PatternType } from '@/store/settingsStore';
import { Section, Field, ColorDot } from '../controls';
import { useCatLive } from '@/store/catStateStore';
import { useKid } from '@/store/kidStore';
import { derivePatternColors } from '../../core/coatColors';

const PATTERNS: PatternType[] = ['solid', 'tabby', 'spots', 'patches', 'tuxedo', 'colorpoint'];

// kid-friendly names instead of raw lowercase ids
const PATTERN_LABELS: Record<PatternType, string> = {
  solid: 'Solid',
  tabby: 'Tabby stripes',
  spots: 'Spots',
  patches: 'Patches',
  tuxedo: 'Tuxedo',
  colorpoint: 'Colour-point',
};

export function AppearanceTab(): React.ReactElement {
  const coat = useSettings((s) => s.coat);
  const setCoat = useSettings((s) => s.setCoat);
  const eyes = useSettings((s) => s.eyes);
  const setEyes = useSettings((s) => s.setEyes);
  const accessory = useSettings((s) => s.accessory);
  const setAccessory = useSettings((s) => s.setAccessory);
  const catName = useSettings((s) => s.catName);
  const setCatName = useSettings((s) => s.setCatName);
  const furQuality = useSettings((s) => s.furQuality);
  const setFurQuality = useSettings((s) => s.setFurQuality);
  const pushToast = useCatLive((s) => s.pushToast);
  const fileRef = useRef<HTMLInputElement>(null);

  // track unique coats tried for the sticker book — count preset changes and "Surprise me"
  const knownCoats = useRef<Set<string>>(new Set([JSON.stringify(coat)]));
  useEffect(() => {
    const key = JSON.stringify(coat);
    if (!knownCoats.current.has(key)) {
      knownCoats.current.add(key);
      useKid.getState().setCoatsTried(knownCoats.current.size);
    }
  }, [coat]);

  const saveCoat = (): void => {
    const blob = new Blob([JSON.stringify({ catName, coat, eyes }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${catName.toLowerCase() || 'cat'}-coat.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const loadCoat = (file: File): void => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result)) as { catName?: string; coat?: typeof coat; eyes?: typeof eyes };
        if (data.coat) setCoat(data.coat);
        if (data.eyes) setEyes(data.eyes);
        if (data.catName) setCatName(data.catName);
        pushToast('Coat loaded!', 'success');
      } catch {
        pushToast('That file is not a valid coat.', 'error');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-5">
      <Section title="Who is this?">
        <Field label="Name">
          <input
            type="text"
            value={catName}
            maxLength={20}
            onChange={(e) => setCatName(e.target.value)}
            className="h-8 w-36 rounded-md border border-stone-200 bg-transparent px-2 text-sm focus-visible:outline-2 focus-visible:outline-amber-400 dark:border-stone-600"
            aria-label="Cat name"
          />
        </Field>
      </Section>

      <Section title="Coat preset">
        <div className="grid grid-cols-3 gap-1.5">
          {Object.entries(COAT_PRESETS).map(([name, preset]) => (
            <button
              key={name}
              type="button"
              onClick={() => setCoat(preset)}
              aria-pressed={coat.baseColor === preset.baseColor && coat.patternType === preset.patternType}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-stone-200 px-2 py-1.5 text-[10px] font-medium text-stone-600 transition hover:border-amber-400 hover:bg-amber-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
            >
              <span
                className="h-4 w-4 rounded-full border border-black/10"
                style={{ background: `linear-gradient(135deg, ${preset.baseColor} 55%, ${preset.patternColor} 55%)` }}
              />
              {name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setCoat(surpriseCoat());
              useKid.getState().bumpSurprise();
              pushToast('Surprise! New look unlocked ✨', 'success');
            }}
            className="flex items-center justify-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden /> Surprise me
          </button>
        </div>
      </Section>

      <Section title="Pattern">
        <Field label="Type">
          <select
            value={coat.patternType}
            onChange={(e) => {
              const t = e.target.value as PatternType;
              // tuxedo / colour-point need contrasting part colours to be
              // visible — derive them from the base, never change the base
              setCoat({ patternType: t, ...derivePatternColors(t, coat) });
            }}
            className="h-8 rounded-md border border-stone-200 bg-transparent px-2 text-sm dark:border-stone-600 dark:bg-stone-800"
            aria-label="Pattern type"
          >
            {PATTERNS.map((p) => (
              <option key={p} value={p}>
                {PATTERN_LABELS[p]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Intensity">
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={coat.patternIntensity}
            onChange={(e) => setCoat({ patternIntensity: Number(e.target.value) })}
            className="w-36 accent-amber-500"
            aria-label="Pattern intensity"
          />
        </Field>
      </Section>

      <Section title="Colours">
        <Field label="Base">
          <ColorDot label="Base colour" value={coat.baseColor} onChange={(v) => setCoat({ baseColor: v })} />
        </Field>
        <Field label="Pattern">
          <ColorDot label="Pattern colour" value={coat.patternColor} onChange={(v) => setCoat({ patternColor: v })} />
        </Field>
        <Field label="Belly & chest">
          <ColorDot label="Belly colour" value={coat.bellyColor} onChange={(v) => setCoat({ bellyColor: v })} />
        </Field>
        <Field label="Paw socks">
          <ColorDot label="Paw colour" value={coat.pawColor} onChange={(v) => setCoat({ pawColor: v })} />
        </Field>
        <Field label="Face mask">
          <ColorDot label="Mask colour" value={coat.maskColor} onChange={(v) => setCoat({ maskColor: v })} />
        </Field>
        <Field label="Inner ears">
          <ColorDot label="Inner ear colour" value={coat.innerEarColor} onChange={(v) => setCoat({ innerEarColor: v })} />
        </Field>
        <Field label="Nose">
          <ColorDot label="Nose colour" value={coat.noseColor} onChange={(v) => setCoat({ noseColor: v })} />
        </Field>
      </Section>

      <Section title="Eyes">
        <div className="flex flex-wrap gap-1.5">
          {EYE_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setEyes({ colorL: p.color, colorR: p.color, oddEyed: false })}
              aria-label={`${p.label} eyes`}
              aria-pressed={eyes.colorL === p.color}
              className="h-7 w-7 rounded-full border-2 border-stone-200 transition hover:scale-110 dark:border-stone-600"
              style={{ background: `radial-gradient(circle at 35% 35%, #fff6 0 18%, ${p.color} 40%, #0008 100%)` }}
            />
          ))}
        </div>
        <Field label="Left eye">
          <ColorDot label="Left eye colour" value={eyes.colorL} onChange={(v) => setEyes({ colorL: v })} />
        </Field>
        <Field label="Odd-eyed" hint="each eye a different colour">
          <input
            type="checkbox"
            checked={eyes.oddEyed}
            onChange={(e) => {
              const on = e.target.checked;
              // when switching odd-eyes ON, immediately give the right eye a
              // contrasting preset so the effect is visible without extra steps
              if (on && eyes.colorL === eyes.colorR) {
                const contrast = EYE_PRESETS.find((p) => p.color !== eyes.colorL) ?? EYE_PRESETS[1];
                setEyes({ oddEyed: true, colorR: contrast.color });
              } else {
                setEyes({ oddEyed: on });
              }
            }}
            className="h-4 w-4 accent-amber-500"
            aria-label="Odd eyes (different colours)"
          />
        </Field>
        {eyes.oddEyed && (
          <Field label="Right eye">
            <ColorDot label="Right eye colour" value={eyes.colorR} onChange={(v) => setEyes({ colorR: v })} />
          </Field>
        )}
      </Section>

      <Section title="Accessory">
        <Field label="Wear">
          <select
            value={accessory}
            onChange={(e) => setAccessory(e.target.value as 'none' | 'collar' | 'bow')}
            className="h-8 rounded-md border border-stone-200 bg-transparent px-2 text-sm dark:border-stone-600 dark:bg-stone-800"
            aria-label="Accessory"
          >
            <option value="none">none</option>
            <option value="collar">collar + bell</option>
            <option value="bow">bow</option>
          </select>
        </Field>
      </Section>

      <Section title="Fur quality">
        <Field label="Shells" hint="auto-lowers if FPS drops">
          <select
            value={furQuality}
            onChange={(e) => setFurQuality(e.target.value as 'low' | 'medium' | 'high')}
            className="h-8 rounded-md border border-stone-200 bg-transparent px-2 text-sm dark:border-stone-600 dark:bg-stone-800"
            aria-label="Fur quality"
          >
            <option value="low">low (flat)</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
        </Field>
      </Section>

      <Section title="Save / load">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={saveCoat}
            className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            Save coat
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            Load coat
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) loadCoat(f);
              e.target.value = '';
            }}
          />
        </div>
      </Section>
    </div>
  );
}
