// CETIQLO brief ("đề bài"): the six pieces of the set THEMSELVES, large, floating evenly on a slowly turning ring — no text,
// no labels. Built from the exact shelf item meshes (items.ts itemMesh: same shape, colour, pattern), each normalised to a
// consistent size per slot and kept facing the camera while the ring carries it round (tops / outers / bottoms front view,
// shoes / bag / accessory three-quarter). Ring order is fixed by slot — top, outer, bottom, shoes, bag, acc — so players learn
// the layout. `renderPiP(renderer, rect)` draws just the ring (layer BRIEF_LAYER) through the room's renderer into a
// scissored viewport, cream backdrop, the store's lights: ≤ 8 draw calls. The same object also stands large on the pedestal.
import * as THREE from 'three';
import { type CatalogItem, ITEM_BY_ID, type SlotKind } from '@race/shared/cetiqlo';
import { HANGER, itemMesh } from './items.ts';

export const BRIEF_LAYER = 2;
/** Recommended PiP rect (renderer px), 4:3 landscape: the whole ring with each piece ≈ a third of the frame height. */
export const BRIEF_SIZE = { w: 420, h: 315 };
export const BRIEF_TURN = 0.35; // rad/s
export const SLOT_ORDER: readonly SlotKind[] = ['top', 'outer', 'bottom', 'shoes', 'bag', 'acc'];
/** Presented height (m) per slot — shoes and accessories blown up so they read as large as a jacket — and the facing (rotation.y). */
const PRESENT: Record<SlotKind, { h: number; yaw: number }> = { top: { h: 0.6, yaw: 0 }, outer: { h: 0.64, yaw: 0 }, bottom: { h: 0.64, yaw: 0 }, shoes: { h: 0.5, yaw: 0.8 }, bag: { h: 0.52, yaw: 0.7 }, acc: { h: 0.5, yaw: 0.75 } };
export const RING_R = 1.15; // m: six pieces ≤ 0.66 m wide never touch (chord 1.15 m)
const BG = new THREE.Color('#e9e6df');
const HANGER_MAT = new THREE.MeshStandardMaterial({ color: '#8a8a90', vertexColors: true, roughness: 0.4, metalness: 0.6 });

export interface Brief {
  /** The ring (origin = ring centre at the floor under it; pieces float RING_Y above). */
  object: THREE.Object3D;
  /** Show these catalog ids, placed by slot (unknown ids / decoys ignored; previous pieces removed). */
  dress(setIds: readonly string[]): void;
  update(dt: number): void;
  renderPiP(renderer: THREE.WebGLRenderer, rect: { x: number; y: number; w: number; h: number }): void;
  dispose(): void;
  readonly size: { w: number; h: number };
  /** The PiP camera (a child of `object`: follows the room frame). */
  camera: THREE.PerspectiveCamera;
  /** Ring phase (rad): set by tests to sample rotations. */
  phase: number;
  /** The six piece holders in slot order (empty when the slot is missing). */
  pieces: THREE.Group[];
}
export const RING_Y = 1.25; // the pieces' centre height above the object origin (the pedestal top)

export function createBrief(o: { turn?: boolean; y?: number } = {}): Brief {
  const object = new THREE.Group();
  object.name = 'brief';
  const ring = new THREE.Group();
  ring.position.y = o.y ?? RING_Y;
  object.add(ring);
  const pieces = SLOT_ORDER.map((slot, i) => {
    const g = new THREE.Group();
    g.name = `brief-${slot}`;
    const a = (i / 6) * Math.PI * 2;
    g.position.set(Math.sin(a) * RING_R, 0, Math.cos(a) * RING_R);
    ring.add(g);
    return g;
  });
  // camera: raised three-quarter view of the whole ring; aimed through the object's world matrix (lookAt takes a world point)
  const camera = new THREE.PerspectiveCamera(34, BRIEF_SIZE.w / BRIEF_SIZE.h, 0.1, 20);
  const PITCH = 0.78, D = 5.1;
  camera.position.set(0, (o.y ?? RING_Y) + Math.sin(PITCH) * D, Math.cos(PITCH) * D);
  object.add(camera);
  const aimCamera = () => { object.updateWorldMatrix(true, false); camera.lookAt(object.localToWorld(new THREE.Vector3(0, (o.y ?? RING_Y) - 0.02, 0))); };
  aimCamera();
  camera.layers.set(BRIEF_LAYER);
  object.traverse((ob) => ob.layers.enable(BRIEF_LAYER));
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
      holder.traverse((ob) => ob.layers.enable(BRIEF_LAYER));
    }
  };
  const save = { vp: new THREE.Vector4(), sc: new THREE.Vector4() };
  const brief: Brief = {
    object, dress, camera, pieces, size: BRIEF_SIZE,
    get phase() { return ring.rotation.y; },
    set phase(v: number) { ring.rotation.y = v; for (const p of pieces) p.rotation.y = -v; }, // the pieces keep facing the camera
    update(dt) { if (o.turn !== false) brief.phase = (brief.phase + BRIEF_TURN * dt) % (Math.PI * 2); },
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
  };
  return brief;
}
