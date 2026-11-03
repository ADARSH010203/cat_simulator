'use client';

// Animation system: base state machine + additive layers + reaction overrides.
// Priority (highest first): Startle > Echo listen/speak > Touch reaction >
// Action button > Autonomous idle. One owner per bone group per frame.

import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { runtime, type CatStateId } from './runtime';
import { clamp, damp, lerp, rand, pickWeighted, easeOutBack } from './utils';
import { useSettings } from '@/store/settingsStore';
import { useCatLive, type Mood } from '@/store/catStateStore';
import { catAudio } from '../audio/sounds';
import { TRANSITIONS, LYING, STATE_DUR, AFTER_STATE, resolvePath } from './stateMachine';

export { resolvePath };

function setState(next: CatStateId): void {
  if (runtime.state === next) return;
  runtime.prevState = runtime.state;
  runtime.state = next;
  runtime.stateT0 = runtime.t;
  runtime.stateDur = STATE_DUR[next]();
  runtime.actionCooldowns[next] = runtime.t + 18;
}

/** Request a state change, resolving invalid jumps through neutral states. */
export function requestState(desired: CatStateId, queueMode = false): void {
  if (queueMode) {
    runtime.queue.push(desired);
    return;
  }
  const path = resolvePath(runtime.state, desired);
  runtime.queue = path.slice();
  if (path.length > 0 && TRANSITIONS[runtime.state]?.includes(path[0])) {
    setState(path[0]);
    runtime.queue = path.slice(1);
  }
}

// ---------------------------------------------------------------- pose writers

type Pose = Partial<Record<string, number>>;

const standPose = (t: number): Pose => ({
  bodyY: 0.36 + Math.sin(t * 0.7) * 0.008,
  spineRY: Math.sin(t * 0.35) * 0.04,
  headRX: 0.02,
  flHip: 0.08,
  flKnee: -0.12,
  frHip: 0.08,
  frKnee: -0.12,
  blHip: 0.1,
  blKnee: 0.16,
  brHip: 0.1,
  brKnee: 0.16,
  tailCurl: 0.62,
  tailSway: -0.12,
});

const sitPose = (t: number): Pose => ({
  bodyY: 0.3,
  bodyPitch: -0.3,
  spineRX: -0.22,
  neckRX: 0.3,
  headRX: -0.08 + Math.sin(t * 0.5) * 0.02,
  flHip: 0.12,
  flKnee: -0.1,
  frHip: 0.12,
  frKnee: -0.1,
  blHip: 1.5,
  blKnee: -1.9,
  brHip: 1.5,
  brKnee: -1.9,
  tailCurl: 0.78,
  tailSway: -0.3,
});

const loafPose = (t: number): Pose => ({
  bodyY: 0.17,
  bodyPitch: -0.06,
  spineRX: -0.04,
  neckRX: 0.18,
  headRX: -0.12,
  flHip: 1.15,
  flKnee: 1.35,
  frHip: 1.15,
  frKnee: 1.35,
  blHip: 1.35,
  blKnee: -1.5,
  brHip: 1.35,
  brKnee: -1.5,
  tailCurl: 0.32,
  squint: 0.15,
});

const lieSidePose = (): Pose => ({
  bodyY: 0.135,
  bodyRZ: 1.3,
  bodyPitch: 0,
  spineRX: 0.05,
  neckRX: 0.1,
  headRX: 0.1,
  headRZ: 0.15,
  flHip: 0.25,
  flKnee: -0.5,
  frHip: 0.85,
  frKnee: -0.2,
  blHip: 0.4,
  blKnee: -0.9,
  brHip: 0.9,
  brKnee: -0.4,
  tailCurl: 0.12,
  tailSway: 0.15,
});

const sleepPose = (): Pose => ({
  ...lieSidePose(),
  headRX: 0.28,
  neckRX: 0.22,
  squint: 1,
  tailCurl: 0.25,
});

const wakePose = (u: number): Pose => ({
  ...lieSidePose(),
  squint: 1 - u * 1.2,
  headRX: lerp(0.28, -0.05, u),
  neckRX: lerp(0.22, 0.1, u),
});

const stretchPose = (u: number): Pose => {
  const k = Math.sin(u * Math.PI);
  return {
    bodyY: 0.32 - k * 0.08,
    bodyPitch: 0.18 * k,
    spineRX: 0.3 * k,
    neckRX: 0.55 * k,
    headRX: 0.15 * k,
    flHip: -0.15 - 0.45 * k,
    flKnee: -0.05,
    frHip: -0.15 - 0.45 * k,
    frKnee: -0.05,
    blHip: 0.35 + 0.35 * k,
    blKnee: 0.4,
    brHip: 0.35 + 0.35 * k,
    brKnee: 0.4,
    tailCurl: 0.15 + 0.55 * k,
  };
};

const yawnPose = (u: number): Pose => {
  const env = Math.sin(clamp(u, 0, 1) * Math.PI);
  return {
    ...sitPose(0),
    jawRX: env * 0.62,
    squint: env * 0.8,
    headRX: -0.28 * env,
    earLRX: 0.3 * env,
    earRRX: 0.3 * env,
    tailCurl: 0.5,
  };
};

const groomPose = (u: number, t: number): Pose => {
  const env = Math.sin(clamp(u, 0, 1) * Math.PI * 0.9 + 0.2);
  return {
    ...sitPose(t),
    neckRX: 0.35 + env * 0.5,
    headRX: 0.45 * env,
    headRZ: 0.12 * env,
    spineRX: -0.15,
    flHip: 0.12 - 0.75 * env,
    flKnee: 0.9 * env,
    jawRX: 0.12 + Math.abs(Math.sin(t * 9)) * 0.1,
    squint: 0.3 * env,
    tailCurl: 0.55,
  };
};

const kneadPose = (t: number): Pose => ({
  ...sitPose(t),
  bodyY: 0.27,
  flHip: -0.15 + Math.sin(t * 3.2) * 0.3,
  frHip: -0.15 + Math.sin(t * 3.2 + Math.PI) * 0.3,
  flKnee: 0.35 + Math.sin(t * 3.2) * 0.25,
  frKnee: 0.35 + Math.sin(t * 3.2 + Math.PI) * 0.25,
  squint: 0.75,
  neckRX: 0.35,
  headRX: -0.15,
  tailCurl: 0.65,
});

const pouncePose = (u: number): Pose => {
  const crouch = u < 0.35 ? u / 0.35 : 1;
  const leap = u >= 0.35 ? (u - 0.35) / 0.65 : 0;
  return {
    bodyY: 0.36 - 0.14 * crouch + 0.17 * leap,
    flHip: 0.08 + (leap > 0 ? -1.3 * easeOutBack(Math.min(1, leap * 1.6)) : 0),
    frHip: 0.08 + (leap > 0 ? -1.3 * easeOutBack(Math.min(1, leap * 1.6)) : 0),
    flKnee: -0.12 - 0.3 * leap,
    frKnee: -0.12 - 0.3 * leap,
    blHip: 0.1 + 0.35 * crouch - 0.5 * leap,
    brHip: 0.1 + 0.35 * crouch - 0.5 * leap,
    blKnee: 0.16 + 0.3 * crouch,
    brKnee: 0.16 + 0.3 * crouch,
    tailCurl: 0.2,
    earFlat: 0.25 * crouch,
  };
};

const zoomiesPose = (t: number): Pose => ({
  bodyY: 0.34,
  bodyPitch: 0.1,
  flHip: Math.sin(t * 16) * 0.5,
  frHip: Math.sin(t * 16 + Math.PI) * 0.5,
  flKnee: -0.2 + Math.sin(t * 16) * 0.35,
  frKnee: -0.2 + Math.sin(t * 16 + Math.PI) * 0.35,
  blHip: Math.sin(t * 16 + Math.PI) * 0.45,
  brHip: Math.sin(t * 16) * 0.45,
  blKnee: 0.2 + Math.sin(t * 16 + Math.PI) * 0.4,
  brKnee: 0.2 + Math.sin(t * 16) * 0.4,
  tailCurl: 0.1,
  earFlat: 0.45,
  headRX: -0.05,
});

function computeStatePose(state: CatStateId, u: number, t: number): Pose {
  switch (state) {
    case 'idle-stand':
      return standPose(t);
    case 'idle-sit':
      return sitPose(t);
    case 'loaf':
      return loafPose(t);
    case 'lie-side':
      return lieSidePose();
    case 'sleep':
      return sleepPose();
    case 'wake':
      return wakePose(u);
    case 'stretch':
      return stretchPose(u);
    case 'yawn':
      return yawnPose(u);
    case 'groom':
      return groomPose(u, t);
    case 'knead':
      return kneadPose(t);
    case 'pounce':
      return pouncePose(u);
    case 'zoomies':
      return zoomiesPose(t);
    case 'walk': {
      const p = runtime.walkPhase;
      return {
        bodyY: 0.35 + Math.sin(p * 2) * 0.015,
        bodyPitch: 0.04,
        flHip: Math.sin(p) * 0.38,
        frHip: Math.sin(p + Math.PI) * 0.38,
        flKnee: -0.1 + Math.sin(p + 0.6) * 0.2,
        frKnee: -0.1 + Math.sin(p + Math.PI + 0.6) * 0.2,
        blHip: Math.sin(p + Math.PI) * 0.32,
        brHip: Math.sin(p) * 0.32,
        blKnee: 0.15 + Math.sin(p + Math.PI + 0.5) * 0.2,
        brKnee: 0.15 + Math.sin(p + 0.5) * 0.2,
        tailCurl: 0.3,
        tailSway: -0.2,
        headRX: 0.03,
      };
    }
    case 'turn': {
      return {
        ...standPose(t),
        headRY: 0.45,
        tailCurl: 0.35,
      };
    }
    default:
      return standPose(t);
  }
}

// ---------------------------------------------------------------- behaviour

function pickBehaviour(): CatStateId {
  const e = runtime.energy;
  const a = runtime.affection;
  const sleepy = e < 30;
  const playful = e > 65 && a > 45;
  const entries: Array<{ id: CatStateId; weight: number }> = [
    { id: 'groom', weight: 1 },
    { id: 'stretch', weight: 0.9 },
    { id: 'yawn', weight: sleepy ? 2 : 0.5 },
    { id: 'walk', weight: 1.2 },
    { id: 'turn', weight: 0.5 },
    { id: 'idle-sit', weight: 1 },
    { id: 'lie-side', weight: sleepy ? 2.2 : 0.6 },
    { id: 'idle-stand', weight: 0.7 },
    { id: 'zoomies', weight: playful ? 0.7 : 0 },
    { id: 'pounce', weight: playful ? 0.5 : 0 },
    { id: 'knead', weight: a > 65 ? 0.5 : 0 },
  ];
  const filtered = entries.filter((en) => {
    const cd = runtime.actionCooldowns[en.id];
    return cd === undefined || runtime.t >= cd;
  });
  return pickWeighted(filtered.length > 0 ? filtered : entries, runtime.lastAction ?? undefined);
}

// ---------------------------------------------------------------- hook

export function useCatAnimation(): void {
  const pointer = useRef({ x: 0, y: 0 });
  const mirrorAcc = useRef(0);
  const earTimerL = useRef(rand(2, 6));
  const earTimerR = useRef(rand(3, 8));
  const slowBlinkTimer = useRef(rand(10, 18));
  const bellCooldown = useRef(0);
  const prevHeadRot = useRef({ x: 0, y: 0 });
  const chatterT = useRef(-1);

  // track pointer for head look-at
  useEffect(() => {
    const onMove = (e: PointerEvent): void => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  useFrame((state, rawDt) => {
    const rig = runtime.rig;
    if (!rig) return;
    const dt = Math.min(rawDt, 0.05);
    const settings = useSettings.getState();
    const live = useCatLive.getState();

    // ---- clocks ----
    runtime.wall += dt;
    runtime.fps = lerp(runtime.fps, 1 / Math.max(rawDt, 1e-4), 0.05);
    runtime.paused = settings.paused;
    runtime.speed = settings.speed;
    if (!runtime.paused) runtime.t += dt * runtime.speed;
    const t = runtime.t;

    // ---- needs ----
    runtime.affection = clamp(runtime.affection - 0.08 * dt, 0, 100);
    if (runtime.state === 'sleep') runtime.energy = clamp(runtime.energy + 2.2 * dt, 0, 100);
    else if (runtime.state === 'walk' || runtime.state === 'zoomies') runtime.energy = clamp(runtime.energy - 1.1 * dt, 0, 100);
    else runtime.energy = clamp(runtime.energy - 0.12 * dt, 0, 100);

    // ---- commands ----
    if (runtime.command) {
      const action = runtime.command.action;
      runtime.command = null;
      switch (action) {
        case 'sit': requestState('idle-sit'); break;
        case 'stand': requestState('idle-stand'); break;
        case 'lie': requestState('lie-side'); break;
        case 'sleep': requestState('sleep'); break;
        case 'wake': requestState('idle-stand'); break;
        case 'stretch': requestState('stretch'); break;
        case 'yawn': requestState('yawn'); break;
        case 'groom': requestState('groom'); break;
        case 'knead': requestState('knead'); break;
        case 'pounce':
        case 'happyjump':
          requestState('pounce');
          break;
        case 'walk': {
          requestState('walk');
          const settingsNow = useSettings.getState();
          runtime.walkTarget = {
            x: clamp(settingsNow.position.x + rand(-0.7, 0.7), -2.2, 2.2),
            z: clamp(settingsNow.position.z + rand(-0.7, 0.7), -2.2, 2.2),
          };
          break;
        }
        case 'turn': requestState('turn'); break;
        case 'play':
          requestState('pounce');
          catAudio.chirp();
          break;
        case 'meow':
          catAudio.meow('normal');
          chatterT.current = t + 0.5;
          break;
        case 'chirp': catAudio.chirp(); break;
        case 'purr':
          runtime.purrManual = !runtime.purrManual;
          if (runtime.purrManual) {
            catAudio.startPurr();
            catAudio.setPurrLevel(0.6);
          } else catAudio.stopPurr();
          break;
        case 'pet':
          runtime.reaction = { id: 'head-stroke', t0: t, dur: 2.0, hold: false };
          runtime.purrTarget = 0.55; // visible purr (hearts + squint) for the button too
          catAudio.startPurr();
          catAudio.setPurrLevel(0.55);
          break;
        case 'return-idle':
          runtime.queue = [];
          requestState('idle-sit');
          break;
        default: break;
      }
    }

    // ---- petting chain (spec: long petting → knead → lie → loaf → sleep) ----
    if (runtime.petChain > 20 && !LYING.includes(runtime.state) && runtime.state !== 'knead') {
      runtime.queue = ['knead', 'lie-side', 'loaf', 'sleep'];
      runtime.petChain = -60; // don't retrigger for a while
    }

    // ---- state machine ----
    const stateAge = t - runtime.stateT0;
    const isLying = LYING.includes(runtime.state);

    // energy auto-sleep
    if (runtime.energy < 12 && !isLying && runtime.state !== 'sleep') {
      requestState('sleep');
    }
    // wake up when fully rested
    if (runtime.state === 'sleep' && runtime.energy > 88) {
      requestState('idle-stand');
    }

    // queue processing
    if (runtime.queue.length > 0 && stateAge > Math.min(runtime.stateDur, 0.45)) {
      const next = runtime.queue[0];
      const allowed = TRANSITIONS[runtime.state] ?? [];
      if (allowed.includes(next) || next === runtime.state) {
        runtime.queue.shift();
        if (next !== runtime.state) setState(next);
      } else if (stateAge > runtime.stateDur) {
        // force through neutral
        setState('idle-stand');
      }
    }

    // auto-exit
    if (stateAge > runtime.stateDur) {
      const after = AFTER_STATE[runtime.state];
      if (runtime.state === 'walk' && !runtime.walkTarget) {
        setState(after ?? 'idle-sit');
      } else if (runtime.state !== 'walk') {
        if (after) setState(after);
        else if (runtime.state === 'idle-stand' || runtime.state === 'idle-sit' || runtime.state === 'loaf' || runtime.state === 'lie-side' || runtime.state === 'sleep') {
          // lying / idle states persist until director or events change them
          runtime.stateDur = t + 30;
        }
      }
    }

    // behaviour director
    const canDecide = settings.autoIdle && !settings.reducedMotion;
    if (canDecide && !isLying && runtime.state !== 'sleep' && t > runtime.nextDecision) {
      runtime.nextDecision = t + rand(4, 12);
      const action = pickBehaviour();
      runtime.lastAction = action;
      if (action === 'walk') {
        const sp = useSettings.getState();
        runtime.walkTarget = {
          x: clamp(sp.position.x + rand(-0.6, 0.6), -2.2, 2.2),
          z: clamp(sp.position.z + rand(-0.6, 0.6), -2.2, 2.2),
        };
      }
      if (Math.random() < 0.06) {
        chatterT.current = t + 1.4; // rare bird-chatter quirk
      }
      requestState(action);
    }

    // ---- locomotion ----
    const anchor = settings.position;
    let hopTarget = 0;
    if (runtime.state === 'walk' || runtime.state === 'turn') {
      let tx: number | null = null;
      let tz: number | null = null;
      if (runtime.state === 'walk' && runtime.walkTarget) {
        tx = runtime.walkTarget.x - anchor.x;
        tz = runtime.walkTarget.z - anchor.z;
      } else if (runtime.state === 'turn') {
        tx = Math.sin(runtime.turnDir ?? 1);
        tz = Math.cos(runtime.turnDir ?? 1);
      }
      if (tx !== null && tz !== null) {
        const dist = Math.hypot(tx, tz);
        if (runtime.state === 'walk' && dist < 0.1) {
          runtime.walkTarget = null;
        } else {
          const dirX = tx / (dist || 1);
          const dirZ = tz / (dist || 1);
          const targetYaw = Math.atan2(dirX, dirZ);
          let dy = targetYaw - runtime.yaw;
          while (dy > Math.PI) dy -= Math.PI * 2;
          while (dy < -Math.PI) dy += Math.PI * 2;
          runtime.yaw += dy * Math.min(1, 4.5 * dt);
          const speed = runtime.state === 'walk' ? 0.34 : 0;
          runtime.posX += Math.sin(runtime.yaw) * speed * dt;
          runtime.posZ += Math.cos(runtime.yaw) * speed * dt;
          if (runtime.state === 'walk') runtime.walkPhase += dt * 7.5 * (0.5 + (runtime.speed ?? 1) * 0.5);
          if (runtime.state === 'turn' && Math.abs(dy) < 0.2) runtime.turnDir = undefined;
        }
      }
    }
    if (runtime.state === 'zoomies') {
      runtime.yaw += 1.7 * dt;
      runtime.posX += Math.sin(runtime.yaw) * 0.55 * dt;
      runtime.posZ += Math.cos(runtime.yaw) * 0.55 * dt;
      runtime.walkPhase += dt * 15;
      // stay near anchor
      const dx = runtime.posX;
      const dz = runtime.posZ;
      const d = Math.hypot(dx, dz);
      if (d > 0.85) {
        runtime.posX = (dx / d) * 0.85;
        runtime.posZ = (dz / d) * 0.85;
      }
    }
    if (runtime.state === 'pounce') {
      const u = clamp(stateAge / runtime.stateDur, 0, 1);
      if (u > 0.35 && u < 0.75) hopTarget = Math.sin((u - 0.35) / 0.4 * Math.PI) * 0.22;
      runtime.posX += Math.sin(runtime.yaw) * 0.22 * dt * (u > 0.35 && u < 0.8 ? 1 : 0);
      runtime.posZ += Math.cos(runtime.yaw) * 0.22 * dt * (u > 0.35 && u < 0.8 ? 1 : 0);
    }
    runtime.hopY = damp(runtime.hopY, hopTarget, 14, dt);
    runtime.posX = clamp(runtime.posX, -1.4, 1.4);
    runtime.posZ = clamp(runtime.posZ, -1.4, 1.4);

    // ---- compute pose targets ----
    const u = runtime.stateDur > 0 ? clamp(stateAge / runtime.stateDur, 0, 1.2) : 0;
    const statePose = computeStatePose(runtime.state, u, t);
    const pose = runtime.pose;
    const LAMBDA = 9;
    for (const [k, v] of Object.entries(statePose)) {
      if (v !== undefined) pose[k] = damp(pose[k] ?? 0, v, LAMBDA, dt);
    }

    // ---- additive layers ----

    // breathing
    const breathRate = runtime.state === 'sleep' ? 0.45 : 0.9;
    const breathAmp = runtime.state === 'sleep' ? 1.4 : 1;
    runtime.breath = Math.sin(t * breathRate * Math.PI) * 0.5 + 0.5;

    // blinking
    runtime.blinkTimer -= dt;
    if (runtime.blinkTimer <= 0) {
      const roll = Math.random();
      runtime.blinkKind = roll < 0.06 ? 'double' : roll < 0.22 ? 'slow' : 'normal';
      runtime.blinkDur = runtime.blinkKind === 'slow' ? 0.55 : runtime.blinkKind === 'double' ? 0.4 : 0.16;
      runtime.blinkTimer = rand(2, 6);
      runtime.blinkT0 = t;
    }
    void runtime.blinkT0;
    let blinkTarget = 0;
    const bt = runtime.blinkT0 ?? t;
    const blinkAge = t - bt;
    if (blinkAge < runtime.blinkDur) {
      const bp = blinkAge / runtime.blinkDur;
      if (runtime.blinkKind === 'double') {
        blinkTarget = bp < 0.5 ? Math.sin(bp * 2 * Math.PI) : Math.sin((bp - 0.5) * 2 * Math.PI);
      } else if (runtime.blinkKind === 'slow') {
        blinkTarget = Math.sin(bp * Math.PI);
      } else {
        blinkTarget = Math.sin(bp * Math.PI);
      }
    }
    // slow blink at the user when relaxed
    if (runtime.affection > 70) {
      slowBlinkTimer.current -= dt;
      if (slowBlinkTimer.current <= 0) {
        slowBlinkTimer.current = rand(12, 20);
        runtime.blinkKind = 'slow';
        runtime.blinkDur = 0.7;
        runtime.blinkT0 = t;
      }
    }
    runtime.blink = damp(runtime.blink, clamp(blinkTarget, 0, 1), 22, dt);

    // pupil dilation
    let pupilTarget = 0.8;
    if (t < runtime.startleT) pupilTarget = 1.35;
    else if (isLying) pupilTarget = 0.7;
    else if (runtime.echoState === 'Listening') pupilTarget = 1.15;
    runtime.pupil = damp(runtime.pupil, pupilTarget, 4, dt);

    // ear twitches
    earTimerL.current -= dt;
    earTimerR.current -= dt;
    if (earTimerL.current <= 0) {
      earTimerL.current = rand(2.5, 7);
      runtime.earTwitchL = 1;
    }
    if (earTimerR.current <= 0) {
      earTimerR.current = rand(3, 8);
      runtime.earTwitchR = 1;
    }
    runtime.earTwitchL = damp(runtime.earTwitchL, 0, 18, dt);
    runtime.earTwitchR = damp(runtime.earTwitchR, 0, 18, dt);

    // whisker springs (critically damped)
    const ws = -60 * runtime.whiskerSpringL - 12 * runtime.whiskerSpringV;
    runtime.whiskerSpringV += ws * dt;
    runtime.whiskerSpringL += runtime.whiskerSpringV * dt;

    // reaction layer ------------------------------------------------
    let rx = 0;
    let earFlatAdd = 0;
    let squintAdd = 0;
    let jawAdd = 0;
    let headTiltAdd = 0;
    let tailLash = clamp(runtime.tailLashBoost, 0, 1);
    runtime.tailLashBoost = damp(runtime.tailLashBoost, 0, 1.2, dt);
    if (t > runtime.annoyedT) runtime.annoyedT = -1;

    const reaction = runtime.reaction;
    if (reaction) {
      const age = t - reaction.t0;
      const done = !reaction.hold && age > reaction.dur;
      if (done || (reaction.hold && runtime.pettingSince === null)) {
        runtime.reaction = null;
        catAudio.stopPurr();
      } else {
        let env = 1;
        if (!reaction.hold) {
          const p = age / reaction.dur;
          env = Math.min(1, p * 5) * (1 - Math.max(0, (p - 0.65) / 0.35));
        }
        switch (reaction.id) {
          case 'head-stroke':
            squintAdd = 0.6 * env;
            rx = -0.12 * env;
            earFlatAdd = 0.12;
            break;
          case 'back-stroke':
            pose.spineRX = damp(pose.spineRX, (pose.spineRX ?? 0) - 0.24 * env, 8, dt);
            pose.tailCurl = damp(pose.tailCurl, 0.85, 6, dt);
            squintAdd = 0.25 * env;
            break;
          case 'cheek-rub':
            squintAdd = 0.9 * env;
            headTiltAdd = 0.3 * env * Math.sin(age * 9);
            rx = -0.1 * env;
            break;
          case 'chin-scratch':
            rx = -0.3 * env;
            pose.neckRX = damp(pose.neckRX, (pose.neckRX ?? 0) - 0.18 * env, 8, dt);
            squintAdd = 0.65 * env;
            break;
          case 'ear-tap':
            runtime.earTwitchL = Math.max(runtime.earTwitchL, env);
            runtime.earTwitchR = Math.max(runtime.earTwitchR, env * 0.7);
            break;
          case 'belly-tap':
            pose.bodyRZ = damp(pose.bodyRZ, Math.sin(age * 5) * 0.5 * env, 8, dt);
            squintAdd = 0.4 * env;
            runtime.whiskerSpringV += 2 * dt;
            break;
          case 'paw-tap':
            pose.flHip = damp(pose.flHip, (pose.flHip ?? 0) + 0.5 * env, 10, dt);
            pose.frHip = damp(pose.frHip, (pose.frHip ?? 0) + 0.5 * env, 10, dt);
            break;
          case 'tail-tap':
            tailLash = Math.max(tailLash, env);
            earFlatAdd = 0.3 * env;
            break;
          case 'nose-tap':
            runtime.blink = Math.max(runtime.blink, env);
            headTiltAdd = 0.18 * env * Math.sin(age * 22) * Math.exp(-age * 3);
            break;
          case 'whisker-touch':
            runtime.whiskerSpringV += 3 * dt * 8;
            break;
          case 'double-tap':
            hopTarget = 0.18 * easeOutBack(env);
            pose.flHip = damp(pose.flHip, (pose.flHip ?? 0) - 0.6 * env, 10, dt);
            pose.frHip = damp(pose.frHip, (pose.frHip ?? 0) - 0.6 * env, 10, dt);
            earFlatAdd = -0.15 * env;
            break;
          case 'poke-spam':
            earFlatAdd = 0.8;
            tailLash = 1;
            if (!runtime.walkTarget) {
              runtime.walkTarget = {
                x: anchor.x + rand(-0.8, 0.8),
                z: anchor.z + rand(-0.8, 0.8),
              };
              requestState('walk');
            }
            break;
          case 'startle':
            earFlatAdd = 0.9;
            squintAdd = -0.5 * env;
            hopTarget = 0.1 * env;
            break;
          default:
            break;
        }
      }
    }
    runtime.hopY = damp(runtime.hopY, hopTarget, 14, dt);

    // echo (listen / speak) layer — outranks touch, below startle ------------
    let echoSquint = 0;
    if (runtime.echoState === 'Listening') {
      pose.headRZ = damp(pose.headRZ ?? 0, 0.16, 6, dt);
      earFlatAdd = -0.35;
      echoSquint = -0.25;
      pose.whiskerLPerk = damp(pose.whiskerLPerk ?? 0, 1, 5, dt);
      pose.whiskerRPerk = damp(pose.whiskerRPerk ?? 0, 1, 5, dt);
    } else if (runtime.echoState === 'Speaking' || runtime.echoState === 'Recover') {
      const jawIn = Math.max(runtime.jawAudio, runtime.ttsJaw);
      jawAdd = jawIn * 0.42;
      if (jawIn > 0.55 && (runtime.lastJawPeak ?? -1) < t - 0.35) {
        runtime.lastJawPeak = t;
        runtime.earTwitchL = 0.8;
        pose.headRX = damp(pose.headRX ?? 0, (pose.headRX ?? 0) - 0.06, 10, dt);
      }
      squintAdd = Math.max(squintAdd, 0.15);
    }
    runtime.ttsJaw = damp(runtime.ttsJaw, 0, 6, dt);

    // chatter quirk (jaw tremble, ears perked)
    let chatter = 0;
    if (t < chatterT.current) {
      chatter = Math.abs(Math.sin(t * 26)) * 0.12;
      earFlatAdd -= 0.3;
    }

    // head look-at pointer
    const sleepy = isLying || runtime.state === 'sleep';
    if (settings.lookAtPointer && !sleepy && runtime.echoState === 'EchoOff' || runtime.echoState === 'EchoIdle') {
      const tx = clamp(pointer.current.x, -1, 1);
      const ty = clamp(pointer.current.y, -1, 1);
      pose.headRY = damp(pose.headRY ?? 0, tx * 0.45, 4, dt);
      pose.headRX = damp(pose.headRX ?? 0, (pose.headRX ?? 0) * 0.9 - ty * 0.18, 4, dt);
      pose.eyeLRY = damp(pose.eyeLRY ?? 0, tx * 0.3, 8, dt);
      pose.eyeRRY = damp(pose.eyeRRY ?? 0, tx * 0.3, 8, dt);
    }

    // purr level follows stroke speed
    runtime.purrLevel = damp(runtime.purrLevel, runtime.purrTarget, 5, dt);
    if (runtime.purrTarget > 0 || runtime.purrLevel > 0.02) {
      catAudio.setPurrLevel(runtime.purrLevel, runtime.purrTarget);
    }
    if (!runtime.reaction?.hold && runtime.pettingSince === null && !runtime.purrManual) {
      runtime.purrTarget = damp(runtime.purrTarget, 0, 3, dt);
      if (runtime.purrTarget < 0.03) runtime.purrTarget = 0;
    }

    // collar bell on head movement
    if (settings.accessory === 'collar' && t > bellCooldown.current) {
      const dHead =
        Math.abs(rig.head.rotation.x - prevHeadRot.current.x) + Math.abs(rig.head.rotation.y - prevHeadRot.current.y);
      if (dHead > 0.09) {
        catAudio.bell(0.8);
        bellCooldown.current = t + 0.5;
      }
    }
    prevHeadRot.current.x = rig.head.rotation.x;
    prevHeadRot.current.y = rig.head.rotation.y;

    // ---- apply to rig ----
    const P = pose;
    rig.root.position.set(anchor.x + runtime.posX, anchor.y + runtime.hopY, anchor.z + runtime.posZ);
    rig.root.rotation.y = runtime.yaw + (anchor.rotY * Math.PI) / 180;
    rig.hips.position.y = (P.bodyY ?? 0.36) + runtime.breath * 0.012 * (runtime.state === 'sleep' ? 1.6 : 1);
    rig.hips.rotation.x = P.bodyPitch ?? 0;
    rig.hips.rotation.z = P.bodyRZ ?? 0;
    rig.spine2.rotation.x = P.spineRX ?? 0;
    rig.spine2.rotation.y = P.spineRY ?? 0;
    rig.chest.rotation.x = P.chestRX ?? 0;
    rig.neck.rotation.x = P.neckRX ?? 0;
    rig.neck.rotation.y = P.neckRY ?? 0;
    rig.head.rotation.x = (P.headRX ?? 0) + rx;
    rig.head.rotation.y = P.headRY ?? 0;
    rig.head.rotation.z = (P.headRZ ?? 0) + headTiltAdd;

    // jaw
    rig.jaw.rotation.x = clamp((P.jawRX ?? 0) + jawAdd + chatter, 0, 0.7);

    // ears (flat: positive back/sideways, negative forward/perked)
    const earFlat = clamp((P.earFlat ?? 0) + earFlatAdd, -0.5, 1);
    rig.earL.rotation.x = (P.earLRX ?? 0) + runtime.earTwitchL * 0.35 + earFlat * 0.85;
    rig.earL.rotation.y = (P.earLRY ?? 0) + earFlat * 0.45;
    rig.earL.rotation.z = 0.3 + earFlat * 0.38;
    rig.earR.rotation.x = (P.earRRX ?? 0) + runtime.earTwitchR * 0.35 + earFlat * 0.85;
    rig.earR.rotation.y = (P.earRRY ?? 0) - earFlat * 0.45;
    rig.earR.rotation.z = -0.3 - earFlat * 0.38;

    // eyes: look + lids + pupils
    const lidCoverage = clamp(
      runtime.blink + Math.max(0, (P.squint ?? 0) + squintAdd + echoSquint) * 0.5 + (runtime.state === 'sleep' ? 1 : 0) + (runtime.energy < 22 && !isLying ? 0.25 : 0),
      0,
      1
    );
    rig.eyeL.rotation.y = P.eyeLRY ?? 0;
    rig.eyeR.rotation.y = P.eyeRRY ?? 0;
    rig.lidUL.rotation.x = -1.05 + lidCoverage * 2.55;
    rig.lidUR.rotation.x = -1.05 + lidCoverage * 2.55;
    rig.lidLL.rotation.x = 0.28 - lidCoverage * 1.6;
    rig.lidLR.rotation.x = 0.28 - lidCoverage * 1.6;
    const psx = 0.3 + 0.34 * runtime.pupil;
    const psy = 0.85 + 0.1 * runtime.pupil;
    rig.pupilL.scale.set(psx, psy, 1.03);
    rig.pupilR.scale.set(psx, psy, 1.03);

    // whiskers
    const perkL = (P.whiskerLPerk ?? 0);
    const perkR = (P.whiskerRPerk ?? 0);
    const scared = t < runtime.startleT || t < runtime.annoyedT ? -0.35 : 0;
    rig.whiskerL.rotation.y = 0.32 + perkL * 0.22 + scared;
    rig.whiskerL.rotation.z = 0.12 + runtime.whiskerSpringL * 0.18 + perkL * 0.1;
    rig.whiskerR.rotation.y = -0.32 - perkR * 0.22 - scared;
    rig.whiskerR.rotation.z = -0.12 - runtime.whiskerSpringL * 0.18 - perkR * 0.1;

    // legs
    rig.legFL.rotation.x = P.flHip ?? 0;
    rig.legFR.rotation.x = P.frHip ?? 0;
    rig.legBL.rotation.x = P.blHip ?? 0;
    rig.legBR.rotation.x = P.brHip ?? 0;
    rig.kneeFL.rotation.x = P.flKnee ?? 0;
    rig.kneeFR.rotation.x = P.frKnee ?? 0;
    rig.kneeBL.rotation.x = P.blKnee ?? 0;
    rig.kneeBR.rotation.x = P.brKnee ?? 0;
    rig.pawFL.rotation.x = P.flPaw ?? 0;
    rig.pawFR.rotation.x = P.frPaw ?? 0;
    rig.pawBL.rotation.x = P.blPaw ?? 0;
    rig.pawBR.rotation.x = P.brPaw ?? 0;

    // chest breathing scale
    const chestScale = 1 + runtime.breath * 0.025 * breathAmp;
    rig.chest.scale.set(chestScale, 1, chestScale);

    // tail
    const curl = P.tailCurl ?? 0.4;
    const swayBase = (P.tailSway ?? 0) + Math.sin(t * 1.3) * 0.08;
    const lash = tailLash * Math.sin(t * 11) * 0.38;
    for (let i = 0; i < rig.tail.length; i++) {
      const seg = rig.tail[i];
      const frac = i / Math.max(1, rig.tail.length - 1);
      seg.rotation.x = 0.08 + curl * 0.19 + curl * 0.3 * frac * frac;
      seg.rotation.y = swayBase * (0.4 + frac) + lash * (0.3 + frac);
    }

    // head world position + screen projection for HTML overlays
    if (runtime.headWorldPos) {
      rig.head.getWorldPosition(TMP);
      runtime.headWorldPos.current.x = TMP.x;
      runtime.headWorldPos.current.y = TMP.y;
      runtime.headWorldPos.current.z = TMP.z;
      TMP.project(state.camera);
      runtime.screenPos.x = (TMP.x * 0.5 + 0.5) * 100;
      runtime.screenPos.y = (-TMP.y * 0.5 + 0.5) * 100;
    }

    // ---- mirror low-frequency state to zustand (4 Hz) ----
    mirrorAcc.current += dt;
    if (mirrorAcc.current > 0.25) {
      mirrorAcc.current = 0;
      const mood: Mood = deriveMood();
      if (
        live.mood !== mood ||
        Math.abs(live.affection - runtime.affection) > 1.5 ||
        Math.abs(live.energy - runtime.energy) > 1.5 ||
        live.baseState !== runtime.state ||
        Math.abs(live.fps - runtime.fps) > 3
      ) {
        useCatLive.getState().setLive({
          mood,
          affection: runtime.affection,
          energy: runtime.energy,
          baseState: runtime.state,
          reaction: runtime.reaction?.id ?? null,
          fps: runtime.fps,
        });
      }
    }
  });
}

const TMP = new THREE.Vector3();

function deriveMood(): Mood {
  const t = runtime.t;
  if (t < runtime.startleT) return 'startled';
  if (t < runtime.annoyedT) return 'annoyed';
  if (runtime.energy < 25) return 'sleepy';
  if (runtime.affection > 75) return 'happy';
  if (runtime.energy > 65 && runtime.affection > 45) return 'playful';
  if (runtime.affection < 25) return 'annoyed';
  return 'calm';
}
