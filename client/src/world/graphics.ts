// Phase 8C foundation (docs/plans/phase8c-graphics.md §6, §8): which graphics items are on, and the quality level.
// Main thread only (the chunk worker's location has no page query and no WebGL: builders never read this). Resolved once,
// on first use: ?quality=low|high > localStorage (graphics8c.quality.storageKey) > 'low' on a weak GPU, else 'high'.
// The level is fixed for the session; on high quality FpsWatch (main.ts) may drop post-processing + the image-based light
// mid-session when the frame rate stays low (graphics8c.quality.autoDowngrade), never the stored choice.
import { graphics8c as G } from '../config.ts';

export type Quality = 'low' | 'high';
export type GraphicsItem = Exclude<keyof typeof G, 'quality'>;

const asQuality = (v: string | null | undefined): Quality | undefined => (v === 'low' || v === 'high' ? v : undefined);

/** Pure: URL param, stored choice, WebGL renderer string → quality. */
export function pickQuality(url: string | null, stored: string | null, gpu: string): Quality {
  return asQuality(url) ?? asQuality(stored) ?? (G.quality.weakGpu.test(gpu) ? 'low' : 'high');
}

/** UNMASKED_RENDERER_WEBGL of a throwaway WebGL2 context ('' when unknown). */
function gpuName(): string {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    const name = gl && ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return name;
  } catch {
    return '';
  }
}

function stored(): string | null {
  try {
    return globalThis.localStorage?.getItem(G.quality.storageKey) ?? null;
  } catch {
    return null; // blocked site data
  }
}

let cached: { quality: Quality; gpu: string; forced: boolean } | undefined;

/** quality, the GPU string (F3 / reports), forced = set by ?quality= (tests / screenshots: no runtime downgrade) and
 *  on(item) = enabled in graphics8c and not switched off by low quality. */
export function graphics() {
  if (!cached) {
    const browser = typeof document !== 'undefined';
    const gpu = browser ? gpuName() : '';
    const url = browser ? new URLSearchParams(location.search).get('quality') : null;
    cached = { gpu, quality: browser ? pickQuality(url, stored(), gpu) : 'high', forced: asQuality(url) !== undefined };
  }
  const { quality, gpu, forced } = cached;
  return { quality, gpu, forced, on: (item: GraphicsItem) => G[item].enabled && !(quality === 'low' && G[item].lowOff) };
}

/** Pure frame-rate watch: frame(dt s) → true once, when the mean FPS of a whole `seconds` window (after `graceSeconds`)
 *  is below `fps`. A frame longer than 3 s (a hidden tab, a stall) restarts the window. */
export class FpsWatch {
  private played = 0;
  private time = 0;
  private frames = 0;
  private fired = false;
  constructor(private readonly cfg: { fps: number; seconds: number; graceSeconds: number } = G.quality.autoDowngrade) {}
  frame(dt: number): boolean {
    if (this.fired) return false;
    if (dt > 3) {
      [this.time, this.frames] = [0, 0];
      return false;
    }
    this.played += dt;
    if (this.played < this.cfg.graceSeconds) return false;
    this.time += dt;
    this.frames++;
    if (this.time < this.cfg.seconds) return false;
    const low = this.frames / this.time < this.cfg.fps;
    [this.time, this.frames] = [0, 0];
    return (this.fired = low);
  }
}
