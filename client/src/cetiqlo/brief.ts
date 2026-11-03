// CETIQLO brief ("đề bài"): the six pieces of the set THEMSELVES at FIXED places in a 3 × 2 grid (top / outer / bottom above,
// shoes / bag / acc below) — no text, no labels. Built from the exact shelf item meshes (items.ts itemMesh: same shape, colour,
// pattern), each normalised to a consistent size per slot (tops / outers / bottoms front view, shoes / bag / accessory
// three-quarter). Order is fixed by slot — top, outer, bottom, shoes, bag, acc — so players learn the layout.
// The room's HUD uses `snapshots(renderer, px)`: one sharp STILL per piece rendered once per set (owner 2026-11-03: the brief
// stands still; a click zooms it). `renderPiP(renderer, rect)` (the live grid, pieces turning) stays for the dev page / tests.
// It is PiP-only (layer BRIEF_LAYER): nothing of it is drawn in the room.
import * as THREE from 'three';
import { type CatalogItem, ITEM_BY_ID, type SlotKind, displayShape } from '@race/shared/cetiqlo';
import { HANGER, itemMesh, shapeGeometry, shelfPiece } from './items.ts';

export const BRIEF_LAYER = 2;
/** Recommended PiP rect (renderer px), 4:3 landscape: the whole ring with each piece ≈ a third of the frame height. */
export const BRIEF_SIZE = { w: 420, h: 315 };
export const BRIEF_TURN = 0.5; // rad/s, each piece about its own axis
export const SLOT_ORDER: readonly SlotKind[] = ['top', 'outer', 'bottom', 'shoes', 'bag', 'acc'];
/** Presented height (m) per slot — shoes and accessories blown up so they read as large as a jacket — and the facing (rotation.y). */
const PRESENT: Record<SlotKind, { h: number; yaw: number }> = { top: { h: 0.8, yaw: 0 }, outer: { h: 0.84, yaw: 0 }, bottom: { h: 0.84, yaw: 0 }, shoes: { h: 0.56, yaw: 0.6 }, bag: { h: 0.6, yaw: 0.5 }, acc: { h: 0.56, yaw: 0.5 } };
export const GRID = { dx: 1.15, dy: 1.05 }; // m between piece centres: columns / rows of the 3 × 2 grid
const BG = new THREE.Color('#e9e6df');
/** The stills' backdrop: neutral light grey (CSS), composited under the transparent render — never lit, never tinting. */
export const STILL_BG = '#e6e6e6';
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
  /** One still per slot (slot order; null = slot missing): the piece EXACTLY as the shop shows it (items.ts shelfPiece: display shape,
   *  shelf pose + stand turn, store hanger) seen from in front of its shelf, lit by the store's own lights + the scene environment,
   *  through the renderer's tone mapping / output colour space (applied here: render targets skip them), on a neutral grey backdrop
   *  (STILL_BG, composited in 2D: never lit). Rendered ONCE per set through a temporary scene + render target (both disposed).
   *  `cams` (optional, out): the world-space camera of each still, for comparing against the store at the same angle. */
  snapshots(renderer: THREE.WebGLRenderer, px?: number, cams?: (THREE.PerspectiveCamera | null)[]): (HTMLCanvasElement | null)[];
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
  let setIds: readonly string[] = [];
  const dress = (ids: readonly string[]) => {
    setIds = ids;
    for (const p of pieces) p.clear();
    for (const id of ids) {
      const it: CatalogItem | undefined = ITEM_BY_ID.get(id);
      if (!it?.slot) continue;
      const holder = pieces[SLOT_ORDER.indexOf(it.slot)]!;
      holder.clear();
      const m = itemMesh(it, shapeGeometry(displayShape(it.shape, it.display)));
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
    snapshots(renderer, px = 512, cams) {
      // the store (brief.object's parent) and the room scene it is in: the pieces take their WORLD shelf pose, the store's lights
      // (every visible light that lights layer 0 — inside the room the sky's lights are hidden, so these are the 3 store lights) are
      // copied at their world positions / targets, the scene environment (the sky's IBL stays on in the room) is shared
      const store = object.parent ?? object;
      let root: THREE.Object3D = object;
      while (root.parent) root = root.parent;
      root.updateWorldMatrix(true, true);
      const scene = new THREE.Scene();
      if (root instanceof THREE.Scene) { scene.environment = root.environment; scene.environmentIntensity = root.environmentIntensity; scene.environmentRotation.copy(root.environmentRotation); }
      root.traverseVisible((ob) => {
        if (!(ob instanceof THREE.Light) || !ob.layers.isEnabled(0)) return;
        const l = ob.clone() as THREE.Light;
        ob.getWorldPosition(l.position);
        if ('target' in ob && ob.target instanceof THREE.Object3D) (l as THREE.DirectionalLight).target.matrixWorld.copy(ob.target.matrixWorld); // not in a scene: the target keeps the store's world pose
        scene.add(l);
      });
      const cam = new THREE.PerspectiveCamera(26, 1, 0.05, 50);
      const rt = new THREE.WebGLRenderTarget(px, px, { depthBuffer: true, type: THREE.HalfFloatType, samples: 4 }); // half float: no banding before tone mapping; MSAA like the canvas
      const saved = { target: renderer.getRenderTarget(), vp: renderer.getViewport(new THREE.Vector4()), sc: renderer.getScissor(new THREE.Vector4()), scissor: renderer.getScissorTest(), clear: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha() };
      renderer.setScissorTest(false);
      const aces = renderer.toneMapping === THREE.ACESFilmicToneMapping, exposure = renderer.toneMappingExposure;
      const pxBuf = new Uint16Array(px * px * 4), bb = new THREE.Box3(), c = new THREE.Vector3(), sz = new THREE.Vector3(), fwd = new THREE.Vector3(), wq = new THREE.Quaternion();
      const out = SLOT_ORDER.map((slot, i) => {
        const it = setIds.map((id) => ITEM_BY_ID.get(id)).find((x) => x?.slot === slot);
        if (!it) { if (cams) cams[i] = null; return null; }
        const piece = shelfPiece(it); // the shop's own mesh / pose / hanger, room-local → placed in the store's world frame
        store.getWorldQuaternion(wq);
        piece.position.setFromMatrixPosition(store.matrixWorld);
        piece.quaternion.copy(wq);
        scene.add(piece);
        piece.updateWorldMatrix(true, true);
        bb.setFromObject(piece, true); bb.getCenter(c); bb.getSize(sz);
        fwd.set(Math.sin(it.shelf.yaw), 0, Math.cos(it.shelf.yaw)).applyQuaternion(wq); // the shelf's facing: standing in front of it (shoes keep their shop turn)
        const half = Math.max(sz.y, Math.max(sz.x, sz.z)) / 2 * 1.08, d = half / Math.tan((cam.fov / 2) * (Math.PI / 180)) + half;
        cam.position.copy(c).addScaledVector(fwd, d);
        cam.position.y += d * 0.1;
        cam.lookAt(c);
        cam.updateMatrixWorld(true);
        if (cams) cams[i] = cam.clone();
        renderer.setRenderTarget(rt);
        renderer.setClearColor(0x000000, 0);
        renderer.render(scene, cam);
        renderer.readRenderTargetPixels(rt, 0, 0, px, px, pxBuf);
        scene.remove(piece);
        piece.traverse((ob) => { if (ob instanceof THREE.Mesh) ob.geometry.dispose(); });
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = px;
        const ctx = canvas.getContext('2d')!, img = ctx.createImageData(px, px), v = [0, 0, 0];
        for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) { // flip y; linear → tone mapping → sRGB, as the canvas pipeline does
          const s = ((px - 1 - y) * px + x) * 4, t = (y * px + x) * 4;
          for (let k = 0; k < 3; k++) v[k] = THREE.DataUtils.fromHalfFloat(pxBuf[s + k]!);
          if (aces) acesFilmic(v, exposure);
          for (let k = 0; k < 3; k++) { const u = Math.min(1, Math.max(0, v[k]!)); img.data[t + k] = Math.round(255 * (u <= 0.0031308 ? u * 12.92 : 1.055 * Math.pow(u, 1 / 2.4) - 0.055)); }
          img.data[t + 3] = Math.round(255 * Math.min(1, THREE.DataUtils.fromHalfFloat(pxBuf[s + 3]!)));
        }
        ctx.fillStyle = STILL_BG;
        ctx.fillRect(0, 0, px, px);
        const layer = document.createElement('canvas');
        layer.width = layer.height = px;
        layer.getContext('2d')!.putImageData(img, 0, 0);
        ctx.drawImage(layer, 0, 0); // the garment over the neutral backdrop (alpha from the render: anti-aliased edges)
        return canvas;
      });
      renderer.setRenderTarget(saved.target);
      renderer.setClearColor(saved.clear, saved.alpha);
      renderer.setScissorTest(saved.scissor);
      renderer.setViewport(saved.vp);
      renderer.setScissor(saved.sc);
      rt.dispose();
      return out;
    },
  };
  return brief;
}

/** three's ACESFilmicToneMapping (tonemapping_pars_fragment.glsl) on a linear rgb triple, in place: the canvas applies it in the
 *  shader, a render target does not, so the stills apply it here to come out the same colour as the shop. */
function acesFilmic(v: number[], exposure: number): void {
  const e = exposure / 0.6, r = v[0]! * e, g = v[1]! * e, b = v[2]! * e;
  const x = [0.59719 * r + 0.35458 * g + 0.04823 * b, 0.076 * r + 0.90834 * g + 0.01566 * b, 0.0284 * r + 0.13383 * g + 0.83777 * b];
  for (let k = 0; k < 3; k++) { const c = x[k]!; x[k] = (c * (c + 0.0245786) - 0.000090537) / (c * (0.983729 * c + 0.432951) + 0.238081); }
  v[0] = 1.60475 * x[0]! - 0.53108 * x[1]! - 0.07367 * x[2]!;
  v[1] = -0.10208 * x[0]! + 1.10813 * x[1]! - 0.00605 * x[2]!;
  v[2] = -0.00327 * x[0]! - 0.07276 * x[1]! + 1.07602 * x[2]!;
}
