// BuildOut (plain typed arrays from a Builder) → THREE objects on the main thread. Used by the preview harness
// (src/preview.ts) and by ChunkManager (package F, which may extend it). Colliders are not handled here.
import * as THREE from 'three';
import { type BuildOut, type MaterialId, type PropKind, VERTEX_COLOR } from './buildTypes.ts';

export type Materials = Record<MaterialId, THREE.Material>;
/** renderOrder / castShadow: the metro well and its depth-only lid draw before everything else (StreetProps). */
export type PropMeshes = Record<PropKind, { geometry: THREE.BufferGeometry; material: THREE.Material; renderOrder?: number; castShadow?: boolean }>;

// Distinct flat colours, so a bucket whose package has no material yet is easy to spot in a screenshot.
const FALLBACK_COLOUR: Record<MaterialId, number> = {
  terrain: 0xffffff, // × vertex colour
  wall: 0xe8d9b5,
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

const GROUND: ReadonlySet<MaterialId> = new Set<MaterialId>(['terrain', 'sidewalk', 'asphalt', 'pave', 'marking']); // receive only

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
    const { geometry, material, renderOrder = 0, castShadow = true } = propMeshes[set.kind];
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
