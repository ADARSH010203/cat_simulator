'use client';

// Environment switcher — lazy-loads the active preset and disposes the rest.
// Switching never moves the cat or resets colour / animation (spec 4C).

import { Suspense, lazy } from 'react';
import { useSettings, type EnvironmentId } from '@/store/settingsStore';

const Garden = lazy(() => import('./Garden'));
const LivingRoom = lazy(() => import('./LivingRoom'));
const Studio = lazy(() => import('./Studio'));
const Bedroom = lazy(() => import('./Bedroom'));
const Forest = lazy(() => import('./Forest'));
const Beach = lazy(() => import('./Beach'));
const NightSky = lazy(() => import('./NightSky'));

export const ENVIRONMENTS: Array<{ id: EnvironmentId; label: string; emoji: string }> = [
  { id: 'garden', label: 'Garden', emoji: '🌿' },
  { id: 'livingroom', label: 'Living Room', emoji: '🛋️' },
  { id: 'studio', label: 'Studio', emoji: '◽' },
  { id: 'bedroom', label: 'Bedroom', emoji: '🛏️' },
  { id: 'forest', label: 'Forest', emoji: '🌲' },
  { id: 'beach', label: 'Beach', emoji: '🏖️' },
  { id: 'nightsky', label: 'Night Sky', emoji: '🌙' },
];

export function EnvironmentSwitch(): React.ReactElement | null {
  const env = useSettings((s) => s.environment);
  return (
    <Suspense fallback={null}>
      {env === 'garden' && <Garden />}
      {env === 'livingroom' && <LivingRoom />}
      {env === 'studio' && <Studio />}
      {env === 'bedroom' && <Bedroom />}
      {env === 'forest' && <Forest />}
      {env === 'beach' && <Beach />}
      {env === 'nightsky' && <NightSky />}
    </Suspense>
  );
}
