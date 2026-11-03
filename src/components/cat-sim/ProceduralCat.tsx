'use client';

// Fully procedural cat: rig of groups ("bones") + primitive meshes, shell fur,
// hit proxies. No external assets — this is the default AND the fallback.

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Rig } from './core/runtime';
import { runtime, setRig, setHeadWorldPos } from './core/runtime';
import type { CoatMaterialSet } from './core/coat';
import { makeFurShellMaterial, makeIrisTexture } from './core/coat';
import * as gestures from './core/interactions';
import { useSettings } from '@/store/settingsStore';

interface Props {
  coatSet: CoatMaterialSet;
  furCount: number;
  eyeColorL: string;
  eyeColorR: string;
  accessory: 'none' | 'collar' | 'bow';
}

const EAR_ROT = Math.PI / 4;

/** Shared proxy sphere for hit-testing (module level, created lazily). */
let PROXY_GEO: THREE.SphereGeometry | null = null;
const proxyGeo = (): THREE.SphereGeometry => {
  if (!PROXY_GEO) PROXY_GEO = new THREE.SphereGeometry(1, 10, 8);
  return PROXY_GEO;
};

function FurShells({
  shellMats,
  geometry,
  position,
  scale,
}: {
  shellMats: THREE.MeshPhysicalMaterial[];
  geometry: THREE.BufferGeometry;
  position: [number, number, number];
  scale: [number, number, number];
}): React.ReactElement | null {
  if (shellMats.length === 0) return null;
  return (
    <>
      {shellMats.map((m, i) => (
        <mesh key={i} geometry={geometry} material={m} position={position} scale={scale} renderOrder={8 + i} />
      ))}
    </>
  );
}

function Proxy({
  region,
  size,
  position,
}: {
  region: string;
  size: number;
  position: [number, number, number];
}): React.ReactElement {
  return (
    <mesh
      geometry={proxyGeo()}
      scale={size}
      position={position}
      userData={{ region }}
      onPointerDown={(e) => {
        e.stopPropagation();
        gestures.pointerDown(region, e.nativeEvent);
      }}
      onPointerMove={(e) => {
        e.stopPropagation();
        gestures.pointerMove(region, e.nativeEvent);
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        gestures.pointerUp(e.nativeEvent);
      }}
      onPointerEnter={(e) => {
        e.stopPropagation();
        document.body.style.cursor = 'pointer';
        runtime.headLook.active = true;
      }}
      onPointerLeave={() => {
        document.body.style.cursor = 'auto';
      }}
    >
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

export function ProceduralCat({ coatSet, furCount, eyeColorL, eyeColorR, accessory }: Props): React.ReactElement {
  const rigRef = useRef<Rig>({} as Rig);
  const headPosRef = useRef({ x: 0, y: 1, z: 0 });

  // ---- geometries (created once, disposed on unmount) ----
  const geo = useMemo(() => {
    const heart = new THREE.Shape();
    heart.moveTo(0, 0.5);
    heart.bezierCurveTo(0, 0.78, -0.5, 0.78, -0.5, 0.5);
    heart.bezierCurveTo(-0.5, 0.24, 0, 0.1, 0, -0.28);
    heart.bezierCurveTo(0, 0.1, 0.5, 0.24, 0.5, 0.5);
    heart.bezierCurveTo(0.5, 0.78, 0, 0.78, 0, 0.5);
    const noseGeo = new THREE.ExtrudeGeometry(heart, {
      depth: 0.22,
      bevelEnabled: true,
      bevelSize: 0.06,
      bevelThickness: 0.05,
      bevelSegments: 2,
    });

    const whiskers: THREE.TubeGeometry[] = [];
    const ys = [0.05, 0.032, 0.014, -0.004, -0.022, -0.04, -0.056];
    for (let i = 0; i < 7; i++) {
      const dy = ys[i];
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(-0.075, dy * 0.45, 0.035),
        new THREE.Vector3(-0.155, dy, 0.018)
      );
      whiskers.push(new THREE.TubeGeometry(curve, 8, 0.0033, 4));
    }

    return {
      body: new THREE.SphereGeometry(0.21, 28, 22),
      head: new THREE.SphereGeometry(0.19, 30, 24),
      muzzle: new THREE.SphereGeometry(0.075, 18, 14),
      cheek: new THREE.SphereGeometry(0.082, 16, 12),
      chin: new THREE.SphereGeometry(0.05, 12, 10),
      ear: new THREE.ConeGeometry(0.088, 0.17, 4),
      earInner: new THREE.ConeGeometry(0.058, 0.11, 4),
      eye: new THREE.SphereGeometry(0.048, 22, 18),
      pupil: new THREE.SphereGeometry(0.0495, 14, 10),
      highlight: new THREE.SphereGeometry(0.0095, 8, 6),
      lidU: new THREE.SphereGeometry(0.0525, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      lidL: new THREE.SphereGeometry(0.0525, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      upperArm: new THREE.CapsuleGeometry(0.043, 0.13, 4, 10),
      forearm: new THREE.CapsuleGeometry(0.038, 0.12, 4, 10),
      thigh: new THREE.CapsuleGeometry(0.066, 0.14, 4, 12),
      shin: new THREE.CapsuleGeometry(0.045, 0.14, 4, 10),
      paw: new THREE.SphereGeometry(0.05, 14, 10),
      toe: new THREE.SphereGeometry(0.017, 8, 6),
      pad: new THREE.SphereGeometry(0.016, 8, 6),
      tailSeg: new THREE.CapsuleGeometry(0.05, 0.1, 4, 10),
      nose: noseGeo,
      whiskers,
      jaw: new THREE.SphereGeometry(0.048, 14, 10),
      cavity: new THREE.SphereGeometry(0.03, 10, 8),
      tongue: new THREE.CapsuleGeometry(0.014, 0.03, 4, 8),
      fang: new THREE.ConeGeometry(0.007, 0.024, 6),
      neck: new THREE.CapsuleGeometry(0.105, 0.1, 4, 12),
      collar: new THREE.TorusGeometry(0.155, 0.022, 10, 26),
      bell: new THREE.SphereGeometry(0.028, 12, 10),
      bowL: new THREE.ConeGeometry(0.05, 0.09, 4),
      bowC: new THREE.SphereGeometry(0.025, 10, 8),
      proxy: new THREE.SphereGeometry(1, 10, 8),
    };
  }, []);

  useEffect(() => {
    return () => {
      Object.values(geo).forEach((g) => {
        if (Array.isArray(g)) g.forEach((x) => x.dispose());
        else g.dispose();
      });
    };
  }, [geo]);

  // ---- materials that are NOT part of the coat set ----
  const irisTexL = useMemo(() => makeIrisTexture(eyeColorL), [eyeColorL]);
  const irisTexR = useMemo(() => makeIrisTexture(eyeColorR), [eyeColorR]);
  const eyeMatL = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        roughness: 0.08,
        clearcoat: 1,
        clearcoatRoughness: 0.05,
        map: irisTexL,
      }),
    [irisTexL]
  );
  const eyeMatR = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        roughness: 0.08,
        clearcoat: 1,
        clearcoatRoughness: 0.05,
        map: irisTexR,
      }),
    [irisTexR]
  );
  useEffect(() => () => irisTexL.dispose(), [irisTexL]);
  useEffect(() => () => irisTexR.dispose(), [irisTexR]);
  useEffect(() => () => eyeMatL.dispose(), [eyeMatL]);
  useEffect(() => () => eyeMatR.dispose(), [eyeMatR]);
  const pupilMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#0a0808', roughness: 0.12 }), []);
  const highlightMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffffff' }), []);
  const lidMat = useMemo(() => new THREE.MeshPhysicalMaterial({ roughness: 0.9, sheen: 0.5 }), []);
  const mouthMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#3a1420', roughness: 0.6 }), []);
  const tongueMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#e88a9a', roughness: 0.5 }), []);
  const padMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#e89aa6', roughness: 0.7 }), []);
  const collarMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#c94f4f', roughness: 0.5 }), []);
  const bellMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#e0b23d', roughness: 0.25, metalness: 0.8 }),
    []
  );
  const bowMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#e070a0', roughness: 0.55 }), []);

  // eyelid colour follows coat base
  useEffect(
    () =>
      useSettings.subscribe((s) => {
        lidMat.color.set(s.coat.baseColor).multiplyScalar(0.82);
      }),
    [lidMat]
  );

  useEffect(() => () => lidMat.dispose(), [lidMat]);

  // ---- fur shell materials (recreated when quality / coat map changes) ----
  const shellMats = useMemo(() => {
    const map = coatSet.bodyMat.map as THREE.Texture;
    const mats: THREE.MeshPhysicalMaterial[] = [];
    for (let i = 1; i <= furCount; i++) {
      mats.push(makeFurShellMaterial(map, i / (furCount + 1), 0.032));
    }
    return mats;
  }, [furCount, coatSet]);

  useEffect(() => {
    return () => {
      shellMats.forEach((m) => m.dispose());
    };
  }, [shellMats]);

  const r = (key: string) => (el: THREE.Group | null): void => {
    if (el) (rigRef.current as unknown as Record<string, THREE.Group>)[key] = el;
  };

  const tailRefs = useRef<(THREE.Group | null)[]>([]);

  // register rig into runtime
  useEffect(() => {
    const rig = rigRef.current;
    rig.tail = tailRefs.current.filter(Boolean) as THREE.Group[];
    setRig(rig);
    setHeadWorldPos(headPosRef);
    return () => {
      setRig(null);
    };
  }, []);

  const S = coatSet;

  // Tail renders as a NESTED chain (seg n+1 is a child of seg n) so the
  // per-segment rotations applied by the animation system accumulate into a
  // curl. Sibling groups would all pivot around the same point and collapse
  // into a single blob.
  const renderTailSeg = (seg: number): React.ReactNode => {
    if (seg > 8) return null;
    const radius = 1.0 - seg * 0.072;
    const mat = seg >= 7 ? S.tailTipMat : S.bodyMat;
    return (
      <group
        key={seg}
        ref={(el) => {
          if (el) tailRefs.current[seg] = el;
        }}
        position={[0, 0.012, -0.096]}
      >
        <mesh geometry={geo.tailSeg} material={mat} rotation={[-Math.PI / 2, 0, 0]} scale={[radius, 1, radius]} castShadow />
        {seg === 4 && <Proxy region="tailMid" size={0.06} position={[0, 0, -0.05]} />}
        {seg === 7 && <Proxy region="tailTip" size={0.055} position={[0, 0, -0.05]} />}
        {renderTailSeg(seg + 1)}
      </group>
    );
  };

  return (
    <group ref={r('root')}>
      <group ref={r('hips')}>
        {/* rear body */}
        <mesh geometry={geo.body} material={S.bodyMat} scale={[0.96, 0.92, 1.06]} position={[0, -0.02, -0.3]} castShadow />
        <FurShells shellMats={shellMats} geometry={geo.body} position={[0, -0.02, -0.3]} scale={[0.96, 0.92, 1.06]} />
        {/* belly patch */}
        <mesh geometry={geo.muzzle} material={S.bellyMat} scale={[1.9, 1.15, 2.1]} position={[0, -0.13, -0.08]} />

        {/* mid + front body */}
        <group ref={r('spine2')} position={[0, 0.01, -0.12]}>
          <mesh geometry={geo.body} material={S.bodyMat} scale={[0.93, 0.9, 1.0]} position={[0, 0, 0.06]} castShadow />
          <FurShells shellMats={shellMats} geometry={geo.body} position={[0, 0, 0.06]} scale={[0.93, 0.9, 1.0]} />
          <group ref={r('chest')} position={[0, 0.02, 0.2]}>
            <mesh geometry={geo.body} material={S.bodyMat} scale={[1.02, 1.0, 1.08]} position={[0, 0, 0.02]} castShadow />
            <FurShells shellMats={shellMats} geometry={geo.body} position={[0, 0, 0.02]} scale={[1.02, 1.0, 1.08]} />

            {/* neck + head */}
            <group ref={r('neck')} position={[0, 0.06, 0.16]}>
              <mesh geometry={geo.neck} material={S.bodyMat} rotation={[Math.PI / 2.6, 0, 0]} position={[0, 0.02, 0.03]} />
              <group ref={r('head')} position={[0, 0.1, 0.14]}>
                <mesh geometry={geo.head} material={S.headMat} scale={[1.12, 0.95, 0.98]} castShadow />
                <FurShells shellMats={shellMats} geometry={geo.head} position={[0, 0, 0]} scale={[1.12, 0.95, 0.98]} />
                {/* cheek puffs */}
                <mesh geometry={geo.cheek} material={S.bellyMat} position={[-0.105, -0.045, 0.075]} scale={[0.82, 0.78, 0.85]} />
                <mesh geometry={geo.cheek} material={S.bellyMat} position={[0.105, -0.045, 0.075]} scale={[0.82, 0.78, 0.85]} />
                {/* muzzle */}
                <mesh geometry={geo.muzzle} material={S.muzzleMat} position={[0, -0.05, 0.145]} scale={[1.2, 0.85, 1.0]} />
                {/* chin fluff */}
                <mesh geometry={geo.chin} material={S.bellyMat} position={[0, -0.115, 0.09]} scale={[1.1, 0.8, 0.9]} />
                {/* nose */}
                <mesh geometry={geo.nose} material={S.noseMat} position={[0, -0.016, 0.187]} scale={[0.05, 0.042, 0.03]} rotation={[-0.25, 0, 0]} />

                {/* jaw + mouth */}
                <group ref={r('jaw')} position={[0, -0.075, 0.06]}>
                  <mesh geometry={geo.jaw} material={S.muzzleMat} position={[0, -0.004, 0.062]} scale={[0.9, 0.55, 1.15]} />
                  <mesh geometry={geo.cavity} material={mouthMat} position={[0, 0.012, 0.05]} scale={[1.1, 0.7, 1.2]} />
                  <mesh geometry={geo.tongue} material={tongueMat} position={[0, -0.002, 0.062]} rotation={[0.15, 0, 0]} scale={[1.1, 0.6, 1]} />
                </group>
                {/* fangs (visible when yawning) */}
                <mesh geometry={geo.fang} material={highlightMat} position={[-0.023, -0.075, 0.145]} rotation={[Math.PI, 0, 0]} />
                <mesh geometry={geo.fang} material={highlightMat} position={[0.023, -0.075, 0.145]} rotation={[Math.PI, 0, 0]} />

                {/* ears */}
                <group ref={r('earL')} position={[-0.105, 0.135, -0.015]} rotation={[0, 0, 0.3]}>
                  <mesh geometry={geo.ear} material={S.earOuterMat} scale={[0.62, 1, 0.9]} rotation={[0, EAR_ROT, 0]} castShadow />
                  <mesh geometry={geo.earInner} material={S.earInnerMat} scale={[0.55, 1, 0.7]} position={[0, 0.005, 0.014]} rotation={[0, EAR_ROT, 0]} />
                </group>
                <group ref={r('earR')} position={[0.105, 0.135, -0.015]} rotation={[0, 0, -0.3]}>
                  <mesh geometry={geo.ear} material={S.earOuterMat} scale={[0.62, 1, 0.9]} rotation={[0, EAR_ROT, 0]} castShadow />
                  <mesh geometry={geo.earInner} material={S.earInnerMat} scale={[0.55, 1, 0.7]} position={[0, 0.005, 0.014]} rotation={[0, EAR_ROT, 0]} />
                </group>

                {/* eyes */}
                <group ref={r('eyeL')} position={[-0.082, 0.018, 0.152]}>
                  <mesh geometry={geo.eye} material={eyeMatL} />
                  <mesh
                    ref={(m) => {
                      if (m) (rigRef.current as unknown as Record<string, unknown>).pupilL = m;
                    }}
                    geometry={geo.pupil}
                    material={pupilMat}
                    scale={[0.45, 0.98, 1.02]}
                  />
                  <mesh geometry={geo.highlight} material={highlightMat} position={[0.015, 0.015, 0.041]} />
                </group>
                <group ref={r('eyeR')} position={[0.082, 0.018, 0.152]}>
                  <mesh geometry={geo.eye} material={eyeMatR} />
                  <mesh
                    ref={(m) => {
                      if (m) (rigRef.current as unknown as Record<string, unknown>).pupilR = m;
                    }}
                    geometry={geo.pupil}
                    material={pupilMat}
                    scale={[0.45, 0.98, 1.02]}
                  />
                  <mesh geometry={geo.highlight} material={highlightMat} position={[-0.015, 0.015, 0.041]} />
                </group>
                {/* eyelids */}
                <group ref={r('lidUL')} position={[-0.082, 0.018, 0.152]}>
                  <mesh geometry={geo.lidU} material={lidMat} />
                </group>
                <group ref={r('lidUR')} position={[0.082, 0.018, 0.152]}>
                  <mesh geometry={geo.lidU} material={lidMat} />
                </group>
                <group ref={r('lidLL')} position={[-0.082, 0.018, 0.152]}>
                  <mesh geometry={geo.lidL} material={lidMat} />
                </group>
                <group ref={r('lidLR')} position={[0.082, 0.018, 0.152]}>
                  <mesh geometry={geo.lidL} material={lidMat} />
                </group>

                {/* whiskers */}
                <group ref={r('whiskerL')} position={[-0.055, -0.038, 0.128]}>
                  {geo.whiskers.map((w, i) => (
                    <mesh key={i} geometry={w} material={S.whiskerMat} rotation={[0, 0.32 + (i - 3) * 0.07, 0.12]} />
                  ))}
                </group>
                <group ref={r('whiskerR')} position={[0.055, -0.038, 0.128]}>
                  {geo.whiskers.map((w, i) => (
                    <mesh key={i} geometry={w} material={S.whiskerMat} rotation={[0, -0.32 - (i - 3) * 0.07, -0.12]} scale={[-1, 1, 1]} />
                  ))}
                </group>

                {/* ---- head hit proxies ---- */}
                <Proxy region="head" size={0.15} position={[0, 0.02, 0]} />
                <Proxy region="forehead" size={0.055} position={[0, 0.1, 0.115]} />
                <Proxy region="cheekL" size={0.05} position={[-0.108, -0.05, 0.1]} />
                <Proxy region="cheekR" size={0.05} position={[0.108, -0.05, 0.1]} />
                <Proxy region="chin" size={0.045} position={[0, -0.13, 0.09]} />
                <Proxy region="nose" size={0.03} position={[0, -0.02, 0.2]} />
                <Proxy region="earL" size={0.075} position={[-0.105, 0.15, -0.015]} />
                <Proxy region="earR" size={0.075} position={[0.105, 0.15, -0.015]} />
                <Proxy region="whiskersL" size={0.045} position={[-0.09, -0.04, 0.16]} />
                <Proxy region="whiskersR" size={0.045} position={[0.09, -0.04, 0.16]} />
              </group>
            </group>

            {/* front legs */}
            <group ref={r('legFL')} position={[-0.108, -0.06, 0.14]}>
              <mesh geometry={geo.upperArm} material={S.bodyMat} position={[0, -0.072, 0]} castShadow />
              <group ref={r('kneeFL')} position={[0, -0.15, 0.008]}>
                <mesh geometry={geo.forearm} material={S.bodyMat} position={[0, -0.072, -0.004]} castShadow />
                <group ref={r('pawFL')} position={[0, -0.148, 0.012]}>
                  <mesh geometry={geo.paw} material={S.pawMat} position={[0, -0.012, 0.018]} scale={[0.85, 0.62, 1.3]} castShadow />
                  {[-1, 0, 1].map((k) => (
                    <mesh key={k} geometry={geo.toe} material={S.pawMat} position={[k * 0.022, -0.018, 0.06]} />
                  ))}
                  <mesh geometry={geo.pad} material={padMat} position={[0, -0.045, 0.02]} />
                  <Proxy region="pawFL" size={0.062} position={[0, -0.01, 0.02]} />
                </group>
              </group>
            </group>
            <group ref={r('legFR')} position={[0.108, -0.06, 0.14]}>
              <mesh geometry={geo.upperArm} material={S.bodyMat} position={[0, -0.072, 0]} castShadow />
              <group ref={r('kneeFR')} position={[0, -0.15, 0.008]}>
                <mesh geometry={geo.forearm} material={S.bodyMat} position={[0, -0.072, -0.004]} castShadow />
                <group ref={r('pawFR')} position={[0, -0.148, 0.012]}>
                  <mesh geometry={geo.paw} material={S.pawMat} position={[0, -0.012, 0.018]} scale={[0.85, 0.62, 1.3]} castShadow />
                  {[-1, 0, 1].map((k) => (
                    <mesh key={k} geometry={geo.toe} material={S.pawMat} position={[k * 0.022, -0.018, 0.06]} />
                  ))}
                  <mesh geometry={geo.pad} material={padMat} position={[0, -0.045, 0.02]} />
                  <Proxy region="pawFR" size={0.062} position={[0, -0.01, 0.02]} />
                </group>
              </group>
            </group>

            {/* neck + back proxies */}
            <Proxy region="neck" size={0.09} position={[0, 0.03, 0.16]} />
            <Proxy region="back" size={0.115} position={[0, 0.13, 0.02]} />

            {/* collar / bow — draped on the chest front, below the head overhang
                so both stay visible from the default camera (head bottom ≈ y -0.02) */}
            <group position={[0, 0.01, 0.19]} visible={accessory === 'collar'}>
              <mesh geometry={geo.collar} material={collarMat} rotation={[1.83, 0, 0]} />
              <mesh geometry={geo.bell} material={bellMat} position={[0, -0.095, 0.11]} />
            </group>
            <group position={[0, -0.04, 0.3]} visible={accessory === 'bow'}>
              <mesh geometry={geo.bowL} material={bowMat} position={[-0.045, 0, 0.06]} rotation={[0, Math.PI / 2, 0]} scale={[0.5, 1, 0.9]} />
              <mesh geometry={geo.bowL} material={bowMat} position={[0.045, 0, 0.06]} rotation={[0, -Math.PI / 2, 0]} scale={[0.5, 1, 0.9]} />
              <mesh geometry={geo.bowC} material={bowMat} position={[0, 0, 0.06]} />
            </group>
          </group>
          {/* flank proxies */}
          <Proxy region="flankL" size={0.1} position={[-0.16, -0.02, 0.04]} />
          <Proxy region="flankR" size={0.1} position={[0.16, -0.02, 0.04]} />
        </group>

        {/* belly proxy */}
        <Proxy region="belly" size={0.13} position={[0, -0.15, -0.05]} />

        {/* hind legs */}
        <group ref={r('legBL')} position={[-0.125, -0.01, -0.19]}>
          <mesh geometry={geo.thigh} material={S.bodyMat} position={[0, -0.085, 0.012]} scale={[1, 1, 1.25]} castShadow />
          <group ref={r('kneeBL')} position={[0, -0.165, 0.022]}>
            <mesh geometry={geo.shin} material={S.bodyMat} position={[0, -0.075, -0.015]} castShadow />
            <group ref={r('pawBL')} position={[0, -0.152, 0.005]}>
              <mesh geometry={geo.paw} material={S.pawMat} position={[0, -0.012, 0.02]} scale={[0.85, 0.62, 1.25]} castShadow />
              {[-1, 0, 1].map((k) => (
                <mesh key={k} geometry={geo.toe} material={S.pawMat} position={[k * 0.022, -0.018, 0.062]} />
              ))}
              <mesh geometry={geo.pad} material={padMat} position={[0, -0.045, 0.02]} />
              <Proxy region="pawBL" size={0.062} position={[0, -0.01, 0.02]} />
            </group>
          </group>
        </group>
        <group ref={r('legBR')} position={[0.125, -0.01, -0.19]}>
          <mesh geometry={geo.thigh} material={S.bodyMat} position={[0, -0.085, 0.012]} scale={[1, 1, 1.25]} castShadow />
          <group ref={r('kneeBR')} position={[0, -0.165, 0.022]}>
            <mesh geometry={geo.shin} material={S.bodyMat} position={[0, -0.075, -0.015]} castShadow />
            <group ref={r('pawBR')} position={[0, -0.152, 0.005]}>
              <mesh geometry={geo.paw} material={S.pawMat} position={[0, -0.012, 0.02]} scale={[0.85, 0.62, 1.25]} castShadow />
              {[-1, 0, 1].map((k) => (
                <mesh key={k} geometry={geo.toe} material={S.pawMat} position={[k * 0.022, -0.018, 0.062]} />
              ))}
              <mesh geometry={geo.pad} material={padMat} position={[0, -0.045, 0.02]} />
              <Proxy region="pawBR" size={0.062} position={[0, -0.01, 0.02]} />
            </group>
          </group>
        </group>

        {/* tail: 9 chained segments */}
        <group
          ref={(el) => {
            if (el) tailRefs.current[0] = el;
          }}
          position={[0, 0.075, -0.31]}
        >
          <mesh geometry={geo.tailSeg} material={S.bodyMat} rotation={[-Math.PI / 2, 0, 0]} scale={[1.0, 1, 1.0]} castShadow />
          <Proxy region="tailBase" size={0.07} position={[0, 0, -0.05]} />
          {renderTailSeg(1)}
        </group>
      </group>
    </group>
  );
}
