'use client';

// Green garden: grass, flowers, a tree, butterflies (sparkles).

import { useMemo } from 'react';
import * as THREE from 'three';
import { Sparkles } from '@react-three/drei';
import { GradientSky, scatter } from './common';

export default function Garden(): React.ReactElement {
  const blades = useMemo(() => scatter(90, 7.5, 7, 1.1), []);
  const flowers = useMemo(() => scatter(26, 6.5, 23, 1.4), []);

  return (
    <>
      <GradientSky top="#8ed4f2" bottom="#dff3e4" />
      <hemisphereLight args={['#cfeaff', '#7aa25c', 0.75]} />
      <directionalLight position={[3, 6, 4]} intensity={1.6} color="#fff3d6" />
      <directionalLight position={[-4, 3, -3]} intensity={0.35} color="#bcd8ff" />

      {/* ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[9, 48]} />
        <meshStandardMaterial color="#6fae54" roughness={0.95} />
      </mesh>
      {/* mown circle where the cat sits */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
        <circleGeometry args={[1.8, 32]} />
        <meshStandardMaterial color="#8ac46c" roughness={0.9} />
      </mesh>

      {/* grass blades */}
      {blades.map((b, i) => (
        <mesh key={i} position={[b.x, 0.07 * b.s, b.z]} rotation={[0, b.r, 0]} scale={b.s}>
          <coneGeometry args={[0.03, 0.16, 4]} />
          <meshStandardMaterial color={i % 3 === 0 ? '#4f9440' : '#5da648'} roughness={1} />
        </mesh>
      ))}

      {/* flowers */}
      {flowers.map((f, i) => (
        <group key={`fl${i}`} position={[f.x, 0.08, f.z]} scale={f.s}>
          <mesh position={[0, 0.1, 0]}>
            <cylinderGeometry args={[0.006, 0.008, 0.2, 5]} />
            <meshStandardMaterial color="#3f7d33" />
          </mesh>
          <mesh position={[0, 0.22, 0]}>
            <sphereGeometry args={[0.045, 8, 6]} />
            <meshStandardMaterial color={['#f2a7c3', '#f2e7a0', '#e8b0d8', '#f5f5f5'][i % 4]} roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.27, 0]}>
            <sphereGeometry args={[0.02, 6, 5]} />
            <meshStandardMaterial color="#e0b23d" />
          </mesh>
        </group>
      ))}

      {/* tree */}
      <group position={[-2.6, 0, -2.2]}>
        <mesh position={[0, 0.9, 0]} castShadow>
          <cylinderGeometry args={[0.16, 0.26, 1.8, 8]} />
          <meshStandardMaterial color="#7a5a3f" roughness={1} />
        </mesh>
        <mesh position={[0, 2.1, 0]} castShadow>
          <sphereGeometry args={[1.15, 16, 12]} />
          <meshStandardMaterial color="#4e8f3f" roughness={1} />
        </mesh>
        <mesh position={[0.6, 1.7, 0.3]}>
          <sphereGeometry args={[0.65, 12, 10]} />
          <meshStandardMaterial color="#5aa047" roughness={1} />
        </mesh>
      </group>

      {/* a couple of rocks */}
      <mesh position={[2.4, 0.08, -1.6]} rotation={[0.4, 0.8, 0.2]}>
        <dodecahedronGeometry args={[0.28, 0]} />
        <meshStandardMaterial color="#9aa0a8" roughness={0.9} />
      </mesh>
      <mesh position={[-2.2, 0.06, 2.5]} rotation={[0.2, 1.4, 0.5]}>
        <dodecahedronGeometry args={[0.18, 0]} />
        <meshStandardMaterial color="#8d939b" roughness={0.9} />
      </mesh>

      <Sparkles count={26} scale={[7, 2.5, 7]} position={[0, 1.2, 0]} size={2.5} speed={0.25} color="#fff8c9" opacity={0.5} />
    </>
  );
}
