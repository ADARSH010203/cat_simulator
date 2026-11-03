'use client';

// Cozy living room: wood floor, rug, sofa, window light, plant, bookshelf.

import { GradientSky } from './common';

export default function LivingRoom(): React.ReactElement {
  return (
    <>
      <GradientSky top="#3a3138" bottom="#2a2229" radius={12} />
      <hemisphereLight args={['#ffe9d0', '#4a3a30', 0.5]} />
      <directionalLight position={[2.5, 3.2, 3.5]} intensity={1.1} color="#ffedd0" />
      <pointLight position={[-2, 1.8, -1.5]} intensity={0.5} color="#ffb46a" distance={7} />

      {/* floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[10, 10]} />
        <meshStandardMaterial color="#a8794f" roughness={0.75} />
      </mesh>
      {/* floorboard lines */}
      {Array.from({ length: 9 }, (_, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, -3.6 + i * 0.9]}>
          <planeGeometry args={[10, 0.02]} />
          <meshStandardMaterial color="#8a5f3c" roughness={0.9} />
        </mesh>
      ))}

      {/* rug */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]} receiveShadow>
        <circleGeometry args={[1.9, 40]} />
        <meshStandardMaterial color="#d8543f" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]}>
        <ringGeometry args={[1.55, 1.7, 40]} />
        <meshStandardMaterial color="#f0d9b5" roughness={1} />
      </mesh>

      {/* sofa */}
      <group position={[0, 0, -2.6]}>
        <mesh position={[0, 0.32, 0]} castShadow>
          <boxGeometry args={[2.6, 0.5, 1]} />
          <meshStandardMaterial color="#70556b" roughness={1} />
        </mesh>
        <mesh position={[0, 0.75, -0.42]} castShadow>
          <boxGeometry args={[2.6, 0.9, 0.25]} />
          <meshStandardMaterial color="#7d6178" roughness={1} />
        </mesh>
        <mesh position={[-1.15, 0.7, 0]} castShadow>
          <boxGeometry args={[0.3, 0.75, 1]} />
          <meshStandardMaterial color="#7d6178" roughness={1} />
        </mesh>
        <mesh position={[1.15, 0.7, 0]} castShadow>
          <boxGeometry args={[0.3, 0.75, 1]} />
          <meshStandardMaterial color="#7d6178" roughness={1} />
        </mesh>
        {/* cushions */}
        <mesh position={[-0.7, 0.68, -0.1]} rotation={[0.2, 0.3, 0.1]}>
          <boxGeometry args={[0.42, 0.42, 0.16]} />
          <meshStandardMaterial color="#e8a25b" roughness={1} />
        </mesh>
        <mesh position={[0.7, 0.68, -0.1]} rotation={[-0.1, -0.2, -0.05]}>
          <boxGeometry args={[0.42, 0.42, 0.16]} />
          <meshStandardMaterial color="#8fb98a" roughness={1} />
        </mesh>
      </group>

      {/* window with warm light */}
      <group position={[3.4, 1.9, -0.8]} rotation={[0, -Math.PI / 2, 0]}>
        <mesh>
          <boxGeometry args={[2.2, 1.8, 0.12]} />
          <meshStandardMaterial color="#4a4038" />
        </mesh>
        <mesh position={[0, 0, 0.08]}>
          <boxGeometry args={[1.9, 1.5, 0.05]} />
          <meshBasicMaterial color="#ffe9bd" />
        </mesh>
        <mesh position={[0, 0, 0.12]}>
          <boxGeometry args={[0.05, 1.5, 0.03]} />
          <meshStandardMaterial color="#4a4038" />
        </mesh>
        <mesh position={[0, 0, 0.12]}>
          <boxGeometry args={[1.9, 0.05, 0.03]} />
          <meshStandardMaterial color="#4a4038" />
        </mesh>
      </group>

      {/* plant */}
      <group position={[-2.8, 0, -1.8]}>
        <mesh position={[0, 0.22, 0]} castShadow>
          <cylinderGeometry args={[0.24, 0.18, 0.44, 12]} />
          <meshStandardMaterial color="#c96f4a" roughness={0.9} />
        </mesh>
        {[0, 1, 2, 3, 4].map((i) => (
          <mesh
            key={i}
            position={[Math.cos(i * 1.3) * 0.15, 0.62 + i * 0.09, Math.sin(i * 1.3) * 0.15]}
            rotation={[0.5 * Math.sin(i), i * 1.3, 0.35]}
          >
            <sphereGeometry args={[0.16, 8, 6]} />
            <meshStandardMaterial color="#4e8f3f" roughness={1} />
          </mesh>
        ))}
      </group>

      {/* toy ball the cat can look at */}
      <mesh position={[1.7, 0.09, 1.3]} castShadow>
        <sphereGeometry args={[0.09, 14, 12]} />
        <meshStandardMaterial color="#e05d5d" roughness={0.4} />
      </mesh>
    </>
  );
}
