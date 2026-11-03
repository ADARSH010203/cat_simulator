'use client';

// Scene: environment + cat + camera rig + soft contact shadow.

import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { CatModel } from './CatModel';
import { CatShadow } from './CatShadow';
import { EnvironmentSwitch } from './environments';
import { useCameraStore, CAMERA_PRESETS } from './core/cameraBus';
import { useSettings } from '@/store/settingsStore';
import { orbitHook } from './core/interactions';
import { damp, easeInOut } from './core/utils';

function CameraRig(): React.ReactElement {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const seq = useCameraStore((s) => s.seq);
  const presetName = useCameraStore((s) => s.preset);
  const panelOpen = useSettings((s) => s.panelOpen);
  const autoRotate = useSettings((s) => s.autoRotate);
  const anim = useRef({
    active: false,
    t: 0,
    dur: 0.8,
    fromPos: new THREE.Vector3(),
    toPos: new THREE.Vector3(),
    fromTarget: new THREE.Vector3(),
    toTarget: new THREE.Vector3(),
  });
  const appliedShift = useRef(0);
  const appliedYShift = useRef(0);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const p = CAMERA_PRESETS[presetName] ?? CAMERA_PRESETS.reset;
    const a = anim.current;
    a.active = true;
    a.t = 0;
    a.fromPos.copy(controls.object.position);
    a.toPos.set(...p.pos);
    a.fromTarget.copy(controls.target);
    a.toTarget.set(...p.target);
  }, [seq, presetName]);

  // let gestures block camera orbit while petting
  useEffect(() => {
    orbitHook.disable = () => {
      if (controlsRef.current) controlsRef.current.enabled = false;
    };
    orbitHook.enable = () => {
      if (controlsRef.current) controlsRef.current.enabled = true;
    };
  }, []);

  useFrame((state, dt) => {
    const controls = controlsRef.current;
    if (!controls) return;
    const a = anim.current;
    if (a.active) {
      a.t += dt;
      const u = easeInOut(Math.min(1, a.t / a.dur));
      state.camera.position.lerpVectors(a.fromPos, a.toPos, u);
      controls.target.lerpVectors(a.fromTarget, a.toTarget, u);
      if (u >= 1) a.active = false;
    } else {
      // shift target so an open panel never covers the cat
      const isDesktop = window.innerWidth >= 768;
      const desired = panelOpen && isDesktop ? 0.55 : 0;
      appliedShift.current = damp(appliedShift.current, desired, 6, dt);
      controls.target.x = damp(controls.target.x, appliedShift.current, 6, dt);
      // mobile bottom sheet: raise the cat above the panel (additive delta
      // keeps any camera-preset target.y intact)
      const desiredY = panelOpen && !isDesktop ? 0.24 : 0;
      const newYShift = damp(appliedYShift.current, desiredY, 6, dt);
      controls.target.y += newYShift - appliedYShift.current;
      appliedYShift.current = newYShift;
    }
    controls.update();
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.09}
      minDistance={0.7}
      maxDistance={7}
      minPolarAngle={0.12}
      maxPolarAngle={Math.PI * 0.52}
      enablePan
      panSpeed={0.55}
      screenSpacePanning
      autoRotate={autoRotate}
      autoRotateSpeed={0.5}
      target={[0, 0.5, 0]}
    />
  );
}

export function Scene(): React.ReactElement {
  return (
    <>
      <EnvironmentSwitch />
      <LightScaler />
      <CatShadow />
      <CatModel />
      {/* double-click empty space to refocus on the cat */}
      <mesh
        position={[0, -0.15, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onDoubleClick={(e) => {
          const onCat = e.intersections.some((i) => Boolean(i.object.userData?.region));
          if (!onCat) useCameraStore.getState().request('reset');
        }}
      >
        <planeGeometry args={[80, 80]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <CameraRig />
    </>
  );
}

/** Global brightness for the Env-tab intensity slider.
 *  Scales the renderer's tone-mapping exposure so EVERYTHING responds —
 *  sky domes (unlit basic materials), props and the cat alike — which the
 *  old per-light scaling could not do (bright skies ignored the slider,
 *  and lazily mounted env lights escaped the rescan entirely).
 *  Runs in useFrame so it can never drift out of sync with the slider. */
const BASE_EXPOSURE = 1.05;

function LightScaler(): null {
  useFrame(({ gl }) => {
    gl.toneMappingExposure = BASE_EXPOSURE * useSettings.getState().envLightIntensity;
  });
  return null;
}
