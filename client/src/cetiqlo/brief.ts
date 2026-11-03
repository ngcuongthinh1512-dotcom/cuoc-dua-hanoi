// CETIQLO brief ("đề bài"): the six pieces of the set THEMSELVES at FIXED places in a 3 × 2 grid (top / outer / bottom above,
// shoes / bag / acc below) — no text, no labels. Built from the exact shelf item meshes (items.ts itemMesh: same shape, colour,
// pattern), each normalised to a consistent size per slot (tops / outers / bottoms front view, shoes / bag / accessory
// three-quarter). Order is fixed by slot — top, outer, bottom, shoes, bag, acc — so players learn the layout.
// The room's HUD uses `snapshots(renderer, px)`: one sharp STILL per piece rendered once per set (owner 2026-11-03: the brief
// stands still; a click zooms it). `renderPiP(renderer, rect)` (the live grid, pieces turning) stays for the dev page / tests.
// It is PiP-only (layer BRIEF_LAYER): nothing of it is drawn in the room.
import * as THREE from 'three';
import { type CatalogItem, ITEM_BY_ID, type SlotKind } from '@race/shared/cetiqlo';
import { HANGER, itemMesh } from './items.ts';

export const BRIEF_LAYER = 2;
/** Recommended PiP rect (renderer px), 4:3 landscape: the whole ring with each piece ≈ a third of the frame height. */
export const BRIEF_SIZE = { w: 420, h: 315 };
export const BRIEF_TURN = 0.5; // rad/s, each piece about its own axis
export const SLOT_ORDER: readonly SlotKind[] = ['top', 'outer', 'bottom', 'shoes', 'bag', 'acc'];
/** Presented height (m) per slot — shoes and accessories blown up so they read as large as a jacket — and the facing (rotation.y). */
const PRESENT: Record<SlotKind, { h: number; yaw: number }> = { top: { h: 0.8, yaw: 0 }, outer: { h: 0.84, yaw: 0 }, bottom: { h: 0.84, yaw: 0 }, shoes: { h: 0.56, yaw: 0.6 }, bag: { h: 0.6, yaw: 0.5 }, acc: { h: 0.56, yaw: 0.5 } };
export const GRID = { dx: 1.15, dy: 1.05 }; // m between piece centres: columns / rows of the 3 × 2 grid
const BG = new THREE.Color('#e9e6df');
const HANGER_MAT = new THREE.MeshStandardMaterial({ color: '#8a8a90', vertexColors: true, roughness: 0.4, metalness: 0.6 });

export interface Brief {
  /** The grid (origin at the floor under it; the pieces' centre RING_Y above). */
  object: THREE.Object3D;
  /** Show these catalog ids, placed by slot (unknown ids / decoys ignored; previous pieces removed). */
  dress(setIds: readonly string[]): void;
  update(dt: number): void;
  renderPiP(renderer: THREE.WebGLRenderer, rect: { x: number; y: number; w: number; h: number }): void;
  dispose(): void;
  readonly size: { w: number; h: number };
  /** The PiP camera (a child of `object`: follows the room frame). */
  camera: THREE.PerspectiveCamera;
  /** Spin phase (rad) of the pieces: set by tests to sample rotations. */
  phase: number;
  /** The six piece holders in slot order (empty when the slot is missing). */
  pieces: THREE.Group[];
  /** One still per slot (slot order; null = slot missing): the dressed piece, front-on (shoes / bag / acc ¾), cream backdrop, `px`² sharp,
   *  rendered ONCE through a temporary scene + render target (both disposed) — the HUD shows these instead of a live PiP. */
  snapshots(renderer: THREE.WebGLRenderer, px?: number): (HTMLCanvasElement | null)[];
}
export const RING_Y = 1.45; // the grid's centre height above the object origin (the pedestal top)

export function createBrief(o: { turn?: boolean; y?: number } = {}): Brief {
  const object = new THREE.Group();
  object.name = 'brief';
  const ring = new THREE.Group();
  ring.position.y = o.y ?? RING_Y;
  object.add(ring);
  const pieces = SLOT_ORDER.map((slot, i) => {
    const g = new THREE.Group();
    g.name = `brief-${slot}`;
    g.position.set((i % 3 - 1) * GRID.dx, i < 3 ? GRID.dy / 2 : -GRID.dy / 2, 0); // top row: top / outer / bottom; bottom row: shoes / bag / acc
    g.rotation.y = i * 1.1; // phases offset so the spins are never in sync
    ring.add(g);
    return g;
  });
  // camera: straight-on, a touch above, framing the 3 × 2 grid in the 4:3 picture; aimed through the object's world matrix
  const camera = new THREE.PerspectiveCamera(34, BRIEF_SIZE.w / BRIEF_SIZE.h, 0.1, 20);
  const PITCH = 0.12, D = 4.45;
  camera.position.set(0, (o.y ?? RING_Y) + Math.sin(PITCH) * D, Math.cos(PITCH) * D);
  object.add(camera);
  const aimCamera = () => { object.updateWorldMatrix(true, false); camera.lookAt(object.localToWorld(new THREE.Vector3(0, (o.y ?? RING_Y), 0))); };
  aimCamera();
  camera.layers.set(BRIEF_LAYER);
  object.traverse((ob) => ob.layers.set(BRIEF_LAYER)); // PiP-only: the room camera (layer 0) never draws the brief
  const box = new THREE.Box3();
  const dress = (ids: readonly string[]) => {
    for (const p of pieces) p.clear();
    for (const id of ids) {
      const it: CatalogItem | undefined = ITEM_BY_ID.get(id);
      if (!it?.slot) continue;
      const holder = pieces[SLOT_ORDER.indexOf(it.slot)]!;
      holder.clear();
      const m = itemMesh(it);
      m.geometry.computeBoundingBox();
      box.copy(m.geometry.boundingBox!);
      const size = box.getSize(new THREE.Vector3()), centre = box.getCenter(new THREE.Vector3());
      const s = PRESENT[it.slot].h / Math.max(size.y, size.x * 0.9, size.z * 0.9);
      m.scale.setScalar(s);
      m.position.copy(centre).multiplyScalar(-s); // centre the piece in its holder
      const inner = new THREE.Group();
      inner.rotation.y = PRESENT[it.slot].yaw;
      inner.add(m);
      if (it.slot === 'top' || it.slot === 'outer' || it.slot === 'bottom') { // a hanger over the garment: reads as clothing on a rail, not a block
        const hg = new THREE.Mesh(HANGER, HANGER_MAT);
        hg.position.y = (box.max.y - centre.y) * s + 0.01;
        hg.scale.setScalar(1.2);
        inner.add(hg);
      }
      holder.add(inner);
      holder.traverse((ob) => ob.layers.set(BRIEF_LAYER));
    }
  };
  let spin = 0;
  const save = { vp: new THREE.Vector4(), sc: new THREE.Vector4() };
  const brief: Brief = {
    object, dress, camera, pieces, size: BRIEF_SIZE,
    get phase() { return spin; },
    set phase(v: number) { spin = v; pieces.forEach((p, i) => { p.rotation.y = v + i * 1.1; }); }, // each piece spins in place, offset
    update(dt) { if (o.turn !== false) brief.phase = (spin + BRIEF_TURN * dt) % (Math.PI * 2); },
    renderPiP(renderer, rect) {
      let scene: THREE.Object3D = object;
      while (scene.parent) scene = scene.parent;
      if (!(scene instanceof THREE.Scene)) return;
      renderer.getViewport(save.vp);
      renderer.getScissor(save.sc);
      const scissor = renderer.getScissorTest(), bg = scene.background, autoClear = renderer.autoClear;
      renderer.setViewport(rect.x, rect.y, rect.w, rect.h);
      renderer.setScissor(rect.x, rect.y, rect.w, rect.h);
      renderer.setScissorTest(true);
      renderer.autoClear = true;
      scene.background = BG;
      camera.aspect = rect.w / rect.h;
      camera.updateProjectionMatrix();
      aimCamera();
      renderer.render(scene, camera);
      scene.background = bg;
      renderer.autoClear = autoClear;
      renderer.setScissorTest(scissor);
      renderer.setViewport(save.vp);
      renderer.setScissor(save.sc);
    },
    dispose() { for (const p of pieces) p.clear(); object.removeFromParent(); },
    snapshots(renderer, px = 512) {
      const scene = new THREE.Scene();
      scene.background = BG;
      const key = new THREE.DirectionalLight('#fff4e6', 2.4), fill = new THREE.DirectionalLight('#e8f0ff', 1.3), rim = new THREE.DirectionalLight('#ffffff', 1.0);
      key.position.set(-1.2, 2, 2.5); fill.position.set(1.6, 0.3, 1.2); rim.position.set(0.4, -1, 1.5); // key high-left, fill low-right, rim from below: seams / pockets / plackets read on black cloth too
      scene.add(new THREE.HemisphereLight('#ffffff', '#c9c0b0', 1.8), key, fill, rim);
      const cam = new THREE.PerspectiveCamera(26, 1, 0.05, 20);
      cam.layers.set(BRIEF_LAYER);
      scene.traverse((ob) => ob.layers.set(BRIEF_LAYER)); // the lights too: a light on another layer than the camera does not light
      const rt = new THREE.WebGLRenderTarget(px, px, { depthBuffer: true });
      const saved = { target: renderer.getRenderTarget(), vp: renderer.getViewport(new THREE.Vector4()), sc: renderer.getScissor(new THREE.Vector4()), scissor: renderer.getScissorTest() };
      renderer.setScissorTest(false);
      const pxBuf = new Uint8Array(px * px * 4), bb = new THREE.Box3(), c = new THREE.Vector3(), sz = new THREE.Vector3();
      const out = pieces.map((holder) => {
        if (!holder.children.length) return null;
        const spin = holder.rotation.y;
        holder.rotation.y = 0; // front-on (the slot's own ¾ yaw is inside the holder)
        scene.add(holder); // moved out of the grid: neighbours never intrude
        bb.setFromObject(holder, true); bb.getCenter(c); bb.getSize(sz); // precise: the ¾-turned pieces' real extent, not the loose AABB
        const half = Math.max(sz.y, sz.x) / 2 * 1.08, d = half / Math.tan((cam.fov / 2) * (Math.PI / 180)) + sz.z / 2;
        cam.position.set(c.x, c.y + d * 0.1, c.z + d);
        cam.lookAt(c);
        renderer.setRenderTarget(rt);
        renderer.render(scene, cam);
        renderer.readRenderTargetPixels(rt, 0, 0, px, px, pxBuf);
        ring.add(holder);
        holder.rotation.y = spin;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = px;
        const ctx = canvas.getContext('2d')!, img = ctx.createImageData(px, px);
        for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) { // flip y; linear → sRGB (render targets are written linear)
          const s = ((px - 1 - y) * px + x) * 4, t = (y * px + x) * 4;
          for (let k = 0; k < 3; k++) { const v = pxBuf[s + k]! / 255; img.data[t + k] = Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)); }
          img.data[t + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
        return canvas;
      });
      renderer.setRenderTarget(saved.target);
      renderer.setScissorTest(saved.scissor);
      renderer.setViewport(saved.vp);
      renderer.setScissor(saved.sc);
      rt.dispose();
      return out;
    },
  };
  return brief;
}
