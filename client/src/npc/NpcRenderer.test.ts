import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GRAPH_VERSION, RoadGraph, type RoadGraphFile, segPoint, WayFlag } from '@race/shared/graph';
import { Color, Matrix4, Quaternion, Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { npcRender as R } from '../config.ts';
import { TrafficLights } from './lights.ts';
import { loadNpcAssets, type NpcAssets } from './NpcAssets.ts';
import { carQuaternion, lerpPose, NpcRenderer, type Snap } from './NpcRenderer.ts';
import { NpcRoads } from './roads.ts';
import type { CarKind, CarPose, LightQuery, SignalHead } from './types.ts';

let assets: NpcAssets;
beforeAll(async () => void (assets = await loadNpcAssets()));

const car = (id: number, kind: CarKind, paint: number, x: number, z: number, yaw = 0): CarPose =>
  ({ id, kind, paint, x, y: 0, z, yaw, pitch: 0, speed: 0, wheel: 0, braking: false });
const snap = (o: Partial<Snap>): Snap => ({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0, wheel: 0, step: 0, ...o });

describe('NpcRenderer (asset stub)', () => {
  it('one InstancedMesh per kind: instances = cars of that kind, each its own paint; empty kinds hidden', () => {
    const r = new NpcRenderer(assets);
    r.cars([car(1, 'sedan', 0xff0000, 0, 0), car(2, 'sedan', 0x00ff00, 5, 0), car(3, 'bus', 0x0000ff, 10, 0)], new Map(), 1);
    const sedan = r.carMeshes.get('sedan')!, bus = r.carMeshes.get('bus')!, taxi = r.carMeshes.get('taxi')!;
    expect([sedan.count, bus.count, taxi.count, taxi.visible]).toEqual([2, 1, 0, false]);
    const [a, b] = [new Color(), new Color()];
    sedan.getColorAt(0, a);
    sedan.getColorAt(1, b);
    expect(a.getHex()).not.toBe(b.getHex());
    const axles = assets.vehicles.get('sedan')!.axles.length * 2 + assets.vehicles.get('bus')!.axles.length;
    expect(r.wheels.count).toBe(axles);
    r.cars([car(3, 'bus', 0x0000ff, 10, 0)], new Map(), 1); // two gone: fewer instances, no new meshes
    expect([sedan.count, sedan.visible, bus.count]).toEqual([0, false, 1]);
  });

  it('heading: yaw 0 = nose (+Z model) to the north (−Z), + = left; pitch lifts the nose', () => {
    const r = new NpcRenderer(assets);
    r.cars([car(1, 'van', 0xffffff, 3, 4, Math.PI / 2)], new Map(), 1);
    const m = new Matrix4();
    r.carMeshes.get('van')!.getMatrixAt(0, m);
    const nose = new Vector3(0, 0, 1).applyMatrix4(m);
    expect([nose.x, nose.y, nose.z].map((v) => +v.toFixed(6) + 0)).toEqual([2, 0, 4]); // heading west
    const up = new Vector3(0, 0, 1).applyQuaternion(carQuaternion(0, 0.2));
    expect(up.y).toBeCloseTo(Math.sin(0.2), 6);
    expect(up.z).toBeCloseTo(-Math.cos(0.2), 6);
  });

  it('lerpPose: between the previous step and now (yaw the short way), the latest when just spawned', () => {
    const out = snap({});
    const p = car(1, 'city', 0, 10, 0, -3);
    expect(lerpPose(p, snap({ x: 0, yaw: 3 }), 0.5, out)).toMatchObject({ x: 5 });
    expect(out.yaw).toBeCloseTo(Math.PI, 1); // across ±π, not through 0
    expect(lerpPose(p, undefined, 0.5, out)).toMatchObject({ x: 10, yaw: -3 });
  });

  it('zebra stripes at a mid-block crossing node, across the carriageway; light heads show the colour they give', () => {
    const CAR = WayFlag.walk | WayFlag.bike | WayFlag.car;
    const file: RoadGraphFile = {
      v: GRAPH_VERSION, nodes: [[-100, 0], [0, 0], [100, 0]].flatMap(([x, z]) => [x! * 10, z! * 10]), kinds: ['residential'], names: [],
      ways: [[0, CAR, 0, -1, 0, 0, 0, 1, 2]], junctions: [], crossings: [1], signals: [], bikeParking: [],
    };
    const roads = new NpcRoads(RoadGraph.decode(file), () => 0);
    const r = new NpcRenderer(assets);
    r.setZebras(roads, 0, 0);
    expect(r.zebras.count).toBe(Math.floor((2 * roads.halfWidth(0) - R.zebra.stripe) / (2 * R.zebra.stripe)));
    const m = new Matrix4();
    const xs = Array.from({ length: r.zebras.count }, (_, i) => (r.zebras.getMatrixAt(i, m), new Vector3().setFromMatrixPosition(m)));
    expect(xs.every((p) => Math.abs(p.x) < 1e-6 && Math.abs(p.z) < roads.halfWidth(0))).toBe(true); // across the x road
    const heads: SignalHead[] = [{ x: 0, z: 0, yaw: Math.PI / 2, junction: 1, edge: 0 }, { x: 0, z: 0, yaw: -Math.PI / 2, junction: 1, edge: 1 }];
    r.setLights(heads, roads);
    const q: LightQuery = { car: (_j, e) => (e ? 'green' : 'red'), pedMayCross: () => true, headsNear: () => heads };
    r.lightColours(q);
    const c = new Color();
    expect([r.poles.count, r.bulbs.count]).toEqual([2, 2]);
    expect((r.bulbs.getColorAt(0, c), c.getHexString())).toBe(new Color(R.lights.bulbs.red).getHexString());
    expect((r.bulbs.getColorAt(1, c), c.getHexString())).toBe(new Color(R.lights.bulbs.green).getHexString());
    r.setChairs([{ x: 1, z: 2, yaw: 0 }], () => 0);
    expect(r.chairs.count).toBe(1);
  });
});

const graphFile = join(import.meta.dirname, '../../../shared/data/roadgraph.json');
describe.skipIf(!existsSync(graphFile))('NpcRenderer lights (real TrafficLights, roadgraph.json)', () => {
  it('pole foot = SignalHead (x, z) (the right kerb, off the carriageway); housing and lit bulb look along yaw, at the oncoming cars', () => {
    const g = RoadGraph.decode(JSON.parse(readFileSync(graphFile, 'utf8')) as RoadGraphFile);
    const roads = new NpcRoads(g, () => 0);
    const lights = new TrafficLights(roads);
    const heads = lights.headsNear(0, 0, 300);
    expect(heads.length).toBeGreaterThan(10);
    const r = new NpcRenderer(assets);
    r.setLights(heads, roads);
    r.lightColours(lights);
    const m = new Matrix4(), p = new Vector3(), q = new Quaternion(), b = new Vector3();
    heads.forEach((h, i) => {
      r.poles.getMatrixAt(i, m);
      m.decompose(p, q, new Vector3());
      expect(Math.hypot(p.x - h.x, p.z - h.z)).toBeLessThan(1e-3); // float32 instance matrix
      const e = h.edge, [ax, az, bx, bz] = [g.x[g.edgeA[e]!]!, g.z[g.edgeA[e]!]!, g.x[g.edgeB[e]!]!, g.z[g.edgeB[e]!]!];
      expect(segPoint(p.x, p.z, ax, az, bx, bz)[1]).toBeGreaterThanOrEqual(roads.halfWidth(g.edgeWay[e]!) - 1e-6);
      const look = new Vector3(0, 0, 1).applyQuaternion(q); // the housing's lamps
      expect(look.x * -Math.sin(h.yaw) + look.z * -Math.cos(h.yaw)).toBeCloseTo(1, 6);
      r.bulbs.getMatrixAt(i, m);
      b.setFromMatrixPosition(m).sub(p);
      expect(b.x * -Math.sin(h.yaw) + b.z * -Math.cos(h.yaw)).toBeCloseTo(R.lights.bulbOut, 4);
    });
  });
});
