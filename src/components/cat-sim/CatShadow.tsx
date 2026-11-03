'use client';

// Soft radial contact shadow that follows the cat — cheap and always visible.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Mesh } from 'three';
import { runtime } from './core/runtime';
import { useSettings } from '@/store/settingsStore';

export function CatShadow(): React.ReactElement {
  const ref = useRef<Mesh>(null);

  const tex = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    const g = ctx.createRadialGradient(64, 64, 6, 64, 64, 62);
    g.addColorStop(0, 'rgba(20,14,8,0.52)');
    g.addColorStop(0.45, 'rgba(20,14,8,0.38)');
    g.addColorStop(0.75, 'rgba(20,14,8,0.16)');
    g.addColorStop(1, 'rgba(20,14,8,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);

  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const anchor = useSettings.getState().position;
    const x = anchor.x + runtime.posX;
    const z = anchor.z + runtime.posZ;
    const lift = Math.min(1, Math.max(0, runtime.hopY * 4));
    m.position.set(x, anchor.y + 0.016 + runtime.hopY * 0.2, z);
    const s = anchor.scale * (1 - lift * 0.25);
    m.scale.set(1.45 * s, 1.05 * s, 1);
    (m.material as THREE.MeshBasicMaterial).opacity = 1 - lift * 0.35;
  });

  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} />
    </mesh>
  );
}
