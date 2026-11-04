'use client';

// Talking Echo Mode — two engines, one interface (spec 5.2).
// Engine A (Recorded): getUserMedia + AudioWorklet PCM capture (ScriptProcessor
//   fallback), VAD with hysteresis, playback with playbackRate shift.
//   Raw PCM capture avoids MediaRecorder codec + decodeAudioData issues
//   entirely (Safari webm/AAC decode failures, headless quirks, missing
//   MediaRecorder in some WebViews).
// Engine B (TTS): SpeechRecognition → SpeechSynthesis, high pitch.
// Auto: Engine A drives audio + lip-sync; recognition only adds subtitles.

import { runtime } from '../core/runtime';
import { catAudio } from '../audio/sounds';
import { useSettings, type EchoEngineId } from '@/store/settingsStore';
import { useCatLive } from '@/store/catStateStore';
import { nextEchoState, type EchoStateId, type EchoEvent } from './echoStateMachine';

// ---------------- minimal Web Speech typings ----------------
interface SRAlternative {
  transcript: string;
  confidence: number;
}
interface SRResult {
  isFinal: boolean;
  length: number;
  [index: number]: SRAlternative;
}
interface SREvent {
  resultIndex: number;
  results: { length: number; [index: number]: SRResult };
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SREvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}
type SRCtor = new () => SpeechRecognitionLike;

export const getSpeechRecognition = (): SRCtor | null => {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export const isTtsSpeakSupported = (): boolean =>
  typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

export const isSecure = (): boolean =>
  typeof window !== 'undefined' && (window.isSecureContext || location.hostname === 'localhost');

/**
 * True when the page runs inside a cross-origin iframe — browsers block
 * getUserMedia there unless the embedder set allow="microphone".
 * (Preview/hosting wrappers often don't.)
 */
export function inCrossOriginIframe(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.self === window.top) return false;
    // same-origin iframe? then the top window is reachable
    void window.top?.location.href;
    return false;
  } catch {
    return true;
  }
}

// ---------------- AudioWorklet source (raw PCM tap) ----------------
const WORKLET_SRC = `
class MochiRecProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._pending = [];
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      this._pending.push(new Float32Array(ch));
      if (this._pending.length >= 8) {
        this.port.postMessage(this._pending);
        this._pending = [];
      }
    }
    return true;
  }
}
registerProcessor('mochi-rec', MochiRecProcessor);
`;

// ---------------- VAD ----------------
class Vad {
  noiseFloor = 0.006;
  speaking = false;
  speechT0 = 0;
  lastVoiceT = 0;
  startedAt = 0;

  reset(): void {
    this.noiseFloor = 0.006;
    this.speaking = false;
    this.speechT0 = 0;
    this.lastVoiceT = 0;
    this.startedAt = performance.now() / 1000;
  }

  /** Feed an RMS value; returns 'end' when the utterance is complete. */
  update(rms: number, sensitivity: number, now: number): 'none' | 'start' | 'voice' | 'end' {
    // adaptive noise floor (tracks quiet room level)
    if (!this.speaking && rms < this.noiseFloor * 2) {
      this.noiseFloor = Math.max(0.0015, this.noiseFloor * 0.998 + rms * 0.002);
    }
    const th1 = Math.max(this.noiseFloor * 2.2, 0.01 + (1 - sensitivity) * 0.035);
    const th0 = th1 * 0.5;
    const elapsed = now - this.startedAt;

    if (!this.speaking && rms > th1 && elapsed > 0.12) {
      this.speaking = true;
      this.speechT0 = now;
      this.lastVoiceT = now;
      return 'start';
    }
    if (this.speaking) {
      if (rms > th0) this.lastVoiceT = now;
      const silence = now - this.lastVoiceT;
      const voiceLen = this.lastVoiceT - this.speechT0;
      if (silence > 0.8 && voiceLen >= 0.2) {
        this.speaking = false;
        return 'end';
      }
      if (now - this.speechT0 > 15) {
        this.speaking = false;
        return 'end';
      }
      return 'voice';
    }
    // blips shorter than 0.2 s are ignored by requiring voiceLen above
    return 'none';
  }
}

// ---------------- controller ----------------
type Utterance = { kind: 'buffer'; buffer: AudioBuffer } | { kind: 'text'; text: string };

const MAX_CAPTURE_SECONDS = 20;

export class VoiceController {
  state: EchoStateId = 'EchoOff';
  engine: EchoEngineId = 'auto';
  lastUtterance: Utterance | null = null;
  onStateChange: ((s: EchoStateId) => void) | null = null;
  onSubtitle: ((text: string, isFinal: boolean) => void) | null = null;
  onError: ((msg: string) => void) | null = null;

  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private listenAnalyser: AnalyserNode | null = null;
  private captureSink: GainNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private spNode: ScriptProcessorNode | null = null;
  private pcmChunks: Float32Array[] = [];
  private pcmTotal = 0;
  private pcmSampleRate = 0;
  private starting = false;
  /** release received while the mic was still opening (permission prompt) */
  private stopRequested = false;
  /** AudioWorklet module: registered once per page, reused across sessions */
  private workletState: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';
  /** bumped on every stop/cancel — lets a pending start abort cleanly */
  private startSeq = 0;
  private vad = new Vad();
  private vadTimer: number | null = null;
  private listenGuard: number | null = null;
  private levelData: Uint8Array<ArrayBuffer> | null = null;
  private recognition: SpeechRecognitionLike | null = null;
  private finalTranscript = '';
  private playbackAnalyser: AnalyserNode | null = null;
  private playbackSource: AudioBufferSourceNode | null = null;
  private playbackGain: GainNode | null = null;
  private rafId: number | null = null;
  private handsfree = false;

  private get ctx(): AudioContext | null {
    return catAudio.context;
  }

  private fire(event: EchoEvent): void {
    this.state = nextEchoState(this.state, event);
    this.onStateChange?.(this.state);
    runtime.echoState = this.state;
    useCatLive.getState().setLive({ echoState: this.state });
  }

  // ---------------- lifecycle ----------------

  setEngine(e: EchoEngineId): void {
    this.engine = e;
  }

  async enable(): Promise<void> {
    const v = useSettings.getState().voice;
    if (v.engine === 'tts' && !isTtsSpeakSupported()) {
      this.onError?.('Speech recognition is not supported in this browser — using Recorded engine instead.');
      this.engine = 'recorded';
    } else {
      this.engine = v.engine;
    }
    if (!isSecure()) {
      this.onError?.('Microphone needs HTTPS (or localhost). Echo Mode audio capture is blocked on insecure pages.');
    }
    this.fire('ENABLE');
  }

  disable(): void {
    this.cancelAll();
    this.fire('DISABLE');
  }

  cancelAll(): void {
    this.startSeq++; // abort any start still waiting on the permission prompt
    this.starting = false;
    this.stopRequested = false;
    this.stopVadLoop();
    this.disarmListenGuard();
    this.stopRecognition();
    this.teardownCapture();
    this.releaseMic();
    this.stopPlayback(true);
    this.handsfree = false;
    useCatLive.getState().setLive({ micRequesting: false });
  }

  // ---------------- mic ----------------

  private async getMic(retry = true): Promise<MediaStream> {
    if (this.stream) return this.stream;
    const v = useSettings.getState().voice;
    const constraints: MediaStreamConstraints = {
      audio: {
        echoCancellation: true,
        // noiseSuppression eats quiet speech — AGC already lifts the level
        noiseSuppression: false,
        autoGainControl: true,
        ...(v.micId ? { deviceId: { exact: v.micId } } : {}),
      },
    };
    useCatLive.getState().setLive({ micRequesting: true });
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.stream = stream;
      useCatLive.getState().setLive({ permission: 'granted', micError: '', micRequesting: false });
      return stream;
    } catch (err) {
      const name = (err as DOMException)?.name ?? '';
      // a stale device id (mic unplugged) — clear it and retry once with the default mic
      if (name === 'OverconstrainedError' && v.micId && retry) {
        useSettings.getState().setVoice({ micId: '' });
        useCatLive.getState().setLive({ micRequesting: false });
        return this.getMic(false);
      }
      this.handleMicError(name);
      throw err;
    }
  }

  private handleMicError(name: string): void {
    let permission: 'granted' | 'denied' | 'prompt' | 'unsupported' = 'denied';
    let micError = 'Could not start the microphone.';
    let micBlockedByFrame = false;
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      if (inCrossOriginIframe()) {
        micBlockedByFrame = true;
        micError = 'This window blocks the microphone — open Mochi in her own tab and she can hear you.';
      } else if (!isSecure()) {
        micError = 'Microphone needs HTTPS (or localhost) — the browser blocks it on insecure pages.';
      } else {
        micError = 'Microphone permission was denied. Allow it from the address-bar padlock, then tap the mic again.';
      }
    } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      permission = 'unsupported';
      micError = 'No microphone found on this device.';
    } else if (name === 'NotReadableError' || name === 'TrackStartError') {
      micError = 'The microphone is busy in another app — close it and try again.';
    }
    useCatLive.getState().setLive({ permission, micError, micBlockedByFrame, micRequesting: false });
    // surface outside the Voice tab too — a silent mic failure otherwise
    // reads as "the cat doesn't repeat me"
    this.onError?.(micError);
  }

  private releaseMic(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  // ---------------- listening ----------------

  async startListening(handsfree: boolean): Promise<void> {
    if (this.state === 'Listening' || this.state === 'Processing' || this.starting) return;
    this.stopRequested = false; // a stale release from an aborted start must not leak
    this.starting = true;
    const seq = ++this.startSeq;
    this.armStartWatchdog(seq);

    const ctx = catAudio.ensure();
    if (!ctx) {
      if (seq === this.startSeq) this.starting = false;
      this.onError?.('Web Audio is not available in this browser.');
      return;
    }
    if (ctx.state === 'suspended') {
      // never await resume() blindly — outside a user gesture Chrome keeps the
      // promise pending forever, which would hang the whole echo pipeline
      await Promise.race([
        ctx.resume().catch(() => undefined),
        new Promise<void>((r) => setTimeout(r, 300)),
      ]);
    }
    if (seq !== this.startSeq) {
      this.starting = false;
      return;
    }

    let stream: MediaStream;
    try {
      stream = await this.getMic();
    } catch {
      // getMic already surfaced the reason to the UI
      if (seq === this.startSeq) this.starting = false;
      return;
    }
    if (seq !== this.startSeq) {
      // cancelled while the permission prompt was open — release and bail
      stream.getTracks().forEach((t) => t.stop());
      this.starting = false;
      return;
    }
    if (this.state === 'EchoOff') {
      // echo was toggled off while the permission prompt was open
      stream.getTracks().forEach((t) => t.stop());
      this.starting = false;
      return;
    }

    // The button was released while the mic was still opening — on a fresh
    // browser the very first attempt dies right here (the permission prompt
    // steals the press, the release aborts the start, nothing is echoed).
    // Convert the session to hands-free instead so the user can simply talk.
    const promptRecovered = this.stopRequested;
    this.stopRequested = false;
    this.starting = false;
    this.handsfree = handsfree || promptRecovered;
    this.pcmChunks = [];
    this.pcmTotal = 0;
    this.finalTranscript = '';
    this.fire('START');

    this.setupCapture(ctx, stream);
    this.vad.reset();
    this.startVadLoop();
    this.armListenGuard();

    if (promptRecovered) {
      useCatLive
        .getState()
        .pushToast(`${useSettings.getState().catName} can hear you now — just talk, no need to hold the mic!`, 'info');
    }

    // optional subtitles via recognition (Engine A audio, Engine B text)
    const wantSubs = useSettings.getState().voice.subtitles;
    const usingTts = this.engine === 'tts';
    if (wantSubs || usingTts) this.startRecognition(usingTts);
  }

  /** if getUserMedia never settles (hung device / OS dialog), unblock after 10 s */
  private armStartWatchdog(seq: number): void {
    window.setTimeout(() => {
      if (this.starting && seq === this.startSeq) {
        this.startSeq++;
        this.starting = false;
        this.stopRequested = false;
        const msg = 'The microphone took too long to start — tap the mic to try again.';
        useCatLive.getState().setLive({ micRequesting: false, micError: msg });
        this.onError?.(msg);
      }
    }, 10000);
  }

  /** source → analyser (levels/VAD) + zero-gain sink pulling the capture node */
  private setupCapture(ctx: AudioContext, stream: MediaStream): void {
    this.source = ctx.createMediaStreamSource(stream);
    this.listenAnalyser = ctx.createAnalyser();
    this.listenAnalyser.fftSize = 512;
    this.source.connect(this.listenAnalyser);
    this.pcmSampleRate = ctx.sampleRate;

    const sink = ctx.createGain();
    sink.gain.value = 0; // capture only — never feed mic audio to the speakers
    sink.connect(ctx.destination);
    this.captureSink = sink;

    // ScriptProcessor first (synchronous, gap-free), upgrade to AudioWorklet when ready
    this.setupScriptProcessor(ctx, sink);
    if (ctx.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
      if (this.workletState === 'ready') {
        this.attachWorklet(ctx, sink);
        return;
      }
      if (this.workletState !== 'idle') return; // loading or failed — keep ScriptProcessor
      this.workletState = 'loading';
      let url = '';
      try {
        url = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'application/javascript' }));
      } catch {
        this.workletState = 'failed'; // keep ScriptProcessor
        return;
      }
      ctx.audioWorklet
        .addModule(url)
        .then(() => {
          URL.revokeObjectURL(url);
          this.workletState = 'ready';
          if (!this.source || this.state !== 'Listening') return;
          this.attachWorklet(ctx, sink);
        })
        .catch(() => {
          URL.revokeObjectURL(url);
          this.workletState = 'failed';
          /* ScriptProcessor keeps running */
        });
    }
  }

  /** one PCM tap via the (already registered) worklet processor */
  private attachWorklet(ctx: AudioContext, sink: GainNode): void {
    try {
      const node = new AudioWorkletNode(ctx, 'mochi-rec');
      node.port.onmessage = (e: MessageEvent<Float32Array[]>): void => this.onPcm(e.data);
      this.source?.connect(node);
      node.connect(sink);
      // swap the fallback out — one tap, not two
      this.teardownScriptProcessor();
      this.workletNode = node;
    } catch {
      /* ScriptProcessor keeps running */
    }
  }

  private setupScriptProcessor(ctx: AudioContext, sink: GainNode): void {
    if (this.spNode) return;
    try {
      const sp = ctx.createScriptProcessor(2048, 1, 1);
      sp.onaudioprocess = (e: AudioProcessingEvent): void => {
        if (this.state !== 'Listening') return;
        this.onPcm([new Float32Array(e.inputBuffer.getChannelData(0))]);
      };
      this.source?.connect(sp);
      sp.connect(sink);
      this.spNode = sp;
    } catch {
      /* no capture path available — stopListening will surface "didn't hear" */
    }
  }

  private teardownScriptProcessor(): void {
    if (this.spNode) {
      try {
        this.spNode.onaudioprocess = null;
        this.spNode.disconnect();
      } catch {
        /* noop */
      }
      this.spNode = null;
    }
  }

  private teardownCapture(): void {
    this.teardownScriptProcessor();
    if (this.workletNode) {
      try {
        this.workletNode.port.onmessage = null;
        this.workletNode.disconnect();
      } catch {
        /* noop */
      }
      this.workletNode = null;
    }
    this.source?.disconnect();
    this.source = null;
    this.listenAnalyser = null;
    this.captureSink?.disconnect();
    this.captureSink = null;
  }

  private onPcm(chunks: Float32Array[]): void {
    if (this.state !== 'Listening' || !chunks?.length) return;
    for (const c of chunks) {
      this.pcmChunks.push(c);
      this.pcmTotal += c.length;
    }
    if (this.pcmTotal > this.pcmSampleRate * MAX_CAPTURE_SECONDS) {
      void this.stopListening(); // hard cap — repeat what we have
    }
  }

  private startVadLoop(): void {
    this.stopVadLoop();
    const tick = (): void => {
      if (!this.listenAnalyser || this.state !== 'Listening') {
        this.stopVadLoop();
        return;
      }
      const rms = this.readLevel(this.listenAnalyser);
      runtime.micLevel = rms; // live ring + test meter, in hold mode too
      if (this.handsfree) {
        const now = performance.now() / 1000;
        const res = this.vad.update(rms, useSettings.getState().voice.sensitivity, now);
        if (res === 'end') {
          void this.stopListening();
          return;
        }
      }
      this.vadTimer = window.setTimeout(tick, 50);
    };
    this.vadTimer = window.setTimeout(tick, 50);
  }

  private stopVadLoop(): void {
    if (this.vadTimer !== null) {
      clearTimeout(this.vadTimer);
      this.vadTimer = null;
    }
  }

  /** hard cap so a missed pointerup can never leave her listening forever */
  private armListenGuard(): void {
    this.disarmListenGuard();
    this.listenGuard = window.setTimeout(
      () => {
        if (this.state === 'Listening') void this.stopListening();
      },
      MAX_CAPTURE_SECONDS * 1000 + 500,
    );
  }

  private disarmListenGuard(): void {
    if (this.listenGuard !== null) {
      clearTimeout(this.listenGuard);
      this.listenGuard = null;
    }
  }

  async stopListening(): Promise<void> {
    // Still opening the mic? The first-ever getUserMedia can take seconds
    // (permission prompt / audio device cold start) and the user has already
    // released the button. Killing the start here made the first echo
    // attempt fail silently. Remember the release instead and convert the
    // session to hands-free once the mic actually opens.
    if (this.starting) {
      this.stopRequested = true;
      return;
    }
    this.startSeq++;
    if (this.state !== 'Listening') return;
    this.stopVadLoop();
    this.disarmListenGuard();
    const c = this.ctx;
    const chunks = this.pcmChunks;
    const sampleRate = this.pcmSampleRate;
    this.pcmChunks = [];
    this.pcmTotal = 0;

    this.teardownCapture();
    this.stopRecognition();
    this.releaseMic();

    const total = chunks.reduce((n, ch) => n + ch.length, 0);
    if (!c || !sampleRate || total < sampleRate * 0.15) {
      this.fire('TIMEOUT');
      this.nudge('Mochi is listening — hold the mic and speak up a little!');
      return;
    }
    this.fire('END_SPEECH');

    const buffer = c.createBuffer(1, total, sampleRate);
    let off = 0;
    for (const ch of chunks) {
      buffer.getChannelData(0).set(ch, off);
      off += ch.length;
    }
    const trimmed = this.trimSilence(buffer);
    if (trimmed.duration < 0.25) {
      this.fire('TIMEOUT');
      this.nudge('Mochi didn\u2019t hear anything — try speaking a bit louder.');
      return;
    }
    this.lastUtterance = { kind: 'buffer', buffer: trimmed };
    this.fire('AUDIO_READY');
    await this.speakLast();
  }

  /** gentle, always-visible feedback when an echo round-trip comes back empty */
  private nudge(text: string): void {
    useCatLive.getState().pushToast(text, 'info');
    useCatLive.getState().setLive({ subtitle: text });
  }

  /** Trim leading/trailing quiet parts with a peak-relative RMS gate. */
  private trimSilence(buf: AudioBuffer): AudioBuffer {
    const data = buf.getChannelData(0);
    const win = Math.max(1, Math.floor(buf.sampleRate * 0.02));
    let peak = 0;
    for (let i = 0; i < data.length; i += 4) {
      const a = Math.abs(data[i]);
      if (a > peak) peak = a;
    }
    const th = Math.min(0.02, Math.max(0.0035, peak * 0.05));
    let first = 0;
    let last = data.length - 1;
    for (let i = 0; i < data.length - win; i += win) {
      let sum = 0;
      for (let k = i; k < i + win; k++) sum += data[k] * data[k];
      if (Math.sqrt(sum / win) > th) {
        first = Math.max(0, i - win); // keep a breath before the word
        break;
      }
    }
    for (let i = data.length - win; i > first; i -= win) {
      let sum = 0;
      for (let k = i; k < i + win; k++) sum += data[k] * data[k];
      if (Math.sqrt(sum / win) > th) {
        last = Math.min(data.length, i + win * 2); // and a breath after
        break;
      }
    }
    if (first === 0 && last >= data.length) return buf;
    const c = this.ctx!;
    const len = Math.max(1, Math.min(last - first, data.length));
    const out = c.createBuffer(buf.numberOfChannels, len, buf.sampleRate);
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      out.getChannelData(ch).set(buf.getChannelData(ch).subarray(first, first + len));
    }
    return out;
  }

  // ---------------- recognition (subtitles / TTS engine) ----------------

  private startRecognition(forSpeaking: boolean): void {
    const SR = getSpeechRecognition();
    if (!SR) {
      useCatLive.getState().setLive({ ttsSupported: false });
      return;
    }
    useCatLive.getState().setLive({ ttsSupported: true });
    try {
      const rec = new SR();
      rec.lang = useSettings.getState().voice.language;
      rec.continuous = false;
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      rec.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          const txt = r[0].transcript;
          if (r.isFinal) this.finalTranscript += txt;
          else interim += txt;
        }
        const shown = (this.finalTranscript + interim).trim();
        if (shown && this.onSubtitle) this.onSubtitle(shown, false);
      };
      rec.onerror = () => {
        /* recognition is best-effort for subtitles */
      };
      rec.onend = () => {
        this.recognition = null;
        if (forSpeaking && this.state === 'Listening') {
          const text = this.finalTranscript.trim();
          if (text.length > 0) {
            this.lastUtterance = { kind: 'text', text };
            void this.stopListeningTts(text);
          } else {
            this.fire('TIMEOUT');
            this.releaseMic();
            this.teardownCapture();
          }
        }
      };
      rec.start();
      this.recognition = rec;
    } catch {
      this.recognition = null;
    }
  }

  private stopRecognition(): void {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        /* noop */
      }
      this.recognition = null;
    }
  }

  private async stopListeningTts(text: string): Promise<void> {
    this.stopVadLoop();
    this.disarmListenGuard();
    this.stopRecognition();
    this.teardownCapture();
    this.releaseMic();
    this.fire('END_SPEECH');
    this.fire('AUDIO_READY');
    await this.speakLast();
  }

  // ---------------- speaking ----------------

  async speakLast(): Promise<void> {
    const u = this.lastUtterance;
    if (!u) return;
    const v = useSettings.getState().voice;
    // count a successful echo round-trip for the sticker book
    try {
      const { useKid } = await import('@/store/kidStore');
      useKid.getState().bumpTalk();
    } catch {
      /* ignore — kid store is optional */
    }
    const speakFn = async (): Promise<void> => {
      if (u.kind === 'buffer') await this.playBuffer(u.buffer, v.pitch, v.volume);
      else await this.speakText(u.text, v);
    };
    this.fire('SPEAK_START');
    try {
      await speakFn();
      if (v.repeatTwice) await speakFn();
    } catch {
      /* playback interrupted */
    }
    if (v.meowAtEnd) catAudio.meow('kitten');
    this.fire('SPEAK_END');
    this.fire('RECOVER_DONE');
    // slow blink back to idle (spec 5.1.4)
    runtime.blinkKind = 'slow';
    runtime.blinkDur = 0.7;
    runtime.blinkT0 = runtime.t;
  }

  private playBuffer(buffer: AudioBuffer, rate: number, volume: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const c = this.ctx;
      if (!c) {
        reject(new Error('no ctx'));
        return;
      }
      const src = c.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = rate;
      // gentle high-shelf so the fast voice sounds cute, not harsh
      const shelf = c.createBiquadFilter();
      shelf.type = 'highshelf';
      shelf.frequency.value = 3600;
      shelf.gain.value = 3;
      const gain = c.createGain();
      // echo volume × global sound setting — sound off means silence
      gain.gain.value = volume * catAudio.effectiveVolume();
      const analyser = c.createAnalyser();
      analyser.fftSize = 512;
      src.connect(shelf).connect(gain).connect(analyser).connect(c.destination);

      this.playbackSource = src;
      this.playbackGain = gain;
      this.playbackAnalyser = analyser;
      this.startJawLoop();

      src.onended = () => {
        this.stopJawLoop();
        src.disconnect();
        shelf.disconnect();
        gain.disconnect();
        analyser.disconnect();
        this.playbackSource = null;
        this.playbackAnalyser = null;
        resolve();
      };
      src.start();
    });
  }

  private speakText(text: string, v: { language: string; speed: number; volume: number }): Promise<void> {
    return new Promise((resolve) => {
      if (!isTtsSpeakSupported()) {
        resolve();
        return;
      }
      const u = new SpeechSynthesisUtterance(text);
      u.lang = v.language;
      u.pitch = 1.9; // max is 2 — classic cat voice
      u.rate = Math.min(1.6, Math.max(0.8, v.speed));
      u.volume = Math.min(v.volume, catAudio.effectiveVolume() > 0 ? 1 : 0);
      u.onboundary = () => {
        runtime.ttsJaw = 0.85;
      };
      u.onstart = () => {
        this.startTtsJawLoop();
      };
      u.onend = () => {
        this.stopTtsJawLoop();
        resolve();
      };
      u.onerror = () => {
        this.stopTtsJawLoop();
        resolve();
      };
      window.speechSynthesis.speak(u);
    });
  }

  // ---------------- lip sync ----------------

  private readLevel(analyser: AnalyserNode): number {
    if (!this.levelData || this.levelData.length !== analyser.fftSize) {
      this.levelData = new Uint8Array(new ArrayBuffer(analyser.fftSize));
    }
    analyser.getByteTimeDomainData(this.levelData);
    let sum = 0;
    for (let i = 0; i < this.levelData.length; i++) {
      const x = (this.levelData[i] - 128) / 128;
      sum += x * x;
    }
    return Math.sqrt(sum / this.levelData.length);
  }

  private startJawLoop(): void {
    this.stopJawLoop();
    let smoothed = 0;
    const tick = (): void => {
      const a = this.playbackAnalyser;
      if (!a) {
        this.stopJawLoop();
        return;
      }
      const rms = this.readLevel(a);
      const target = Math.min(1, rms * 6.5);
      // fast attack, slow release (spec 5.3)
      smoothed = target > smoothed ? smoothed + (target - smoothed) * 0.55 : smoothed * 0.88;
      runtime.jawAudio = smoothed;
      runtime.micLevel = smoothed;
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private stopJawLoop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    runtime.jawAudio = 0;
  }

  private ttsJawTimer: number | null = null;

  private startTtsJawLoop(): void {
    this.stopTtsJawLoop();
    const tick = (): void => {
      if (window.speechSynthesis.speaking) {
        runtime.ttsJaw = Math.max(runtime.ttsJaw, 0.3 + Math.abs(Math.sin(performance.now() / 90)) * 0.5);
        this.ttsJawTimer = window.setTimeout(tick, 60);
      }
    };
    this.ttsJawTimer = window.setTimeout(tick, 60);
  }

  private stopTtsJawLoop(): void {
    if (this.ttsJawTimer !== null) {
      clearTimeout(this.ttsJawTimer);
      this.ttsJawTimer = null;
    }
    runtime.ttsJaw = 0;
  }

  stopPlayback(hard: boolean): void {
    try {
      this.playbackSource?.stop();
    } catch {
      /* noop */
    }
    this.playbackSource = null;
    this.playbackAnalyser = null;
    this.stopJawLoop();
    this.stopTtsJawLoop();
    if (hard && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  /** interrupted while speaking (e.g. the cat was touched) */
  interrupt(): void {
    if (this.state === 'Speaking') {
      this.stopPlayback(true);
      catAudio.squeak();
      this.fire('INTERRUPT');
      window.setTimeout(() => this.fire('RECOVER_DONE'), 700);
    }
  }

  get listening(): boolean {
    return this.state === 'Listening';
  }

  get speaking(): boolean {
    return this.state === 'Speaking';
  }
}

export const voiceController = new VoiceController();

// QA hook: lets e2e tests drive and inspect the echo pipeline from the console.
if (typeof window !== 'undefined') {
  (window as unknown as { __voice?: VoiceController }).__voice = voiceController;
}
