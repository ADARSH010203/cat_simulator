'use client';

// Minimal white studio: seamless backdrop + 3-point soft light.

export default function Studio(): React.ReactElement {
  return (
    <>
      <color attach="background" args={['#f4f2ef']} />
      <hemisphereLight args={['#ffffff', '#d8d4cd', 0.9]} />
      <directionalLight position={[3, 5, 3]} intensity={1.1} color="#ffffff" />
      <directionalLight position={[-4, 3, 2]} intensity={0.45} color="#eef2f8" />
      <directionalLight position={[0, 2, -5]} intensity={0.3} color="#ffffff" />

      {/* floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[8, 48]} />
        <meshStandardMaterial color="#efedea" roughness={0.6} metalness={0.02} />
      </mesh>
      {/* seamless backdrop curve */}
      <mesh position={[0, 2.5, -5.5]}>
        <planeGeometry args={[16, 6]} />
        <meshStandardMaterial color="#f4f2ef" roughness={0.8} />
      </mesh>
      {/* subtle stool */}
      <mesh position={[1.6, 0.26, -0.9]} castShadow>
        <cylinderGeometry args={[0.3, 0.34, 0.52, 20]} />
        <meshStandardMaterial color="#e8e4de" roughness={0.5} />
      </mesh>
    </>
  );
}
