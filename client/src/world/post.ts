// Phase 8C track T1 (docs/plans/phase8c-graphics.md #10): post-processing, hooked in main.ts (render + resize). null =
// the plain renderer.render path of Phase 7 (graphics8c.post off, or ?quality=low / a weak GPU: post.lowOff).
// On: scene → HalfFloat target (linear, no tone mapping) → light bloom (only the brightest highlights: sun glints on the
// river, gold, neon) → OutputPass (ACES tone mapping + sRGB, the renderer's settings) → SMAA on the display image (the
// canvas MSAA does not reach a render target; an MSAA target at pixel ratio 2 would cost ~250 MB).
// renderer.info counts every pass of the frame (autoReset off, reset here), so __STATS__ / F3 include the post passes.
import { type Camera, type Scene, Vector2, type WebGLRenderer } from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { graphics8c } from '../config.ts';
import { mountQualitySetting } from '../ui/settings.ts';
import { graphics } from './graphics.ts';

const P = graphics8c.post;

export interface Post {
  render(): void;
  setSize(width: number, height: number): void;
}

export function createPost(renderer: WebGLRenderer, scene: Scene, camera: Camera): Post | null {
  mountQualitySetting(); // the Esc menu's "Chất lượng" row (ui/settings.ts); here because post is created once, early
  if (!graphics().on('post')) return null;
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // resolution: composer.setSize sets the real one
  if (P.bloom.strength > 0) composer.addPass(new UnrealBloomPass(new Vector2(256, 256), P.bloom.strength, P.bloom.radius, P.bloom.threshold));
  composer.addPass(new OutputPass());
  if (P.smaa) composer.addPass(new SMAAPass());
  renderer.info.autoReset = false;
  return {
    render() {
      renderer.info.reset();
      composer.render();
    },
    setSize(width, height) {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(width, height);
    },
  };
}
