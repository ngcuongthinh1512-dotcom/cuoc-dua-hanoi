// CETIQLO pattern atlas: 16 ORIGINAL procedural patterns (no third-party art) drawn once on a 512² canvas as grey masks
// (white = `colour2`, black = the item colour), 4 × 4 tiles of 128 px. items.ts samples it per instance (pattern id, second
// colour, repeat scale) in a small onBeforeCompile addition. Null without a DOM (Node tests).
import * as THREE from 'three';
import type { PatternId } from '@race/shared/cetiqlo';

export const ATLAS_PX = 512, TILE = 128, TILES = 4;
export const PATTERN_IDS: readonly PatternId[] = ['breton', 'pinstripe', 'border', 'gingham', 'tartan', 'windowpane', 'houndstooth', 'dot', 'floral', 'camo', 'tiedye', 'geo', 'waves', 'wash', 'corduroy', 'seersucker'];
/** Default repeats per UV tile (a garment face ≈ 0.5 m): how many times the 128 px tile tiles across it. */
export const PATTERN_SCALE: Record<PatternId, number> = { breton: 2, pinstripe: 3, border: 1, gingham: 3, tartan: 1.5, windowpane: 1.5, houndstooth: 4, dot: 2.5, floral: 1.5, camo: 1, tiedye: 1, geo: 1, waves: 1.5, wash: 1, corduroy: 4, seersucker: 3 };
export const patternIndex = (id: PatternId): number => PATTERN_IDS.indexOf(id);

type Draw = (x: CanvasRenderingContext2D) => void;
const W = TILE;
let seed = 11;
const rnd = () => ((seed = (seed * 48271) % 2147483647) / 2147483647);
const DRAW: Record<PatternId, Draw> = {
  breton: (x) => { for (let y = 0; y < W; y += 32) x.fillRect(0, y, W, 14); },
  pinstripe: (x) => { for (let i = 0; i < W; i += 16) x.fillRect(i, 0, 4, W); },
  border: (x) => { x.fillRect(0, 0, W, 34); x.fillRect(0, 70, W, 10); },
  gingham: (x) => { x.globalAlpha = 0.55; for (let i = 0; i < W; i += 32) { x.fillRect(i, 0, 16, W); x.fillRect(0, i, W, 16); } x.globalAlpha = 1; for (let i = 0; i < W; i += 32) for (let j = 0; j < W; j += 32) x.fillRect(i, j, 16, 16); },
  tartan: (x) => { x.globalAlpha = 0.5; x.fillRect(0, 0, 48, W); x.fillRect(0, 0, W, 48); x.globalAlpha = 1; x.fillRect(0, 0, 48, 48); x.fillRect(84, 0, 12, W); x.fillRect(0, 84, W, 12); },
  windowpane: (x) => { x.fillRect(0, 0, 5, W); x.fillRect(0, 0, W, 5); },
  houndstooth: (x) => { for (let i = 0; i < W; i += 32) for (let j = 0; j < W; j += 32) { x.fillRect(i, j, 16, 16); x.beginPath(); x.moveTo(i + 16, j); x.lineTo(i + 32, j); x.lineTo(i + 16, j + 16); x.fill(); x.beginPath(); x.moveTo(i, j + 16); x.lineTo(i + 16, j + 16); x.lineTo(i, j + 32); x.fill(); } },
  dot: (x) => { for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.beginPath(); x.arc(16 + i * 32 + (j % 2) * 16, 16 + j * 32, 7, 0, Math.PI * 2); x.fill(); } },
  floral: (x) => { for (let k = 0; k < 7; k++) { const cx = rnd() * W, cy = rnd() * W; for (let p = 0; p < 5; p++) { x.beginPath(); x.arc(cx + Math.cos((p * Math.PI * 2) / 5) * 8, cy + Math.sin((p * Math.PI * 2) / 5) * 8, 6, 0, Math.PI * 2); x.fill(); } x.globalAlpha = 0.4; x.beginPath(); x.arc(cx, cy, 5, 0, Math.PI * 2); x.fill(); x.globalAlpha = 1; } x.globalAlpha = 0.5; for (let k = 0; k < 10; k++) { x.beginPath(); x.ellipse(rnd() * W, rnd() * W, 9, 4, rnd() * 3, 0, Math.PI * 2); x.fill(); } x.globalAlpha = 1; },
  camo: (x) => { for (let k = 0; k < 16; k++) { x.globalAlpha = k < 6 ? 1 : k < 11 ? 0.55 : 0.3; x.beginPath(); const cx = rnd() * W, cy = rnd() * W; x.moveTo(cx, cy); for (let p = 0; p < 7; p++) x.lineTo(cx + Math.cos((p / 7) * Math.PI * 2) * (12 + rnd() * 16), cy + Math.sin((p / 7) * Math.PI * 2) * (9 + rnd() * 14)); x.closePath(); x.fill(); } x.globalAlpha = 1; },
  tiedye: (x) => { for (let r = 60; r > 4; r -= 7) { x.globalAlpha = 0.25; x.beginPath(); x.arc(64, 64, r, 0, Math.PI * 2); x.fill(); } x.globalAlpha = 1; for (let k = 0; k < 8; k++) { x.beginPath(); x.moveTo(64, 64); x.lineTo(64 + Math.cos(k * 0.8) * 70, 64 + Math.sin(k * 0.8) * 70); x.lineWidth = 3; x.strokeStyle = '#fff'; x.stroke(); } },
  geo: (x) => { x.font = '900 34px Helvetica, Arial, sans-serif'; x.textAlign = 'center'; x.fillText('CETI', 64, 44); x.fillText('QLO', 64, 84); x.fillRect(16, 100, 96, 6); x.beginPath(); x.moveTo(20, 20); x.lineTo(40, 6); x.lineTo(40, 20); x.fill(); x.beginPath(); x.arc(104, 14, 8, 0, Math.PI * 2); x.fill(); },
  waves: (x) => { x.lineWidth = 5; x.strokeStyle = '#fff'; for (let y = 10; y < W; y += 28) { x.beginPath(); for (let i = 0; i <= W; i += 4) x.lineTo(i, y + Math.sin((i / W) * Math.PI * 4) * 7); x.stroke(); } x.beginPath(); x.arc(100, 28, 10, 0, Math.PI * 2); x.fill(); },
  wash: (x) => { const g = x.createLinearGradient(0, 0, 0, W); g.addColorStop(0, 'rgba(255,255,255,0.1)'); g.addColorStop(0.5, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0.15)'); x.fillStyle = g; x.fillRect(0, 0, W, W); x.fillStyle = '#fff'; x.fillRect(20, 40, 60, 3); x.fillRect(30, 46, 40, 2); x.fillRect(50, 90, 50, 3); x.fillRect(56, 96, 30, 2); },
  corduroy: (x) => { for (let i = 0; i < W; i += 8) x.fillRect(i, 0, 3, W); },
  seersucker: (x) => { for (let i = 0; i < W; i += 12) { x.fillRect(i, 0, 5, W); x.globalAlpha = 0.35; x.fillRect(i + 5, 0, 7, W); x.globalAlpha = 1; } },
};

let cached: THREE.Texture | null | undefined;
export function patternAtlas(): THREE.Texture | null {
  if (cached !== undefined) return cached;
  if (typeof document === 'undefined') return (cached = null);
  const c = document.createElement('canvas');
  c.width = c.height = ATLAS_PX;
  const x = c.getContext('2d')!;
  x.fillStyle = '#000';
  x.fillRect(0, 0, ATLAS_PX, ATLAS_PX);
  PATTERN_IDS.forEach((id, i) => {
    x.save();
    x.translate((i % TILES) * TILE, Math.floor(i / TILES) * TILE);
    x.beginPath(); x.rect(0, 0, TILE, TILE); x.clip();
    x.fillStyle = '#fff'; x.strokeStyle = '#fff';
    DRAW[id](x);
    x.restore();
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return (cached = t);
}
