// BuildOut (plain typed arrays from a Builder) → THREE objects on the main thread. Used by the preview harness
// (src/preview.ts) and by ChunkManager (package F, which may extend it). Colliders are not handled here.
import * as THREE from 'three';
import { type BuildOut, type MaterialId, type PropKind, VERTEX_COLOR } from './buildTypes.ts';

export type Materials = Record<MaterialId, THREE.Material>;
/** One level of detail: drawn for the instances closer to the camera than `distance` (m) and farther than the previous
 *  level's distance; one InstancedMesh (draw call) per part. */
export interface PropLevel { parts: { geometry: THREE.BufferGeometry; material: THREE.Material }[]; distance: number; castShadow?: boolean }
/** Phase 8C: a prop kind drawn per instance at the level its distance picks (beyond the last level: not drawn). `levels`
 *  may be replaced later (a GLB that arrives after the first chunks): the chunks rebuild their meshes on the next frame.
 *  radius = bounding radius of the model at instance scale (frustum culling). */
export interface PropLods { levels: PropLevel[]; radius: number }
/** renderOrder / castShadow: the metro well and its depth-only lid draw before everything else (StreetProps). */
export type StaticProp = { geometry: THREE.BufferGeometry; material: THREE.Material; renderOrder?: number; castShadow?: boolean };
export type PropMeshes = Record<PropKind, StaticProp | { lods: PropLods }>;

const lodStep = 3; // m the camera moves before the instances are re-binned
const v3 = new THREE.Vector3();

/** One InstanceSet drawn with per-instance LOD. A THREE.LOD without levels: the renderer calls its update(camera) before
 *  drawing its children (and not the shadow pass, which draws what the main pass binned); update re-bins the instances by
 *  their distance to the camera whenever it moved ≥ lodStep m (or the levels changed), writing each level's matrices
 *  into one InstancedBufferAttribute shared by the level's parts. */
export function lodInstances(matrices: Float32Array, lods: PropLods) {
  const n = matrices.length / 16;
  const root = new THREE.LOD();
  root.name = 'lod instances';
  const box = new THREE.Box3();
  for (let i = 0; i < n; i++) box.expandByPoint(v3.fromArray(matrices, 16 * i + 12));
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  sphere.radius += lods.radius;
  let built: PropLevel[] | undefined;
  let attrs: THREE.InstancedBufferAttribute[] = [];
  let meshes: THREE.InstancedMesh[][] = [];
  const level = new Int8Array(n);
  const last = new THREE.Vector3(Infinity, 0, 0);
  const levelOf = (d: number) => {
    const k = lods.levels.findIndex((l) => d < l.distance);
    return k; // −1: beyond the last level
  };
  function build() {
    for (const m of meshes.flat()) (m.removeFromParent(), m.dispose());
    built = lods.levels;
    attrs = built.map(() => new THREE.InstancedBufferAttribute(new Float32Array(16 * n), 16).setUsage(THREE.DynamicDrawUsage));
    meshes = built.map((l, k) =>
      l.parts.map((p) => {
        const m = new THREE.InstancedMesh(p.geometry, p.material, n);
        m.instanceMatrix = attrs[k]!;
        m.count = 0;
        m.visible = false;
        m.boundingSphere = sphere;
        m.castShadow = !!l.castShadow;
        m.receiveShadow = true;
        root.add(m);
        return m;
      }),
    );
    level.fill(-2);
    last.set(Infinity, 0, 0);
  }
  root.update = (camera: THREE.Camera) => {
    if (built !== lods.levels) build();
    v3.setFromMatrixPosition(camera.matrixWorld);
    if (v3.distanceToSquared(last) < lodStep * lodStep) return;
    last.copy(v3);
    // whole set in one level, as last time: nothing to do
    const [near, far] = [box.distanceToPoint(v3), Math.hypot(Math.max(Math.abs(v3.x - box.min.x), Math.abs(v3.x - box.max.x)), Math.max(Math.abs(v3.y - box.min.y), Math.abs(v3.y - box.max.y)), Math.max(Math.abs(v3.z - box.min.z), Math.abs(v3.z - box.max.z)))];
    const k0 = levelOf(near);
    if (k0 === levelOf(far) && level.every((k) => k === k0)) return;
    const counts = attrs.map(() => 0);
    let changed = false;
    for (let i = 0; i < n; i++) {
      const o = 16 * i;
      const k = levelOf(Math.hypot(matrices[o + 12]! - v3.x, matrices[o + 13]! - v3.y, matrices[o + 14]! - v3.z));
      if (k !== level[i]) changed = true;
      level[i] = k;
      if (k >= 0) attrs[k]!.array.set(matrices.subarray(o, o + 16), 16 * counts[k]!++);
    }
    if (!changed) return;
    attrs.forEach((a, k) => {
      a.needsUpdate = true;
      a.clearUpdateRanges();
      a.addUpdateRange(0, 16 * counts[k]!);
      for (const m of meshes[k]!) [m.count, m.visible] = [counts[k]!, counts[k]! > 0];
    });
  };
  return { object: root, dispose: () => meshes.flat().forEach((m) => m.dispose()) };
}

// Distinct flat colours, so a bucket whose package has no material yet is easy to spot in a screenshot.
const FALLBACK_COLOUR: Record<MaterialId, number> = {
  terrain: 0xffffff, // × vertex colour
  wall: 0xe8d9b5,
  tenement: 0xb8b6b0, // × vertex colour
  curtain: 0x8aa8c0, // × vertex colour
  shopfront: 0x9a5b3c,
  roof: 0x7d8fa0,
  balcony: 0x303438,
  sidewalk: 0xbdb8ad,
  asphalt: 0x3b3d42,
  pave: 0x8a7458,
  marking: 0xf4f4f4,
  bridge: 0xb0a48c,
  railing: 0x1c2024,
  sign: 0x1d4f9c,
  stone: 0xd2bf94,
  glass: 0x9cc8dc,
  masonry: 0xffffff, // × vertex colour
  metal: 0xffffff, // × vertex colour
  gold: 0xd4a53c,
  bronze: 0x5a4a32,
  waterJet: 0xe8f2f8,
  neon: 0xffffff, // × vertex colour
  neonSign: 0xff2f78,
  mural: 0xffffff, // × the chunk's atlas
  stairGlow: 0xffe0a8,
};

/** Flat-coloured stand-in for a material no package provides yet (vertexColors iff VERTEX_COLOR has it). */
export function defaultMaterial(id: MaterialId): THREE.Material {
  return new THREE.MeshStandardMaterial({ color: FALLBACK_COLOUR[id], roughness: 0.9, vertexColors: VERTEX_COLOR.has(id) });
}

/** The packages' merged create*Materials(), plus defaultMaterial() for every id still missing. */
export function withFallbacks(provided: Partial<Materials>): Materials {
  const ids = Object.keys(FALLBACK_COLOUR) as MaterialId[];
  return Object.fromEntries(ids.map((id) => [id, provided[id] ?? defaultMaterial(id)])) as Materials;
}

const GROUND: ReadonlySet<MaterialId> = new Set<MaterialId>(['terrain', 'sidewalk', 'asphalt', 'pave', 'marking', 'stairGlow']); // receive only

// ponytail: per-chunk InstancedMeshes and CPU copies of every geometry are kept (no dispose-after-upload); global
// instancing and freeing CPU arrays in Phase 12. LOD: only the landmark 'near' buckets (ChunkManager hides them far away).
/** One Mesh per bucket (shared materials), one InstancedMesh per InstanceSet (shared prop meshes); `near` = the meshes
 *  of lod 'near' buckets (bounding spheres computed). Each
 *  BuildOut.textures entry replaces its material, for this BuildOut only, by a clone with `map` = that image
 *  (flipY = false: v = 0 is the image's TOP row). dispose() frees only what was created here. */
export function attachBuildOut(out: BuildOut, materials: Materials, propMeshes: PropMeshes) {
  const object = new THREE.Group();
  const owned: { dispose(): void }[] = [];
  const mats = { ...materials };
  const near: THREE.Mesh[] = [];
  let triangles = 0;

  for (const { material, image } of out.textures ?? []) {
    const map = new THREE.Texture(image);
    map.colorSpace = THREE.SRGBColorSpace;
    map.flipY = false;
    map.anisotropy = 8; // plaques stay readable at grazing angles
    map.needsUpdate = true;
    mats[material] = Object.assign(materials[material].clone(), { map });
    owned.push(mats[material], { dispose: () => (map.dispose(), image.close()) });
  }

  for (const b of out.meshes) {
    if (!b.index.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(b.position, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(b.normal, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(b.uv, 2));
    if (b.color) g.setAttribute('color', new THREE.BufferAttribute(b.color, 3));
    if (b.lit) g.setAttribute('lit', new THREE.BufferAttribute(b.lit, 1));
    g.setIndex(new THREE.BufferAttribute(b.index, 1));
    const mesh = new THREE.Mesh(g, mats[b.material]);
    mesh.castShadow = !GROUND.has(b.material);
    mesh.receiveShadow = true;
    if (b.lod === 'near') {
      g.computeBoundingSphere();
      near.push(mesh);
    }
    object.add(mesh);
    owned.push(g);
    triangles += b.index.length / 3;
  }

  for (const set of out.instances) {
    const count = set.matrices.length / 16;
    if (!count) continue;
    const prop = propMeshes[set.kind];
    if ('lods' in prop) {
      const l = lodInstances(set.matrices, prop.lods);
      object.add(l.object);
      owned.push(l);
      continue; // triangles: depend on the camera (renderer.info counts them)
    }
    const { geometry, material, renderOrder = 0, castShadow = true } = prop;
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.instanceMatrix.array.set(set.matrices);
    mesh.computeBoundingSphere();
    mesh.renderOrder = renderOrder;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    object.add(mesh);
    owned.push(mesh);
    triangles += (count * (geometry.index?.count ?? geometry.getAttribute('position').count)) / 3;
  }

  return {
    object,
    near,
    triangles,
    drawCalls: object.children.length,
    dispose() {
      object.removeFromParent();
      for (const o of owned) o.dispose();
    },
  };
}
