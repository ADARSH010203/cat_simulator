'use client';

// Root of the simulator: canvas + overlays + shortcuts + WebGL fallback.
// If WebGL is unavailable (or the 3D scene crashes at startup) the whole
// app switches to the Canvas-2D renderer — Mochi ALWAYS appears.

import { Component, useEffect, useState, type ReactNode } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { PerformanceMonitor } from '@react-three/drei';
import { Scene } from './Scene';
import { Cat2D } from './Cat2D';
import { LoadingScreen } from './ui/LoadingScreen';
import { MoodBar } from './ui/MoodBar';
import { FloatingButtons } from './ui/FloatingButtons';
import { ControlPanel } from './ui/ControlPanel';
import { ToastStack } from './ui/ToastStack';
import { HeartsLayer } from './ui/HeartsLayer';
import { VoiceManager } from './voice/VoiceManager';
import { KidBar } from './ui/KidBar';
import { StickerBook } from './ui/StickerBook';
import { HelpModal } from './ui/HelpModal';
import { UnlockPopup } from './ui/UnlockPopup';
import { catAudio } from './audio/sounds';
import { useSettings } from '@/store/settingsStore';
import { useCameraStore } from './core/cameraBus';
import { useCatLive } from '@/store/catStateStore';

function PerfDprTuner(): null {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const id = window.setInterval(() => {
      gl.setPixelRatio(Math.max(0.75, Math.min(1.75, dprBus.factor * 1.75)));
    }, 800);
    return () => window.clearInterval(id);
  }, [gl]);
  return null;
}

/**
 * Full 2D fallback mode — same runtime, reactions, echo mode and UI as the
 * 3D mode, just rendered on a 2D canvas. Used when WebGL is missing or the
 * 3D scene crashed on startup.
 */
function Mode2D({ recovered }: { recovered: boolean }): React.ReactElement {
  const [stickersOpen, setStickersOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    if (recovered) {
      useCatLive
        .getState()
        .pushToast('3D scene hit a snag — switched to 2D lite mode so Mochi stays with you.', 'info');
    } else {
      useCatLive
        .getState()
        .pushToast('WebGL is unavailable here — running in 2D lite mode. Everything still works!', 'info');
    }
  }, [recovered]);

  return (
    <div className="fixed inset-0 overflow-hidden bg-stone-100 dark:bg-stone-950">
      <Cat2D />
      <div className="pointer-events-none fixed left-1/2 top-3 z-40 -translate-x-1/2">
        <span className="rounded-full bg-stone-900/75 px-3 py-1 text-[11px] font-semibold tracking-wide text-amber-200 shadow-md backdrop-blur-sm">
          🐾 2D lite mode · WebGL unavailable
        </span>
      </div>
      <LoadingScreen />
      <MoodBar />
      <FloatingButtons />
      <VoiceManager />
      <ControlPanel />
      <HeartsLayer />
      <ToastStack />
      <KidBar onOpenStickers={() => setStickersOpen(true)} onOpenHelp={() => setHelpOpen(true)} />
      <StickerBook open={stickersOpen} onClose={() => setStickersOpen(false)} />
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      <UnlockPopup />
    </div>
  );
}

class ErrorBoundary extends Component<
  { fallback3dCrash: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  constructor(props: { fallback3dCrash: ReactNode; children: ReactNode }) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  componentDidCatch(error: unknown): void {
    console.error('[Mochi] 3D scene error — falling back to 2D:', error);
  }
  render(): ReactNode {
    if (this.state.failed) return this.props.fallback3dCrash;
    return this.props.children;
  }
}

const TAB_ORDER = ['appearance', 'position', 'environment', 'camera', 'animation', 'voice'];

/** Adaptive DPR bus: PerformanceMonitor → PerfDprTuner inside the canvas. */
const dprBus = { factor: 1 };
function setCanvasDpr(factor: number): void {
  dprBus.factor = Math.max(0.55, Math.min(1, factor));
}

/** Thorough WebGL probe: create a context, compile a shader and clear. */
function probeWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') ?? c.getContext('webgl');
    if (!gl) return false;
    const vs = gl.createShader(gl.VERTEX_SHADER);
    if (!vs) return false;
    gl.shaderSource(vs, 'void main(){gl_Position=vec4(0.0,0.0,0.0,1.0);}');
    gl.compileShader(vs);
    const ok = gl.getShaderParameter(vs, gl.COMPILE_STATUS);
    gl.deleteShader(vs);
    if (!ok) return false;
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const lose = gl.getExtension('WEBGL_lose_context');
    lose?.loseContext();
    return true;
  } catch {
    return false;
  }
}

export default function CatSimulator(): React.ReactElement {
  // WebGL support probe — safe at first render because this page is client-only.
  // `?mode=2d` forces the fallback renderer (useful on locked-down devices).
  const [webglOk] = useState<boolean | null>(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mode') === '2d') {
      return false;
    }
    return probeWebGL();
  });
  // live WebGL context loss → switch to the 2D renderer without a reload
  const [contextLost, setContextLost] = useState(false);
  // kid-mode modals
  const [stickersOpen, setStickersOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  // audio unlock on first gesture
  useEffect(() => {
    const unlock = (): void => { void catAudio.ensure(); };
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  // respect OS reduced-motion on first load
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      useSettings.getState().setUI({ reducedMotion: true });
    }
  }, []);

  // keyboard shortcuts: Space pause · R camera reset · 1-6 tabs · M mic
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const el = e.target as HTMLElement;
      if (el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        const s = useSettings.getState();
        s.setAnim({ paused: !s.paused });
      } else if (e.key === 'r' || e.key === 'R') {
        useCameraStore.getState().request('reset');
      } else if (e.key === 'm' || e.key === 'M') {
        const s = useSettings.getState();
        s.setVoice({ echoOn: !s.voice.echoOn });
      } else if (/^[1-6]$/.test(e.key)) {
        useSettings.getState().setUI({ activeTab: TAB_ORDER[Number(e.key) - 1], panelOpen: true });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // No WebGL (or forced via ?mode=2d) → full 2D fallback (never a dead screen)
  if (webglOk === false || contextLost) {
    return <Mode2D recovered={contextLost} />;
  }

  return (
    <div className="fixed inset-0 overflow-hidden bg-stone-100 dark:bg-stone-950">
      <ErrorBoundary
        fallback3dCrash={
          <Mode2D recovered />
        }
      >
        <Canvas
          dpr={[1, 1.75]}
          camera={{ position: [1.9, 1.45, 3], fov: 42, near: 0.1, far: 80 }}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
          onCreated={({ gl }) => {
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 1.05;
            // if the GPU driver kills the context mid-session, degrade to 2D
            gl.domElement.addEventListener(
              'webglcontextlost',
              (e) => {
                e.preventDefault();
                setContextLost(true);
              },
              { once: true }
            );
          }}
          aria-label="Interactive 3D cat — pet her with your pointer"
        >
          <PerformanceMonitor
            onDecline={() => {
              const s = useSettings.getState();
              if (s.furQuality === 'high') {
                s.setFurQuality('medium');
                useCatLive.getState().pushToast('Low FPS — fur quality lowered.', 'info');
              } else if (s.furQuality === 'medium') {
                s.setFurQuality('low');
                useCatLive.getState().pushToast('Low FPS — fur shells off, staying smooth.', 'info');
              }
            }}
            onChange={({ factor }) => {
              // adaptive resolution — smooths out weak GPUs before dropping fur quality
              setCanvasDpr(factor);
            }}
          >
            <PerfDprTuner />
            <Scene />
          </PerformanceMonitor>
        </Canvas>
      </ErrorBoundary>

      <LoadingScreen />
      <MoodBar />
      <FloatingButtons />
      <VoiceManager />
      <ControlPanel />
      <HeartsLayer />
      <ToastStack />
      <KidBar onOpenStickers={() => setStickersOpen(true)} onOpenHelp={() => setHelpOpen(true)} />
      <StickerBook open={stickersOpen} onClose={() => setStickersOpen(false)} />
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      <UnlockPopup />
    </div>
  );
}
