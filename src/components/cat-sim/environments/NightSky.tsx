'use client';

// Night sky: stars, moon, aurora sparkles, dark velvet ground.

import { Stars, Sparkles } from '@react-three/drei';
import { GradientSky, scatter } from './common';

export default function NightSky(): React.ReactElement {
  const rocks = scatter(7, 6, 61, 1.6);
  return (
    <>
      <GradientSky top="#0a0a1e" bottom="#1d1b38" />
      <hemisphereLight args={['#8a9ae8', '#1a1a2e', 0.35]} />
      <directionalLight position={[-3, 5, -2]} intensity={0.8} color="#cdd8ff" />
      <directionalLight position={[2, 1.5, 3]} intensity={0.25} color="#8a9ae8" />

      {/* floating platform the cat sits on */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[8, 48]} />
        <meshStandardMaterial color="#2a2848" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]}>
        <circleGeometry args={[1.7, 36]} />
        <meshStandardMaterial color="#38345e" roughness={1} />
      </mesh>
      {/* glowing rim */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]}>
        <ringGeometry args={[1.68, 1.74, 48]} />
        <meshBasicMaterial color="#9aa8ff" transparent opacity={0.7} />
      </mesh>

      {/* moon */}
      <mesh position={[-4.5, 4.2, -7]}>
        <sphereGeometry args={[0.85, 20, 16]} />
        <meshBasicMaterial color="#f2eede" />
      </mesh>
      <mesh position={[-4.75, 4.35, -6.85]}>
        <sphereGeometry args={[0.82, 20, 16]} />
        <meshBasicMaterial color="#e8e2cc" />
      </mesh>

      <Stars radius={40} depth={20} count={2200} factor={3.2} saturation={0.4} fade speed={0.6} />
      <Sparkles count={60} scale={[6, 3, 6]} position={[0, 1.6, 0]} size={3} speed={0.3} color="#b0bcff" opacity={0.65} />

      {/* floating crystals */}
      {rocks.map((rk, i) => (
        <mesh key={i} position={[rk.x, 0.35 + rk.s * 0.3, rk.z]} rotation={[rk.r, rk.r * 2, rk.r / 2]}>
          <octahedronGeometry args={[0.1 * rk.s, 0]} />
          <meshStandardMaterial
            color="#8a9ae8"
            emissive="#6a78d8"
            emissiveIntensity={0.9}
            roughness={0.2}
            metalness={0.5}
          />
        </mesh>
      ))}
    </>
  );
}
