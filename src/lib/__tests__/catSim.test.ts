/// <reference types="bun-types" />
// Unit tests for the echo state machine (spec 5.6: "write unit tests for all
// transitions") and the base-state transition resolver.
// Run with: bun test
// Types come from bun-types (dev dependency).

import { describe, expect, test } from 'bun:test';
import { nextEchoState, echoIsActive } from '@/components/cat-sim/voice/echoStateMachine';
import { resolvePath } from '@/components/cat-sim/core/stateMachine';
import type { CatStateId } from '@/components/cat-sim/core/runtime';

describe('echo state machine', () => {
  test('echo stays off until enabled', () => {
    expect(nextEchoState('EchoOff', 'START')).toBe('EchoOff');
    expect(nextEchoState('EchoOff', 'ENABLE')).toBe('EchoIdle');
  });

  test('idle → listening on start', () => {
    expect(nextEchoState('EchoIdle', 'START')).toBe('Listening');
  });

  test('listening → processing on end of speech', () => {
    expect(nextEchoState('Listening', 'END_SPEECH')).toBe('Processing');
  });

  test('listening → idle on timeout (silence / blip)', () => {
    expect(nextEchoState('Listening', 'TIMEOUT')).toBe('EchoIdle');
  });

  test('processing → speaking when audio is ready', () => {
    expect(nextEchoState('Processing', 'AUDIO_READY')).toBe('Speaking');
  });

  test('recording defers playback back to idle (mic & speaker are separate)', () => {
    let s = nextEchoState('EchoOff', 'ENABLE');
    s = nextEchoState(s, 'START');
    s = nextEchoState(s, 'END_SPEECH');
    expect(s).toBe('Processing');
    s = nextEchoState(s, 'DEFER');
    expect(s).toBe('EchoIdle');
  });

  test('repeat button starts speaking from idle and recover', () => {
    expect(nextEchoState('EchoIdle', 'SPEAK_START')).toBe('Speaking');
    expect(nextEchoState('Recover', 'SPEAK_START')).toBe('Speaking');
    // already speaking — no state change, no crash
    expect(nextEchoState('Speaking', 'SPEAK_START')).toBe('Speaking');
  });

  test('speaking → recover when done or interrupted', () => {
    expect(nextEchoState('Speaking', 'SPEAK_END')).toBe('Recover');
    expect(nextEchoState('Speaking', 'INTERRUPT')).toBe('Recover');
  });

  test('recover → idle, then can listen again immediately', () => {
    expect(nextEchoState('Recover', 'RECOVER_DONE')).toBe('EchoIdle');
    expect(nextEchoState('Recover', 'START')).toBe('Listening');
  });

  test('disable works from any active state', () => {
    for (const s of ['EchoIdle', 'Listening', 'Processing', 'Speaking', 'Recover'] as const) {
      expect(nextEchoState(s, 'DISABLE')).toBe('EchoOff');
    }
  });

  test('unknown events keep the state (no crash)', () => {
    expect(nextEchoState('EchoOff', 'SPEAK_END')).toBe('EchoOff');
    expect(nextEchoState('Listening', 'AUDIO_READY')).toBe('Listening');
  });

  test('listening and speaking outrank other layers', () => {
    expect(echoIsActive('Listening')).toBe(true);
    expect(echoIsActive('Speaking')).toBe(true);
    expect(echoIsActive('Processing')).toBe(true);
    expect(echoIsActive('EchoOff')).toBe(false);
    expect(echoIsActive('EchoIdle')).toBe(false);
    expect(echoIsActive('Recover')).toBe(false);
  });
});

describe('base state machine transitions', () => {
  test('sleep never goes straight to walk — it wakes first', () => {
    const path = resolvePath('sleep', 'walk');
    expect(path[0]).toBe('wake');
    expect(path).toContain('stretch');
    expect(path[path.length - 1]).toBe('walk');
  });

  test('sleep → loaf is allowed directly', () => {
    expect(resolvePath('sleep', 'loaf')).toEqual(['loaf']);
  });

  test('idle-sit → walk is a single step', () => {
    expect(resolvePath('idle-sit', 'walk')).toEqual(['walk']);
  });

  test('sit → sleep routes through a neutral state', () => {
    const path = resolvePath('idle-sit', 'sleep');
    expect(path.length).toBeGreaterThan(1);
    expect(path[path.length - 1]).toBe('sleep');
  });

  test('stretch always returns to idle-stand', () => {
    expect(resolvePath('stretch', 'idle-stand')).toEqual(['idle-stand']);
  });

  test('same-state requests are idempotent', () => {
    expect(resolvePath('idle-sit', 'idle-sit')).toEqual(['idle-sit']);
  });

  test('lying down states reach active states via idle-stand', () => {
    const path = resolvePath('lie-side', 'groom' as CatStateId);
    expect(path[0]).toBe('idle-stand');
    expect(path[path.length - 1]).toBe('groom');
  });
});
