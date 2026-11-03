'use client';

// Pure colour helpers for coat pattern switching.
// Kid-UX rule: changing the pattern TYPE must always read clearly on screen.
// Tuxedo and colour-point markings live on the part colours (belly / paws /
// mask), so we derive a high-contrast companion palette from the base colour
// when those patterns are picked. The base colour itself is never changed.

import * as THREE from 'three';
import type { CoatSettings, PatternType } from '@/store/settingsStore';

/** Perceived lightness (HSL L) of any CSS colour three can parse. */
export function lightness(color: string): number {
  const hsl = { h: 0, s: 0, l: 0 };
  new THREE.Color(color).getHSL(hsl);
  return hsl.l;
}

/** Same hue+saturation, lightness moved toward `target` (0..1). */
export function toLightness(color: string, target: number): string {
  const c = new THREE.Color(color);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  const l = hsl.l + (target - hsl.l) * 0.9;
  // keep saturation lively at the extremes so whites stay warm, not grey
  const s = hsl.s * (l > 0.85 ? 0.55 : 1);
  c.setHSL(hsl.h, s, Math.min(0.97, Math.max(0.04, l)));
  return `#${c.getHexString()}`;
}

/**
 * Companion colours for a pattern-type switch so the pattern is always
 * visible. Returns {} for patterns that draw on the canvas layer and read
 * fine with the user's existing pattern colour.
 */
export function derivePatternColors(type: PatternType, coat: CoatSettings): Partial<CoatSettings> {
  if (type === 'tuxedo') {
    // Classic tuxedo: white bib, socks and muzzle on a mid/dark base.
    // Pale base cats get charcoal markings instead (still a bold look).
    const pale = lightness(coat.baseColor) > 0.7;
    const bib = pale ? toLightness(coat.baseColor, 0.16) : toLightness(coat.baseColor, 0.92);
    return { bellyColor: bib, pawColor: bib, maskColor: bib, patternColor: coat.baseColor };
  }
  if (type === 'colorpoint') {
    // Siamese-style: dark mask and points on a light body; on a dark body
    // the points flip to cream (Birman look) so they stay visible.
    const dark = lightness(coat.baseColor) < 0.35;
    const point = dark ? toLightness(coat.baseColor, 0.82) : toLightness(coat.baseColor, 0.2);
    return { maskColor: point, pawColor: point, patternColor: point };
  }
  return {};
}
