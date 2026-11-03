'use client';

// Touch / gesture recognition + reaction map + mood updates.
// Hit proxies call into these handlers; effects are applied by the animation
// layer via `runtime.reaction` (never directly mutating the rig here).

import { runtime, type ReactionId, type CatStateId } from '../core/runtime';
import { catAudio } from '../audio/sounds';
import { useCatLive } from '@/store/catStateStore';
import { useSettings } from '@/store/settingsStore';
import { useKid } from '@/store/kidStore';
import { voiceController } from '../voice/engines';

/** Registered by the scene so gestures can temporarily block camera orbit. */
export const orbitHook = {
  disable: (): void => {},
  enable: (): void => {},
};

interface ReactionDef {
  dur: number; // seconds
  cooldown: number;
  text: string;
  affection?: number;
  energy?: number;
  sound?: () => void;
}

/** Spec 2.2 reaction map. */
export const REACTIONS: Record<ReactionId, ReactionDef> = {
  'head-stroke': { dur: Infinity, cooldown: 0, text: 'leans into your hand…', affection: 0 },
  'cheek-rub': { dur: 1.4, cooldown: 1.5, text: 'bumps her head on you', affection: 4, sound: () => catAudio.chirp() },
  'chin-scratch': { dur: 1.2, cooldown: 1.0, text: 'stretches her chin', affection: 4 },
  'ear-tap': { dur: 0.9, cooldown: 1.0, text: 'flicks her ear', affection: 1, sound: () => catAudio.prrt() },
  'back-stroke': { dur: Infinity, cooldown: 0, text: 'arches her back', affection: 0 },
  'belly-tap': { dur: 2.2, cooldown: 3.0, text: 'rolls around', affection: 2, sound: () => catAudio.chirp() },
  'paw-tap': { dur: 0.9, cooldown: 1.2, text: 'tucks her paw away', sound: () => catAudio.squeak() },
  'tail-tap': { dur: 1.0, cooldown: 1.0, text: 'flicks her tail', sound: () => catAudio.prrt() },
  'nose-tap': { dur: 1.1, cooldown: 2.0, text: 'sneezes!', affection: 1, sound: () => catAudio.sneeze() },
  'whisker-touch': { dur: 0.8, cooldown: 1.0, text: 'twitches her whiskers' },
  'double-tap': { dur: 1.6, cooldown: 2.0, text: 'pounces happily', affection: 5, energy: -4, sound: () => catAudio.chirp() },
  'poke-spam': { dur: 2.5, cooldown: 6.0, text: 'is annoyed and walks away', affection: -6, sound: () => catAudio.meow('annoyed') },
  startle: { dur: 1.2, cooldown: 3.0, text: 'is startled!', sound: () => catAudio.squeak() },
};

const gesture = {
  down: false,
  downRegion: '',
  downT: 0,
  lastX: 0,
  lastY: 0,
  moved: 0,
  lastRegion: '',
  strokeAcc: 0,
  strokeT: 0,
  lastTapT: -10,
  tapRegion: '',
  holding: false,
  holdTimer: 0 as unknown as ReturnType<typeof setTimeout>,
  lastReactionAt: {} as Record<string, number>,
};

export function haptic(): void {
  const s = useSettings.getState();
  if (s.haptics && typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(12);
  }
}

export function playReaction(id: ReactionId, now?: number): void {
  const def = REACTIONS[id];
  const t = now ?? runtime.t;
  const key = id;
  if (gesture.lastReactionAt[key] && t - gesture.lastReactionAt[key] < def.cooldown) return;
  gesture.lastReactionAt[key] = t;
  runtime.reaction = { id, t0: t, dur: def.dur, hold: def.dur === Infinity };
  if (def.sound) def.sound();
  if (def.affection) runtime.affection = Math.max(0, Math.min(100, runtime.affection + def.affection));
  if (def.energy) runtime.energy = Math.max(0, Math.min(100, runtime.energy + def.energy));
  const live = useCatLive.getState();
  live.pushReactionText(def.text);
  live.setLive({ reaction: id });
}

function beginPetting(): void {
  if (runtime.pettingSince === null) runtime.pettingSince = runtime.t;
  catAudio.startPurr();
}

function endPetting(): void {
  runtime.pettingSince = null;
  runtime.petChain = 0;
  runtime.purrTarget = 0;
  catAudio.stopPurr();
}

// ---------------------------------------------------------------- handlers

export function pointerDown(region: string, e: PointerEvent | MouseEvent): void {
  const now = performance.now() / 1000;
  gesture.down = true;
  gesture.downRegion = region;
  gesture.downT = now;
  gesture.lastX = e.clientX;
  gesture.lastY = e.clientY;
  gesture.moved = 0;
  gesture.lastRegion = region;
  gesture.strokeAcc = 0;
  orbitHook.disable();
  haptic();

  // touching the cat while she speaks → surprised squeak + stop (spec 5.5)
  if (runtime.echoState === 'Speaking') {
    voiceController.interrupt();
  }

  clearTimeout(gesture.holdTimer);
  gesture.holdTimer = setTimeout(() => {
    if (gesture.down && gesture.moved < 14) {
      gesture.holding = true;
      beginPetting();
    }
  }, 480);
}

export function pointerMove(region: string, e: PointerEvent | MouseEvent): void {
  if (!gesture.down) return;
  const dx = e.clientX - gesture.lastX;
  const dy = e.clientY - gesture.lastY;
  gesture.lastX = e.clientX;
  gesture.lastY = e.clientY;
  const d = Math.hypot(dx, dy);
  gesture.moved += d;

  if (gesture.moved > 10) {
    gesture.holding = false;
    clearTimeout(gesture.holdTimer);
  }

  // stroke across the cat
  if (gesture.moved > 14) {
    gesture.strokeAcc += d;
    const now = performance.now() / 1000;
    const dt = Math.max(0.016, now - gesture.strokeT);
    gesture.strokeT = now;
    const speed = Math.min(1, d / dt / 900);
    runtime.purrTarget = 0.35 + speed * 0.65;
    if (!runtime.reaction || !runtime.reaction.hold) beginPetting();
    if (runtime.pettingSince === null) beginPetting();

    // every ~30px of stroke = one reaction tick
    if (gesture.strokeAcc > 30) {
      gesture.strokeAcc = 0;
      runtime.affection = Math.min(100, runtime.affection + 1.2);
      runtime.petChain += dt;
      const r = gesture.downRegion === 'back' || gesture.lastRegion === 'back' ? 'back-stroke' : 'head-stroke';
      runtime.reaction = { id: r as ReactionId, t0: runtime.t, dur: Infinity, hold: true };
      catAudio.setPurrLevel(runtime.purrTarget, speed);
      useKid.getState().bumpStroke(1);
    }
    // region crossing → region-specific stroke reaction
    if (region !== gesture.lastRegion) {
      if (region === 'cheekL' || region === 'cheekR') playReaction('cheek-rub');
      if (region === 'chin') playReaction('chin-scratch');
      gesture.lastRegion = region;
    }
  }
}

export function pointerUp(e: PointerEvent | MouseEvent): void {
  if (!gesture.down) return;
  void e;
  const now = performance.now() / 1000;
  const dur = now - gesture.downT;
  const wasTap = gesture.moved < 12 && dur < 0.55 && !gesture.holding;
  const region = gesture.downRegion;

  clearTimeout(gesture.holdTimer);
  if (gesture.holding || runtime.reaction?.hold) {
    gesture.holding = false;
    endPetting();
  }

  if (wasTap) {
    // poke spam detection: 6+ taps in 3 s
    const pokeWindow = now - runtime.pokeWindowT0;
    if (pokeWindow > 3) {
      runtime.pokeCount = 0;
      runtime.pokeWindowT0 = now;
    }
    runtime.pokeCount++;

    // double tap?
    if (now - gesture.lastTapT < 0.32 && gesture.tapRegion === region) {
      playReaction('double-tap');
      gesture.lastTapT = -10;
    } else {
      gesture.lastTapT = now;
      gesture.tapRegion = region;

      if (runtime.pokeCount >= 6) {
        playReaction('poke-spam');
        runtime.annoyedT = runtime.t + 6;
        runtime.pokeCount = 0;
      } else {
        tapReaction(region);
      }
    }
  }

  gesture.down = false;
  gesture.downRegion = '';
  orbitHook.enable();
}

function tapReaction(region: string): void {
  switch (region) {
    case 'head':
    case 'forehead':
      playReaction('cheek-rub');
      break;
    case 'cheekL':
    case 'cheekR':
      playReaction('cheek-rub');
      break;
    case 'chin':
      playReaction('chin-scratch');
      break;
    case 'earL':
    case 'earR':
      playReaction('ear-tap');
      break;
    case 'belly':
      // high trust + lying down → roll & knead, otherwise playful grab
      if (runtime.affection > 70 && ['loaf', 'lie-side', 'sleep'].includes(runtime.state)) {
        queueStates(['knead', 'idle-sit']);
        playReaction('belly-tap');
      } else {
        playReaction('belly-tap');
        if (runtime.affection < 40) catAudio.hiss();
      }
      break;
    case 'pawFL':
    case 'pawFR':
    case 'pawBL':
    case 'pawBR':
      playReaction('paw-tap');
      break;
    case 'tailBase':
    case 'tailMid':
    case 'tailTip':
      playReaction('tail-tap');
      if (runtime.reaction?.id === 'tail-tap') {
        runtime.tailLashBoost = 2.2;
        runtime.tailTaps = (runtime.tailTaps ?? 0) + 1;
        if (runtime.tailTaps > 2) runtime.annoyedT = runtime.t + 4;
      }
      break;
    case 'nose':
      playReaction('nose-tap');
      break;
    case 'whiskersL':
    case 'whiskersR':
      playReaction('whisker-touch');
      break;
    case 'back':
    case 'flankL':
    case 'flankR':
    case 'neck':
      playReaction('ear-tap');
      break;
    default:
      playReaction('ear-tap');
      break;
  }
}

/** Queue a sequence of base states (used by petting chain & belly roll). */
export function queueStates(states: CatStateId[]): void {
  runtime.queue.push(...states);
}

export function initGestureCleanup(): () => void {
  const onVisibility = (): void => {
    if (document.hidden) endPetting();
  };
  document.addEventListener('visibilitychange', onVisibility);
  return () => document.removeEventListener('visibilitychange', onVisibility);
}
