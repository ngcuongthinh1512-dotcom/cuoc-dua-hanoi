// Leg 3 grade (config `look`: preset 'modern' by default, 'old' = "Hà Nội xưa"): the canvas gets a CSS filter (sepia / desaturate / soft contrast) and three
// fixed overlays right after it in the DOM (under every HUD panel, no z-index): lifted blacks (screen), a vignette and a
// static grain tile (overlay). Chrome's compositor does the work, so there is no render pass: low and high quality look
// the same, the game loop pays nothing. The three-side part of the look (fog tint, asphalt patches) reads vintage() too.
// ponytail: a post ShaderPass would allow a real curve / split tone; add one on high quality if the owner wants more.
import { look as K } from '../config.ts';
import { hash01 } from './geom.ts';

let v: number | undefined;
/** 0…1 strength of the look: DEV `?vintage=` > config look.vintage. */
export function vintage(): number {
  if (v === undefined) {
    const q = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('vintage');
    const n = q === null ? NaN : Number(q);
    v = Math.min(1, Math.max(0, Number.isFinite(n) ? n : K.vintage));
  }
  return v;
}

/** base → x by vintage(). */
export const mix = (x: number, base = 1) => base + (x - base) * vintage();

export function applyLook(canvas: HTMLCanvasElement): void {
  const s = vintage();
  if (s <= 0) return;
  const q = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('grade'); // DEV override
  const modern = (q === 'old' || q === 'modern' ? q : K.preset) === 'modern';
  const g = modern ? K.modern : K.grade;
  const [lift, vig, grain] = modern ? [K.modern.lift, K.modern.vignette, K.modern.grain] : [K.lift, 1, 1];
  canvas.style.filter = `sepia(${mix(g.sepia, 0).toFixed(3)}) saturate(${mix(g.saturate).toFixed(3)}) contrast(${mix(g.contrast).toFixed(3)}) brightness(${mix(g.brightness).toFixed(3)})`;
  const layers = [
    `background:${lift};mix-blend-mode:screen;opacity:${s}`,
    `background:radial-gradient(ellipse at center, transparent ${K.vignette.from}%, ${K.vignette.colour} 100%);opacity:${s * vig}`,
    `background:url(${grainTile()}) repeat;mix-blend-mode:overlay;opacity:${K.grain.opacity * s * grain}`,
  ];
  for (const css of layers.reverse()) {
    const d = document.createElement('div');
    d.className = 'look';
    d.style.cssText = `position:fixed;inset:0;pointer-events:none;${css}`;
    canvas.after(d);
  }
}

/** A deterministic grey-noise PNG data URL (grain.size px square). */
function grainTile(): string {
  const n = K.grain.size;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d')!;
  const img = g.createImageData(n, n);
  for (let i = 0; i < n * n; i++) {
    const l = Math.floor(255 * hash01(i % n, Math.floor(i / n), 11));
    img.data.set([l, l, l, 255], 4 * i);
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL();
}
