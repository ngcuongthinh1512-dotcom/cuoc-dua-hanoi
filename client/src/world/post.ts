// Phase 8C track T1 (docs/plans/phase8c-graphics.md #10): post-processing, hooked in main.ts (render + resize). null =
// the plain renderer.render path of Phase 7 (graphics8c.post off, or ?quality=low / a weak GPU: post.lowOff).
import type * as THREE from 'three';
import { graphics } from './graphics.ts';

export interface Post {
  render(): void;
  setSize(width: number, height: number): void;
}

export function createPost(_renderer: THREE.WebGLRenderer, _scene: THREE.Scene, _camera: THREE.Camera): Post | null {
  if (!graphics().on('post')) return null;
  // TODO(8C T1): EffectComposer (three/examples/jsm/postprocessing): RenderPass → SMAAPass → UnrealBloomPass (very light) →
  // OutputPass (tone mapping + sRGB move here: renderer.toneMapping stays as set in main.ts for the plain path). Keep
  // renderer.info usable for __STATS__ (info.autoReset = false + reset() before the passes, or count the scene pass only).
  return null;
}
