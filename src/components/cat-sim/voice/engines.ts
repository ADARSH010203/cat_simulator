'use client';

// Talking Echo Mode — two engines, one interface (spec 5.2).
// Engine A (Recorded): getUserMedia + MediaRecorder, VAD with hysteresis,
//   playback with playbackRate shift for the classic cat voice.
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

// ---------------- VAD ----------------
class Vad {
  noiseFloor = 0.008;
  speaking = false;
  speechT0 = 0;
  lastVoiceT = 0;
  startedAt = 0;

  reset(): void {
    this.noiseFloor = 0.008;
    this.speaking = false;
    this.speechT0 = 0;
    this.lastVoiceT = 0;
    this.startedAt = performance.now() / 1000;
  }

  /** Feed an RMS value; returns 'end' when the utterance is complete. */
  update(rms: number, sensitivity: number, now: number): 'none' | 'start' | 'voice' | 'end' {
    // adaptive noise floor (tracks quiet room level)
    if (!this.speaking && rms < this.noiseFloor * 2) {
      this.noiseFloor = Math.max(0.002, this.noiseFloor * 0.998 + rms * 0.002);
    }
    const th1 = Math.max(this.noiseFloor * 2.4, 0.015 + (1 - sensitivity) * 0.05);
    const th0 = th1 * 0.55;
    const elapsed = now - this.startedAt;

    if (!this.speaking && rms > th1 && elapsed > 0.15) {
      this.speaking = true;
      this.speechT0 = now;
      this.lastVoiceT = now;
      return 'start';
    }
    if (this.speaking) {
      if (rms > th0) this.lastVoiceT = now;
      const silence = now - this.lastVoiceT;
      const voiceLen = this.lastVoiceT - this.speechT0;
      if (silence > 1.0 && voiceLen >= 0.25) {
        this.speaking = false;
        return 'end';
      }
      if (now - this.speechT0 > 15) {
        this.speaking = false;
        return 'end';
      }
      return 'voice';
    }
    // blips shorter than 0.25 s are ignored by requiring voiceLen above
    return 'none';
  }
}

// ---------------- controller ----------------
type Utterance = { kind: 'buffer'; buffer: AudioBuffer } | { kind: 'text'; text: string };

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
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private vad = new Vad();
  private vadTimer: number | null = null;
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
    this.stopVadLoop();
    this.stopRecognition();
    if (this.recorder && this.recorder.state !== 'inactive') {
      try {
        this.recorder.stop();
      } catch {
        /* noop */
      }
    }
    this.recorder = null;
    this.stopPlayback(true);
    this.releaseMic();
    this.handsfree = false;
  }

  private async getMic(): Promise<MediaStream> {
    if (this.stream) return this.stream;
    const v = useSettings.getState().voice;
    const constraints: MediaStreamConstraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        ...(v.micId ? { deviceId: { exact: v.micId } } : {}),
      },
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.stream = stream;
    useCatLive.getState().setLive({ permission: 'granted', micError: '' });
    return stream;
  }

  private releaseMic(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.source?.disconnect();
    this.source = null;
    this.listenAnalyser = null;
  }

  // ---------------- listening ----------------

  async startListening(handsfree: boolean): Promise<void> {
    if (this.state === 'Listening') return;
    const ctx = catAudio.ensure();
    if (!ctx) {
      this.onError?.('Web Audio is not available in this browser.');
      return;
    }
    if (ctx.state === 'suspended') await ctx.resume().catch(() => undefined);

    try {
      await this.getMic();
    } catch (err) {
      const name = (err as { name?: string }).name ?? '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        useCatLive.getState().setLive({ permission: 'denied', micError: 'Microphone permission was denied. You can still pet and play with the cat!' });
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        useCatLive.getState().setLive({ permission: 'unsupported', micError: 'No microphone found on this device.' });
      } else if (!isSecure()) {
        useCatLive.getState().setLive({ permission: 'denied', micError: 'Microphone needs HTTPS or localhost.' });
      } else {
        useCatLive.getState().setLive({ micError: 'Could not start the microphone.' });
      }
      return;
    }

    this.handsfree = handsfree;
    this.chunks = [];
    this.finalTranscript = '';
    this.fire('START');

    const c = this.ctx!;
    this.source = c.createMediaStreamSource(this.stream!);
    this.listenAnalyser = c.createAnalyser();
    this.listenAnalyser.fftSize = 512;
    this.source.connect(this.listenAnalyser);
    this.levelData = new Uint8Array(this.listenAnalyser.fftSize);

    // recorder with format fallback
    const preferred = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', ''];
    const mime = preferred.find((m) => m === '' || MediaRecorder.isTypeSupported(m)) ?? '';
    try {
      this.recorder = new MediaRecorder(this.stream!, mime ? { mimeType: mime } : undefined);
    } catch {
      this.recorder = new MediaRecorder(this.stream!);
    }
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.start(120);

    this.vad.reset();
    if (handsfree) this.startVadLoop();

    // optional subtitles via recognition (Engine A audio, Engine B text)
    const wantSubs = useSettings.getState().voice.subtitles;
    const usingTts = this.engine === 'tts';
    if (wantSubs || usingTts) this.startRecognition(usingTts);
  }

  private startVadLoop(): void {
    this.stopVadLoop();
    const tick = (): void => {
      if (!this.listenAnalyser || this.state !== 'Listening') {
        this.stopVadLoop();
        return;
      }
      const rms = this.readLevel(this.listenAnalyser);
      runtime.micLevel = rms;
      const now = performance.now() / 1000;
      const res = this.vad.update(rms, useSettings.getState().voice.sensitivity, now);
      if (res === 'end') {
        void this.stopListening();
        return;
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

  async stopListening(): Promise<void> {
    if (this.state !== 'Listening') return;
    this.stopVadLoop();
    const rec = this.recorder;
    this.recorder = null;
    const chunks = this.chunks;
    this.chunks = [];
    const c = this.ctx;

    if (!rec || rec.state === 'inactive' || !c) {
      this.fire('TIMEOUT');
      this.releaseMic();
      return;
    }

    await new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
      try {
        rec.stop();
      } catch {
        resolve();
      }
    });
    this.stopRecognition();
    this.releaseMic();

    if (chunks.length === 0) {
      this.fire('TIMEOUT');
      return;
    }
    this.fire('END_SPEECH');

    try {
      const blob = new Blob(chunks, { type: chunks[0].type || 'audio/webm' });
      const arr = await blob.arrayBuffer();
      const buffer = await this.decode(c, arr);
      const trimmed = this.trimSilence(buffer);
      if (trimmed.duration < 0.25) {
        this.fire('TIMEOUT');
        return;
      }
      this.lastUtterance = { kind: 'buffer', buffer: trimmed };
      this.fire('AUDIO_READY');
      await this.speakLast();
    } catch {
      this.onError?.('Could not process that recording — try again.');
      this.fire('TIMEOUT');
    }
  }

  private decode(ctx: AudioContext, arr: ArrayBuffer): Promise<AudioBuffer> {
    return new Promise<AudioBuffer>((resolve, reject) => {
      const p = ctx.decodeAudioData(arr, resolve, reject);
      if (p && typeof p.then === 'function') p.then(resolve, reject);
    });
  }

  /** Trim leading/trailing quiet parts using a simple RMS gate. */
  private trimSilence(buf: AudioBuffer): AudioBuffer {
    const data = buf.getChannelData(0);
    const win = Math.floor(buf.sampleRate * 0.02);
    const th = 0.012;
    let first = 0;
    let last = data.length - 1;
    for (let i = 0; i < data.length - win; i += win) {
      let sum = 0;
      for (let k = i; k < i + win; k++) sum += data[k] * data[k];
      if (Math.sqrt(sum / win) > th) {
        first = i;
        break;
      }
    }
    for (let i = data.length - win; i > first; i -= win) {
      let sum = 0;
      for (let k = i; k < i + win; k++) sum += data[k] * data[k];
      if (Math.sqrt(sum / win) > th) {
        last = Math.min(data.length - 1, i + win);
        break;
      }
    }
    if (first === 0 && last === data.length - 1) return buf;
    const c = this.ctx!;
    const out = c.createBuffer(buf.numberOfChannels, Math.max(1, last - first), buf.sampleRate);
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      out.getChannelData(ch).set(buf.getChannelData(ch).subarray(first, last));
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
    this.stopRecognition();
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
      gain.gain.value = volume;
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
      u.volume = v.volume;
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
