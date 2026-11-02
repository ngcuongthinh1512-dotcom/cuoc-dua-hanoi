// CETIQLO mannequin: the set is worn by a REAL human figure — the game's own Rocketbox avatar (player.glb via
// player/CharacterModel.ts) posed arms-down (bones aimed from the bind pose, no animation) on a slowly turning disc; until
// the asset arrives (or without a DOM: tests) a stylised ivory figure stands in. `dress(ids)` tailors the six pieces onto
// the body (fitting.ts: the catalog item's own recipe, colour and pattern, cut to the bones: tops hug the torso with sleeves
// along the arms, outers a size larger and open at the front, trousers follow each leg and stop above the shoes, skirts /
// dresses from the waist; shoes / bag / hat / scarf / glasses are the shelf meshes enlarged at feet / hand / head / neck /
// face). `renderPiP(renderer, rect)` draws just the mannequin (layer PIP_LAYER) through the room's renderer into a scissored
// viewport. `legend(ids)` = caption data; `thumbnails(ids, renderer, size)` = one product-card canvas per item (cached per set).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { type CatalogItem, ITEM_BY_ID, SHAPE_H, type SlotKind } from '@race/shared/cetiqlo';
import { type CharacterAsset, CharacterModel } from '../player/CharacterModel.ts';
import { type Fit, STYLISED_FIT, wornGeometry } from './fitting.ts';
import { itemMesh } from './items.ts';

export const PIP_LAYER = 1;
/** Recommended PiP rect (renderer px): 2:3 portrait, the whole figure large on a neutral backdrop. */
export const PIP_SIZE = { w: 360, h: 540 };
const IVORY = new THREE.MeshStandardMaterial({ color: '#efe9df', roughness: 0.6 });
const DISC = new THREE.MeshStandardMaterial({ color: '#f6f6f4', roughness: 0.5 });
const UNDERLAYER = '#d8c2a6'; // the avatar's tinted base clothes become a plain skin-tone underlayer
const PIP_BG = new THREE.Color('#e9e6df');

/** The stand-in figure (≈ 500 triangles): origin at the feet, facing +z, arms down (STYLISED_FIT landmarks). */
function figure(): THREE.BufferGeometry {
  const F = STYLISED_FIT;
  const cyl = (rt: number, rb: number, h: number, y: number, x = 0, seg = 10) => new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, y, 0);
  const limb = (a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number) => { const d = b.clone().sub(a), g = new THREE.CylinderGeometry(r0, r1, d.length(), 8).rotateX(Math.PI).translate(0, d.length() / 2, 0); return g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())).translate(a.x, a.y, a.z); };
  const parts = [
    new THREE.SphereGeometry(0.105, 10, 7).scale(1, 1.15, 1).translate(0, F.headY, 0),
    cyl(0.045, 0.05, 0.1, F.neckY, 0, 8),
    cyl(0.16, 0.135, 0.5, 1.15), cyl(0.14, 0.16, 0.2, 0.82),
    limb(F.thighL, F.ankleL, F.thighRad, F.ankleRad), limb(F.thighR, F.ankleR, F.thighRad, F.ankleRad),
    limb(F.shoulderL, F.elbowL, 0.045, 0.038), limb(F.elbowL, F.wristL, 0.038, 0.03), limb(F.shoulderR, F.elbowR, 0.045, 0.038), limb(F.elbowR, F.wristR, 0.038, 0.03),
    new THREE.BoxGeometry(0.09, 0.05, 0.24).translate(F.footL.x, 0.025, 0.04), new THREE.BoxGeometry(0.09, 0.05, 0.24).translate(F.footR.x, 0.025, 0.04),
  ];
  return mergeGeometries(parts.map((p) => p.toNonIndexed()), false)!;
}
let figureGeo: THREE.BufferGeometry | null = null;

export interface LegendEntry { slot: SlotKind | CatalogItem['category']; id: string; name: string; nameEn: string; colour: string; hex: string; pattern?: string; hex2?: string }
export interface Thumbnail extends LegendEntry { canvas: HTMLCanvasElement | null }
export interface Mannequin {
  /** The whole thing (disc + figure + clothes), origin at the floor under the disc. */
  object: THREE.Object3D;
  /** Clothe it with these catalog ids (unknown ids ignored; previous clothes removed). */
  dress(setIds: readonly string[]): void;
  /** Caption data for the HUD: one entry per id in `setIds` (unknown ids skipped), in set order. */
  legend(setIds: readonly string[]): LegendEntry[];
  /** Product cards: each item rendered alone (its shelf mesh, colour and pattern, front ¾ view, cream backdrop) into a
   *  `size`² canvas; cached per set key, rendered once (6 × 160² ≈ 1 ms). Without WebGL (no renderer / no DOM) `canvas` is a
   *  coloured rounded square with the name, or null in Node (no DOM). */
  thumbnails(setIds: readonly string[], renderer?: THREE.WebGLRenderer | null, size?: number): Thumbnail[];
  /** Turn the disc (TURN_RATE rad/s); no-op for a static mannequin. */
  update(dt: number): void;
  /** Swap the stand-in figure for the game's human avatar (re-dresses the current set). */
  setHuman(asset: CharacterAsset, avatar?: 0 | 1): void;
  /** The PiP camera (a child of the pedestal, so it follows the room frame): in front, framing the whole figure. */
  pipCamera: THREE.PerspectiveCamera;
  /** Room-local pose of that camera for anyone building their own: position + target relative to `object`. */
  viewPoseForPiP: { position: THREE.Vector3; target: THREE.Vector3 };
  /** Draw the mannequin alone into `rect` (renderer pixels, origin bottom-left; PIP_SIZE recommended) with the scene's lights. */
  renderPiP(renderer: THREE.WebGLRenderer, rect: { x: number; y: number; w: number; h: number }): void;
  dispose(): void;
}

export const TURN_RATE = 0.45; // rad/s

/** Aim bone `b` so the direction to `child` becomes `dir` (in `frame`'s space). */
function aim(b: THREE.Object3D, child: THREE.Object3D, dir: THREE.Vector3, frame: THREE.Object3D) {
  b.updateWorldMatrix(true, false);
  child.updateWorldMatrix(true, false);
  const P = b.getWorldPosition(new THREE.Vector3()), C = child.getWorldPosition(new THREE.Vector3());
  const cur = C.sub(P).normalize(), want = dir.clone().normalize().applyQuaternion(frame.getWorldQuaternion(new THREE.Quaternion()));
  const q = new THREE.Quaternion().setFromUnitVectors(cur, want);
  const pw = b.parent!.getWorldQuaternion(new THREE.Quaternion());
  b.quaternion.copy(pw.clone().invert().multiply(q).multiply(pw).multiply(b.quaternion));
}

export function createMannequin(o: { turn: boolean; discR?: number; discH?: number; human?: CharacterAsset; avatar?: 0 | 1 }): Mannequin {
  const object = new THREE.Group();
  object.name = o.turn ? 'mannequin' : 'display-mannequin';
  const discR = o.discR ?? 0.6, discH = o.discH ?? 0.12;
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(discR, discR, discH, 24).translate(0, discH / 2, 0), DISC);
  object.add(disc);
  const turning = new THREE.Group(); // disc top: the figure and its clothes
  turning.position.y = discH;
  object.add(turning);
  let fit: Fit = STYLISED_FIT;
  let body: THREE.Object3D = new THREE.Mesh((figureGeo ??= figure()), IVORY);
  let human: CharacterModel | null = null;
  turning.add(body);
  const clothes = new THREE.Group();
  turning.add(clothes);
  const pipCamera = new THREE.PerspectiveCamera(28, PIP_SIZE.w / PIP_SIZE.h, 0.1, 12);
  /** Frame a figure of `height` m: the camera is a child of `object`, and Object3D.lookAt takes a WORLD point, so aim at the
   *  pedestal-local target mapped through the pedestal's world matrix (works before and after the object is placed). */
  const camAt = (height: number) => {
    const d = (height * 1.22) / 2 / Math.tan((28 / 2) * (Math.PI / 180)); // a little air above the hat and beside the bag
    pipCamera.position.set(0, discH + height * 0.5, d);
    object.updateWorldMatrix(true, false);
    pipCamera.lookAt(object.localToWorld(new THREE.Vector3(0, discH + height * 0.49, 0)));
  };
  camAt(1.78);
  object.add(pipCamera);
  const viewPoseForPiP = { position: pipCamera.position.clone(), target: new THREE.Vector3(0, discH + 0.88, 0) };
  object.traverse((ob) => ob.layers.enable(PIP_LAYER));
  pipCamera.layers.set(PIP_LAYER);
  let worn: readonly string[] = [];

  const put = (m: THREE.Object3D, x: number, y: number, z: number, s = 1, ry = 0) => { m.position.set(x, y, z); m.scale.setScalar(s); m.rotation.y = ry; m.traverse((ob) => ob.layers.enable(PIP_LAYER)); clothes.add(m); return m; };
  const dress = (ids: readonly string[]) => {
    worn = ids;
    clothes.clear();
    const f = fit;
    for (const id of ids) {
      const it = ITEM_BY_ID.get(id);
      if (!it) continue;
      const h = SHAPE_H[it.shape];
      const tailored = it.category === 'top' || it.category === 'outer' || it.category === 'bottom' || it.category === 'dress' ? wornGeometry(it.shape, f, it.category === 'outer') : null;
      if (tailored) { put(itemMesh(it, tailored), 0, 0, 0); continue; }
      switch (it.category) {
        case 'shoes': for (const [sx, ft] of [[1, f.footL], [-1, f.footR]] as const) { const m = put(itemMesh(it), ft.x, h * 0.62, ft.z + 0.06, 1.3); m.scale.x *= sx; } break;
        case 'bag': put(itemMesh(it), f.handL.x + 0.09, f.handL.y - 0.1, f.handL.z + 0.02, 1.15); break;
        case 'acc':
          if (it.shape === 'cap') put(itemMesh(it), 0, f.headY + 0.16, 0.02, 1.3);
          else if (it.shape === 'bucket-hat') put(itemMesh(it), 0, f.headY + 0.16, 0, 1.3);
          else if (it.shape === 'beanie') put(itemMesh(it), 0, f.headY + 0.15, 0, 1.25);
          else if (it.shape === 'scarf') put(itemMesh(it), 0, f.neckY - 0.03, 0.01, 1.5);
          else if (it.shape === 'sunglasses') put(itemMesh(it), 0, f.headY + 0.06, 0.1, 1.6);
          else put(itemMesh(it), f.handR.x - 0.09, f.handR.y, f.handR.z + 0.05, 1.2);
          break;
        default: put(itemMesh(it), 0.45, 1.0, 0, 1); // decoys are never in a set; shown at the side if asked
      }
    }
  };
  const legend = (ids: readonly string[]): LegendEntry[] => ids.flatMap((id) => {
    const it = ITEM_BY_ID.get(id);
    return it ? [{ slot: it.slot ?? it.category, id, name: it.name, nameEn: it.nameEn, colour: it.colour.name, hex: it.colour.hex, pattern: it.pattern, hex2: it.colour2?.hex }] : [];
  });

  // ---- product cards -----------------------------------------------------------------------------------------------
  const thumbCache = new Map<string, Thumbnail[]>();
  let thumbScene: THREE.Scene | null = null, thumbCam: THREE.PerspectiveCamera | null = null, thumbRT: THREE.WebGLRenderTarget | null = null;
  const thumbnails = (ids: readonly string[], renderer?: THREE.WebGLRenderer | null, size = 160): Thumbnail[] => {
    const key = `${ids.join(',')}|${size}|${renderer ? 'gl' : 'cv'}`;
    const hit = thumbCache.get(key);
    if (hit) return hit;
    const dom = typeof document !== 'undefined';
    const out: Thumbnail[] = legend(ids).map((e) => ({ ...e, canvas: null }));
    if (dom) for (const t of out) {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      t.canvas = c;
      const x = c.getContext('2d')!;
      if (renderer) renderThumb(renderer, ITEM_BY_ID.get(t.id)!, c, size);
      else { // no WebGL: a coloured rounded square with the name
        x.fillStyle = '#e9e6df'; x.fillRect(0, 0, size, size);
        x.fillStyle = t.hex; x.beginPath(); x.roundRect(size * 0.15, size * 0.12, size * 0.7, size * 0.56, size * 0.08); x.fill();
        if (t.hex2) { x.fillStyle = t.hex2; x.beginPath(); x.roundRect(size * 0.55, size * 0.4, size * 0.26, size * 0.24, size * 0.04); x.fill(); }
        x.fillStyle = '#222'; x.font = `600 ${size * 0.1}px system-ui, sans-serif`; x.textAlign = 'center'; x.fillText(t.name, size / 2, size * 0.86, size * 0.9);
      }
    }
    thumbCache.set(key, out);
    return out;
  };
  const renderThumb = (renderer: THREE.WebGLRenderer, it: CatalogItem, c: HTMLCanvasElement, size: number) => {
    if (!thumbScene) {
      thumbScene = new THREE.Scene();
      thumbScene.background = PIP_BG;
      const hemi = new THREE.HemisphereLight('#ffffff', '#b9ae9c', 1.6), sun = new THREE.DirectionalLight('#fff4e6', 2.2);
      sun.position.set(-1, 2, 2);
      thumbScene.add(hemi, sun);
      thumbCam = new THREE.PerspectiveCamera(30, 1, 0.05, 20);
    }
    if (!thumbRT || thumbRT.width !== size) { thumbRT?.dispose(); thumbRT = new THREE.WebGLRenderTarget(size, size); }
    const m = itemMesh(it);
    m.geometry.computeBoundingSphere();
    const bs = m.geometry.boundingSphere!;
    m.rotation.y = 0.55; // front ¾
    thumbScene.add(m);
    const d = (bs.radius * 1.15) / Math.tan((30 / 2) * (Math.PI / 180));
    thumbCam!.position.set(Math.sin(0.0) * d, bs.center.y + d * 0.28, d);
    thumbCam!.lookAt(bs.center.x, bs.center.y, bs.center.z);
    const vp = renderer.getViewport(new THREE.Vector4()), target = renderer.getRenderTarget(), scissor = renderer.getScissorTest(), tm = renderer.toneMapping;
    renderer.setScissorTest(false);
    renderer.setRenderTarget(thumbRT);
    renderer.render(thumbScene, thumbCam!);
    const px = new Uint8Array(size * size * 4);
    renderer.readRenderTargetPixels(thumbRT, 0, 0, size, size, px);
    renderer.setRenderTarget(target);
    renderer.setScissorTest(scissor);
    renderer.setViewport(vp);
    renderer.toneMapping = tm;
    thumbScene.remove(m);
    m.geometry.dispose();
    const img = c.getContext('2d')!.createImageData(size, size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { // flip y; linear → sRGB
      const s = ((size - 1 - y) * size + x) * 4, t = (y * size + x) * 4;
      for (let k = 0; k < 3; k++) img.data[t + k] = Math.round(Math.pow(px[s + k]! / 255, 1 / 2.2) * 255);
      img.data[t + 3] = 255;
    }
    c.getContext('2d')!.putImageData(img, 0, 0);
  };

  const setHuman = (asset: CharacterAsset, avatar: 0 | 1 = 0) => {
    human?.dispose();
    body.removeFromParent();
    human = new CharacterModel(asset, { shirt: UNDERLAYER, name: null, avatar });
    human.setPose(new THREE.Vector3(), Math.PI); // yaw π = facing +z, toward the PiP camera
    human.root.traverse((ob) => { ob.layers.enable(PIP_LAYER); if (ob instanceof THREE.Mesh) { ob.castShadow = ob.receiveShadow = false; ob.frustumCulled = false; } });
    body = human.root;
    turning.add(body);
    turning.updateMatrixWorld(true);
    const bone = (n: string) => body.getObjectByName(n);
    // pose: from the bind A-pose to a relaxed stand — arms down along the body (L forearm a little forward: it carries the bag), legs slightly apart
    for (const [side, sx] of [['l', 1], ['r', -1]] as const) {
      const ua = bone(`upperarm_${side}`), la = bone(`lowerarm_${side}`), hd = bone(`hand_${side}`), th = bone(`thigh_${side}`), ca = bone(`calf_${side}`);
      if (ua && la) aim(ua, la, new THREE.Vector3(sx * 0.16, -1, 0.02), turning);
      if (la && hd) aim(la, hd, new THREE.Vector3(sx * 0.06, -1, 0.16), turning);
      if (th && ca) aim(th, ca, new THREE.Vector3(sx * 0.07, -1, 0), turning);
    }
    turning.updateMatrixWorld(true);
    const at = (name: string, fallback: THREE.Vector3) => { const b = bone(name); return b ? turning.worldToLocal(b.getWorldPosition(new THREE.Vector3())) : fallback.clone(); };
    const F = STYLISED_FIT;
    const shoulderL = at('upperarm_l', F.shoulderL), shoulderR = at('upperarm_r', F.shoulderR);
    const pelvis = at('pelvis', new THREE.Vector3(0, 0.95, 0)), chest = at('spine_03', new THREE.Vector3(0, 1.3, 0)), waist = at('spine_01', new THREE.Vector3(0, 1.05, 0));
    const head = at('Head', at('head', new THREE.Vector3(0, 1.62, 0))), neck = at('neck_01', new THREE.Vector3(0, 1.5, 0));
    const height = (asset.scene.userData.height as number | undefined) ?? 1.8;
    const halfW = Math.abs(shoulderL.x - shoulderR.x) / 2;
    fit = {
      height, headY: head.y + 0.04, neckY: neck.y, neckR: 0.055,
      shoulderL, shoulderR, elbowL: at('lowerarm_l', F.elbowL), elbowR: at('lowerarm_r', F.elbowR), wristL: at('hand_l', F.wristL), wristR: at('hand_r', F.wristR), handL: at('hand_l', F.handL).add(new THREE.Vector3(0, -0.06, 0.04)), handR: at('hand_r', F.handR).add(new THREE.Vector3(0, -0.06, 0.04)), armR: 0.045,
      chestY: chest.y, chestHalfW: halfW + 0.005, chestHalfD: 0.135, waistY: waist.y, waistHalfW: halfW - 0.03, waistHalfD: 0.12, hipY: pelvis.y + 0.04, hipHalfW: halfW - 0.01, hipHalfD: 0.13,
      thighL: at('thigh_l', F.thighL), thighR: at('thigh_r', F.thighR), kneeL: at('calf_l', F.kneeL), kneeR: at('calf_r', F.kneeR), ankleL: at('foot_l', F.ankleL), ankleR: at('foot_r', F.ankleR),
      footL: at('foot_l', F.footL).setY(0), footR: at('foot_r', F.footR).setY(0), thighRad: 0.085, kneeRad: 0.065, ankleRad: 0.05,
    };
    camAt(height);
    object.userData.fit = fit;
    dress(worn);
  };
  if (o.human) setHuman(o.human, o.avatar);
  const save = { vp: new THREE.Vector4(), sc: new THREE.Vector4() };
  return {
    object, dress, legend, thumbnails, setHuman, pipCamera, viewPoseForPiP,
    update(dt) { if (o.turn) turning.rotation.y += TURN_RATE * dt; },
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
      scene.background = PIP_BG;
      pipCamera.aspect = rect.w / rect.h;
      pipCamera.updateProjectionMatrix();
      renderer.render(scene, pipCamera);
      scene.background = bg;
      renderer.autoClear = autoClear;
      renderer.setScissorTest(scissor);
      renderer.setViewport(save.vp);
      renderer.setScissor(save.sc);
    },
    dispose() { clothes.clear(); human?.dispose(); thumbRT?.dispose(); object.removeFromParent(); },
  };
}
