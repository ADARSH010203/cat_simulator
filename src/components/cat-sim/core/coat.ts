'use client';

// Procedural coat system: canvas-generated textures (base colour, pattern,
// belly gradient) + rim-lit physical materials + shell-fur layers.
// All colour / pattern changes keep shading, AO feel and rim light.

import * as THREE from 'three';
import type { CoatSettings } from '@/store/settingsStore';
import { makeNoise2D } from '../core/utils';

const BODY_TEX = 512;
const HEAD_TEX = 512;

function hexToRgb(hex: string): [number, number, number] {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

function css(r: number, g: number, b: number): string {
  return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
}

/** Any CSS colour (hex / hsl() / rgb() / named) → rgba() with alpha.
 *  THREE.Color does the parsing, so hand-edited coat JSON with hsl() colours
 *  can never crash the canvas gradient (they used to). */
function rgba(color: string, alpha: number): string {
  const [r, g, b] = hexToRgb(color);
  return `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${alpha})`;
}

function shade(hex: string, k: number): string {
  const [r, g, b] = hexToRgb(hex);
  return css(Math.min(1, r * k), Math.min(1, g * k), Math.min(1, b * k));
}

/** Draw short fur strokes over the whole canvas for micro-texture. */
function furStrokes(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  base: string,
  count: number
): void {
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.strokeStyle = shade(base, 1.25);
  ctx.lineWidth = 1;
  for (let i = 0; i < count; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const len = 4 + Math.random() * 10;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + 1, y + len * 0.5, x + (Math.random() - 0.5) * 3, y + len);
    ctx.stroke();
  }
  ctx.restore();
}

/** seamless blob (drawn 3x wrapped horizontally) */
function blob(
  ctx: CanvasRenderingContext2D,
  w: number,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color: string,
  squish = 0.35
): void {
  ctx.fillStyle = color;
  for (const dx of [-w, 0, w]) {
    ctx.beginPath();
    ctx.ellipse(x + dx, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    // wavy overlap for irregular edge
    ctx.beginPath();
    ctx.ellipse(x + dx + rx * 0.4, y + ry * squish, rx * 0.45, ry * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Body texture: v axis maps to vertical (canvas y=0 = back, y=H = belly).
 * Patterns wrap around u.
 */
export function drawBodyTexture(canvas: HTMLCanvasElement, coat: CoatSettings): void {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d')!;
  const noise = makeNoise2D(42);

  ctx.fillStyle = coat.baseColor;
  ctx.fillRect(0, 0, w, h);

  const px = coat.patternIntensity;

  // ---- belly / chest lightening (drawn FIRST so patterns stay visible on top) ----
  const bellySize = coat.patternType === 'tuxedo' ? 0.62 : 0.3;
  const grad = ctx.createLinearGradient(0, h * (1 - bellySize - 0.18), 0, h);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(0.55, rgba(coat.bellyColor, 0.9));
  grad.addColorStop(1, coat.bellyColor);
  ctx.fillStyle = grad;
  ctx.fillRect(0, h * (1 - bellySize - 0.18), w, h * (bellySize + 0.18));

  // ---- pattern layer (painted over the belly so every angle shows the coat) ----
  // vertical fade: patterns stay strong on the back/sides and melt into the belly
  const sideFade = (y: number): number => {
    // 1.0 above 0.62h, fades to 0 at 0.97h (keeps the belly clean)
    if (y < h * 0.62) return 1;
    const t = (y - h * 0.62) / (h * 0.35);
    return Math.max(0, 1 - t);
  };

  switch (coat.patternType) {
    case 'tabby': {
      // vertical bands (rings around the body) with wavy edges + dorsal darkening
      ctx.save();
      ctx.globalAlpha = 0.55 * px;
      for (let i = 0; i < 9; i++) {
        const x = (i / 9) * w + Math.sin(i * 2.7) * 12;
        const bw = 10 + noise(i * 3.1, 0) * 26;
        ctx.fillStyle = coat.patternColor;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        for (let y = 0; y <= h; y += 16) {
          ctx.lineTo(x + Math.sin(y * 0.05 + i * 2.1) * 7 + bw * 0.5 * noise(i, y * 0.01), y);
        }
        for (let y = h; y >= 0; y -= 16) {
          ctx.lineTo(x + Math.sin(y * 0.05 + i * 2.1) * 7 - bw * 0.55 * noise(i + 5, y * 0.01), y);
        }
        ctx.closePath();
        ctx.fill();
      }
      // dorsal spine stripe
      ctx.globalAlpha = 0.5 * px;
      ctx.fillStyle = coat.patternColor;
      ctx.fillRect(0, 0, w, h * 0.14);
      ctx.restore();
      break;
    }
    case 'spots': {
      ctx.save();
      for (let i = 0; i < 22; i++) {
        const x = noise(i, 7) * w;
        const y = h * (0.08 + noise(i, 13) * 0.8);
        const r = 14 + noise(i, 21) * 22;
        const fade = sideFade(y);
        if (fade <= 0.02) continue;
        ctx.globalAlpha = 0.85 * px * fade;
        blob(ctx, w, x, y, r, r * 0.8, coat.patternColor);
      }
      // a couple of smaller satellite dots for a natural scattered look
      for (let i = 0; i < 8; i++) {
        const x = noise(i + 40, 7) * w;
        const y = h * (0.1 + noise(i + 40, 13) * 0.7);
        const fade = sideFade(y);
        if (fade <= 0.02) continue;
        ctx.globalAlpha = 0.7 * px * fade;
        blob(ctx, w, x, y, 7 + noise(i + 40, 21) * 8, 6 + noise(i + 40, 23) * 7, coat.patternColor);
      }
      // reliable shoulder/chest dots facing the camera (sphere front ≈ u 0.25)
      for (let i = 0; i < 5; i++) {
        const u = 0.25 + (noise(i + 60, 5) - 0.5) * 0.22;
        const y = h * (0.14 + noise(i + 60, 15) * 0.4);
        const fade = sideFade(y);
        if (fade <= 0.02) continue;
        ctx.globalAlpha = 0.8 * px * fade;
        blob(ctx, w, w * u, y, 12 + noise(i + 60, 25) * 12, 10 + noise(i + 60, 27) * 10, coat.patternColor);
      }
      ctx.restore();
      break;
    }
    case 'patches': {
      ctx.save();
      for (let i = 0; i < 5; i++) {
        const x = noise(i + 3, 31) * w;
        const y = h * (0.2 + noise(i, 41) * 0.6);
        const fade = Math.max(0.55, sideFade(y));
        ctx.globalAlpha = 0.95 * px * fade;
        blob(ctx, w, x, y, 70 + noise(i, 51) * 60, 60 + noise(i, 61) * 50, coat.patternColor);
      }
      // secondary darker patches for calico feel
      for (let i = 0; i < 3; i++) {
        const x = noise(i + 9, 71) * w;
        const y = h * (0.15 + noise(i, 81) * 0.7);
        const fade = Math.max(0.5, sideFade(y));
        ctx.globalAlpha = 0.6 * px * fade;
        blob(ctx, w, x, y, 46 + noise(i, 91) * 30, 40 + noise(i, 95) * 30, shade(coat.patternColor, 0.35));
      }
      ctx.restore();
      break;
    }
    case 'tuxedo': {
      // the white comes from the big belly band above
      break;
    }
    case 'colorpoint': {
      // body stays light; nothing here (extremities are separately tinted)
      break;
    }
    default:
      break;
  }

  // ---- fur micro strokes ----
  furStrokes(ctx, w, h, coat.baseColor, 500);
}

/** Head texture: base + crown stripes + subtle shading. */
export function drawHeadTexture(canvas: HTMLCanvasElement, coat: CoatSettings): void {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = coat.baseColor;
  ctx.fillRect(0, 0, w, h);

  // Sphere UV: the face looks towards u≈0.25 — markings are centred there.
  const FACE_U = 0.25;
  if (coat.patternType === 'tabby' || coat.patternType === 'patches') {
    ctx.save();
    ctx.globalAlpha = 0.5 * coat.patternIntensity;
    ctx.fillStyle = coat.patternColor;
    // the classic tabby "M" fanning over the forehead
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(w * FACE_U + i * 26, 8);
      ctx.quadraticCurveTo(w * FACE_U + i * 34, h * 0.3, w * FACE_U + i * 22, h * 0.42);
      ctx.lineWidth = 12 - Math.abs(i) * 2;
      ctx.strokeStyle = coat.patternColor;
      ctx.stroke();
    }
    ctx.restore();
  }
  if (coat.patternType === 'spots') {
    // dots clustered over the face/crown (u≈0.25), a few on the sides & back
    ctx.save();
    const put = (u: number, v: number, r: number): void => {
      ctx.globalAlpha = 0.8 * coat.patternIntensity;
      ctx.fillStyle = coat.patternColor;
      ctx.beginPath();
      ctx.ellipse(w * u, h * v, r, r * 0.82, 0, 0, Math.PI * 2);
      ctx.fill();
    };
    const noise = makeNoise2D(7);
    // forehead trio + crown pair (clearly visible from the front)
    put(FACE_U - 0.055 + noise(1, 3) * 0.02, 0.13 + noise(1, 5) * 0.02, 13);
    put(FACE_U + 0.05 + noise(2, 3) * 0.02, 0.12 + noise(2, 5) * 0.02, 12);
    put(FACE_U + noise(3, 3) * 0.02, 0.09 + noise(3, 5) * 0.02, 15);
    put(FACE_U - 0.09 + noise(4, 3) * 0.02, 0.08 + noise(4, 5) * 0.02, 12);
    put(FACE_U + 0.09 + noise(5, 3) * 0.02, 0.07 + noise(5, 5) * 0.02, 12);
    // cheek dots
    put(FACE_U - 0.11, 0.3, 10);
    put(FACE_U + 0.11, 0.31, 10);
    // sides + back of the head (visible when she turns)
    put(0.08, 0.2, 12);
    put(0.42, 0.18, 12);
    put(0.62, 0.14, 14);
    put(0.78, 0.19, 12);
    ctx.restore();
  }
  if (coat.patternType === 'colorpoint') {
    // darken the crown slightly
    ctx.save();
    ctx.globalAlpha = 0.25 * coat.patternIntensity;
    ctx.fillStyle = coat.patternColor;
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.25, w * 0.3, h * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  furStrokes(ctx, w, h, coat.baseColor, 260);
}

/** Iris texture — radial gradient, fibres, dark limbal ring. */
export function makeIrisTexture(colorHex: string): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const [r, g, b] = hexToRgb(colorHex);

  const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.05, size / 2, size / 2, size * 0.5);
  grad.addColorStop(0, css(Math.min(1, r * 1.5 + 0.1), Math.min(1, g * 1.5 + 0.1), Math.min(1, b * 1.5 + 0.1)));
  grad.addColorStop(0.55, colorHex);
  grad.addColorStop(0.85, shade(colorHex, 0.55));
  grad.addColorStop(1, shade(colorHex, 0.28));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // radial fibres
  ctx.save();
  ctx.translate(size / 2, size / 2);
  for (let i = 0; i < 90; i++) {
    const a = (i / 90) * Math.PI * 2;
    const r1 = size * 0.16;
    const r2 = size * (0.34 + Math.random() * 0.12);
    ctx.strokeStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 1 + Math.random();
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
    ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
    ctx.stroke();
  }
  // limbal ring
  ctx.strokeStyle = 'rgba(15,10,10,0.55)';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.46, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Rim-light injection for the soft fuzzy halo on base materials. */
function injectRim(mat: THREE.Material, strength: number): void {
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
       uniform float uRimStrength;`
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>
       {
         float rim = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0), 2.6);
         gl_FragColor.rgb += vec3(1.0, 0.95, 0.88) * rim * uRimStrength;
       }`
    );
    shader.uniforms.uRimStrength = { value: strength };
  };
}

export interface CoatMaterialSet {
  bodyMat: THREE.MeshPhysicalMaterial;
  headMat: THREE.MeshPhysicalMaterial;
  muzzleMat: THREE.MeshPhysicalMaterial;
  bellyMat: THREE.MeshPhysicalMaterial;
  earOuterMat: THREE.MeshPhysicalMaterial;
  earInnerMat: THREE.MeshPhysicalMaterial;
  noseMat: THREE.MeshPhysicalMaterial;
  pawMat: THREE.MeshPhysicalMaterial;
  tailTipMat: THREE.MeshPhysicalMaterial;
  whiskerMat: THREE.MeshBasicMaterial;
  bodyCanvas: HTMLCanvasElement;
  headCanvas: HTMLCanvasElement;
  update(coat: CoatSettings): void;
  dispose(): void;
}

export function createCoatMaterials(coat: CoatSettings): CoatMaterialSet {
  const bodyCanvas = document.createElement('canvas');
  bodyCanvas.width = BODY_TEX;
  bodyCanvas.height = BODY_TEX;
  const headCanvas = document.createElement('canvas');
  headCanvas.width = HEAD_TEX;
  headCanvas.height = HEAD_TEX;

  const bodyTex = new THREE.CanvasTexture(bodyCanvas);
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.wrapS = THREE.RepeatWrapping;
  bodyTex.anisotropy = 4;
  const headTex = new THREE.CanvasTexture(headCanvas);
  headTex.colorSpace = THREE.SRGBColorSpace;
  headTex.anisotropy = 4;

  const mkPhys = (opts: Partial<THREE.MeshPhysicalMaterialParameters>): THREE.MeshPhysicalMaterial => {
    const m = new THREE.MeshPhysicalMaterial({
      roughness: 0.9,
      sheen: 0.55,
      sheenRoughness: 0.85,
      sheenColor: new THREE.Color('#fff4e6'),
      ...opts,
    });
    return m;
  };

  const bodyMat = mkPhys({ map: bodyTex });
  const headMat = mkPhys({ map: headTex });
  const muzzleMat = mkPhys({});
  const bellyMat = mkPhys({});
  const earOuterMat = mkPhys({ map: bodyTex });
  const earInnerMat = mkPhys({ roughness: 0.8 });
  const noseMat = mkPhys({ roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.4 });
  const pawMat = mkPhys({});
  const tailTipMat = mkPhys({});

  injectRim(bodyMat, 0.16);
  injectRim(headMat, 0.16);
  injectRim(earOuterMat, 0.12);
  injectRim(pawMat, 0.1);
  injectRim(tailTipMat, 0.1);

  const whiskerMat = new THREE.MeshBasicMaterial({
    color: '#ffffff',
    transparent: true,
    opacity: 0.7,
  });

  const set = {
    bodyMat,
    headMat,
    muzzleMat,
    bellyMat,
    earOuterMat,
    earInnerMat,
    noseMat,
    pawMat,
    tailTipMat,
    whiskerMat,
    bodyCanvas,
    headCanvas,
    update(c: CoatSettings): void {
      drawBodyTexture(bodyCanvas, c);
      drawHeadTexture(headCanvas, c);
      bodyTex.needsUpdate = true;
      headTex.needsUpdate = true;

      const faceLight =
        c.patternType === 'tuxedo' ? c.bellyColor : c.patternType === 'colorpoint' ? c.maskColor : c.bellyColor;
      muzzleMat.color.set(faceLight);
      bellyMat.color.set(c.bellyColor);
      earInnerMat.color.set(c.innerEarColor);
      noseMat.color.set(c.noseColor);
      pawMat.color.set(c.pawColor);
      earOuterMat.color.set(c.baseColor === '#ffffff' ? '#ffffff' : '#ffffff'); // texture carries colour
      // colorpoint → dark extremities
      const extrem = c.patternType === 'colorpoint' ? c.maskColor : shade(c.patternColor, 0.9);
      tailTipMat.color.set(c.patternType === 'solid' ? c.baseColor : extrem);
      // subtle tone variation so solids are not flat
      bodyMat.sheenColor.set(shade(c.baseColor, 1.2));
      headMat.sheenColor.set(shade(c.baseColor, 1.2));
    },
    dispose(): void {
      bodyMat.dispose();
      headMat.dispose();
      muzzleMat.dispose();
      bellyMat.dispose();
      earOuterMat.dispose();
      earInnerMat.dispose();
      noseMat.dispose();
      pawMat.dispose();
      tailTipMat.dispose();
      whiskerMat.dispose();
      bodyTex.dispose();
      headTex.dispose();
    },
  };

  set.update(coat);
  return set;
}

// ------------------------------------------------------------------ fur shells

export interface FurShellMaterial extends THREE.MeshPhysicalMaterial {
  uniforms: { shellFrac: { value: number }; uFurLen: { value: number }; uTime: { value: number } };
}

/**
 * Shell-fur layer material: vertices pushed along normals, strand alpha from
 * per-cell hash of map UVs, darker roots, wind sway. Lit like the base coat.
 */
export function makeFurShellMaterial(
  map: THREE.Texture,
  shellFrac: number,
  furLength: number
): FurShellMaterial {
  const mat = new THREE.MeshPhysicalMaterial({
    map,
    transparent: true,
    depthWrite: false,
    roughness: 0.95,
    sheen: 0.4,
    side: THREE.FrontSide,
  }) as FurShellMaterial;

  const uniforms = {
    shellFrac: { value: shellFrac },
    uFurLen: { value: furLength },
    uTime: { value: 0 },
  };
  mat.uniforms = uniforms;

  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float shellFrac;
         uniform float uFurLen;
         uniform float uTime;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         transformed += objectNormal * uFurLen * shellFrac;
         transformed.y -= 0.2 * uFurLen * shellFrac * shellFrac; // gravity droop
         transformed.x += sin(uTime * 1.4 + position.y * 9.0) * 0.05 * uFurLen * shellFrac; // wind
         transformed.z += cos(uTime * 1.1 + position.x * 7.0) * 0.04 * uFurLen * shellFrac;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float shellFrac;
         float furHash(vec2 p) {
           return fract(sin(dot(floor(p), vec2(12.9898, 78.233))) * 43758.5453);
         }`
      )
      .replace(
        '#include <alphamap_fragment>',
        `#include <alphamap_fragment>
         {
           float cellHash = furHash(vMapUv * vec2(170.0, 44.0));
           float a = smoothstep(shellFrac - 0.13, shellFrac + 0.03, cellHash);
           a *= (1.0 - shellFrac * 0.35);
           diffuseColor.a *= a * 0.92;
           diffuseColor.rgb *= mix(0.58, 1.0, shellFrac); // darker roots (fake AO)
         }`
      );
  };
  mat.customProgramCacheKey = () => `fur-${shellFrac.toFixed(3)}`;
  return mat;
}

export const FUR_SHELLS: Record<'low' | 'medium' | 'high', number> = {
  low: 0,
  medium: 4,
  high: 10,
};
