import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { physics, player as PL, stairs as S, terrain as T } from '../config.ts';
import type { StairRec } from '../geo/chunkData.ts';
import { CharacterController } from '../player/CharacterController.ts';
import type { MoveIntent, PlayerEnv } from '../player/types.ts';
import type { TriMesh } from './buildTypes.ts';
import { MeshBuffer } from './geom.ts';
import { buildFlight, buildStairs, flightOf, stepTop } from './StairBuilder.ts';

// A 3 m rise northward (−z): ground y = 0 for z ≥ 0, y = 3 for z ≤ −run.
const hill = (run: number) => (_x: number, z: number) => (z >= 0 ? 0 : z <= -run ? 3 : (-z / run) * 3);
const osm = (run: number, steps?: number): StairRec => ({ pts: [0, 0, 0, -run], width: 3, ...(steps && { steps }) });

function colliderOf(r: StairRec, height: (x: number, z: number) => number) {
  const out: TriMesh[] = [];
  buildFlight(flightOf(r, height), height, new MeshBuffer('sidewalk'), new MeshBuffer('railing'), out);
  return out[0]!;
}

describe('flightOf / stepTop', () => {
  it('step_count wins; else |Δh| / riser; never a riser above player.maxStep', () => {
    expect(flightOf(osm(6, 20), hill(6)).n).toBe(20);
    expect(flightOf(osm(6), hill(6)).n).toBe(Math.round(3 / S.riser));
    const f = flightOf(osm(6, 4), hill(6)); // tagged 4 steps over 3 m → more steps
    for (let k = 0; k < f.n; k++) expect(Math.abs(stepTop(f, k) - stepTop(f, k - 1))).toBeLessThanOrEqual(PL.maxStep);
  });
  it('first riser starts at the ground of the start, the last tread is the ground of the end', () => {
    const f = flightOf(osm(6), hill(6));
    expect(stepTop(f, -1)).toBeCloseTo(0);
    expect(stepTop(f, f.n - 1)).toBeCloseTo(3);
  });
  it('quay flight: coping level → quay.under below the river surface (bed beside it + riverDepth)', () => {
    const level = 0;
    const height = (_x: number, z: number) => (z < 0 ? level + T.quayHeight : level - T.riverDepth);
    const f = flightOf({ pts: [0, 1.4, 20, 1.4], width: S.quay.width, quay: true }, height);
    expect(f.y0).toBeCloseTo(level + T.quayHeight + T.copingLift);
    expect(f.y1).toBeCloseTo(level - S.quay.under);
    expect(f.landing).toBe(S.quay.landing);
    expect(f.ext).toBeGreaterThan(0);
  });
});

describe('buildStairs', () => {
  it('draws sidewalk + railing buckets and one stair collider covering the flight', () => {
    const out = buildStairs({ v: 2, key: '0_-1', buildings: [], roads: [], bridges: [], areas: [], points: [], stairs: [osm(6)] }, {
      key: '0_-1', bounds: { minX: 0, minZ: -250, maxX: 250, maxZ: 0 }, height: hill(6),
    });
    expect(out.meshes.map((m) => m.material).sort()).toEqual(['railing', 'sidewalk']);
    for (const m of out.meshes) expect(m.position.every(Number.isFinite)).toBe(true);
    expect(out.colliders).toHaveLength(1);
    const c = out.colliders[0]!;
    expect(c.stairs).toBe(true);
    const zs = [...c.vertices].filter((_, i) => i % 3 === 2);
    expect(Math.max(...zs)).toBeCloseTo(0);
    expect(Math.min(...zs)).toBeCloseTo(-6);
  });
  it('steeper than maxSlopeDeg: boxes with risers ≤ maxStep and treads ≥ minStepWidth', () => {
    const c = colliderOf(osm(2.6), hill(2.6)); // 49°
    const boxes = c.indices.length / 36;
    expect(3 / boxes).toBeLessThanOrEqual(PL.maxStep);
    expect(2.6 / boxes).toBeGreaterThanOrEqual(PL.minStepWidth);
  });
});

// ── the real character controller (Phase 3 KCC) on a stair collider ──
beforeAll(() => RAPIER.init());
const DT = physics.fixedDt;
function world(build: (w: RAPIER.World) => void) {
  const w = new RAPIER.World(physics.gravity);
  w.timestep = DT;
  build(w);
  return w;
}
const box = (w: RAPIER.World, x: number, y: number, z: number, hx: number, hy: number, hz: number) =>
  w.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z));
const trimesh = (w: RAPIER.World, m: TriMesh) => w.createCollider(RAPIER.ColliderDesc.trimesh(m.vertices, m.indices));
const go = (cameraYaw: number): MoveIntent => ({ forward: 1, right: 0, cameraYaw, slow: false, jump: false });
function run(w: RAPIER.World, c: CharacterController, seconds: number, intent?: MoveIntent) {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    c.fixedUpdate(DT, intent ?? { forward: 0, right: 0, cameraYaw: 0, slow: false, jump: false });
    w.step();
  }
}

describe('CharacterController on stairs', () => {
  for (const run_ of [6, 2.6]) {
    it(`walks up and back down a 3 m flight (${run_} m run: ${run_ === 6 ? 'ramp' : 'boxes'})`, () => {
      const height = hill(run_);
      const w = world((w) => {
        box(w, 0, -0.5, 10, 20, 0.5, 10); // low ground z ∈ [0, 20]
        box(w, 0, 1.5, -run_ - 10, 20, 1.5, 10); // plateau top y = 3 beyond the flight
        trimesh(w, colliderOf(osm(run_), height));
      });
      const env: PlayerEnv = { heightAt: height, waterLevel: null, water: undefined };
      const c = new CharacterController(w, env);
      c.spawn(0, 4, 0);
      run(w, c, 0.5);
      expect(c.state.position.y).toBeCloseTo(0, 1);
      run(w, c, 4, go(0)); // north, up
      expect(c.state.position.z).toBeLessThan(-run_ - 1);
      expect(c.state.position.y).toBeCloseTo(3, 1);
      run(w, c, 4, go(Math.PI)); // south, down
      expect(c.state.position.z).toBeGreaterThan(1);
      expect(c.state.position.y).toBeCloseTo(0, 1);
    });
  }

  // River z ≥ 0 (bed level − riverDepth), quay z < 0 at level + quayHeight; the flight hugs the wall on the river side.
  const level = 0;
  const quayH = (_x: number, z: number) => (z < 0 ? level + T.quayHeight : level - T.riverDepth);
  const off = S.quay.width / 2 + 0.02; // as build-chunks
  const len = S.quay.landing + Math.ceil((T.quayHeight + T.copingLift + S.quay.under) / S.riser) * S.tread;
  /** Swimmer spawned at (x, z) in front of a quay flight (top landing at x = 0, foot at x = len). */
  function quay(x: number, z: number, yaw: number) {
    const rec: StairRec = { pts: [0, off, len, off], width: S.quay.width, quay: true };
    const w = world((w) => {
      box(w, 0, level - T.riverDepth - 0.5, 25, 60, 0.5, 25); // bed
      box(w, 0, (level + T.quayHeight + T.copingLift) / 2, -25, 60, (level + T.quayHeight + T.copingLift) / 2, 25); // quay
      trimesh(w, colliderOf(rec, quayH));
    });
    const c = new CharacterController(w, { heightAt: quayH, waterLevel: level, water: undefined });
    c.spawn(x, z, yaw);
    run(w, c, 0.5);
    expect(c.state.moveMode).toBe('swim');
    return { w, c };
  }
  /** West up the flight to the top landing, then north through the parapet gap onto the quay. */
  function upAndOut(w: RAPIER.World, c: CharacterController) {
    for (let i = 0; i < 20 * 60 && c.state.position.x > S.quay.landing / 2; i++) run(w, c, DT, go(Math.PI / 2));
    run(w, c, 2, go(0));
    expect(c.state.moveMode).toBe('walk');
    expect(c.state.position.y).toBeCloseTo(level + T.quayHeight + T.copingLift, 1);
    expect(c.state.position.z).toBeLessThan(-0.5);
  }

  it('a swimmer swims to a quay flight and walks out of the Seine up to the quay', () => {
    const { w, c } = quay(len + 5, off, Math.PI / 2);
    let walked = false;
    for (let i = 0; i < 20 * 60 && c.state.position.x > len - 2; i++) {
      run(w, c, DT, go(Math.PI / 2)); // west along the wall onto the foot of the flight
      walked ||= c.state.moveMode === 'walk' && !c.state.inWater;
    }
    expect(walked).toBe(true);
    upAndOut(w, c);
  });

  it('from the river side: the high part is a wall down into the water; slide along it onto the steps near the water', () => {
    const high = quay(len / 2, 6, 0); // north into the middle of the flight's river side: blocked, not under the steps
    run(high.w, high.c, 6, go(0));
    expect(high.c.state.moveMode).toBe('swim');
    expect(high.c.state.position.z - PL.radius).toBeGreaterThan(off + S.quay.width / 2 + S.stringer.width - 0.03); // outside the stone
    for (let i = 0; i < 20 * 60 && high.c.state.position.x < len - 2; i++) run(high.w, high.c, DT, go(-Math.PI / 4)); // NE
    run(high.w, high.c, 4, go(0));
    expect(high.c.state.moveMode).toBe('walk');
    expect(high.c.state.position.z).toBeLessThan(off);
    upAndOut(high.w, high.c);
  });

  it('from the river side near the water: straight onto the steps', () => {
    const low = quay(len - 1, 6, 0); // north toward the steps at the water line: onto them, then up and out
    run(low.w, low.c, 4, go(0));
    expect(low.c.state.moveMode).toBe('walk');
    expect(low.c.state.position.z).toBeLessThan(off); // on the steps against the quay wall
    upAndOut(low.w, low.c);
  });
});
