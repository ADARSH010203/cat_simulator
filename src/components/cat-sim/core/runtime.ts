// Shared mutable per-frame runtime state.
// React state is NEVER used for per-frame animation values (spec rule 0.6).
// Everything here is read/written inside useFrame at 60fps.

import type { MutableRefObject } from 'react';
import type { Group, Mesh, MeshStandardMaterial } from 'three';

export type CatStateId =
  | 'idle-stand'
  | 'idle-sit'
  | 'loaf'
  | 'lie-side'
  | 'sleep'
  | 'wake'
  | 'stretch'
  | 'yawn'
  | 'groom'
  | 'knead'
  | 'pounce'
  | 'zoomies'
  | 'walk'
  | 'turn';

export type EchoStateId = 'EchoOff' | 'EchoIdle' | 'Listening' | 'Processing' | 'Speaking' | 'Recover';

export type ReactionId =
  | 'head-stroke'
  | 'cheek-rub'
  | 'chin-scratch'
  | 'ear-tap'
  | 'back-stroke'
  | 'belly-tap'
  | 'paw-tap'
  | 'tail-tap'
  | 'nose-tap'
  | 'whisker-touch'
  | 'double-tap'
  | 'poke-spam'
  | 'startle';

export interface Rig {
  root: Group;
  hips: Group;
  tail: Group[];
  spine2: Group;
  chest: Group;
  neck: Group;
  head: Group;
  jaw: Group;
  earL: Group;
  earR: Group;
  eyeL: Group;
  eyeR: Group;
  pupilL: Mesh;
  pupilR: Mesh;
  lidUL: Group;
  lidUR: Group;
  lidLL: Group;
  lidLR: Group;
  whiskerL: Group;
  whiskerR: Group;
  legFL: Group;
  legFR: Group;
  legBL: Group;
  legBR: Group;
  kneeFL: Group;
  kneeFR: Group;
  kneeBL: Group;
  kneeBR: Group;
  pawFL: Group;
  pawFR: Group;
  pawBL: Group;
  pawBR: Group;
}

/** A single active (or held) touch reaction with envelope timing. */
export interface ActiveReaction {
  id: ReactionId;
  t0: number; // runtime seconds when started
  dur: number; // seconds; Infinity for held (continuous strokes)
  hold: boolean;
}

export interface CatRuntime {
  /** scaled animation clock (respects pause + speed slider) */
  t: number;
  /** wall clock for non-pausable UI things */
  wall: number;
  paused: boolean;
  speed: number;

  // ---- pose channels (damped every frame) ----
  pose: Record<string, number>;

  // ---- additive layer state ----
  blink: number; // 0 open .. 1 closed
  blinkTimer: number;
  blinkDur: number;
  blinkT0: number;
  blinkKind: 'normal' | 'slow' | 'double';
  purrManual: boolean;
  lastJawPeak: number;
  turnDir: number | undefined;
  pupil: number; // dilation 0.35..1.4
  breath: number; // 0..1
  jawAudio: number; // 0..1 lip-sync RMS
  purrLevel: number; // 0..1 smoothed purr gain
  purrTarget: number;
  earTwitchL: number;
  earTwitchR: number;
  whiskerSpringL: number;
  whiskerSpringV: number;
  whiskerSpringR: number;
  whiskerSpringVR: number;
  headLook: { x: number; y: number; active: boolean };

  // ---- locomotion ----
  posX: number;
  posZ: number;
  yaw: number;
  walkPhase: number;
  walkTarget: { x: number; z: number } | null;
  hopY: number;

  // ---- state machine ----
  state: CatStateId;
  stateT0: number;
  stateDur: number; // auto-exit duration (Infinity = until event)
  prevState: CatStateId;

  // ---- behaviour director ----
  nextDecision: number;
  lastAction: CatStateId | null;
  actionCooldowns: Partial<Record<CatStateId, number>>;

  // ---- reactions ----
  reaction: ActiveReaction | null;
  pettingSince: number | null; // runtime sec when continuous petting started
  petChain: number; // accumulated petting time
  pokeCount: number;
  pokeWindowT0: number;
  annoyedT: number; // runtime sec until which cat is annoyed
  tailLashBoost: number;
  tailTaps: number;
  startleT: number;

  // ---- state queue (petting chain, scripted sequences) ----
  queue: CatStateId[];

  // ---- needs / mood (mirrored to zustand at low frequency) ----
  affection: number; // 0..100
  energy: number; // 0..100

  // ---- echo / voice ----
  echoState: EchoStateId;
  ttsJaw: number; // synthetic jaw envelope for TTS speaking
  micLevel: number; // 0..1 for UI meter

  // ---- commands from UI ----
  command: { id: number; action: string } | null;

  // ---- fps adaptive quality ----
  fps: number;

  // ---- rig refs (assigned once mounted) ----
  rig: Rig | null;
  /** cat head projected to screen % (for HTML overlays like hearts) */
  screenPos: { x: number; y: number };
  headWorldPos: MutableRefObject<{ x: number; y: number; z: number }> | null;
}

const DEFAULT_POSE: Record<string, number> = {
  bodyY: 0.36,
  bodyPitch: 0,
  bodyRZ: 0,
  spineRX: 0,
  spineRY: 0,
  chestRX: 0,
  neckRX: 0,
  neckRY: 0,
  neckRZ: 0,
  headRX: 0,
  headRY: 0,
  headRZ: 0,
  jawRX: 0,
  earLRX: 0,
  earLRY: 0,
  earRRX: 0,
  earRRY: 0,
  eyeLRX: 0,
  eyeLRY: 0,
  eyeRRX: 0,
  eyeRRY: 0,
  whiskerLPerk: 0,
  whiskerRPerk: 0,
  flHip: 0,
  flKnee: 0,
  frHip: 0,
  frKnee: 0,
  blHip: 0,
  blKnee: 0,
  brHip: 0,
  brKnee: 0,
  flPaw: 0,
  frPaw: 0,
  blPaw: 0,
  brPaw: 0,
  tailCurl: 0.45,
  tailSway: 0,
  tailLash: 0,
  earFlat: 0,
  squint: 0,
  tilt: 0,
};

export function createRuntime(): CatRuntime {
  return {
    t: 0,
    wall: 0,
    paused: false,
    speed: 1,
    pose: { ...DEFAULT_POSE },
    blink: 0,
    blinkTimer: 2,
    blinkDur: 0.18,
    blinkT0: -10,
    blinkKind: 'normal',
    purrManual: false,
    lastJawPeak: -1,
    turnDir: undefined,
    pupil: 0.8,
    breath: 0,
    jawAudio: 0,
    purrLevel: 0,
    purrTarget: 0,
    earTwitchL: 0,
    earTwitchR: 0,
    whiskerSpringL: 0,
    whiskerSpringV: 0,
    whiskerSpringR: 0,
    whiskerSpringVR: 0,
    headLook: { x: 0, y: 0, active: false },
    posX: 0,
    posZ: 0,
    yaw: 0,
    walkPhase: 0,
    walkTarget: null,
    hopY: 0,
    state: 'idle-sit',
    stateT0: 0,
    stateDur: 6,
    prevState: 'idle-stand',
    nextDecision: 4,
    lastAction: null,
    actionCooldowns: {},
    reaction: null,
    pettingSince: null,
    petChain: 0,
    pokeCount: 0,
    pokeWindowT0: 0,
    annoyedT: -1,
    tailLashBoost: 0,
    tailTaps: 0,
    startleT: -1,
    queue: [],
    affection: 55,
    energy: 70,
    echoState: 'EchoOff',
    ttsJaw: 0,
    micLevel: 0,
    command: null,
    fps: 60,
    rig: null,
    screenPos: { x: 50, y: 55 },
    headWorldPos: null,
  };
}

/** Module-level singleton shared by every system. */
export const runtime: CatRuntime = createRuntime();

/** Lint-safe setters for the rig (direct module mutation trips react-hooks rules). */
export function setRig(rig: Rig | null): void {
  runtime.rig = rig;
}

export function setHeadWorldPos(ref: CatRuntime['headWorldPos']): void {
  runtime.headWorldPos = ref;
}

export const resetPoseToDefaults = (pose: Record<string, number>): void => {
  Object.assign(pose, DEFAULT_POSE);
};

export type { MeshStandardMaterial };
