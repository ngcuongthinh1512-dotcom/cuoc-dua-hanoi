// Package E: plane trees (InstanceSet 'tree') from PointRecs.
// Module top level must not touch the DOM: the worker imports build*(); canvas textures only inside create*().
// Phase 8C T2 (graphics8c.trees): createTreeLods() = a procedural platane (bark trunk + limbs, leaf-cluster cards) at three
// levels of detail, all on one atlas made by scripts/assets/trees.ts; world/attach.ts picks the level per tree by distance.
import * as THREE from 'three';
import { graphics8c as G8, props as P } from '../config.ts';
import type { PropLods } from './attach.ts';
import type { ChunkData } from '../geo/chunkData.ts';
import type { Builder } from './buildTypes.ts';
import { hash01 } from './geom.ts';
import { roadWidth, sidewalkWidth } from './RoadBuilder.ts';
import { along, free, pushMatrix } from './StreetProps.ts';

/** Hà Nội street trees (props.streetTrees): along both kerbs of the streets with a real pavement, every `spacing` m (a hashed
 *  share left empty), on free pavement only (StreetProps `free`: off every carriageway, out of buildings, clear of OSM trees). */
/** Inside the thinned corridor (props.streetTrees.thin: Phạm Ngọc Thạch / Vincom, too many trees there). */
const thinned = (x: number, z: number) => P.streetTrees.thin.boxes.some((b) => x >= b[0] && x <= b[2] && z >= b[1] && z <= b[3]);

export function placeStreetTrees(chunk: ChunkData): [number, number][] {
  const T = P.streetTrees;
  const out: [number, number][] = [];
  if (!T.enabled) return out;
  for (const r of chunk.roads) {
    if (!T.kinds.includes(r.kind) || sidewalkWidth(r) < T.minSidewalk) continue;
    const off = roadWidth(r) / 2 + T.curb;
    along(r, T.spacing, T.spacing / 2, (x, z, tx, tz) => {
      for (const side of [1, -1]) {
        const [px, pz] = [x + tz * side * off, z - tx * side * off];
        if (hash01(px, pz, 71) < T.gapShare || (thinned(px, pz) && hash01(px, pz, 72) >= T.thin.keep) || !free(chunk, px, pz, T.foot, T.curb - 0.3)) continue;
        out.push([px, pz]);
      }
    });
  }
  return out;
}

/** One instance per tree point + planted street tree: hashed yaw and scale in props.treeScale, foot 0.2 m into the ground. */
export const buildVegetation: Builder = (chunk, ctx) => {
  const m: number[] = [];
  const [s0, s1] = P.treeScale as [number, number];
  const pts = chunk.points.filter((p) => p.kind === 'tree' && !(thinned(p.x, p.z) && hash01(p.x, p.z, 73) >= P.streetTrees.thin.osmKeep)).map((p): [number, number] => [p.x, p.z]);
  for (const [x, z] of [...pts, ...placeStreetTrees(chunk)]) {
    const s = s0 + (s1 - s0) * hash01(x, z, 2);
    pushMatrix(m, x, ctx.height(x, z) - 0.2, z, hash01(x, z, 1) * 2 * Math.PI, s);
  }
  return { meshes: [], instances: m.length ? [{ kind: 'tree', matrices: new Float32Array(m) }] : [], colliders: [] };
};

/** Cells of textures/trees_{col,nrm}.webp (2048 × 1024 px): [left, top, width, height] in px. */
export const TREE_ATLAS = {
  size: [2048, 1024],
  bark: [0, 0, 1024, 1024],
  leavesA: [1024, 0, 512, 512],
  leavesB: [1536, 0, 512, 512],
  side: [1024, 512, 512, 512],
  top: [1536, 512, 512, 512],
} as const;

/** Proportions of the platane at instance scale k (m): the impostor cells are painted to match. */
export function treeShape(k = 1) {
  const H = P.treeHeight * k;
  return { height: H, trunkRadius: 0.022 * H, forkY: 0.34 * H, crownY: 0.62 * H, crownRadius: 0.36 * H, crownHeight: 0.6 * H };
}

type Cell = readonly [number, number, number, number];
/** Atlas uv of (s, t) in a cell: s left → right, t bottom → top (TextureLoader flips y). */
const cellUv = (c: Cell, s: number, t: number): [number, number] => [(c[0] + s * c[2]) / TREE_ATLAS.size[0], 1 - (c[1] + (1 - t) * c[3]) / TREE_ATLAS.size[1]];

const WHITE = [1, 1, 1] as const;
/** Vertex colour (× the bark map) at side i, ring j of a tube starting at height y0: olive-grey bark with hashed light
 *  grey-cream patches where it has flaked off (graphics8c.trees.bark; the map's own dark brown is divided out). */
function barkColour(i: number, j: number, y0: number): number[] {
  const B = G8.trees.bark;
  const t = Math.max(0, hash01(i, j, Math.round(y0 * 10) + 5) * 2 - 1) ** 0.7 * B.patch; // ~half the vertices: no patch
  const [d, l, m] = [new THREE.Color(B.dark), new THREE.Color(B.light), new THREE.Color(B.mapMean)];
  const lum = 0.2126 * m.r + 0.7152 * m.g + 0.0722 * m.b;
  return d.lerp(l, t).multiplyScalar(1 / lum).toArray(); // linear: the map's mean brightness → c (its hue stays)
}

/** Luminance of the bark map's mean colour (vertex colours are divided by it so the map's dark brown drops out). */
function mapLum() {
  const m = new THREE.Color(G8.trees.bark.mapMean);
  return 0.2126 * m.r + 0.7152 * m.g + 0.0722 * m.b;
}

/** mulberry32: the same tree on every run. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Geo {
  pos: number[] = [];
  nrm: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  idx: number[] = [];
  vert(p: THREE.Vector3, n: THREE.Vector3, uv: [number, number], c: readonly number[] = WHITE) {
    this.pos.push(p.x, p.y, p.z);
    this.nrm.push(n.x, n.y, n.z);
    this.uv.push(...uv);
    this.col.push(c[0]!, c[1]!, c[2]!);
    return this.pos.length / 3 - 1;
  }
  /** Tapered tube from a to b, radius ra → rb, `seg` sides, `rings` lengthwise; bark uv: once around (s 0 → 1 over half the
   *  cell), t 0 → 1. Vertex colour: the platane's flaking bark, hashed patches between graphics8c.trees.bark colours. */
  tube(a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number, seg: number, rings = 1, colour?: readonly number[]) {
    const axis = b.clone().sub(a).normalize();
    const side = Math.abs(axis.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const u = side.cross(axis).normalize();
    const w = axis.clone().cross(u);
    const base = this.pos.length / 3;
    for (let i = 0; i <= seg; i++) {
      const ang = (2 * Math.PI * i) / seg;
      const n = u.clone().multiplyScalar(Math.cos(ang)).addScaledVector(w, Math.sin(ang));
      for (let j = 0; j <= rings; j++) {
        const p = a.clone().lerp(b, j / rings).addScaledVector(n, ra + ((rb - ra) * j) / rings);
        this.vert(p, n, cellUv(TREE_ATLAS.bark, (0.5 * i) / seg, j / rings), colour ?? barkColour(i % seg, j, a.y));
      }
    }
    const r1 = rings + 1;
    for (let i = 0; i < seg; i++) {
      for (let j = 0; j < rings; j++) {
        const k = base + r1 * i + j;
        this.idx.push(k, k + r1, k + 1, k + 1, k + r1, k + r1 + 1);
      }
    }
  }
  /** A card (centre c, half axes u, v) seen from both sides, normals = `n` on both (lit like the crown's outside). */
  card(c: THREE.Vector3, u: THREE.Vector3, v: THREE.Vector3, cell: Cell, n: (p: THREE.Vector3) => THREE.Vector3) {
    const corners: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const k = corners.map(([a, b]) => {
      const p = c.clone().addScaledVector(u, a).addScaledVector(v, b);
      return this.vert(p, n(p), cellUv(cell, 0.03 + 0.47 * (a + 1), 0.03 + 0.47 * (b + 1))); // 3 % inset: no mip bleed from the next cell
    }) as [number, number, number, number];
    this.idx.push(k[0], k[1], k[2], k[0], k[2], k[3], k[0], k[2], k[1], k[0], k[3], k[2]);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

/** The three tree geometries (scale 1, foot at the origin): LOD0 full crown, LOD1 a few big cards, LOD2 impostor. */
export function treeGeometries() {
  const S = treeShape();
  const centre = new THREE.Vector3(0, S.crownY, 0);
  const up = new THREE.Vector3(0, 1, 0);
  // crown normals: outward from the crown centre, bent up (sunlit top, darker underside)
  const outward = (p: THREE.Vector3) => p.clone().sub(centre).normalize().addScaledVector(up, 0.6).normalize();
  const crown = (geo: Geo, n: number, size: number, seed: number) => {
    const r = rng(seed);
    for (let i = 0; i < n; i++) {
      const a = r() * 2 * Math.PI;
      const h = 2 * r() - 1;
      const rho = 0.45 + 0.55 * Math.sqrt(r());
      const ring = Math.sqrt(1 - h * h) * rho;
      const p = new THREE.Vector3(Math.cos(a) * ring * S.crownRadius, S.crownY + h * rho * (S.crownHeight / 2), Math.sin(a) * ring * S.crownRadius);
      const s = size * (0.8 + 0.4 * r());
      const yaw = r() * Math.PI;
      const tilt = (r() - 0.5) * 0.8;
      const cell = r() < 0.5 ? TREE_ATLAS.leavesA : TREE_ATLAS.leavesB;
      for (const turn of [0, Math.PI / 2]) {
        const d = new THREE.Vector3(Math.cos(yaw + turn), 0, Math.sin(yaw + turn));
        const v = new THREE.Vector3(0, 1, 0).applyAxisAngle(d, tilt).multiplyScalar(s / 2);
        geo.card(p, d.multiplyScalar(s / 2), v, cell, outward);
      }
      // upper clusters also lie flat: seen from above the crown is foliage, not crossed blades
      if (h > -0.2) {
        // tilted 25–45° about its own axis: never edge-on as one long line at eye level
        const d = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
        const v = new THREE.Vector3(-d.z, 0, d.x).applyAxisAngle(d, (r() < 0.5 ? -1 : 1) * (0.45 + 0.35 * r()));
        geo.card(p, d.multiplyScalar(s / 2), v.multiplyScalar(s / 2), cell, outward);
      }
    }
  };
  const limbs = (geo: Geo, n: number, seg: number, seed: number) => {
    const r = rng(seed);
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * (i + r() * 0.5)) / n;
      const tip = new THREE.Vector3(Math.cos(a) * 0.5 * S.crownRadius, S.crownY + (r() - 0.3) * 0.3 * S.crownHeight, Math.sin(a) * 0.5 * S.crownRadius);
      geo.tube(new THREE.Vector3(0, S.forkY, 0), tip, 0.55 * S.trunkRadius, 0.18 * S.trunkRadius, seg);
    }
  };

  // Hà Nội: the lower trunk is whitewashed (quét vôi gốc cây) up to graphics8c.trees.whitewash m (at scale 1)
  const wash = new THREE.Color(G8.trees.whitewashColour).multiplyScalar(1 / mapLum()).toArray();
  const W = G8.trees.whitewash;
  const r0 = 1.3 * S.trunkRadius;
  const rW = r0 + ((S.trunkRadius - r0) * (W + 0.3)) / (S.forkY * 0.5 + 0.3);
  const lod0 = new Geo();
  lod0.tube(new THREE.Vector3(0, -0.3, 0), new THREE.Vector3(0, W, 0), r0, rW, 8, 1, wash);
  lod0.tube(new THREE.Vector3(0, W, 0), new THREE.Vector3(0, S.forkY * 0.5, 0), rW, S.trunkRadius, 8, 3);
  lod0.tube(new THREE.Vector3(0, S.forkY * 0.5, 0), new THREE.Vector3(0, S.forkY, 0), S.trunkRadius, 0.85 * S.trunkRadius, 8, 3);
  limbs(lod0, 5, 5, 3);
  crown(lod0, 48, 0.3 * S.height, 7);

  const lod1 = new Geo();
  lod1.tube(new THREE.Vector3(0, -0.3, 0), new THREE.Vector3(0, W, 0), 1.2 * S.trunkRadius, 1.1 * S.trunkRadius, 5, 1, wash);
  lod1.tube(new THREE.Vector3(0, W, 0), new THREE.Vector3(0, S.forkY, 0), 1.1 * S.trunkRadius, 0.85 * S.trunkRadius, 5);
  crown(lod1, 12, 0.48 * S.height, 11);

  // impostor: two crossed upright quads (the side cell) + one horizontal quad (the top cell) at the crown's middle
  const lod2 = new Geo();
  const half = (S.height * 1.02) / 2;
  for (const d of [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)]) {
    lod2.card(new THREE.Vector3(0, half, 0), d.clone().multiplyScalar(half), new THREE.Vector3(0, half, 0), TREE_ATLAS.side, () => up.clone().add(d.clone().cross(up).multiplyScalar(0.3)).normalize());
  }
  const rTop = S.crownRadius / 0.92; // the top cell's crown fills 92 % of the cell
  lod2.card(new THREE.Vector3(0, S.crownY + S.crownHeight * 0.15, 0), new THREE.Vector3(rTop, 0, 0), new THREE.Vector3(0, 0, -rTop), TREE_ATLAS.top, () => up);
  return [lod0, lod1, lod2].map((g) => g.geometry());
}

/** Tree LOD levels for world/attach.ts. Textures load async (`onLoad` counts them for __READY__ via the callbacks).
 *  Low quality: the colour map only (no normal map). */
export function createTreeLods(quality: 'low' | 'high', track: <T>(p: Promise<T>) => Promise<T>): PropLods {
  const T = G8.trees;
  const material = new THREE.MeshStandardMaterial({ alphaTest: 0.5, roughness: 0.85, metalness: 0, vertexColors: true });
  if (typeof document !== 'undefined') {
    const loader = new THREE.TextureLoader();
    const suffix = quality === 'low' ? '_1k' : '';
    const slots = [['map', 'col'], ['normalMap', 'nrm']] as const;
    for (const [slot, name] of quality === 'low' ? slots.slice(0, 1) : slots) {
      void track(loader.loadAsync(`textures/trees_${name}${suffix}.webp`)).then(
        (t) => {
          t.colorSpace = name === 'col' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          t.anisotropy = 4;
          material[slot] = t;
          material.needsUpdate = true;
        },
        () => console.warn(`textures/trees_${name}${suffix}.webp missing (npm run process-assets -- trees)`),
      );
    }
  }
  const [g0, g1, g2] = treeGeometries();
  const [d0, d1] = quality === 'low' ? T.lowLod : T.lod;
  const S = treeShape(P.treeScale[1]);
  return {
    radius: Math.hypot(S.crownRadius, S.height / 2),
    levels: [
      ...(d0 > 0 ? [{ parts: [{ geometry: g0!, material }], distance: d0, castShadow: true }] : []),
      // low quality: only the full crowns near the camera cast shadows (graphics8c.trees.lowShadow; fix B, review F1)
      { parts: [{ geometry: g1!, material }], distance: d1, castShadow: quality !== 'low' || T.lowShadow },
      { parts: [{ geometry: g2!, material }], distance: Infinity, castShadow: false },
    ],
  };
}
