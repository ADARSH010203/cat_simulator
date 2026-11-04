'use client';

// Echo Mode UI: floating mic button with live level ring + subtitle bubble.

import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Square, ExternalLink } from 'lucide-react';
import { useSettings } from '@/store/settingsStore';
import { useCatLive } from '@/store/catStateStore';
import { voiceController, isTtsSpeakSupported } from './engines';
import { runtime } from '../core/runtime';
import { catAudio } from '../audio/sounds';

export function VoiceManager(): React.ReactElement {
  const voice = useSettings((s) => s.voice);
  const catName = useSettings((s) => s.catName);
  const echoState = useCatLive((s) => s.echoState);
  const subtitle = useCatLive((s) => s.subtitle);
  const micRequesting = useCatLive((s) => s.micRequesting);
  const micBlockedByFrame = useCatLive((s) => s.micBlockedByFrame);
  const ringRef = useRef<HTMLDivElement>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [holdDown, setHoldDown] = useState(false);

  // controller callbacks
  useEffect(() => {
    voiceController.onStateChange = (s) => {
      const live = useCatLive.getState();
      live.setLive({
        listening: s === 'Listening',
        speaking: s === 'Speaking',
        echoState: s,
      });
    };
    voiceController.onSubtitle = (text) => {
      useCatLive.getState().setLive({ subtitle: text });
    };
    voiceController.onError = (msg) => {
      useCatLive.getState().pushToast(msg, 'error');
    };
    useCatLive.getState().setLive({ ttsSupported: isTtsSpeakSupported() });
  }, []);

  // echo toggle
  useEffect(() => {
    if (voice.echoOn) {
      void voiceController.enable();
    } else {
      voiceController.disable();
    }
  }, [voice.echoOn]);

  useEffect(() => {
    voiceController.setEngine(voice.engine);
  }, [voice.engine]);

  // clear subtitle when idle
  useEffect(() => {
    if (echoState === 'EchoIdle' || echoState === 'EchoOff') {
      const id = setTimeout(() => useCatLive.getState().setLive({ subtitle: '' }), 1200);
      return () => clearTimeout(id);
    }
  }, [echoState]);

  // live level ring
  useEffect(() => {
    let raf = 0;
    const tick = (): void => {
      if (ringRef.current) {
        const l = Math.min(1, runtime.micLevel * 4.5);
        ringRef.current.style.transform = `scale(${1 + l * 0.5})`;
        ringRef.current.style.opacity = String(0.35 + l * 0.65);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const start = (handsfree: boolean): void => {
    if (!voice.echoOn) {
      useSettings.getState().setVoice({ echoOn: true });
      // wait for ENABLE so START can never race ahead of the state machine
      void voiceController.enable().then(() => voiceController.startListening(handsfree));
    } else if (echoState === 'Speaking') {
      voiceController.interrupt();
    } else if (echoState === 'Listening') {
      void voiceController.stopListening();
    } else {
      void voiceController.startListening(handsfree);
    }
  };

  const stopHold = (): void => {
    setHoldDown(false);
    if (voice.inputStyle === 'hold') {
      void voiceController.stopListening();
    }
  };

  const onPointerDown = (): void => {
    // unlock Web Audio inside the gesture — Chrome refuses resume() outside it
    catAudio.ensure();
    if (voice.inputStyle === 'hold') {
      setHoldDown(true);
      start(false);
    } else {
      holdTimer.current = setTimeout(() => {
        holdTimer.current = null;
      }, 220);
      setHoldDown(true);
    }
  };

  const onPointerUp = (): void => {
    setHoldDown(false);
    catAudio.ensure();
    if (voice.inputStyle === 'hold') {
      void voiceController.stopListening();
    } else {
      if (holdTimer.current) {
        clearTimeout(holdTimer.current);
        holdTimer.current = null;
        start(true);
      }
    }
  };

  const listening = echoState === 'Listening';
  const speaking = echoState === 'Speaking';
  const off = echoState === 'EchoOff';

  return (
    <>
      {/* mic button — sits above the KidBar (left column) so it never gets covered */}
      <div className="fixed bottom-32 left-4 z-40 md:bottom-[132px] md:left-6">
        <button
          type="button"
          aria-label={listening ? 'Stop listening' : speaking ? 'Stop echo' : 'Start Talking Echo Mode'}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={stopHold}
          onPointerLeave={() => {
            if (holdDown && voice.inputStyle === 'hold') stopHold();
          }}
          className={`relative flex h-14 w-14 touch-none select-none items-center justify-center rounded-full shadow-lg transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 ${
            listening
              ? 'bg-rose-500 text-white'
              : speaking
                ? 'bg-amber-500 text-white'
                : micRequesting
                  ? 'animate-pulse bg-amber-400 text-white'
                  : off
                    ? 'bg-white/90 text-stone-700 hover:bg-white'
                    : 'bg-stone-800 text-amber-300 hover:bg-stone-700'
          }`}
        >
          {(listening || speaking) && (
            <div
              ref={ringRef}
              className="pointer-events-none absolute inset-0 rounded-full border-2 border-rose-400"
              style={{ transform: 'scale(1)', opacity: 0.5 }}
            />
          )}
          {voice.echoOn ? (
            listening ? (
              <Square className="h-5 w-5" aria-hidden />
            ) : (
              <Mic className="h-6 w-6" aria-hidden />
            )
          ) : (
            <MicOff className="h-6 w-6" aria-hidden />
          )}
        </button>
        <div className="mt-1 text-center text-[10px] font-medium text-stone-500 dark:text-stone-400">
          {listening ? 'listening…' : speaking ? `${catName} talks` : micRequesting ? 'waking ears…' : 'Echo'}
        </div>
        {micBlockedByFrame && (
          <button
            type="button"
            onClick={() => window.open(window.location.href, '_blank', 'noopener')}
            className="mt-2 flex items-center gap-1 whitespace-nowrap rounded-full border border-amber-300 bg-amber-100/90 px-2.5 py-1.5 text-[10px] font-semibold text-amber-800 shadow-md transition hover:bg-amber-200 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300"
          >
            <ExternalLink className="h-3 w-3" aria-hidden />
            Open in new tab
          </button>
        )}
      </div>

      {/* subtitle bubble */}
      {voice.subtitles && (subtitle || listening) ? (
        <div className="pointer-events-none fixed bottom-44 left-1/2 z-30 w-[86%] max-w-md -translate-x-1/2 md:bottom-[150px]">
          <div className="rounded-2xl border border-stone-200/60 bg-white/85 px-4 py-2 text-center text-sm font-medium text-stone-800 shadow-lg backdrop-blur-md dark:border-stone-700/60 dark:bg-stone-900/85 dark:text-stone-100">
            {listening && !subtitle ? (
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" />
                {catName} is listening…
              </span>
            ) : (
              <span>
                <span className="text-amber-600 dark:text-amber-400">{catName}:</span> {subtitle}
              </span>
            )}
          </div>
        </div>
      ) : null}
      {/* mic-request feedback shows even without subtitles enabled */}
      {micRequesting && !voice.subtitles && (
        <div className="pointer-events-none fixed bottom-44 left-1/2 z-30 w-[86%] max-w-md -translate-x-1/2 md:bottom-[150px]">
          <div className="rounded-2xl border border-stone-200/60 bg-white/85 px-4 py-2 text-center text-sm font-medium text-stone-800 shadow-lg backdrop-blur-md dark:border-stone-700/60 dark:bg-stone-900/85 dark:text-stone-100">
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
              {catName} is waking her ears… (allow the microphone if asked)
            </span>
          </div>
        </div>
      )}
    </>
  );
}
