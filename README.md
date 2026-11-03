# Mochi — 3D Cat Simulator + Talking Echo Mode

A living virtual pet in your browser. Pet her and she purrs. Talk, and she repeats it back in her tiny cat voice. Her look, position and world are all yours to change.

Built with **Next.js 16 + React 19 + TypeScript (strict) + Three.js / @react-three/fiber + drei + Zustand + Tailwind CSS 4 + shadcn/ui**. Everything is procedural — **zero external 3D/sound assets**.

## Run

```bash
bun install        # or npm install
bun run dev        # or npm run dev → http://localhost:3000
bun run lint       # ESLint
bunx tsc --noEmit  # type check
bun test src/lib/__tests__/catSim.test.ts   # state-machine unit tests
```

> The microphone requires **HTTPS or localhost**. On any other origin the browser blocks `getUserMedia` (the app detects this and shows a friendly note — everything else keeps working).

## What's inside

| System | Where | Notes |
|---|---|---|
| Procedural cat (rig, face, fur) | `src/components/cat-sim/ProceduralCat.tsx` | ~45-bone group rig, shell fur, iris canvas textures |
| Coat generator | `src/components/cat-sim/core/coat.ts` | canvas textures: tabby/spots/patches/tuxedo/colourpoint + belly gradient |
| Animation system | `src/components/cat-sim/core/useCatAnimation.ts` | base state machine + additive layers + reactions, damped springs |
| Transition table (pure) | `src/components/cat-sim/core/stateMachine.ts` | sleep → wake → stretch → stand, never sleep→walk |
| Gestures + reaction map | `src/components/cat-sim/core/interactions.ts` | tap/double-tap/hold/stroke/poke-spam per body region |
| Synth audio | `src/components/cat-sim/audio/sounds.ts` | purr (25 Hz AM noise), meow (formant filters), chirp, squeak, bell… |
| Echo Mode engines | `src/components/cat-sim/voice/engines.ts` | Recorded (exact repeat, any language) + TTS + VAD + lip-sync |
| Echo state machine (pure) | `src/components/cat-sim/voice/echoStateMachine.ts` | EchoOff→Idle→Listening→Processing→Speaking→Recover |
| Environments ×7 | `src/components/cat-sim/environments/` | Garden, Living room, Studio, Bedroom, Forest, Beach, Night sky |
| Settings store (persisted) | `src/store/settingsStore.ts` | localStorage, schema version + migrate |
| UI panel | `src/components/cat-sim/ui/` | 6 tabs, mobile bottom sheet, dark/light, shortcuts |

### Keyboard shortcuts

`Space` pause/play · `R` reset camera · `M` echo mode · `1–6` panel tabs

### Petting guide

Head/cheek strokes → purr + happy squints · belly tap (high trust, lying down) → roll & knead · 6+ pokes in 3 s → she gets annoyed and walks away · ~20 s of petting → knead → lie down → loaf → sleep. Every region (ears, tail, paws, nose, whiskers, chin, back…) has its own reaction with sounds and cooldowns.

### Echo Mode guide

1. Voice tab (or `M`) → enable **Echo Mode**
2. **Hold-to-talk**: press & hold the mic · **Hands-free**: tap the mic, speak, pause ~1 s
3. She repeats your words exactly — **Recorded engine** replays your own audio pitch-shifted (1.0–2.2×, default 1.5 — works in any language), **TTS engine** re-speaks the recognised transcript at pitch ~1.9
4. Jaw lip-syncs to the playback RMS; touching her mid-speech gets a surprised squeak
5. Options: repeat twice, meow at the end, subtitles, language, mic device, sensitivity

## Architecture notes

- Per-frame animation values live in a single mutable `runtime` object (`core/runtime.ts`) — **never in React state** (spec rule 0.6).
- Touch hit-testing uses invisible proxy spheres parented to the rig — they follow the animation and stay cheap.
- One bone-group owner per frame with priority: Startle > Echo > Touch reaction > Action button > Autonomous idle.
- Fur = shell layers (0/4/10 by quality) with per-strand hash alpha, gravity droop, wind sway and darker roots; `PerformanceMonitor` drops quality + DPR automatically under sustained low FPS.
- All environments are lazy-loaded and fully disposed on unmount; switching worlds never moves the cat or resets her coat.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Microphone needs HTTPS" | Serve over HTTPS or use `localhost` — browsers block mic on insecure pages |
| Mic permission denied | Re-allow from the address-bar padlock; the rest of the app keeps working |
| No sound at all | Click/tap once first — browsers unlock audio only after a user gesture |
| She feels too still | Anim tab → enable *Autonomous idle* and turn speed back to 1× |
| Low FPS | Look tab → Fur quality → medium/low; the app also auto-lowers when needed |
| Cat is off-screen | Spot tab → *Bring her back* / *Move to centre* |
| TTS option greyed out | Firefox/iOS Safari lack SpeechRecognition — the Recorded engine still works |
| Subtitles missing on Recorded engine | Subtitles need browser speech recognition (Chrome); audio echo works without it |

## Honest known limitations

- Recorded-echo voice = your recording played faster/higher — words are exact, but it's a "chipmunk" effect, not formant-shifted speech synthesis.
- Subtitles rely on browser SpeechRecognition (Chrome best; Firefox/iOS unsupported → disabled with a note).
- The procedural cat is stylised/chibi, not photoreal.
- GLB rig support from the master prompt (clipMap etc.) is not included — the procedural cat is the default and only model.
- The behaviour director, walking and zoomies are tuned for cuteness, not biological accuracy.
- Tested in headless Chromium for rendering/interaction flows; the microphone and speakers were **not** physically verified in the sandbox — the mic path follows the Web Audio/MediaRecorder standard flow used in production apps.
