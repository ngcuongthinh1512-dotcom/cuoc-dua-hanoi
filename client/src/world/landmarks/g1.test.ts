// g1 sanity: the processed GLB models (public/models, scripts/process-assets.ts) against published dimensions
// (fr.wikipedia Tour Eiffel / Arc de triomphe de l'Étoile, cited in config landmarks.g1) and the worker colliders on
// the real OSM outlines.
import { readFileSync, statSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { Ray, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { landmarks as L } from '../../config.ts';
import { type ChunkData, chunkBounds } from '../../geo/chunkData.ts';
import { LANDMARK_BY_ID } from '../../geo/landmarks.ts';
import type { BuildOut } from '../buildTypes.ts';
import { details, modelPose } from './g1.ts';
import { helpers } from './index.ts';
import { MODELS } from './models.ts';
import { recordGround } from './parts.ts';

const G = L.g1;
const PUBLIC = new URL('../../../public/', import.meta.url);
/** Relative error (tests: < 5 %). */
const err = (v: number, target: number) => Math.abs(v / target - 1);

function load(id: (typeof MODELS)[number]['id']) {
  const m = MODELS.find((q) => q.id === id)!;
  const chunk = JSON.parse(readFileSync(new URL(`data/chunks/${m.key}.json`, PUBLIC), 'utf8')) as ChunkData;
  const rec = chunk.buildings.find((b) => b.landmark === id)!;
  const ctx = { key: m.key, bounds: chunkBounds(m.key), height: () => 0, def: LANDMARK_BY_ID.get(id)!, ...recordGround(rec.outer, () => 0) };
  return { m, rec, out: details[id]!(rec, rec.parts ?? [], ctx, helpers), pose: modelPose(rec, 0, id) };
}

/** Triangles of a GLB in its own frame (node transforms applied: undoes the meshopt quantization), 9 numbers each. */
async function glbTriangles(url: string) {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const doc = await io.readBinary(new Uint8Array(readFileSync(new URL(url, PUBLIC))));
  const out: number[] = [];
  const v = [0, 0, 0];
  for (const node of doc.getRoot().listNodes()) {
    const M = node.getWorldMatrix();
    for (const p of node.getMesh()?.listPrimitives() ?? []) {
      const [P, I] = [p.getAttribute('POSITION')!, p.getIndices()!];
      for (let k = 0; k < I.getCount(); k++) {
        P.getElement(I.getScalar(k), v);
        for (let r = 0; r < 3; r++) out.push(M[r]! * v[0]! + M[4 + r]! * v[1]! + M[8 + r]! * v[2]! + M[12 + r]!);
      }
    }
  }
  return out;
}

/** Horizontal (|n.y| > 0.95) triangle area with its centroid y in [y0, y1]. */
function flatArea(t: number[], y0: number, y1: number) {
  let area = 0;
  for (let i = 0; i < t.length; i += 9) {
    const [a, b, c] = [0, 3, 6].map((o) => new Vector3().fromArray(t, i + o)) as [Vector3, Vector3, Vector3];
    const n = b.clone().sub(a).cross(c.clone().sub(a));
    const y = (a.y + b.y + c.y) / 3;
    if (y >= y0 && y <= y1 && Math.abs(n.y) > 0.95 * n.length()) area += n.length() / 2;
  }
  return area;
}

/** Max |coordinate k| (0 = x, 1 = y, 2 = z) over vertices with y in [y0, y1]. */
function extent(t: number[], k: number, y0 = -Infinity, y1 = Infinity) {
  let m = 0;
  for (let i = 0; i < t.length; i += 3) if (t[i + 1]! >= y0 && t[i + 1]! <= y1) m = Math.max(m, Math.abs(t[i + k]!));
  return m;
}

/** Does segment p→q cross a collider triangle? */
function hits(o: BuildOut, p: number[], q: number[]) {
  const [a, b] = [new Vector3(...p), new Vector3(...q)];
  const ray = new Ray(a, b.clone().sub(a).normalize());
  const [v0, v1, v2, hit] = [new Vector3(), new Vector3(), new Vector3(), new Vector3()];
  return o.colliders.some(({ vertices: v, indices: idx }) => {
    for (let k = 0; k < idx.length; k += 3) {
      [v0, v1, v2].forEach((w, j) => w.fromArray(v, 3 * idx[k + j]!));
      if (ray.intersectTriangle(v0, v1, v2, false, hit) && hit.distanceTo(a) <= b.distanceTo(a)) return true;
    }
    return false;
  });
}

const finite = (o: BuildOut) =>
  o.meshes.every((m) => [m.position, m.normal].every((a) => a.every(Number.isFinite))) && o.colliders.every((c) => c.vertices.every(Number.isFinite));
const ys = (a: ArrayLike<number>) => Array.from(a).filter((_, i) => i % 3 === 1);
const maxY = (a: ArrayLike<number>) => ys(a).reduce((m, y) => Math.max(m, y), -Infinity);
const minY = (a: ArrayLike<number>) => ys(a).reduce((m, y) => Math.min(m, y), Infinity);

describe('g1 models (public/models)', () => {
  it('each model file ≤ 8 MB (limit 25 MB) and its outline lies in the chunk MODELS names', () => {
    for (const m of MODELS) {
      expect(statSync(new URL(m.url, PUBLIC)).size).toBeLessThan(8 * 2 ** 20);
      expect(load(m.id).rec).toBeDefined();
    }
  });

  it('Eiffel: ≤ 60k triangles, 330 m, base 124.9 m, decks at 57.63 / 115.73 / 276.13 m', async () => {
    const t = await glbTriangles('models/eiffel.glb');
    expect(t.every(Number.isFinite)).toBe(true);
    expect(t.length / 9).toBeLessThanOrEqual(60_000);
    expect(err(maxY(t), G.eiffel.height)).toBeLessThan(0.05);
    expect(err(extent(t, 0, 0, 5), G.eiffel.halfBase)).toBeLessThan(0.05);
    expect(minY(t)).toBeGreaterThan(-G.sink);
    // Published floor areas (fr.wikipedia): 4,200 / 1,430 / 350 m²; at least half of each as flat deck near its height.
    for (const [h, area] of [[57.63, 4200], [115.73, 1430], [276.13, 350]] as const) {
      expect(flatArea(t, h * 0.97, h * 1.05)).toBeGreaterThan(area / 2);
    }
  });

  it('Arc: ≤ 150k triangles, 49.54 × 44.82 × 22.21 m, ground cut, roof patched', async () => {
    const t = await glbTriangles('models/arc.glb');
    const A = G.arc;
    expect(t.every(Number.isFinite)).toBe(true);
    expect(t.length / 9).toBeLessThanOrEqual(150_000);
    expect(err(maxY(t), A.height)).toBeLessThan(0.05);
    expect(err(extent(t, 0, 22, 34), A.halfWidth)).toBeLessThan(0.05); // body: above the sculpture groups, below the cornice
    expect(err(extent(t, 2, 22, 34), A.halfDepth)).toBeLessThan(0.05);
    expect(minY(t)).toBeGreaterThan(-G.sink);
    const roof = 4 * (A.halfWidth - A.roofInset) * (A.halfDepth - A.roofInset);
    expect(flatArea(t, A.roofY - 1, A.height)).toBeGreaterThan(roof * 0.95);
  });
});

describe('g1 colliders on the OSM outlines', () => {
  it('Eiffel: 4 legs to the 1st floor only, open and walkable under the tower', () => {
    const { out, pose } = load('eiffel');
    const [x, y, z, s] = [pose.x, pose.y + G.sink, pose.z, pose.scale];
    expect(finite(out)).toBe(true);
    expect(out.meshes).toEqual([]);
    expect(out.colliders.length).toBe(1);
    expect(err(maxY(out.colliders[0]!.vertices) - y, G.eiffel.platforms[0]!)).toBeLessThan(0.05);
    expect(hits(out, [x, y, z], [x, y + 50, z])).toBe(false);
    for (let deg = 0; deg < 180; deg += 15) {
      const [dx, dz] = [Math.cos((deg * Math.PI) / 180) * 30 * s, Math.sin((deg * Math.PI) / 180) * 30 * s];
      expect(hits(out, [x - dx, y + 3, z - dz], [x + dx, y + 3, z + dz])).toBe(false);
    }
    const { ux, uz } = pose.frame;
    const diag = [(ux - uz) * 70 * s, (uz + ux) * 70 * s];
    expect(hits(out, [x, y + 3, z], [x + diag[0]!, y + 3, z + diag[1]!])).toBe(true); // a leg on the diagonal
  });

  it('Arc: 49.54 m, main passage along the Champs-Élysées axis and transverse passage open, tomb near LOD', () => {
    const { out, pose } = load('arc');
    const [x, y, z] = [pose.x, pose.y + G.sink, pose.z];
    const { ux, uz } = pose.frame;
    const [wx, wz] = [-uz, ux];
    expect(finite(out)).toBe(true);
    expect(err(maxY(out.colliders[0]!.vertices) - y, G.arc.height)).toBeLessThan(0.05);
    // Local +z (through the main arch) points at the Concorde, down the Champs-Élysées (< 3°).
    expect((wx * -x + wz * -z) / Math.hypot(x, z)).toBeGreaterThan(Math.cos((3 * Math.PI) / 180));
    const seg = (a: number, b: number, h: number, k: number, du: number) =>
      hits(out, [x + a * k + ux * du, y + h, z + b * k + uz * du], [x - a * k + ux * du, y + h, z - b * k + uz * du]);
    expect(seg(wx, wz, 10, 20, 0)).toBe(false); // main passage
    expect(seg(ux, uz, 6, 30, 0)).toBe(false); // transverse passage
    expect(seg(ux, uz, 35, 30, 0)).toBe(true); // attic
    expect(seg(wx, wz, 10, 20, 15)).toBe(true); // pier
    expect(out.meshes.length).toBe(2);
    for (const m of out.meshes) {
      expect(m.lod).toBe('near');
      for (let i = 0; i < m.position.length; i += 3) expect(Math.hypot(m.position[i]! - x, m.position[i + 2]! - z)).toBeLessThan(4);
    }
  });
});
