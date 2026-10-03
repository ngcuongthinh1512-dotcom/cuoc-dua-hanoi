// Phase 8C foundation (docs/plans/phase8c-graphics.md §6, §8): which graphics items are on, and the quality level.
// Main thread only (the chunk worker's location has no page query and no WebGL: builders never read this). Resolved once,
// on first use: ?quality=low|high > localStorage (graphics8c.quality.storageKey) > 'low' on a weak GPU, else 'high'.
// ponytail: fixed for the session (no auto-downgrade on a low FPS mid-race), add an FPS watcher like npcRender.autoDensity if needed
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

let cached: { quality: Quality; gpu: string } | undefined;

/** quality, the GPU string (F3 / reports) and on(item) = enabled in graphics8c and not switched off by low quality. */
export function graphics() {
  if (!cached) {
    const browser = typeof document !== 'undefined';
    const gpu = browser ? gpuName() : '';
    cached = { gpu, quality: browser ? pickQuality(new URLSearchParams(location.search).get('quality'), stored(), gpu) : 'high' };
  }
  const { quality, gpu } = cached;
  return { quality, gpu, on: (item: GraphicsItem) => G[item].enabled && !(quality === 'low' && G[item].lowOff) };
}
