'use client';

// Cat2D — Canvas-2D fallback renderer used when WebGL is unavailable or the
// 3D scene crashes (sandboxed previews, blocked GPUs, software rendering).
// It shares the SAME runtime singleton, state machine, touch-reaction
// system, audio engine, settings and live stores as the 3D mode — only the
// renderer differs. Every feature still works here:
//   · procedural cat (body, ears, blinking eyes, 9-segment tail, whiskers,
//     coat presets + patterns, accessories)
//   · 20+ touch regions with the full reaction set + petting chain
//   · Talking Echo Mode (mic → cat-voice playback + subtitles, via the
//     VoiceManager overlay which is renderer independent)

import { useEffect, useRef } from 'react';
import { runtime, type CatStateId, type ReactionId } from './core/runtime';
import {
  pointerDown,
  pointerMove,
  pointerUp,
  initGestureCleanup,
  REACTIONS,
} from './core/interactions';
import { TRANSITIONS, STATE_DUR, AFTER_STATE, LYING } from './core/stateMachine';
import { catAudio } from './audio/sounds';
import { useSettings, type EnvironmentId } from '@/store/settingsStore';
import { useCatLive, type Mood } from '@/store/catStateStore';
import { useCameraStore } from './core/cameraBus';
import { clamp, damp, lerp, rand, pickWeighted } from './core/utils';

// ============================================================ 2D environment art

interface Env2D {
  skyTop: string;
  skyBottom: string;
  ground: string;
  groundDark: string;
  decor: 'sun' | 'moon' | 'lamp' | 'window' | 'trees' | 'palms' | 'none';
  stars?: boolean;
}

const ENV_2D: Record<EnvironmentId, Env2D> = {
  garden: { skyTop: '#aee3f5', skyBottom: '#eaf7d9', ground: '#8fc95e', groundDark: '#6fae43', decor: 'sun' },
  livingroom: { skyTop: '#e9dccb', skyBottom: '#d9c6ae', ground: '#b98a5d', groundDark: '#9c7149', decor: 'window' },
  studio: { skyTop: '#e8e8ea', skyBottom: '#d3d3d6', ground: '#c4c4c8', groundDark: '#a8a8ae', decor: 'lamp' },
  bedroom: { skyTop: '#d8cfe8', skyBottom: '#c4b6da', ground: '#a98bb0', groundDark: '#8f7096', decor: 'lamp' },
  forest: { skyTop: '#b9d4c2', skyBottom: '#ddead8', ground: '#6d9b5e', groundDark: '#527a45', decor: 'trees' },
  beach: { skyTop: '#9edcf2', skyBottom: '#ffedc9', ground: '#f2dfae', groundDark: '#dcc68d', decor: 'palms' },
  nightsky: { skyTop: '#101a33', skyBottom: '#27335c', ground: '#1c2440', groundDark: '#141b31', decor: 'moon', stars: true },
};

// Camera preset → 2D view approximation (zoom + vertical shift + facing).
const CAM_2D: Record<string, { zoom: number; dy: number; face: 'auto' | 'side' | 'back' }> = {
  front: { zoom: 1.12, dy: 0, face: 'auto' },
  side: { zoom: 1.0, dy: 0, face: 'side' },
  back: { zoom: 1.0, dy: 0, face: 'back' },
  top: { zoom: 0.86, dy: 0.02, face: 'auto' },
  face: { zoom: 1.5, dy: -0.04, face: 'auto' },
  reset: { zoom: 1, dy: 0, face: 'auto' },
};

// ============================================================ driver (state machine)

/** Module scratch for the 2D animation loop. */
const st2 = {
  earTL: rand(2, 6),
  earTR: rand(3, 8),
  slowBlink: rand(10, 18),
  mirrorAcc: 0,
  zoomPhase: 0,
  camZoom: 1,
  camDy: 0,
  camFace: 'auto' as 'auto' | 'side' | 'back',
  gyLift: 0, // damped ground-line lift when the mobile sheet covers the cat
};

/** Visually damped channels the renderer reads (per frame). */
export const viz = {
  breath: 0,
  squint: 0,
  earFlat: 0,
  headTilt: 0,
  headNod: 0,
  headBump: 0, // cheek-rub bump
  jaw: 0,
  tailLash: 0,
  whiskerTwitch: 0,
  roll: 0, // full-body roll (belly-tap)
  hopKick: 0, // double-tap / startle hop
  arch: 0, // back-stroke arch
  pawL: 0, // front-left paw lift 0..1 (knead / groom / paw-tap)
  pawR: 0,
  groomCycle: 0,
  camShake: 0,
};

function setState2D(next: CatStateId): void {
  if (runtime.state === next) return;
  runtime.prevState = runtime.state;
  runtime.state = next;
  runtime.stateT0 = runtime.t;
  runtime.stateDur = STATE_DUR[next]();
  runtime.actionCooldowns[next] = runtime.t + 18;
}

function requestState2D(desired: CatStateId): void {
  const current = runtime.state;
  if (current === desired) return;
  const allowed = TRANSITIONS[current] ?? ['idle-stand'];
  if (allowed.includes(desired)) {
    setState2D(desired);
    return;
  }
  if (current === 'sleep') {
    setState2D('wake');
    runtime.queue = ['stretch', 'idle-stand', desired];
    return;
  }
  setState2D('idle-stand');
  runtime.queue = [desired];
}

function pickBehaviour2D(): CatStateId {
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

function handleCommands(): void {
  if (!runtime.command) return;
  const action = runtime.command.action;
  runtime.command = null;
  switch (action) {
    case 'sit': requestState2D('idle-sit'); break;
    case 'stand': requestState2D('idle-stand'); break;
    case 'lie': requestState2D('lie-side'); break;
    case 'sleep': requestState2D('sleep'); break;
    case 'wake': requestState2D('idle-stand'); break;
    case 'stretch': requestState2D('stretch'); break;
    case 'yawn': requestState2D('yawn'); break;
    case 'groom': requestState2D('groom'); break;
    case 'knead': requestState2D('knead'); break;
    case 'pounce':
    case 'happyjump':
      requestState2D('pounce');
      break;
    case 'walk': {
      requestState2D('walk');
      runtime.walkTarget = { x: clamp(rand(-1.1, 1.1), -1.2, 1.2), z: 0 };
      break;
    }
    case 'turn': requestState2D('turn'); break;
    case 'play':
      requestState2D('pounce');
      catAudio.chirp();
      break;
    case 'meow':
      catAudio.meow('normal');
      viz.jaw = 0.8;
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
      runtime.reaction = { id: 'head-stroke', t0: runtime.t, dur: 2.0, hold: false };
      runtime.purrTarget = 0.55; // visible purr (hearts + squint) for the button too
      catAudio.startPurr();
      catAudio.setPurrLevel(0.55);
      break;
    case 'return-idle':
      runtime.queue = [];
      requestState2D('idle-sit');
      break;
    default: break;
  }
}

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

/**
 * The 2D twin of `useCatAnimation`'s frame body (without three.js).
 * Advances the shared runtime: clocks, needs, commands, state machine,
 * locomotion, blinking, pupils, ears, reactions, purr and store mirroring.
 */
export function step2D(rawDt: number): void {
  const dt = Math.min(rawDt, 0.05);
  const settings = useSettings.getState();

  runtime.wall += dt;
  runtime.fps = lerp(runtime.fps, 1 / Math.max(rawDt, 1e-4), 0.05);
  runtime.paused = settings.paused;
  runtime.speed = settings.speed;
  if (!runtime.paused) runtime.t += dt * runtime.speed;
  const t = runtime.t;
  const sdt = runtime.paused ? 0 : dt * runtime.speed;

  // camera preset damping + mobile sheet lift (keep the cat clear of the panel)
  const cam = useCameraStore.getState();
  const camTarget = CAM_2D[cam.preset] ?? CAM_2D.reset;
  st2.camZoom = damp(st2.camZoom, camTarget.zoom, 3.5, dt);
  st2.camDy = damp(st2.camDy, camTarget.dy, 3.5, dt);
  st2.camFace = camTarget.face;
  const portrait = typeof window !== 'undefined' && window.innerHeight > window.innerWidth;
  const liftTarget = portrait && settings.panelOpen ? 0.26 : 0;
  st2.gyLift = damp(st2.gyLift, liftTarget, 4, dt);

  // ---- needs ----
  runtime.affection = clamp(runtime.affection - 0.08 * sdt, 0, 100);
  if (runtime.state === 'sleep') runtime.energy = clamp(runtime.energy + 2.2 * sdt, 0, 100);
  else if (runtime.state === 'walk' || runtime.state === 'zoomies') runtime.energy = clamp(runtime.energy - 1.1 * sdt, 0, 100);
  else runtime.energy = clamp(runtime.energy - 0.12 * sdt, 0, 100);

  // ---- commands ----
  handleCommands();

  // ---- petting chain (long petting → knead → lie → loaf → sleep) ----
  if (runtime.petChain > 20 && !LYING.includes(runtime.state) && runtime.state !== 'knead') {
    runtime.queue = ['knead', 'lie-side', 'loaf', 'sleep'];
    runtime.petChain = -60;
  }

  // ---- state machine ----
  const stateAge = t - runtime.stateT0;
  const isLying = LYING.includes(runtime.state);

  if (runtime.energy < 12 && !isLying && runtime.state !== 'sleep') requestState2D('sleep');
  if (runtime.state === 'sleep' && runtime.energy > 88) requestState2D('idle-stand');

  if (runtime.queue.length > 0 && stateAge > Math.min(runtime.stateDur, 0.45)) {
    const next = runtime.queue[0];
    const allowed = TRANSITIONS[runtime.state] ?? [];
    if (allowed.includes(next) || next === runtime.state) {
      runtime.queue.shift();
      if (next !== runtime.state) setState2D(next);
    } else if (stateAge > runtime.stateDur) {
      setState2D('idle-stand');
    }
  }

  if (stateAge > runtime.stateDur) {
    const after = AFTER_STATE[runtime.state];
    if (runtime.state !== 'walk' || !runtime.walkTarget) {
      if (after) setState2D(after);
      else if (['idle-stand', 'idle-sit', 'loaf', 'lie-side', 'sleep'].includes(runtime.state)) {
        runtime.stateDur = t + 30; // idle states persist until events change them
      }
    }
  }

  // ---- behaviour director ----
  const canDecide = settings.autoIdle && !settings.reducedMotion;
  if (canDecide && !isLying && runtime.state !== 'sleep' && t > runtime.nextDecision) {
    runtime.nextDecision = t + rand(4, 12);
    const action = pickBehaviour2D();
    runtime.lastAction = action;
    if (action === 'walk') runtime.walkTarget = { x: clamp(rand(-1, 1), -1.1, 1.1), z: 0 };
    requestState2D(action);
  }

  // ---- locomotion (screen-space x only) ----
  if (runtime.state === 'walk' && runtime.walkTarget) {
    const target = runtime.walkTarget.x;
    const dx = target - runtime.posX;
    if (Math.abs(dx) < 0.06) {
      runtime.walkTarget = null;
    } else {
      runtime.posX += clamp(dx, -1, 1) * 0.34 * sdt;
      runtime.walkPhase += sdt * 7.5;
    }
  } else if (runtime.state === 'walk') {
    runtime.walkPhase += sdt * 7.5;
  }
  if (runtime.state === 'zoomies') {
    st2.zoomPhase += sdt * 1.9;
    runtime.posX = Math.sin(st2.zoomPhase) * 0.55;
    runtime.walkPhase += sdt * 16;
  }
  if (runtime.state === 'pounce') {
    const u = clamp(stateAge / runtime.stateDur, 0, 1);
    if (u > 0.35 && u < 0.75) viz.hopKick = Math.max(viz.hopKick, Math.sin(((u - 0.35) / 0.4) * Math.PI));
  }
  runtime.posX = clamp(runtime.posX, -1.2, 1.2);
  runtime.hopY = damp(runtime.hopY, 0, 14, dt);

  // ---- breathing ----
  const breathRate = runtime.state === 'sleep' ? 0.45 : 0.9;
  const breathAmp = runtime.state === 'sleep' ? 1.5 : 1;
  runtime.breath = Math.sin(t * breathRate * Math.PI) * 0.5 + 0.5;
  viz.breath = runtime.breath * breathAmp;

  // ---- blinking ----
  runtime.blinkTimer -= dt;
  if (runtime.blinkTimer <= 0) {
    const roll = Math.random();
    runtime.blinkKind = roll < 0.06 ? 'double' : roll < 0.22 ? 'slow' : 'normal';
    runtime.blinkDur = runtime.blinkKind === 'slow' ? 0.55 : runtime.blinkKind === 'double' ? 0.4 : 0.16;
    runtime.blinkTimer = rand(2, 6);
    runtime.blinkT0 = t;
  }
  let blinkTarget = 0;
  const blinkAge = t - (runtime.blinkT0 ?? t);
  if (blinkAge >= 0 && blinkAge < runtime.blinkDur) {
    const bp = blinkAge / runtime.blinkDur;
    if (runtime.blinkKind === 'double') {
      blinkTarget = bp < 0.5 ? Math.sin(bp * 2 * Math.PI) : Math.sin((bp - 0.5) * 2 * Math.PI);
    } else {
      blinkTarget = Math.sin(bp * Math.PI);
    }
  }
  if (runtime.affection > 70 && !isLying) {
    st2.slowBlink -= dt;
    if (st2.slowBlink <= 0) {
      st2.slowBlink = rand(12, 20);
      runtime.blinkKind = 'slow';
      runtime.blinkDur = 0.7;
      runtime.blinkT0 = t;
    }
  }
  runtime.blink = damp(runtime.blink, clamp(blinkTarget, 0, 1), 22, dt);

  // ---- pupil dilation ----
  let pupilTarget = 0.8;
  if (t < runtime.startleT) pupilTarget = 1.35;
  else if (isLying) pupilTarget = 0.7;
  else if (runtime.echoState === 'Listening') pupilTarget = 1.15;
  runtime.pupil = damp(runtime.pupil, pupilTarget, 4, dt);

  // ---- ear twitches ----
  st2.earTL -= dt;
  st2.earTR -= dt;
  if (st2.earTL <= 0) {
    st2.earTL = rand(2.5, 7);
    runtime.earTwitchL = 1;
  }
  if (st2.earTR <= 0) {
    st2.earTR = rand(3, 8);
    runtime.earTwitchR = 1;
  }
  runtime.earTwitchL = damp(runtime.earTwitchL, 0, 18, dt);
  runtime.earTwitchR = damp(runtime.earTwitchR, 0, 18, dt);

  // ---- reaction layer ----
  if (runtime.annoyedT > 0 && t > runtime.annoyedT) runtime.annoyedT = -1;

  let squintAdd = 0;
  let earFlatAdd = 0;
  const reaction = runtime.reaction;
  if (reaction) {
    const age = t - reaction.t0;
    const done = !reaction.hold && age > reaction.dur;
    if (done || (reaction.hold && runtime.pettingSince === null && age > 0.6)) {
      runtime.reaction = null;
    } else {
      const env = reaction.hold ? 1 : Math.sin(clamp(age / reaction.dur, 0, 1) * Math.PI);
      switch (reaction.id as ReactionId) {
        case 'head-stroke':
          squintAdd = 0.6 * env;
          viz.headBump = damp(viz.headBump, 0.5 * env, 8, dt);
          break;
        case 'cheek-rub':
          viz.headBump = damp(viz.headBump, env, 14, dt);
          viz.headTilt = damp(viz.headTilt, 0.35 * env, 12, dt);
          break;
        case 'chin-scratch':
          viz.headNod = damp(viz.headNod, -0.3 * env, 12, dt);
          squintAdd = 0.25 * env;
          break;
        case 'back-stroke':
          viz.arch = damp(viz.arch, 0.8 * env, 6, dt);
          squintAdd = 0.3 * env;
          break;
        case 'belly-tap':
          viz.roll = env; // full body roll across reaction duration
          break;
        case 'paw-tap':
          viz.pawR = damp(viz.pawR, env, 18, dt);
          break;
        case 'tail-tap':
          break; // handled via tailLashBoost below
        case 'nose-tap':
          viz.headNod = damp(viz.headNod, -0.55 * env, 20, dt);
          break;
        case 'whisker-touch':
          viz.whiskerTwitch = Math.max(viz.whiskerTwitch, env);
          break;
        case 'double-tap':
          viz.hopKick = Math.max(viz.hopKick, env);
          break;
        case 'poke-spam':
          earFlatAdd = 0.9;
          // walk away from the annoyer
          if (age < 0.1 && runtime.state !== 'walk') {
            runtime.walkTarget = { x: runtime.posX > 0 ? -1.1 : 1.1, z: 0 };
            requestState2D('walk');
          }
          break;
        case 'startle':
          viz.hopKick = Math.max(viz.hopKick, env);
          earFlatAdd = 0.8 * env;
          break;
        default:
          break;
      }
      if (reaction.id === 'ear-tap') earFlatAdd = 0.3 * env;
    }
  } else {
    viz.headBump = damp(viz.headBump, 0, 8, dt);
    viz.headTilt = damp(viz.headTilt, 0, 8, dt);
    viz.headNod = damp(viz.headNod, 0, 8, dt);
    viz.arch = damp(viz.arch, 0, 5, dt);
    viz.roll = damp(viz.roll, 0, 10, dt);
  }

  if (t < runtime.annoyedT) earFlatAdd = Math.max(earFlatAdd, 0.7);

  // echo mode: ears become radar dishes while listening, jaw while speaking
  if (runtime.echoState === 'Listening') {
    squintAdd = Math.max(squintAdd, 0.15);
  }
  const jawIn = Math.max(runtime.jawAudio, runtime.ttsJaw);
  if (jawIn > 0.01) viz.jaw = damp(viz.jaw, clamp(jawIn, 0, 1), 18, dt);
  else viz.jaw = damp(viz.jaw, 0, 10, dt);
  runtime.ttsJaw = damp(runtime.ttsJaw, 0, 6, dt);

  // purr smoothing (matches 3D behaviour)
  runtime.purrLevel = damp(runtime.purrLevel, runtime.purrTarget, 5, dt);
  if (runtime.purrTarget > 0 || runtime.purrLevel > 0.02) {
    catAudio.setPurrLevel(runtime.purrLevel, runtime.purrTarget);
  }
  if (!runtime.reaction?.hold && runtime.pettingSince === null && !runtime.purrManual) {
    runtime.purrTarget = damp(runtime.purrTarget, 0, 3, dt);
    if (runtime.purrTarget < 0.03) runtime.purrTarget = 0;
  }
  if (runtime.purrLevel > 0.15) squintAdd = Math.max(squintAdd, 0.45 * Math.min(1, runtime.purrLevel));

  // decay tail lash
  runtime.tailLashBoost = damp(runtime.tailLashBoost, 0, 1.8, dt);
  viz.tailLash = runtime.tailLashBoost * Math.sin(t * 11);

  // per-state visual targets
  let squintState = 0;
  let pawLCycle = 0;
  let pawRCycle = 0;
  if (runtime.state === 'loaf') squintState = 0.15;
  if (runtime.state === 'sleep') squintState = 1;
  if (runtime.state === 'knead') {
    squintState = 0.55;
    pawLCycle = Math.max(0, Math.sin(t * 2 * Math.PI * 1.15));
    pawRCycle = Math.max(0, Math.sin(t * 2 * Math.PI * 1.15 + Math.PI));
  }
  if (runtime.state === 'groom') {
    viz.groomCycle = Math.sin(t * 9) * 0.5 + 0.5;
    pawLCycle = 0.85;
  }
  if (runtime.state === 'yawn') {
    const u = clamp(stateAge / runtime.stateDur, 0, 1);
    viz.jaw = Math.max(viz.jaw, Math.sin(u * Math.PI) * 0.9);
    squintState = Math.sin(u * Math.PI) * 0.8;
  }
  viz.squint = clamp(squintState + squintAdd, 0, 1.2);
  viz.earFlat = clamp(earFlatAdd, 0, 1);
  viz.pawL = damp(viz.pawL, pawLCycle, 12, dt);
  viz.pawR = damp(viz.pawR, pawRCycle, 12, dt);
  viz.hopKick = damp(viz.hopKick, 0, 6, dt);
  viz.whiskerTwitch = damp(viz.whiskerTwitch, 0, 8, dt);

  // ---- mirror low-frequency state to zustand (4 Hz) ----
  st2.mirrorAcc += dt;
  if (st2.mirrorAcc > 0.25) {
    st2.mirrorAcc = 0;
    const mood: Mood = deriveMood();
    const live = useCatLive.getState();
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
}

// ============================================================ hit-testing

type Settings = ReturnType<typeof useSettings.getState>;

interface Region2D {
  id: string;
  prio: number;
  test: (x: number, y: number) => boolean;
}

const hitRegions: Region2D[] = [];
const ptr = { x: 0, y: 0 };

function segDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : clamp(((px - x1) * dx + (py - y1) * dy) / l2, 0, 1);
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

const circleHit = (x: number, y: number, r: number) => (px: number, py: number): boolean =>
  (px - x) * (px - x) + (py - y) * (py - y) <= r * r;
const ellipseHit = (x: number, y: number, rx: number, ry: number) => (px: number, py: number): boolean => {
  const nx = (px - x) / rx;
  const ny = (py - y) / ry;
  return nx * nx + ny * ny <= 1;
};
const rectHit = (x: number, y: number, w: number, h: number) => (px: number, py: number): boolean =>
  px >= x && px <= x + w && py >= y && py <= y + h;
const polyHit = (pts: Array<[number, number]>, w: number) => (px: number, py: number): boolean =>
  pts.some((_, i) => i > 0 && segDist(px, py, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]) <= w);

function addRegion(id: string, test: (x: number, y: number) => boolean, prio = 50): void {
  hitRegions.push({ id, prio, test });
}

function hitTest(x: number, y: number): string {
  for (const r of hitRegions) {
    if (r.test(x, y)) return r.id;
  }
  return '';
}

// ============================================================ canvas helpers

function ellipse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  fill: string,
  rot = 0
): void {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), rot, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

function shade(hex: string, amt: number): string {
  // amt -1..1 — lighten / darken an rgb() or #rrggbb() colour
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  if (amt >= 0) {
    r = Math.round(r + (255 - r) * amt);
    g = Math.round(g + (255 - g) * amt);
    b = Math.round(b + (255 - b) * amt);
  } else {
    r = Math.round(r * (1 + amt));
    g = Math.round(g * (1 + amt));
    b = Math.round(b * (1 + amt));
  }
  return `rgb(${r}, ${g}, ${b})`;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string
): void {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

/** Draw one eye with blink / squint / dilation, in local head space. */
function drawEye(
  ctx: CanvasRenderingContext2D,
  ex: number,
  ey: number,
  rx: number,
  ry: number,
  open: number,
  iris: string,
  pupilScale: number,
  outline: string
): void {
  if (open < 0.12) {
    ctx.beginPath();
    ctx.moveTo(ex - rx, ey);
    ctx.quadraticCurveTo(ex, ey + ry * 0.5, ex + rx, ey);
    ctx.strokeStyle = outline;
    ctx.lineWidth = Math.max(1, rx * 0.22);
    ctx.lineCap = 'round';
    ctx.stroke();
    return;
  }
  ctx.save();
  ctx.translate(ex, ey);
  ctx.scale(1, open);
  ellipse(ctx, 0, 0, rx, ry, iris);
  // outline
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.strokeStyle = outline;
  ctx.lineWidth = Math.max(1, rx * 0.14);
  ctx.stroke();
  // vertical slit pupil
  const pw = rx * 0.42 * pupilScale;
  ellipse(ctx, 0, ry * 0.05, Math.max(0.8, pw), ry * 0.78, '#151317');
  // highlight
  ellipse(ctx, -rx * 0.32, -ry * 0.35, rx * 0.18, ry * 0.16, 'rgba(255,255,255,0.85)');
  ctx.restore();
}

// ============================================================ cat renderer

interface CatLayout {
  bodyX: number;
  bodyY: number;
  bodyRx: number;
  bodyRy: number;
  headX: number;
  headY: number;
  headR: number;
  profile: boolean;
  backView: boolean;
  mirror: boolean;
  lying: boolean;
  sleeping: boolean;
}

let lastWalkFace = 1;

function drawCat(ctx: CanvasRenderingContext2D, u: number, cx: number, gy: number, s: Settings): void {
  const t = runtime.t;
  const state = runtime.state;
  const coat = s.coat;
  const isLying = LYING.includes(state);
  const sleeping = state === 'sleep';

  // ---------- decide view style ----------
  let profile = false;
  let backView = false;
  let mirror = false;
  const deg = ((s.position.rotY % 360) + 360) % 360;
  if (state === 'walk' || state === 'zoomies') {
    profile = true;
  } else if (st2.camFace === 'side') {
    profile = true;
  } else if (st2.camFace === 'back') {
    backView = true;
  } else if (deg > 135 && deg < 225) {
    backView = true;
  } else if (deg > 45 && deg < 135) {
    profile = true;
    mirror = true;
  } else if (deg > 225 && deg < 315) {
    profile = true;
  }
  if (state === 'walk' || state === 'zoomies') {
    // face the direction of travel (fall back to the last known one)
    if (Math.abs(runtime.posX - lastWalkFacePos) > 0.001) {
      lastWalkFace = runtime.posX > lastWalkFacePos ? 1 : -1;
      lastWalkFacePos = runtime.posX;
    }
    mirror = lastWalkFace < 0;
  } else {
    lastWalkFacePos = runtime.posX;
  }

  const hop = (runtime.hopY + viz.hopKick) * 0.35;
  const breath = viz.breath * 0.012;
  const arch = viz.arch;

  // ---------- pose layout (cat units, +y up, origin = ground centre) ----------
  let L: CatLayout;
  const stateAge = t - runtime.stateT0;
  const su = runtime.stateDur > 0 ? clamp(stateAge / runtime.stateDur, 0, 1) : 0;

  if (profile) {
    L = {
      bodyX: 0, bodyY: 0.55 + breath, bodyRx: 0.58, bodyRy: 0.3 + breath,
      headX: 0.5, headY: 0.86, headR: 0.3,
      profile, backView, mirror, lying: false, sleeping,
    };
  } else if (isLying) {
    L = {
      bodyX: 0, bodyY: 0.27 + breath, bodyRx: 0.63, bodyRy: 0.28 + breath,
      headX: -0.58, headY: 0.33 + breath * 2, headR: 0.3,
      profile, backView, mirror, lying: true, sleeping,
    };
  } else if (state === 'loaf') {
    L = {
      bodyX: 0, bodyY: 0.36 + breath, bodyRx: 0.66, bodyRy: 0.37 + breath,
      headX: 0.04, headY: 0.75, headR: 0.32,
      profile, backView, mirror, lying: false, sleeping,
    };
  } else if (state === 'stretch') {
    const k = Math.sin(su * Math.PI);
    L = {
      bodyX: 0.05, bodyY: 0.44 - k * 0.1 + breath, bodyRx: 0.62, bodyRy: 0.4,
      headX: -0.42 - k * 0.12, headY: 0.52 - k * 0.06, headR: 0.3,
      profile, backView, mirror, lying: false, sleeping,
    };
  } else if (state === 'pounce') {
    const crouch = su < 0.35 ? 1 - su / 0.35 : 0;
    L = {
      bodyX: 0.02, bodyY: 0.5 - crouch * 0.12 + breath, bodyRx: 0.56, bodyRy: 0.46 - crouch * 0.06,
      headX: -0.06, headY: 1.0 - crouch * 0.08, headR: 0.33,
      profile, backView, mirror, lying: false, sleeping,
    };
  } else if (state === 'idle-stand') {
    L = {
      bodyX: 0.02, bodyY: 0.6 + breath, bodyRx: 0.44, bodyRy: 0.42 + breath,
      headX: -0.02, headY: 1.14, headR: 0.33,
      profile, backView, mirror, lying: false, sleeping,
    };
  } else {
    // idle-sit, knead, groom, yawn, turn, wake — the chibi sit
    const bob = state === 'knead' ? Math.sin(t * 2 * Math.PI * 1.15) * 0.012 : 0;
    L = {
      bodyX: 0.05, bodyY: 0.52 + breath + bob, bodyRx: 0.53, bodyRy: 0.47 + breath,
      headX: -0.03, headY: 1.07 + bob, headR: 0.34,
      profile, backView, mirror, lying: false, sleeping,
    };
    if (state === 'groom') {
      L.headX = -0.14 - viz.groomCycle * 0.08;
      L.headY = 0.98 + viz.groomCycle * 0.02;
    }
    if (state === 'yawn') {
      L.headY = 1.12;
    }
  }

  // pointer look-at (gentle)
  if (s.lookAtPointer && !profile && !isLying) {
    L.headX += clamp(ptr.x, -1, 1) * 0.05;
    L.headY += clamp(-ptr.y, -1, 1) * 0.03;
  }

  hitRegions.length = 0;

  const X = (x: number): number => (L.mirror ? -x : x) * u;
  const px = (x: number): number => cx + X(x) + runtime.posX * u;
  const py = (y: number): number => gy - y * u - hop * u;

  // ---------- shadow ----------
  const shadowSquash = 1 - clamp(hop, 0, 0.6) * 0.5;
  ellipse(ctx, px(L.bodyX), gy, L.bodyRx * u * 0.95 * shadowSquash, 0.13 * u * shadowSquash, 'rgba(20,16,12,0.20)');

  // ---------- tail (behind everything) ----------
  const tailPts: Array<[number, number]> = [];
  {
    const sway = Math.sin(t * 1.3) * 0.08 + (runtime.pose.tailSway ?? -0.25) * 0.25;
    const curl = L.lying ? 0.15 : state === 'loaf' ? 0.25 : 0.6;
    let ang: number; // screen angle (0 = right, -π/2 = up)
    let tx: number;
    let ty: number;
    if (L.lying) {
      tx = L.bodyX + L.bodyRx * 0.8;
      ty = L.bodyY - 0.08;
      ang = L.mirror ? Math.PI : 0;
    } else if (L.profile) {
      tx = L.bodyX - L.bodyRx * 0.75;
      ty = L.bodyY + 0.1;
      ang = L.mirror ? 0.35 : Math.PI - 0.35;
    } else {
      tx = L.bodyX + L.bodyRx * 0.55;
      ty = L.bodyY - L.bodyRy * 0.55;
      ang = -0.35;
    }
    let x = px(tx);
    let y = py(ty);
    tailPts.push([x, y]);
    const segLen = (L.lying ? 0.13 : 0.105) * u;
    const cp = coat.patternType === 'colorpoint' || coat.patternType === 'tabby';
    for (let i = 0; i < 9; i++) {
      const frac = i / 8;
      const a =
        ang +
        (L.lying ? 0 : -curl * (0.55 + frac * 0.9)) * (L.mirror ? -1 : 1) +
        sway * (0.4 + frac) +
        viz.tailLash * (0.3 + frac) * 0.5;
      x += Math.cos(a) * segLen;
      y += Math.sin(a) * segLen;
      tailPts.push([x, y]);
      const w = (0.052 - frac * 0.026) * u;
      const segCol =
        cp && (i === 4 || i === 6 || i === 8)
          ? coat.patternColor
          : coat.baseColor;
      ctx.beginPath();
      ctx.arc(x, y, w, 0, Math.PI * 2);
      ctx.fillStyle = segCol;
      ctx.fill();
    }
    addRegion('tailBase', polyHit([tailPts[0], tailPts[1], tailPts[2]], 0.1 * u), 16);
    addRegion('tailMid', polyHit([tailPts[3], tailPts[4], tailPts[5]], 0.1 * u), 16);
    addRegion('tailTip', polyHit([tailPts[7], tailPts[8], tailPts[9]], 0.1 * u), 16);
  }

  // ---------- whole-cat transforms (roll for belly-tap, hop) ----------
  ctx.save();
  const rollAng = viz.roll > 0.02 ? viz.roll * Math.PI * 2 * (L.mirror ? -1 : 1) : 0;
  if (rollAng !== 0) {
    ctx.translate(px(L.bodyX), py(L.bodyY + L.bodyRy));
    ctx.rotate(rollAng);
    ctx.translate(-px(L.bodyX), -py(L.bodyY + L.bodyRy));
  }

  const bodyC = coat.baseColor;
  const bellyC = coat.bellyColor;
  const patternC = coat.patternColor;

  if (L.profile) {
    // ================== PROFILE (side) VIEW ==================
    const bx = px(L.bodyX);
    const by = py(L.bodyY);
    const brx = L.bodyRx * u;
    const bry = L.bodyRy * u;
    // haunch
    ellipse(ctx, bx - brx * 0.35, by - bry * 0.1, brx * 0.55, bry * 1.02, bodyC);
    // torso
    ellipse(ctx, bx + brx * 0.15, by, brx * 0.72, bry * 0.92, bodyC);
    // chest
    ellipse(ctx, bx + brx * 0.62, by + bry * 0.05, brx * 0.28, bry * 0.62, bodyC);
    // belly underline
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(bx + brx * 0.1, by, brx * 0.66, bry * 0.9, 0, 0, Math.PI * 2);
    ctx.clip();
    ellipse(ctx, bx + brx * 0.1, by + bry * 0.55, brx * 0.66, bry * 0.5, bellyC);
    ctx.restore();
    // patterns on body
    drawBodyPatterns(ctx, bx, by, brx, bry, coat, 'profile');

    // legs (4)
    const legs: Array<[number, number]> = [
      [-0.34, 0], [-0.14, Math.PI * 0.9], [0.18, Math.PI * 1.9], [0.36, Math.PI * 2.8],
    ];
    for (const [lx, off] of legs) {
      const swing = Math.sin(runtime.walkPhase + off);
      const lift = Math.max(0, swing) * 0.07;
      const legX = bx + X(lx) + swing * 0.1 * u;
      const topY = by + bry * 0.4;
      const footY = gy - lift * u;
      roundRect(ctx, legX - 0.05 * u, topY, 0.1 * u, footY - topY, 0.05 * u, bodyC);
      ellipse(ctx, legX, footY - 0.03 * u, 0.065 * u, 0.045 * u, coat.pawColor);
    }
    addRegion('pawFL', circleHit(bx + X(0.18), gy - 0.02 * u, 0.12 * u), 13);
    addRegion('pawFR', circleHit(bx + X(0.36), gy - 0.02 * u, 0.12 * u), 13);
    addRegion('pawBL', circleHit(bx + X(-0.34), gy - 0.02 * u, 0.12 * u), 13);
    addRegion('pawBR', circleHit(bx + X(-0.14), gy - 0.02 * u, 0.12 * u), 13);

    // speed streaks while zooming
    if (state === 'zoomies') {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const sy = by - bry * (0.3 + i * 0.35);
        ctx.beginPath();
        ctx.moveTo(bx - (L.mirror ? -1 : 1) * (brx + 0.12 * u), sy);
        ctx.lineTo(bx - (L.mirror ? -1 : 1) * (brx + 0.42 * u), sy);
        ctx.stroke();
      }
    }

    drawHead2D(ctx, L, u, px, py, s);
    addRegion('chest', ellipseHit(bx + brx * 0.6, by, brx * 0.3, bry * 0.75), 9);
    addRegion('back', ellipseHit(bx, by - bry * 0.45, brx * 0.85, bry * 0.5), 11);
    addRegion('belly', ellipseHit(bx + brx * 0.1, by + bry * 0.55, brx * 0.6, bry * 0.45), 10);
    addRegion('flankL', ellipseHit(bx - brx * 0.45, by - bry * 0.05, brx * 0.35, bry * 0.85), 12);
    addRegion('flankR', ellipseHit(bx + brx * 0.45, by - bry * 0.05, brx * 0.35, bry * 0.85), 12);
  } else {
    // ================== FRONT / SIT / LOAF / LYING ==================
    const bx = px(L.bodyX);
    const by = py(L.bodyY);
    const brx = L.bodyRx * u * (1 + arch * 0.05);
    const bry = L.bodyRy * u;

    if (L.lying) {
      // lying on the side: belly up-ish
      ellipse(ctx, bx, by, brx, bry, bellyC);
      ellipse(ctx, bx, by - bry * 0.45, brx * 0.96, bry * 0.62, bodyC);
      drawBodyPatterns(ctx, bx, by, brx, bry, coat, 'lying');
      // front paws reaching forward
      const pawY = gy - 0.05 * u;
      ellipse(ctx, bx - brx * 0.55, pawY, 0.09 * u, 0.05 * u, coat.pawColor);
      ellipse(ctx, bx - brx * 0.3, pawY, 0.09 * u, 0.05 * u, coat.pawColor);
      addRegion('pawFL', circleHit(bx - brx * 0.55, pawY, 0.11 * u), 13);
      addRegion('pawFR', circleHit(bx - brx * 0.3, pawY, 0.11 * u), 13);
      addRegion('belly', ellipseHit(bx + brx * 0.15, by - bry * 0.15, brx * 0.7, bry * 0.5), 10);
      addRegion('back', ellipseHit(bx + brx * 0.5, by - bry * 0.2, brx * 0.45, bry * 0.75), 11);
      addRegion('flankL', ellipseHit(bx - brx * 0.55, by, brx * 0.4, bry * 0.8), 12);
      addRegion('flankR', ellipseHit(bx + brx * 0.55, by, brx * 0.4, bry * 0.8), 12);
    } else if (state === 'loaf') {
      ellipse(ctx, bx, by, brx, bry, bodyC);
      drawBodyPatterns(ctx, bx, by, brx, bry, coat, 'loaf');
      // tucked toe beans
      ellipse(ctx, bx - brx * 0.35, gy - 0.045 * u, 0.085 * u, 0.05 * u, coat.pawColor);
      ellipse(ctx, bx - brx * 0.12, gy - 0.045 * u, 0.085 * u, 0.05 * u, coat.pawColor);
      addRegion('pawFL', circleHit(bx - brx * 0.35, gy - 0.04 * u, 0.11 * u), 13);
      addRegion('pawFR', circleHit(bx - brx * 0.12, gy - 0.04 * u, 0.11 * u), 13);
      addRegion('pawBL', circleHit(bx + brx * 0.62, gy - 0.03 * u, 0.1 * u), 13);
      addRegion('pawBR', circleHit(bx + brx * 0.8, gy - 0.03 * u, 0.1 * u), 13);
      addRegion('back', ellipseHit(bx, by - bry * 0.4, brx * 0.9, bry * 0.55), 11);
      addRegion('belly', ellipseHit(bx - brx * 0.4, by + bry * 0.25, brx * 0.5, bry * 0.5), 10);
      addRegion('flankL', ellipseHit(bx - brx * 0.6, by, brx * 0.35, bry * 0.85), 12);
      addRegion('flankR', ellipseHit(bx + brx * 0.6, by, brx * 0.35, bry * 0.85), 12);
    } else {
      // sitting / standing: haunches + chest + front legs
      const stretchy = state === 'stretch' ? Math.sin(su * Math.PI) : 0;
      // haunches (rear)
      ellipse(ctx, bx + brx * 0.28, by - bry * 0.05, brx * 0.72, bry * 1.0, bodyC);
      // chest / front body
      ellipse(
        ctx,
        bx - brx * 0.3,
        by - bry * 0.18 + stretchy * 0.1 * u,
        brx * 0.62,
        bry * 0.98 + arch * 0.06 * u,
        bodyC
      );
      // belly patch on the chest
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(bx - brx * 0.3, by - bry * 0.18, brx * 0.62, bry * 0.98, 0, 0, Math.PI * 2);
      ctx.clip();
      ellipse(ctx, bx - brx * 0.3, by + bry * 0.5, brx * 0.5, bry * 0.55, bellyC);
      ctx.restore();
      drawBodyPatterns(ctx, bx, by, brx, bry, coat, 'front');

      // front legs
      const legW = 0.115 * u;
      const legTops: Array<[number, number]> = [
        [bx - brx * 0.42, -0.06],
        [bx - brx * 0.06, 0.08],
      ];
      const lifts = [viz.pawL, viz.pawR];
      legTops.forEach(([lx, lo], i) => {
        const lift = lifts[i] * 0.16 * u;
        if (state === 'stretch' && i === 0) {
          // stretched forward
          roundRect(ctx, lx - legW / 2, gy - 0.34 * u, legW * 1.8, legW * 1.4, legW / 2, bodyC);
          ellipse(ctx, lx + legW * 0.85, gy - 0.28 * u, 0.08 * u, 0.05 * u, coat.pawColor);
          return;
        }
        const topY = by - bry * 0.35 + lo * u;
        const footY = gy - lift;
        roundRect(ctx, lx - legW / 2, topY, legW, footY - topY, legW / 2, bodyC);
        ellipse(ctx, lx, footY - 0.03 * u, 0.085 * u, 0.05 * u, coat.pawColor);
      });
      addRegion('pawFL', circleHit(legTops[0][0], gy - 0.02 * u, 0.12 * u), 13);
      addRegion('pawFR', circleHit(legTops[1][0], gy - 0.02 * u, 0.12 * u), 13);
      addRegion('pawBL', circleHit(bx + brx * 0.75, gy - 0.02 * u, 0.11 * u), 13);
      addRegion('pawBR', circleHit(bx + brx * 1.0, gy - 0.02 * u, 0.11 * u), 13);

      addRegion('chest', ellipseHit(bx - brx * 0.3, by - bry * 0.4, brx * 0.55, bry * 0.55), 9);
      addRegion('belly', ellipseHit(bx - brx * 0.3, by + bry * 0.45, brx * 0.5, bry * 0.55), 10);
      addRegion('back', ellipseHit(bx + brx * 0.28, by - bry * 0.55, brx * 0.68, bry * 0.5), 11);
      addRegion('flankL', ellipseHit(bx - brx * 0.75, by, brx * 0.4, bry * 0.85), 12);
      addRegion('flankR', ellipseHit(bx + brx * 0.85, by - bry * 0.05, brx * 0.4, bry * 0.85), 12);
    }

    drawHead2D(ctx, L, u, px, py, s);
  }

  ctx.restore(); // roll transform

  // ---------- overlays (world-space) ----------
  const headPx = px(L.headX);
  const headPy = py(L.headY + L.headR * 1.1);
  runtime.screenPos.x = clamp((headPx / ctx.canvas.clientWidth) * 100, 5, 95);
  runtime.screenPos.y = clamp((headPy / ctx.canvas.clientHeight) * 100, 5, 95);

  if (sleeping) {
    ctx.fillStyle = 'rgba(90,80,110,0.85)';
    ctx.textAlign = 'center';
    for (let i = 0; i < 3; i++) {
      const cyc = (t * 0.42 + i * 0.36) % 1.5;
      const size = (0.14 + i * 0.035) * u * (0.7 + cyc * 0.5);
      ctx.globalAlpha = clamp(1.1 - cyc / 1.5, 0, 1);
      ctx.font = `700 ${size}px ui-sans-serif, system-ui, sans-serif`;
      ctx.fillText('z', headPx + 0.34 * u + Math.sin(t * 0.9 + i) * 0.05 * u, headPy - cyc * 0.5 * u);
    }
    ctx.globalAlpha = 1;
  }
  if (t < runtime.startleT) {
    ctx.fillStyle = '#c0392b';
    ctx.textAlign = 'center';
    ctx.font = `800 ${0.42 * u}px ui-sans-serif, system-ui, sans-serif`;
    const pop = 1 + Math.max(0, 0.25 - (runtime.startleT - t)) * 0.8;
    ctx.save();
    ctx.translate(headPx, headPy - 0.3 * u);
    ctx.scale(pop, pop);
    ctx.fillText('!', 0, 0);
    ctx.restore();
  }
  if (runtime.purrLevel > 0.25) {
    ctx.textAlign = 'center';
    for (let i = 0; i < 2; i++) {
      const cyc = (t * 0.5 + i * 0.5) % 1.2;
      ctx.globalAlpha = clamp(1 - cyc / 1.2, 0, 1) * clamp(runtime.purrLevel * 1.4, 0, 1);
      ctx.font = `${(0.16 + i * 0.04) * u}px ui-sans-serif, system-ui, sans-serif`;
      ctx.fillStyle = '#e0567a';
      ctx.fillText('♥', headPx + (i === 0 ? -0.55 : 0.55) * u, headPy - 0.15 * u - cyc * 0.42 * u);
    }
    ctx.globalAlpha = 1;
  }
}

let lastWalkFacePos = 0;

// ============================================================ head renderer

function drawHead2D(
  ctx: CanvasRenderingContext2D,
  L: CatLayout,
  u: number,
  px: (x: number) => number,
  py: (y: number) => number,
  s: Settings
): void {
  const t = runtime.t;
  const coat = s.coat;
  const hx = px(L.headX + viz.headBump * 0.06);
  const hy = py(L.headY);
  const hr = L.headR * u;
  const tilt = viz.headTilt * (L.mirror ? -1 : 1) + viz.headNod * 0.4;

  // local head-space → world-space (head is translated to hx,hy + rotated by tilt)
  const rotP = (lx: number, ly: number): [number, number] => {
    const c = Math.cos(tilt);
    const s = Math.sin(tilt);
    return [hx + lx * c - ly * s, hy + lx * s + ly * c];
  };

  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(tilt);

  const earFlat = viz.earFlat;
  const twitchL = runtime.earTwitchL * 0.35;
  const twitchR = runtime.earTwitchR * 0.35;

  // ---- ears (drawn behind the head) ----
  const earGeo: Array<[-1 | 1, number, number]> = [
    [-1, -0.62, twitchL],
    [1, 0.62, twitchR],
  ];
  const earHoles: Array<[number, number, number]> = [];
  for (const [side, ox, tw] of earGeo) {
    const ex = side * hr * 0.78;
    const ey = -hr * 0.72;
    const rot = side * (0.28 + earFlat * 0.9) + tw * side;
    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate(rot);
    const ew = hr * 0.46;
    const eh = hr * 0.72;
    // outer ear
    ctx.beginPath();
    ctx.moveTo(-ew * 0.55, eh * 0.45);
    ctx.quadraticCurveTo(-ew * 0.25, -eh * 0.75, ew * 0.3, -eh * 0.5);
    ctx.quadraticCurveTo(ew * 0.75, eh * 0.2, -ew * 0.55, eh * 0.45);
    ctx.closePath();
    ctx.fillStyle = coat.baseColor;
    ctx.fill();
    // inner ear
    ctx.beginPath();
    ctx.moveTo(-ew * 0.28, eh * 0.25);
    ctx.quadraticCurveTo(-ew * 0.12, -eh * 0.5, ew * 0.2, -eh * 0.32);
    ctx.quadraticCurveTo(ew * 0.45, eh * 0.1, -ew * 0.28, eh * 0.25);
    ctx.closePath();
    ctx.fillStyle = coat.innerEarColor;
    ctx.fill();
    ctx.restore();
    const [ewx, ewy] = rotP(ex, ey);
    addRegion(side < 0 ? 'earL' : 'earR', ellipseHit(ewx, ewy, hr * 0.46, hr * 0.6), 4);
  }

  // ---- head shape ----
  ellipse(ctx, 0, 0, hr, hr * 0.94, coat.baseColor);
  // cheek fluff
  ctx.strokeStyle = shade(coat.baseColor, -0.08);
  ctx.lineWidth = hr * 0.1;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(side * hr * 0.78, hr * 0.28, hr * 0.3, side < 0 ? Math.PI * 0.7 : Math.PI * 0.15, side < 0 ? Math.PI * 1.25 : Math.PI * 0.7);
    ctx.stroke();
  }

  // colourpoint mask
  if (coat.patternType === 'colorpoint') {
    ctx.save();
    ctx.globalAlpha = 0.35 + coat.patternIntensity * 0.35;
    ellipse(ctx, 0, 0, hr * 0.98, hr * 0.92, coat.maskColor);
    ctx.restore();
  }
  // tabby forehead stripes
  if (coat.patternType === 'tabby' && !L.backView) {
    ctx.save();
    ctx.globalAlpha = 0.35 + coat.patternIntensity * 0.4;
    ctx.strokeStyle = coat.patternColor;
    ctx.lineWidth = hr * 0.09;
    ctx.lineCap = 'round';
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(i * hr * 0.26, -hr * 0.85);
      ctx.lineTo(i * hr * 0.2, -hr * 0.55);
      ctx.stroke();
    }
    ctx.restore();
  }

  if (L.backView) {
    // no face from behind — restore & finish
    ctx.restore();
    addRegion('head', circleHit(hx, hy, hr * 1.05));
    addRegion('forehead', ellipseHit(hx, hy - hr * 0.45, hr * 0.75, hr * 0.45));
    addRegion('neck', rectHit(hx - hr * 0.5, hy + hr * 0.8, hr, hr * 0.6));
    return;
  }
  // ---- muzzle ----
  const muzzleY = hr * 0.38;
  ellipse(ctx, 0, muzzleY, hr * 0.52, hr * 0.34, shade(coat.bellyColor, 0.05));

  // ---- eyes ----
  const squint = clamp(viz.squint, 0, 1);
  const eyeOpen = clamp(1 - runtime.blink * 0.95 - squint * 0.8 - (L.sleeping ? 1 : 0), 0.02, 1);
  const eyeY = -hr * 0.06;
  const eyeR = hr * 0.26;
  const eyeSpread = hr * 0.42;
  const outline = shade(coat.baseColor, -0.35);
  drawEye(ctx, -eyeSpread, eyeY, eyeR, eyeR * 1.18, eyeOpen, s.eyes.colorL, runtime.pupil, outline);
  drawEye(
    ctx,
    eyeSpread,
    eyeY,
    eyeR,
    eyeR * 1.18,
    eyeOpen,
    s.eyes.oddEyed ? s.eyes.colorR : s.eyes.colorL,
    runtime.pupil,
    outline
  );

  // ---- nose ----
  const noseY = muzzleY - hr * 0.04;
  ctx.beginPath();
  ctx.moveTo(-hr * 0.09, noseY - hr * 0.07);
  ctx.lineTo(hr * 0.09, noseY - hr * 0.07);
  ctx.quadraticCurveTo(hr * 0.11, noseY + hr * 0.06, 0, noseY + hr * 0.08);
  ctx.quadraticCurveTo(-hr * 0.11, noseY + hr * 0.06, -hr * 0.09, noseY - hr * 0.07);
  ctx.fillStyle = coat.noseColor;
  ctx.fill();
  const [nx, ny] = rotP(0, noseY);
  addRegion('nose', circleHit(nx, ny, hr * 0.22), 1);

  // ---- mouth + jaw ----
  const jawOpen = clamp(viz.jaw, 0, 1);
  ctx.strokeStyle = shade(coat.baseColor, -0.4);
  ctx.lineWidth = Math.max(1, hr * 0.05);
  ctx.lineCap = 'round';
  if (jawOpen > 0.06) {
    const mw = hr * (0.22 + jawOpen * 0.18);
    const mh = hr * (0.1 + jawOpen * 0.42);
    ellipse(ctx, 0, noseY + hr * 0.16 + mh * 0.4, mw, mh, '#7c4250');
    ellipse(ctx, 0, noseY + hr * 0.16 + mh * 0.85, mw * 0.55, mh * 0.4, '#e2848f'); // tongue
    const [jx, jy] = rotP(0, noseY + hr * 0.4);
    addRegion('chin', circleHit(jx, jy, hr * 0.24), 2);
  } else {
    ctx.beginPath();
    ctx.moveTo(0, noseY + hr * 0.08);
    ctx.quadraticCurveTo(-hr * 0.12, noseY + hr * 0.2, -hr * 0.22, noseY + hr * 0.1);
    ctx.moveTo(0, noseY + hr * 0.08);
    ctx.quadraticCurveTo(hr * 0.12, noseY + hr * 0.2, hr * 0.22, noseY + hr * 0.1);
    ctx.stroke();
    const [jx, jy] = rotP(0, noseY + hr * 0.3);
    addRegion('chin', circleHit(jx, jy, hr * 0.22), 2);
  }

  // ---- whiskers ----
  const tw = viz.whiskerTwitch * Math.sin(t * 30) * 0.12;
  ctx.strokeStyle = 'rgba(252,250,246,0.9)';
  ctx.lineWidth = Math.max(1, u * 0.011);
  for (const side of [-1, 1]) {
    const wBaseX = side * hr * 0.3;
    const wBaseY = noseY + hr * 0.02;
    for (let i = -1; i <= 1; i++) {
      const ang = side * (Math.PI / 2) + i * 0.28 + tw;
      const len = hr * (1.15 - Math.abs(i) * 0.18);
      ctx.beginPath();
      ctx.moveTo(wBaseX, wBaseY);
      const mx = wBaseX + Math.cos(ang) * len * 0.5;
      const my = wBaseY - Math.sin(ang) * len * 0.5 + i * hr * 0.06;
      const ex = wBaseX + Math.cos(ang) * len;
      const ey = wBaseY - Math.sin(ang) * len;
      ctx.quadraticCurveTo(mx, my, ex, ey);
      ctx.stroke();
    }
    addRegion(
      side < 0 ? 'whiskersL' : 'whiskersR',
      circleHit(...rotP(side * hr * 0.85, noseY), hr * 0.55),
      3
    );
  }

  // ---- cheeks / forehead / head regions (world-space via rotP) ----
  const [clx, cly] = rotP(-hr * 0.8, hr * 0.25);
  const [crx, cry] = rotP(hr * 0.8, hr * 0.25);
  const [ffx, ffy] = rotP(0, -hr * 0.55);
  addRegion('cheekL', ellipseHit(clx, cly, hr * 0.4, hr * 0.36), 5);
  addRegion('cheekR', ellipseHit(crx, cry, hr * 0.4, hr * 0.36), 5);
  addRegion('forehead', ellipseHit(ffx, ffy, hr * 0.75, hr * 0.45), 6);
  addRegion('head', circleHit(hx, hy, hr * 1.02), 7);

  // ---- accessory ----
  if (s.accessory === 'collar') {
    ctx.save();
    ctx.strokeStyle = '#c0392b';
    ctx.lineWidth = hr * 0.16;
    ctx.beginPath();
    ctx.arc(0, hr * 0.82, hr * 0.72, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
    ellipse(ctx, 0, hr * 1.06, hr * 0.13, hr * 0.13, '#e0b83d');
    ctx.restore();
  } else if (s.accessory === 'bow') {
    ctx.save();
    ctx.translate(-hr * 0.78, -hr * 0.78);
    ctx.rotate(-0.5);
    ctx.fillStyle = '#e0567a';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(side * hr * 0.42, -hr * 0.22);
      ctx.lineTo(side * hr * 0.42, hr * 0.22);
      ctx.closePath();
      ctx.fill();
    }
    ellipse(ctx, 0, 0, hr * 0.1, hr * 0.1, '#c0392b');
    ctx.restore();
  }

  ctx.restore(); // head transform

  addRegion('neck', rectHit(hx - hr * 0.55, hy + hr * 0.85, hr * 1.1, hr * 0.7), 8);
}

// ============================================================ body patterns

function drawBodyPatterns(
  ctx: CanvasRenderingContext2D,
  bx: number,
  by: number,
  brx: number,
  bry: number,
  coat: Settings['coat'],
  view: 'front' | 'profile' | 'loaf' | 'lying'
): void {
  const type = coat.patternType;
  const inten = coat.patternIntensity;
  if (type === 'solid' || inten <= 0.02) return;
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(bx, by, brx, bry, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.globalAlpha = 0.25 + inten * 0.55;
  if (type === 'tabby') {
    ctx.strokeStyle = coat.patternColor;
    ctx.lineCap = 'round';
    ctx.lineWidth = brx * 0.07;
    const n = view === 'profile' ? 4 : 3;
    for (let i = 0; i < n; i++) {
      const fx = bx - brx * 0.45 + (i / Math.max(1, n - 1)) * brx * 0.95;
      ctx.beginPath();
      ctx.moveTo(fx, by - bry * 0.75);
      ctx.quadraticCurveTo(fx + brx * 0.06, by, fx - brx * 0.04, by + bry * 0.7);
      ctx.stroke();
    }
  } else if (type === 'spots') {
    const spots: Array<[number, number, number]> = [
      [-0.45, -0.3, 0.16], [-0.1, 0.15, 0.2], [0.3, -0.45, 0.14],
      [0.42, 0.2, 0.18], [0.05, -0.62, 0.12], [-0.3, 0.5, 0.13],
    ];
    for (const [fx, fy, fr] of spots) {
      ellipse(ctx, bx + fx * brx, by + fy * bry, fr * brx, fr * bry * 0.8, coat.patternColor);
    }
  } else if (type === 'patches') {
    ellipse(ctx, bx + brx * 0.45, by - bry * 0.35, brx * 0.55, bry * 0.6, coat.patternColor);
    ellipse(ctx, bx - brx * 0.5, by + bry * 0.25, brx * 0.42, bry * 0.5, coat.patternColor);
    ellipse(ctx, bx + brx * 0.05, by - bry * 0.55, brx * 0.35, bry * 0.42, coat.patternColor);
  }
  // tuxedo / colorpoint markings live on the part colours themselves
  ctx.restore();
}

// ============================================================ scene renderer

function drawStars(ctx: CanvasRenderingContext2D, W: number, gy: number, t: number): void {
  ctx.fillStyle = '#f5f2e8';
  for (let i = 0; i < 70; i++) {
    const sx = ((i * 127.31 + 11) % 97) / 97 * W;
    const sy = ((i * 61.7 + 3) % 100) / 100 * gy * 0.85;
    const r = 0.8 + (i % 3) * 0.7;
    const tw2 = 0.55 + 0.45 * Math.sin(t * 2 + i * 1.7);
    ctx.globalAlpha = (0.35 + (i % 5) * 0.13) * tw2;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawEnvironment(ctx: CanvasRenderingContext2D, W: number, H: number, gy: number, s: Settings): void {
  const env = ENV_2D[s.environment] ?? ENV_2D.garden;
  const t = runtime.t;

  // sky
  const grad = ctx.createLinearGradient(0, 0, 0, gy);
  grad.addColorStop(0, env.skyTop);
  grad.addColorStop(1, env.skyBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, gy + 1);

  if (env.stars) drawStars(ctx, W, gy, t);

  // decor
  ctx.save();
  switch (env.decor) {
    case 'sun': {
      const sx = W * 0.82;
      const sy = gy * 0.22;
      const r = Math.min(W, H) * 0.055;
      const glow = ctx.createRadialGradient(sx, sy, r * 0.3, sx, sy, r * 3.2);
      glow.addColorStop(0, 'rgba(255,236,160,0.85)');
      glow.addColorStop(1, 'rgba(255,236,160,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(sx - r * 3.2, sy - r * 3.2, r * 6.4, r * 6.4);
      ellipse(ctx, sx, sy, r, r, '#ffe07a');
      // clouds
      ctx.globalAlpha = 0.85;
      for (const [cxp, cyp, cs] of [
        [0.2, 0.16, 1], [0.55, 0.09, 0.7], [0.35, 0.3, 0.55],
      ] as Array<[number, number, number]>) {
        const bx = W * cxp + Math.sin(t * 0.05 + cxp * 9) * W * 0.012;
        const by = gy * cyp;
        ellipse(ctx, bx, by, 46 * cs, 16 * cs, '#ffffff');
        ellipse(ctx, bx + 26 * cs, by + 4 * cs, 30 * cs, 12 * cs, '#ffffff');
        ellipse(ctx, bx - 26 * cs, by + 5 * cs, 26 * cs, 11 * cs, '#ffffff');
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'moon': {
      const mx = W * 0.8;
      const my = gy * 0.2;
      const r = Math.min(W, H) * 0.05;
      const glow = ctx.createRadialGradient(mx, my, r * 0.2, mx, my, r * 3.6);
      glow.addColorStop(0, 'rgba(235,240,255,0.5)');
      glow.addColorStop(1, 'rgba(235,240,255,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(mx - r * 3.6, my - r * 3.6, r * 7.2, r * 7.2);
      ellipse(ctx, mx, my, r, r, '#eef1fa');
      ellipse(ctx, mx + r * 0.42, my - r * 0.18, r * 0.86, r * 0.86, '#27335c');
      break;
    }
    case 'window': {
      const wx = W * 0.12;
      const wy = gy * 0.16;
      const ww = Math.min(W * 0.24, 190);
      const wh = gy * 0.42;
      roundRect(ctx, wx, wy, ww, wh, 10, '#8a6f52');
      roundRect(ctx, wx + 8, wy + 8, ww - 16, wh - 16, 6, '#bfe0ee');
      ctx.strokeStyle = '#8a6f52';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(wx + ww / 2, wy + 6);
      ctx.lineTo(wx + ww / 2, wy + wh - 6);
      ctx.moveTo(wx + 6, wy + wh / 2);
      ctx.lineTo(wx + ww - 6, wy + wh / 2);
      ctx.stroke();
      ellipse(ctx, wx + ww * 0.3, wy + wh * 0.32, ww * 0.1, ww * 0.1, '#ffe9a8');
      break;
    }
    case 'lamp': {
      const lx = W / 2;
      const ly = gy * 0.1;
      const glow = ctx.createRadialGradient(lx, ly, 8, lx, ly, Math.min(W, H) * 0.55);
      glow.addColorStop(0, 'rgba(255,240,200,0.55)');
      glow.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, gy);
      break;
    }
    case 'trees': {
      for (const [fx, s2] of [
        [0.08, 1.1], [0.22, 0.75], [0.82, 1.25], [0.94, 0.85],
      ] as Array<[number, number]>) {
        const bx = W * fx;
        const h = gy * 0.62 * s2;
        ctx.fillStyle = '#5c4632';
        ctx.fillRect(bx - h * 0.035, gy - h * 0.32, h * 0.07, h * 0.32);
        ctx.fillStyle = '#3f6b46';
        for (let l = 0; l < 3; l++) {
          const lw = h * (0.34 - l * 0.08);
          ctx.beginPath();
          ctx.moveTo(bx - lw, gy - h * (0.3 + l * 0.22));
          ctx.lineTo(bx + lw, gy - h * (0.3 + l * 0.22));
          ctx.lineTo(bx, gy - h * (0.55 + l * 0.22));
          ctx.closePath();
          ctx.fill();
        }
      }
      break;
    }
    case 'palms': {
      for (const [fx, s2] of [[0.1, 1], [0.88, 1.15]] as Array<[number, number]>) {
        const bx = W * fx;
        const h = gy * 0.55 * s2;
        ctx.strokeStyle = '#8a6a48';
        ctx.lineWidth = h * 0.06;
        ctx.beginPath();
        ctx.moveTo(bx, gy);
        ctx.quadraticCurveTo(bx + h * 0.08, gy - h * 0.5, bx + h * 0.16, gy - h);
        ctx.stroke();
        ctx.strokeStyle = '#4f8f5c';
        ctx.lineWidth = h * 0.05;
        ctx.lineCap = 'round';
        for (const da of [-1.1, -0.5, 0.1, 0.7, 1.3]) {
          ctx.beginPath();
          ctx.moveTo(bx + h * 0.16, gy - h);
          ctx.quadraticCurveTo(
            bx + h * 0.16 + Math.cos(da) * h * 0.3,
            gy - h - Math.sin(da) * h * 0.1 - h * 0.12,
            bx + h * 0.16 + Math.cos(da) * h * 0.5,
            gy - h - Math.sin(da) * h * 0.06 + h * 0.08
          );
          ctx.stroke();
        }
      }
      // sea band
      ctx.fillStyle = '#7fd0e8';
      ctx.fillRect(0, gy - H * 0.045, W, H * 0.045);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      for (let i = 0; i < 14; i++) {
        const sx = ((i * 83.7 + 5) % 100) / 100 * W;
        const sy = gy - H * 0.045 + ((i * 31) % 3) + Math.sin(t * 1.6 + i) * 1.5;
        ctx.fillRect(sx, sy, 14 + (i % 3) * 6, 1.6);
      }
      break;
    }
    default:
      break;
  }
  ctx.restore();

  // ground
  ctx.fillStyle = env.ground;
  ctx.fillRect(0, gy, W, H - gy);
  ctx.fillStyle = env.groundDark;
  ctx.fillRect(0, gy, W, Math.max(2, H * 0.006));
  for (let i = 0; i < 10; i++) {
    const gx = ((i * 71.3 + 13) % 100) / 100 * W;
    const gyy = gy + ((i * 37.9 + 7) % 100) / 100 * (H - gy);
    ellipse(ctx, gx, gyy, 18 + (i % 4) * 9, 3 + (i % 2) * 2, 'rgba(0,0,0,0.05)');
  }

  // env light intensity
  const li = s.envLightIntensity;
  if (li < 0.99) {
    ctx.fillStyle = `rgba(10,10,20,${clamp((1 - li) * 0.45, 0, 0.6)})`;
    ctx.fillRect(0, 0, W, H);
  } else if (li > 1.01) {
    ctx.fillStyle = `rgba(255,252,240,${clamp((li - 1) * 0.25, 0, 0.35)})`;
    ctx.fillRect(0, 0, W, H);
  }
}

function drawScene(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  const s = useSettings.getState();
  ctx.clearRect(0, 0, W, H);
  const portrait = H > W;
  const gy = H * (portrait ? 0.68 : 0.74) + st2.camDy * H - st2.gyLift * H;
  const u = (Math.min(W, H) / 4.9) * s.position.scale * st2.camZoom;
  const cx = W / 2 + s.position.x * u * 0.4;

  drawEnvironment(ctx, W, H, gy, s);
  drawCat(ctx, u, cx, gy, s);
  // smallest / most specific regions win regardless of draw order
  hitRegions.sort((a, b) => a.prio - b.prio);
}

// ============================================================ component

export function Cat2D(): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pressedRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let last = performance.now();
    let cw = 0;
    let ch = 0;

    const cleanup = initGestureCleanup();

    // window-level pointer tracking for the look-at behaviour
    const onWinMove = (e: PointerEvent): void => {
      ptr.x = (e.clientX / window.innerWidth) * 2 - 1;
      ptr.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('pointermove', onWinMove);

    const frame = (now: number): void => {
      const dt = Math.max((now - last) / 1000, 0.0001);
      last = now;
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (rect.width !== cw || rect.height !== ch || canvas.width !== Math.round(rect.width * dpr)) {
        cw = rect.width;
        ch = rect.height;
        canvas.width = Math.round(cw * dpr);
        canvas.height = Math.round(ch * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      step2D(dt);
      drawScene(ctx, cw, ch);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const regionAt = (e: PointerEvent): string => {
      const r = canvas.getBoundingClientRect();
      return hitTest(e.clientX - r.left, e.clientY - r.top);
    };

    const onDown = (e: PointerEvent): void => {
      const region = regionAt(e);
      if (!region) return;
      canvas.setPointerCapture(e.pointerId);
      pressedRef.current = true;
      pointerDown(region, e);
    };
    const onMove = (e: PointerEvent): void => {
      if (pressedRef.current) {
        pointerMove(regionAt(e), e);
      } else {
        // hover cursor affordance
        canvas.style.cursor = regionAt(e) ? 'grab' : 'default';
      }
    };
    const onUp = (e: PointerEvent): void => {
      if (!pressedRef.current) return;
      pressedRef.current = false;
      pointerUp(e);
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);

    return () => {
      cancelAnimationFrame(raf);
      cleanup();
      window.removeEventListener('pointermove', onWinMove);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full touch-none select-none"
      aria-label="Interactive cat — pet her with your pointer"
    />
  );
}
