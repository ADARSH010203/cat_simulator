'use client';

// Voice tab: Echo Mode settings, mic selector, test level meter, privacy notes.

import { useEffect, useRef, useState } from 'react';
import { useSettings } from '@/store/settingsStore';
import { useCatLive } from '@/store/catStateStore';
import { voiceController, isTtsSpeakSupported, isSecure } from '../../voice/engines';
import { runtime } from '../../core/runtime';
import { Section, Field } from '../controls';
import { ExternalLink } from 'lucide-react';

const LANGUAGES: Array<{ code: string; label: string }> = [
  { code: 'en-IN', label: 'English (India)' },
  { code: 'hi-IN', label: 'हिन्दी (Hindi)' },
  { code: 'en-US', label: 'English (US)' },
  { code: 'en-GB', label: 'English (UK)' },
  { code: 'mr-IN', label: 'मराठी' },
  { code: 'ta-IN', label: 'தமிழ்' },
  { code: 'bn-IN', label: 'বাংলা' },
  { code: 'es-ES', label: 'Español' },
  { code: 'fr-FR', label: 'Français' },
  { code: 'de-DE', label: 'Deutsch' },
  { code: 'ja-JP', label: '日本語' },
];

export function VoiceTab(): React.ReactElement {
  const voice = useSettings((s) => s.voice);
  const setVoice = useSettings((s) => s.setVoice);
  const permission = useCatLive((s) => s.permission);
  const micError = useCatLive((s) => s.micError);
  const micBlockedByFrame = useCatLive((s) => s.micBlockedByFrame);
  const micRequesting = useCatLive((s) => s.micRequesting);
  const ttsSupported = useCatLive((s) => s.ttsSupported);
  const echoState = useCatLive((s) => s.echoState);
  const meterRef = useRef<HTMLDivElement>(null);
  const [mics, setMics] = useState<Array<{ id: string; label: string }>>([]);
  const [testing, setTesting] = useState(false);

  // enumerate microphones (labels appear after permission is granted)
  useEffect(() => {
    const list = async (): Promise<void> => {
      try {
        const devs = await navigator.mediaDevices.enumerateDevices();
        setMics(devs.filter((d) => d.kind === 'audioinput').map((d) => ({ id: d.deviceId, label: d.label || 'Microphone' })));
      } catch {
        /* ignore */
      }
    };
    void list();
    const onDeviceChange = (): void => void list();
    navigator.mediaDevices?.addEventListener?.('devicechange', onDeviceChange);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', onDeviceChange);
  }, [permission]);

  // live test meter
  useEffect(() => {
    if (!testing) return;
    let raf = 0;
    const tick = (): void => {
      if (meterRef.current) {
        const l = Math.min(1, runtime.micLevel * 4.5);
        meterRef.current.style.width = `${8 + l * 92}%`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [testing]);

  const testMic = async (): Promise<void> => {
    if (testing) {
      setTesting(false);
      if (voiceController.state === 'Listening') await voiceController.stopListening();
      return;
    }
    setTesting(true);
    await voiceController.startListening(false);
    // hold-mode test: stop after 4 s automatically
    setTimeout(() => {
      if (voiceController.state === 'Listening') void voiceController.stopListening();
    }, 4000);
  };

  return (
    <div className="space-y-5">
      <Section title="Talking Echo Mode">
        <Field label="Echo Mode" hint="cat repeats what you say">
          <input
            type="checkbox"
            checked={voice.echoOn}
            onChange={(e) => setVoice({ echoOn: e.target.checked })}
            className="h-4 w-4 accent-amber-500"
            aria-label="Enable Echo Mode"
          />
        </Field>
        <Field label="Input style">
          <select
            value={voice.inputStyle}
            onChange={(e) => setVoice({ inputStyle: e.target.value as 'hold' | 'handsfree' })}
            className="h-8 rounded-md border border-stone-200 bg-transparent px-2 text-sm dark:border-stone-600 dark:bg-stone-800"
            aria-label="Input style"
          >
            <option value="hold">Hold-to-talk (press &amp; hold mic)</option>
            <option value="handsfree">Hands-free (auto-detect)</option>
          </select>
        </Field>
        <Field label="Engine">
          <select
            value={voice.engine}
            onChange={(e) => setVoice({ engine: e.target.value as 'recorded' | 'tts' | 'auto' })}
            className="h-8 rounded-md border border-stone-200 bg-transparent px-2 text-sm dark:border-stone-600 dark:bg-stone-800"
            aria-label="Echo engine"
          >
            <option value="auto">Auto (best available)</option>
            <option value="recorded">Recorded — exact repeat, any language</option>
            <option value="tts" disabled={!ttsSupported}>
              TTS — clean cat voice {ttsSupported ? '' : '(unsupported here)'}
            </option>
          </select>
        </Field>
        <p className="rounded-lg bg-stone-50 p-2 text-[10px] leading-relaxed text-stone-500 dark:bg-stone-800/60 dark:text-stone-400">
          <strong>Recorded</strong> replays your own recording with a higher, cuter pitch — words stay exactly the
          same in any language. <strong>TTS</strong> re-speaks the recognised text in a high-pitch voice.
          {!isSecure() && <span className="mt-1 block text-rose-500">⚠ This page is not HTTPS — the microphone will be blocked by the browser.</span>}
        </p>
      </Section>

      <Section title="Cat voice">
        <Field label={`Pitch ${voice.pitch.toFixed(2)}×`} hint="chipmunk factor">
          <input
            type="range"
            min={1}
            max={2.2}
            step={0.05}
            value={voice.pitch}
            onChange={(e) => setVoice({ pitch: Number(e.target.value) })}
            className="w-32 accent-amber-500"
            aria-label="Voice pitch"
          />
        </Field>
        <Field label={`Speed ${voice.speed.toFixed(2)}×`}>
          <input
            type="range"
            min={0.8}
            max={1.6}
            step={0.05}
            value={voice.speed}
            onChange={(e) => setVoice({ speed: Number(e.target.value) })}
            className="w-32 accent-amber-500"
            aria-label="Voice speed"
          />
        </Field>
        <Field label={`Volume ${Math.round(voice.volume * 100)}%`}>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={voice.volume}
            onChange={(e) => setVoice({ volume: Number(e.target.value) })}
            className="w-32 accent-amber-500"
            aria-label="Echo volume"
          />
        </Field>
        <Field label="Repeat twice">
          <input
            type="checkbox"
            checked={voice.repeatTwice}
            onChange={(e) => setVoice({ repeatTwice: e.target.checked })}
            className="h-4 w-4 accent-amber-500"
            aria-label="Repeat twice"
          />
        </Field>
        <Field label="Meow at the end">
          <input
            type="checkbox"
            checked={voice.meowAtEnd}
            onChange={(e) => setVoice({ meowAtEnd: e.target.checked })}
            className="h-4 w-4 accent-amber-500"
            aria-label="Meow at the end"
          />
        </Field>
        <Field label="Show subtitles">
          <input
            type="checkbox"
            checked={voice.subtitles}
            onChange={(e) => setVoice({ subtitles: e.target.checked })}
            className="h-4 w-4 accent-amber-500"
            aria-label="Show subtitles"
          />
        </Field>
      </Section>

      <Section title="Microphone">
        <Field label="Language" hint="for TTS & subtitles">
          <select
            value={voice.language}
            onChange={(e) => setVoice({ language: e.target.value })}
            className="h-8 max-w-[164px] rounded-md border border-stone-200 bg-transparent px-2 text-sm dark:border-stone-600 dark:bg-stone-800"
            aria-label="Recognition language"
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Microphone">
          <select
            value={voice.micId}
            onChange={(e) => setVoice({ micId: e.target.value })}
            className="h-8 max-w-[164px] rounded-md border border-stone-200 bg-transparent px-2 text-sm dark:border-stone-600 dark:bg-stone-800"
            aria-label="Microphone"
          >
            <option value="">Default</option>
            {mics.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={`Sensitivity ${Math.round(voice.sensitivity * 100)}%`}>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={voice.sensitivity}
            onChange={(e) => setVoice({ sensitivity: Number(e.target.value) })}
            className="w-32 accent-amber-500"
            aria-label="Microphone sensitivity"
          />
        </Field>

        <div className="space-y-2">
          <button
            type="button"
            onClick={() => void testMic()}
            disabled={micRequesting}
            className={`w-full rounded-lg border px-3 py-2 text-xs font-semibold transition ${
              testing
                ? 'border-rose-300 bg-rose-50 text-rose-600 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300'
                : 'border-stone-200 text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800'
            }`}
          >
            {micRequesting ? 'Waking ears…' : testing ? 'Stop test' : 'Test microphone — she will repeat you!'}
          </button>
          {testing && (
            <div className="h-2 w-full overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
              <div ref={meterRef} className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-amber-500 transition-[width] duration-75" style={{ width: '8%' }} />
            </div>
          )}
          {micBlockedByFrame && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-2 dark:border-amber-500/40 dark:bg-amber-500/10">
              <p className="text-[11px] font-medium leading-relaxed text-amber-800 dark:text-amber-300">
                This preview window blocks the microphone — browsers only allow it in the top page. Open Mochi in her own
                tab and echo mode will work.
              </p>
              <button
                type="button"
                onClick={() => window.open(window.location.href, '_blank', 'noopener')}
                className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-amber-500 px-2.5 py-1 text-[10px] font-bold text-white shadow transition hover:bg-amber-600"
              >
                <ExternalLink className="h-3 w-3" aria-hidden />
                Open in new tab
              </button>
            </div>
          )}
          {micError && !micBlockedByFrame && <p className="text-[11px] font-medium text-rose-500">{micError}</p>}
          {permission === 'denied' && !micError && !micBlockedByFrame && (
            <p className="text-[11px] text-rose-500">
              Microphone permission was denied. You can re-allow it from the address bar — everything else keeps
              working.
            </p>
          )}
        </div>
      </Section>

      <Section title="Privacy">
        <p className="rounded-lg bg-stone-50 p-2 text-[10px] leading-relaxed text-stone-500 dark:bg-stone-800/60 dark:text-stone-400">
          Audio is processed locally in memory and never uploaded or saved by this app. In Chrome, speech
          recognition may send audio to a cloud service to produce subtitles — the Recorded engine works fully
          offline. Status: <strong>{echoState}</strong>
        </p>
      </Section>
    </div>
  );
}
