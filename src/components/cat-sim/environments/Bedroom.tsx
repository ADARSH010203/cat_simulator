'use client';

// Cozy bedroom: bed, nightstand, warm lamp, window with stars.

import { GradientSky } from './common';

export default function Bedroom(): React.ReactElement {
  return (
    <>
      <GradientSky top="#241d2e" bottom="#33283a" radius={11} />
      <hemisphereLight args={['#f5dcc8', '#3a2c33', 0.45]} />
      <pointLight position={[-1.9, 0.95, -2.2]} intensity={1.1} color="#ffb46a" distance={6} decay={2} />
      <directionalLight position={[2.5, 3, 3]} intensity={0.35} color="#cdd8ff" />

      {/* floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[10, 10]} />
        <meshStandardMaterial color="#8a6a52" roughness={0.85} />
      </mesh>
      {/* soft round rug under the cat */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]}>
        <circleGeometry args={[1.7, 36]} />
        <meshStandardMaterial color="#d9a8a0" roughness={1} />
      </mesh>

      {/* bed */}
      <group position={[-0.4, 0, -2.7]}>
        <mesh position={[0, 0.25, 0]} castShadow>
          <boxGeometry args={[2.2, 0.34, 1.5]} />
          <meshStandardMaterial color="#7d6a8a" roughness={1} />
        </mesh>
        <mesh position={[0, 0.48, 0]} castShadow>
          <boxGeometry args={[2.15, 0.16, 1.45]} />
          <meshStandardMaterial color="#e8d8c8" roughness={1} />
        </mesh>
        <mesh position={[0, 0.56, 0]} castShadow>
          <boxGeometry args={[2.1, 0.1, 1.4]} />
          <meshStandardMaterial color="#c46a5a" roughness={1} />
        </mesh>
        {/* pillows */}
        <mesh position={[-0.7, 0.62, -0.35]} rotation={[0, 0.1, 0]} castShadow>
          <boxGeometry args={[0.55, 0.16, 0.42]} />
          <meshStandardMaterial color="#f2e8da" roughness={1} />
        </mesh>
        <mesh position={[-0.7, 0.62, 0.35]} rotation={[0, -0.08, 0]} castShadow>
          <boxGeometry args={[0.55, 0.16, 0.42]} />
          <meshStandardMaterial color="#f2e8da" roughness={1} />
        </mesh>
        {/* headboard */}
        <mesh position={[0, 0.85, -0.78]} castShadow>
          <boxGeometry args={[2.2, 1.1, 0.12]} />
          <meshStandardMaterial color="#6a5a76" roughness={1} />
        </mesh>
      </group>

      {/* nightstand + lamp */}
      <group position={[-1.9, 0, -2.4]}>
        <mesh position={[0, 0.3, 0]} castShadow>
          <boxGeometry args={[0.6, 0.6, 0.5]} />
          <meshStandardMaterial color="#7a5c46" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.66, 0]}>
          <cylinderGeometry args={[0.05, 0.07, 0.14, 8]} />
          <meshStandardMaterial color="#c9a06a" />
        </mesh>
        <mesh position={[0, 0.86, 0]}>
          <sphereGeometry args={[0.22, 12, 10]} />
          <meshStandardMaterial color="#ffd9a0" emissive="#ffb46a" emissiveIntensity={1.4} roughness={0.6} />
        </mesh>
      </group>

      {/* window with night sky */}
      <group position={[3.3, 2.1, -1]} rotation={[0, -Math.PI / 2, 0]}>
        <mesh>
          <boxGeometry args={[1.7, 1.6, 0.12]} />
          <meshStandardMaterial color="#5a4a5f" />
        </mesh>
        <mesh position={[0, 0, 0.08]}>
          <planeGeometry args={[1.4, 1.3]} />
          <meshBasicMaterial color="#2a2a4a" />
        </mesh>
        <mesh position={[-0.3, 0.4, 0.12]}>
          <circleGeometry args={[0.04, 8]} />
          <meshBasicMaterial color="#fdfdfd" />
        </mesh>
        <mesh position={[0.4, 0.15, 0.12]}>
          <circleGeometry args={[0.03, 8]} />
          <meshBasicMaterial color="#fdfdfd" />
        </mesh>
      </group>
    </>
  );
}
