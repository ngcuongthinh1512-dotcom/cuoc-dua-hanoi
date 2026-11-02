// CETIQLO pattern atlas: 9 ORIGINAL procedural patterns (no third-party art) drawn once on a 512² canvas as grey masks
// (white = `colour2`, black = the item colour), 4 × 4 tiles of 128 px. items.ts samples it per instance (pattern id, second
// colour, repeat scale) in a small onBeforeCompile addition. Null without a DOM (Node tests).
import * as THREE from 'three';
import type { PatternId } from '@race/shared/cetiqlo';

export const ATLAS_PX = 512, TILE = 128, TILES = 4;
export const PATTERN_IDS: readonly PatternId[] = ['breton', 'pinstripe', 'border', 'gingham', 'windowpane', 'dot', 'floral', 'waves', 'wash']; // 9 that stay crisp at 3 m (audit 2026-11-02: tartan, houndstooth, camo, tie-dye, geo, corduroy, seersucker removed)
/** Default repeats per UV tile (a garment face ≈ 0.5 m): how many times the 128 px tile tiles across it. */
export const PATTERN_SCALE: Record<PatternId, number> = { breton: 2, pinstripe: 2.5, border: 1, gingham: 2.5, windowpane: 1.5, dot: 2, floral: 1.5, waves: 1.5, wash: 1 };
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
  windowpane: (x) => { x.fillRect(0, 0, 5, W); x.fillRect(0, 0, W, 5); },
  dot: (x) => { for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.beginPath(); x.arc(16 + i * 32 + (j % 2) * 16, 16 + j * 32, 7, 0, Math.PI * 2); x.fill(); } },
  floral: (x) => { for (let k = 0; k < 7; k++) { const cx = rnd() * W, cy = rnd() * W; for (let p = 0; p < 5; p++) { x.beginPath(); x.arc(cx + Math.cos((p * Math.PI * 2) / 5) * 8, cy + Math.sin((p * Math.PI * 2) / 5) * 8, 6, 0, Math.PI * 2); x.fill(); } x.globalAlpha = 0.4; x.beginPath(); x.arc(cx, cy, 5, 0, Math.PI * 2); x.fill(); x.globalAlpha = 1; } x.globalAlpha = 0.5; for (let k = 0; k < 10; k++) { x.beginPath(); x.ellipse(rnd() * W, rnd() * W, 9, 4, rnd() * 3, 0, Math.PI * 2); x.fill(); } x.globalAlpha = 1; },
  waves: (x) => { x.lineWidth = 5; x.strokeStyle = '#fff'; for (let y = 10; y < W; y += 28) { x.beginPath(); for (let i = 0; i <= W; i += 4) x.lineTo(i, y + Math.sin((i / W) * Math.PI * 4) * 7); x.stroke(); } x.beginPath(); x.arc(100, 28, 10, 0, Math.PI * 2); x.fill(); },
  wash: (x) => { const g = x.createLinearGradient(0, 0, 0, W); g.addColorStop(0, 'rgba(255,255,255,0.1)'); g.addColorStop(0.5, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0.15)'); x.fillStyle = g; x.fillRect(0, 0, W, W); x.fillStyle = '#fff'; x.fillRect(20, 40, 60, 3); x.fillRect(30, 46, 40, 2); x.fillRect(50, 90, 50, 3); x.fillRect(56, 96, 30, 2); },
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
  t.anisotropy = 8;
  return (cached = t);
}
