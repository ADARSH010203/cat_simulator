'use client';

// Shared helpers for the procedural environments.

import { useMemo } from 'react';
import * as THREE from 'three';

export function GradientSky({
  top,
  bottom,
  radius = 24,
}: {
  top: string;
  bottom: string;
  radius?: number;
}): React.ReactElement {
  const tex = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, top);
    grad.addColorStop(0.55, bottom);
    grad.addColorStop(1, bottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 4, 256);
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [top, bottom]);

  return (
    <mesh scale={radius}>
      <sphereGeometry args={[1, 24, 16]} />
      <meshBasicMaterial map={tex} side={THREE.BackSide} depthWrite={false} fog={false} />
    </mesh>
  );
}

/** Simple deterministic scatter used by the environments. */
export function scatter(
  count: number,
  radius: number,
  seed = 1,
  minR = 0
): Array<{ x: number; z: number; s: number; r: number }> {
  const out: Array<{ x: number; z: number; s: number; r: number }> = [];
  let s = seed;
  const rnd = (): number => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2;
    const d = minR + rnd() * (radius - minR);
    out.push({
      x: Math.cos(a) * d,
      z: Math.sin(a) * d,
      s: 0.6 + rnd() * 0.8,
      r: rnd() * Math.PI * 2,
    });
  }
  return out;
}
