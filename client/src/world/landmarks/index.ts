// Landmark builder (SPEC §17.6, docs/plans/phase2b-assets.md §5): every BuildingRec with .landmark goes to
//   1. a DetailFn registered for its id in DETAILS (Leg 3: none yet, every landmark uses the generic renderer),
//   2. else the generic S3DB renderer: its building:part (parts.ts); the outline too when the parts cover less than
//      landmarks.partCoverage of it (S3DB: an outline with parts is not extruded); no parts → the outline alone.
// Non-building outlines (bridge decks, fountains, artworks) are drawn by details only. A DetailFn that throws is
// reported and replaced by the generic renderer. DOM-free except createLandmarkMaterials() (main thread only).
import { CanvasTexture, DoubleSide, type Material, MeshBasicMaterial, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace } from 'three';
import { landmarks as L } from '../../config.ts';
import type { BuildingRec, LandmarkId, PartRec } from '../../geo/chunkData.ts';
import { LANDMARK_BY_ID, type LandmarkDef } from '../../geo/landmarks.ts';
import { buildingHeight } from '../BuildingBuilder.ts';
import { sceneEnvironmentOn, skyEnvironment } from '../Water.ts';
import type { BuildCtx, Builder, BuildOut, MaterialId } from '../buildTypes.ts';
import { mergeBuckets } from '../geom.ts';
import { details as b } from './b.ts';
import { details as c } from './c.ts';
import { details as d } from './d.ts';
import { details as e } from './e.ts';
import { details as f } from './f.ts';
import { details as g } from './g.ts';
import { details as h2 } from './h.ts';
import { details as i } from './i.ts';
import { details as j } from './j.ts';
import { details as k } from './k.ts';
import { details as l } from './l.ts';
import { details as m } from './m.ts';
import { details as n } from './n.ts';
import * as kit from './kit.ts';
import { parseColour, partHeights, partRings, pickMaterial, recordGround, renderPart, roofShape, Sink } from './parts.ts';

export interface LandmarkCtx extends BuildCtx {
  def: LandmarkDef;
  ground: number; // y the OSM heights of this record count from (lowest terrain, at most groundSpan below the highest)
  minGround: number; // lowest terrain under the outline
}

/** A group's builder for one landmark record (called once per record, i.e. per outline polygon). */
export type DetailFn = (rec: BuildingRec, parts: PartRec[], ctx: LandmarkCtx, h: Helpers) => BuildOut;

/** Kinds the generic renderer leaves to the details (bridge decks come from BridgeBuilder, fountains from water.json). */
const NOT_BUILT = new Set(['bridge', 'fountain', 'artwork']);

/** Top (m above ground) of an outline: height → registry height → levels / defaults (BuildingBuilder.buildingHeight). */
export const outlineTop = (rec: BuildingRec, def: LandmarkDef) => rec.height ?? def.height ?? buildingHeight(rec);

const inRing = (x: number, z: number, r: number[]) => {
  let inside = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const [xi, zi, xj, zj] = [r[i]!, r[i + 1]!, r[j]!, r[j + 1]!];
    if (zi > z !== zj > z && x < xi + ((z - zi) / (zj - zi)) * (xj - xi)) inside = !inside;
  }
  return inside;
};
const inPoly = (x: number, z: number, p: { outer: number[]; holes?: number[][] }) =>
  inRing(x, z, p.outer) && !(p.holes ?? []).some((h) => inRing(x, z, h));

/** Share of the outline (sampled on a grid, ≤ coverageSamples points) covered by its non-column parts. */
export function coverage(rec: BuildingRec, parts: PartRec[]) {
  const xs = rec.outer.filter((_, k) => k % 2 === 0);
  const zs = rec.outer.filter((_, k) => k % 2 === 1);
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  const step = Math.max(0.5, Math.sqrt(((x1 - x0) * (z1 - z0)) / L.coverageSamples));
  const solid = parts.filter((p) => p.kind !== 'column');
  let [inside, covered] = [0, 0];
  for (let x = x0 + step / 2; x < x1; x += step) {
    for (let z = z0 + step / 2; z < z1; z += step) {
      if (!inPoly(x, z, rec)) continue;
      inside++;
      if (solid.some((p) => inPoly(x, z, p))) covered++;
    }
  }
  return inside ? covered / inside : 1;
}

/** Generic S3DB rendering of one record (see the header); groups may call it and add their details. */
export function generic(rec: BuildingRec, parts: PartRec[], ctx: LandmarkCtx): BuildOut {
  if (NOT_BUILT.has(rec.kind)) return { meshes: [], instances: [], colliders: [] };
  const sink = new Sink();
  const o = { ground: ctx.ground, height: ctx.height, fallbackTop: outlineTop(rec, ctx.def) };
  let drawn = 0;
  for (const p of parts) if (renderPart(p, o, sink)) drawn++;
  if (!drawn || coverage(rec, parts) < L.partCoverage) renderPart(rec, o, sink);
  return sink.out();
}

export const helpers = {
  ...kit, generic, coverage, outlineTop, renderPart, partHeights, partRings, pickMaterial, parseColour, roofShape, Sink,
} as const;
export type Helpers = typeof helpers;

const DETAILS: Partial<Record<LandmarkId, DetailFn>> = { ...b, ...c, ...d, ...e, ...f, ...g, ...h2, ...i, ...j, ...k, ...l, ...m, ...n };

export const buildLandmarks: Builder = (chunk, ctx) => {
  const outs: BuildOut[] = [];
  for (const rec of chunk.buildings) {
    if (!rec.landmark) continue;
    const def = LANDMARK_BY_ID.get(rec.landmark);
    if (!def) {
      console.warn(`landmarks ${ctx.key}: unknown id ${rec.landmark}`);
      continue;
    }
    const lctx: LandmarkCtx = { ...ctx, def, ...recordGround(rec.outer, ctx.height) };
    const parts = rec.parts ?? [];
    const fn = DETAILS[rec.landmark];
    try {
      outs.push((fn ?? generic)(rec, parts, lctx, helpers));
    } catch (err) {
      console.warn(`landmarks ${ctx.key}: ${rec.landmark} details failed, generic instead:`, err);
      outs.push(generic(rec, parts, lctx));
    }
  }
  return {
    meshes: mergeBuckets(outs.flatMap((o) => o.meshes)),
    instances: outs.flatMap((o) => o.instances),
    colliders: outs.flatMap((o) => o.colliders),
    textures: outs.flatMap((o) => o.textures ?? []),
  };
};

/** 64 px repeating canvas texture (main thread only). */
function canvasTexture(draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  draw(c.getContext('2d')!);
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function createLandmarkMaterials(): Partial<Record<MaterialId, Material>> {
  const C = L.colours;
  // Shared equirect sky (three builds its PMREM once for all three metals); null = scene.environment, the HDRI (8C T1).
  const envMap = sceneEnvironmentOn() ? null : skyEnvironment();
  const panes = canvasTexture((g) => {
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.fillRect(0, 0, 64, 64);
    g.strokeStyle = 'rgba(40,46,52,1)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, 32), g.lineTo(32, 0), g.lineTo(64, 32), g.lineTo(32, 64), g.closePath();
    g.moveTo(0, 0), g.lineTo(64, 0);
    g.stroke();
  });
  return {
    stone: new MeshStandardMaterial({ color: '#d8c8a2', roughness: 0.85 }),
    glass: new MeshStandardMaterial({ color: C.glass, roughness: 0.12, metalness: 0.25, map: panes, transparent: true, opacity: 0.85, side: DoubleSide }),
    masonry: new MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }),
    metal: new MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.6, envMap }),
    gold: new MeshStandardMaterial({ color: C.gold, roughness: 0.3, metalness: 1, envMap }),
    bronze: new MeshStandardMaterial({ color: C.bronze, roughness: 0.5, metalness: 0.8, envMap }),
    waterJet: new MeshStandardMaterial({ color: C.waterJet, roughness: 0.2, transparent: true, opacity: 0.6, depthWrite: false }),
    neon: new MeshBasicMaterial({ vertexColors: true, toneMapped: false }), // unlit: reads as light in any sun
  };
}
