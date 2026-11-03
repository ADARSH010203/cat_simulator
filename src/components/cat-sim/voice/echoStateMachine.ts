// Pure echo state machine — spec 5.6. Unit-tested in src/lib/__tests__.

export type EchoStateId = 'EchoOff' | 'EchoIdle' | 'Listening' | 'Processing' | 'Speaking' | 'Recover';

export type EchoEvent =
  | 'ENABLE'
  | 'DISABLE'
  | 'START'
  | 'END_SPEECH'
  | 'TIMEOUT'
  | 'AUDIO_READY'
  | 'SPEAK_START'
  | 'SPEAK_END'
  | 'RECOVER_DONE'
  | 'INTERRUPT';

const TABLE: Record<EchoStateId, Partial<Record<EchoEvent, EchoStateId>>> = {
  EchoOff: { ENABLE: 'EchoIdle' },
  EchoIdle: { DISABLE: 'EchoOff', START: 'Listening' },
  Listening: { END_SPEECH: 'Processing', TIMEOUT: 'EchoIdle', DISABLE: 'EchoOff', INTERRUPT: 'EchoIdle' },
  Processing: { AUDIO_READY: 'Speaking', TIMEOUT: 'EchoIdle', DISABLE: 'EchoOff' },
  Speaking: { SPEAK_END: 'Recover', INTERRUPT: 'Recover', DISABLE: 'EchoOff' },
  Recover: { RECOVER_DONE: 'EchoIdle', DISABLE: 'EchoOff', START: 'Listening' },
};

export function nextEchoState(state: EchoStateId, event: EchoEvent): EchoStateId {
  return TABLE[state][event] ?? state;
}

/** Listening and Speaking outrank touch reactions and autonomous behaviour. */
export function echoIsActive(state: EchoStateId): boolean {
  return state === 'Listening' || state === 'Speaking' || state === 'Processing';
}
