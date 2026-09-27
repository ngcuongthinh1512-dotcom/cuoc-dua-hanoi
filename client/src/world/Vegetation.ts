// Package E: plane trees (InstanceSet 'tree') from PointRecs.
// Module top level must not touch the DOM: the worker imports build*(); canvas textures only inside create*().
import { props as P } from '../config.ts';
import type { Builder } from './buildTypes.ts';
import { hash01 } from './geom.ts';
import { pushMatrix } from './StreetProps.ts';

/** One instance per tree point: hashed yaw and scale in props.treeScale, foot 0.2 m into the ground. */
export const buildVegetation: Builder = (chunk, ctx) => {
  const m: number[] = [];
  const [s0, s1] = P.treeScale as [number, number];
  for (const p of chunk.points) {
    if (p.kind !== 'tree') continue;
    const s = s0 + (s1 - s0) * hash01(p.x, p.z, 2);
    pushMatrix(m, p.x, ctx.height(p.x, p.z) - 0.2, p.z, hash01(p.x, p.z, 1) * 2 * Math.PI, s);
  }
  return { meshes: [], instances: m.length ? [{ kind: 'tree', matrices: new Float32Array(m) }] : [], colliders: [] };
};
