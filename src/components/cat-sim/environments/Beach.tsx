'use client';

// Beach at golden hour: sand, gentle animated water, sun glints.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GradientSky, scatter } from './common';
import type { Mesh } from 'three';

export default function Beach(): React.ReactElement {
  const waterRef = useRef<Mesh>(null);
  const shells = useMemo(() => scatter(12, 6.5, 17, 1.6), []);

  useFrame(({ clock }) => {
    const w = waterRef.current;
    if (w) {
      w.position.y = -0.06 + Math.sin(clock.elapsedTime * 0.7) * 0.02;
    }
  });

  return (
    <>
      <GradientSky top="#7ab8e8" bottom="#f5d9a8" />
      <hemisphereLight args={['#cfe8ff', '#d9b884', 0.8]} />
      <directionalLight position={[-4, 3, 4]} intensity={1.5} color="#ffe0b0" />

      {/* sand */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[10, 48]} />
        <meshStandardMaterial color="#e0c290" roughness={1} />
      </mesh>
      {/* towel the cat sits on */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]}>
        <circleGeometry args={[1.6, 36]} />
        <meshStandardMaterial color="#4fa8a0" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]}>
        <ringGeometry args={[1.3, 1.45, 36]} />
        <meshStandardMaterial color="#f0e4c8" roughness={1} />
      </mesh>

      {/* water */}
      <mesh ref={waterRef} rotation={[-Math.PI / 2, 0, 0]} position={[-0.06, 0, 0]}>
        <circleGeometry args={[10, 48]} />
        <meshStandardMaterial
          color="#3f9ec4"
          transparent
          opacity={0.85}
          roughness={0.15}
          metalness={0.4}
        />
      </mesh>
      {/* foam ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0]}>
        <ringGeometry args={[1.85, 2.1, 40]} />
        <meshStandardMaterial color="#eaf6f8" transparent opacity={0.7} roughness={0.3} />
      </mesh>

      {/* sun low on the horizon */}
      <mesh position={[-7, 2.2, -8]}>
        <sphereGeometry args={[0.9, 16, 12]} />
        <meshBasicMaterial color="#ffdf9e" />
      </mesh>

      {/* beach props */}
      <mesh position={[2.2, 0.28, 1.4]} rotation={[0.3, 0.5, -0.2]} castShadow>
        <capsuleGeometry args={[0.16, 0.4, 4, 10]} />
        <meshStandardMaterial color="#e07a5f" roughness={0.6} />
      </mesh>
      {shells.map((s, i) => (
        <mesh key={i} position={[s.x, 0.012, s.z]} rotation={[Math.PI / 2, s.r, 0]} scale={s.s}>
          <sphereGeometry args={[0.05, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={['#f2dbe0', '#f5ead2', '#e8c9b0'][i % 3]} roughness={0.5} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {/* beach ball */}
      <mesh position={[-1.8, 0.14, 1.7]} castShadow>
        <sphereGeometry args={[0.14, 16, 12]} />
        <meshStandardMaterial color="#f2f2f2" roughness={0.4} />
      </mesh>
    </>
  );
}
