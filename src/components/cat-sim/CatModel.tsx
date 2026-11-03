'use client';

// CatModel: wires settings → procedural cat materials/fur, runs the animation
// system, applies user position/rotation/scale.

import { useEffect, useMemo } from 'react';
import { useSettings } from '@/store/settingsStore';
import { createCoatMaterials, FUR_SHELLS } from './core/coat';
import { ProceduralCat } from './ProceduralCat';
import { useCatAnimation } from './core/useCatAnimation';

export function CatModel(): React.ReactElement {
  const coat = useSettings((s) => s.coat);
  const eyes = useSettings((s) => s.eyes);
  const accessory = useSettings((s) => s.accessory);
  const furQuality = useSettings((s) => s.furQuality);
  const scale = useSettings((s) => s.position.scale);

  const coatSet = useMemo(() => createCoatMaterials(useSettings.getState().coat), []);

  useEffect(() => {
    coatSet.update(coat);
  }, [coat, coatSet]);

  useCatAnimation();

  const furCount = FUR_SHELLS[furQuality];

  return (
    <group scale={scale}>
      <ProceduralCat
        coatSet={coatSet}
        furCount={furCount}
        eyeColorL={eyes.colorL}
        eyeColorR={eyes.oddEyed ? eyes.colorR : eyes.colorL}
        accessory={accessory}
      />
    </group>
  );
}
