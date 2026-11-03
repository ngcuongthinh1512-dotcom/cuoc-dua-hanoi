// CETIQLO signage: ONE canvas atlas (≤ 1024²) holding every sign — the facade logo + wordmark, the CHECKOUT pad text, the
// bilingual zone signs — so all signs in the store are one merged mesh with one texture (1 draw call). Without a DOM (Node
// tests) the atlas is a 1 × 1 placeholder and the planes stay white.
import * as THREE from 'three';
import { BRAND_RED, FONT, drawLogo } from './brand.ts';

export const ATLAS = 1024;
export interface SignSpec { id: string; kind: 'zone' | 'checkout' | 'logo' | 'wordmark' | 'text'; text?: string; sub?: string }
export interface SignRect { u0: number; v0: number; u1: number; v1: number; aspect: number }

/** Packs the signs into the atlas (fixed cells: zone signs 340 × 72, logo 256², wordmark / checkout 512 × 128) and draws them. */
export function makeAtlas(signs: readonly SignSpec[]): { texture: THREE.Texture; rects: Map<string, SignRect> } {
  const rects = new Map<string, SignRect>();
  const dom = typeof document !== 'undefined';
  const c = dom ? document.createElement('canvas') : null;
  if (c) c.width = c.height = ATLAS;
  const x = c?.getContext('2d') ?? null;
  // row packer: cells are placed left to right, rows of the tallest cell in them
  let px = 0, py = 0, rowH = 0;
  const cell = (id: string, w: number, h: number, draw: (x: CanvasRenderingContext2D, w: number, h: number) => void) => {
    if (px + w > ATLAS) { px = 0; py += rowH; rowH = 0; }
    if (py + h > ATLAS) throw new Error('cetiqlo signage atlas full');
    rects.set(id, { u0: px / ATLAS, v0: 1 - (py + h) / ATLAS, u1: (px + w) / ATLAS, v1: 1 - py / ATLAS, aspect: w / h });
    if (x) { x.save(); x.translate(px, py); x.beginPath(); x.rect(0, 0, w, h); x.clip(); draw(x, w, h); x.restore(); }
    px += w; rowH = Math.max(rowH, h);
  };
  for (const s of signs) {
    if (s.kind === 'logo') cell(s.id, 256, 256, (x, w) => drawLogo(x, 0, 0, w));
    else if (s.kind === 'wordmark') cell(s.id, 512, 128, (x, w, h) => { // transparent: sits straight on the wall
      x.fillStyle = BRAND_RED; x.font = `900 ${h * 0.7}px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText('CETIQLO', w / 2, h / 2 + 4);
    });
    else if (s.kind === 'checkout') cell(s.id, 512, 128, (x, w, h) => {
      x.fillStyle = BRAND_RED; x.fillRect(0, 0, w, h);
      x.fillStyle = '#fff'; x.font = `900 ${h * 0.62}px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText('CHECKOUT', w / 2, h / 2 + 4);
    });
    else cell(s.id, 320, 64, (x, w, h) => {
      x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
      x.fillStyle = BRAND_RED; x.fillRect(0, 0, 8, h);
      x.fillStyle = '#1c1c1e'; x.textAlign = 'left'; x.textBaseline = 'middle';
      x.font = `800 ${h * 0.44}px ${FONT}`; x.fillText(s.text ?? '', 18, h * 0.32);
      x.fillStyle = '#6e6e73'; x.font = `500 ${h * 0.27}px ${FONT}`; x.fillText((s.sub ?? '').toUpperCase(), 18, h * 0.72);
    });
  }
  const texture = c ? new THREE.CanvasTexture(c) : new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return { texture, rects };
}

/** A sign plane (centre at the origin, facing +z) `w` m wide, with the atlas UVs of `r`; height follows the cell's aspect. */
export function signPlane(r: SignRect, w: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, w / r.aspect);
  g.setAttribute('uv', new THREE.Float32BufferAttribute([r.u0, r.v1, r.u1, r.v1, r.u0, r.v0, r.u1, r.v0], 2));
  return g;
}
