'use client';

// Forest: instanced pines, ferns, dappled light, soft fog.

import { useMemo } from 'react';
import * as THREE from 'three';
import { GradientSky, scatter } from './common';

export default function Forest(): React.ReactElement {
  const trees = useMemo(() => scatter(30, 8.5, 11, 1.9), []);
  const ferns = useMemo(() => scatter(24, 5.5, 31, 1.2), []);

  return (
    <>
      <GradientSky top="#7fa8b8" bottom="#c8d8c0" />
      <fog attach="fog" args={['#a8c2ae', 4, 16]} />
      <hemisphereLight args={['#cfe4d8', '#3a4a30', 0.6]} />
      <directionalLight position={[2.5, 7, 2]} intensity={1.0} color="#f2ecc8" />

      {/* ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[10, 48]} />
        <meshStandardMaterial color="#4e6b3a" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]}>
        <circleGeometry args={[1.9, 32]} />
        <meshStandardMaterial color="#5f7d45" roughness={1} />
      </mesh>

      {/* pine trees (instanced look via mapped meshes) */}
      {trees.map((tr, i) => (
        <group key={i} position={[tr.x, 0, tr.z]} rotation={[0, tr.r, 0]} scale={tr.s}>
          <mesh position={[0, 0.5, 0]}>
            <cylinderGeometry args={[0.09, 0.14, 1, 6]} />
            <meshStandardMaterial color="#5a4632" roughness={1} />
          </mesh>
          <mesh position={[0, 1.35, 0]} castShadow>
            <coneGeometry args={[0.62, 1.1, 7]} />
            <meshStandardMaterial color={i % 3 === 0 ? '#2f5c3a' : '#37684a'} roughness={1} />
          </mesh>
          <mesh position={[0, 2.05, 0]} castShadow>
            <coneGeometry args={[0.48, 0.95, 7]} />
            <meshStandardMaterial color={i % 3 === 0 ? '#356b42' : '#3d7752'} roughness={1} />
          </mesh>
          <mesh position={[0, 2.7, 0]} castShadow>
            <coneGeometry args={[0.32, 0.8, 7]} />
            <meshStandardMaterial color="#417f58" roughness={1} />
          </mesh>
        </group>
      ))}

      {/* ferns / bushes */}
      {ferns.map((f, i) => (
        <group key={`f${i}`} position={[f.x, 0, f.z]} rotation={[0, f.r, 0]} scale={f.s}>
          {[0, 1, 2, 3, 4].map((k) => (
            <mesh
              key={k}
              position={[Math.cos(k * 1.26) * 0.1, 0.16, Math.sin(k * 1.26) * 0.1]}
              rotation={[0.7, k * 1.26, 0]}
            >
              <sphereGeometry args={[0.14, 6, 5]} />
              <meshStandardMaterial color="#57804a" roughness={1} />
            </mesh>
          ))}
        </group>
      ))}

      {/* fallen log */}
      <mesh position={[2.3, 0.16, 1.9]} rotation={[0, 0.6, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.15, 0.17, 1.3, 9]} />
        <meshStandardMaterial color="#6a5340" roughness={1} />
      </mesh>
      {/* mushrooms */}
      <group position={[1.6, 0, 2.4]}>
        <mesh position={[0, 0.05, 0]}>
          <cylinderGeometry args={[0.02, 0.03, 0.1, 6]} />
          <meshStandardMaterial color="#e8dcc8" />
        </mesh>
        <mesh position={[0, 0.11, 0]}>
          <sphereGeometry args={[0.06, 8, 6]} />
          <meshStandardMaterial color="#c9452e" roughness={0.7} />
        </mesh>
      </group>
    </>
  );
}
