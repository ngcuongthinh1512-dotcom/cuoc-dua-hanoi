// Tiny hand-made chunk "0_0" (x, z ∈ [0, 250)) covering every case the builders must handle (docs/plans/phase2.md
// step 0). Used by unit tests and by /preview.html?fixture=1. Layout, north (−Z) up:
//   z 10–70   buildings: courtyard block, L-shape, no-height block, Eiffel-tagged footprint
//   z 100     2-lane named road west→east (junction at x 125, neighbours across both chunk edges)
//   x 125     sett road running south from the junction; subway entrance on the north sidewalk
//   z 110–225 park with a pond hole, footway across it, 5 trees (2 street trees)
//   z ~238    2-segment bridge chain
import type { ChunkData, XZ } from './chunkData.ts';

/** Axis-aligned rectangle, counter-clockwise seen from above (ringArea > 0); `hole` reverses it (ringArea < 0). */
const rect = (x0: number, z0: number, x1: number, z1: number, hole = false): XZ =>
  hole ? [x0, z0, x1, z0, x1, z1, x0, z1] : [x0, z1, x1, z1, x1, z0, x0, z0];

export const fixture: ChunkData = {
  v: 1,
  key: '0_0',
  buildings: [
    { outer: rect(10, 10, 50, 50), holes: [rect(25, 25, 35, 35, true)], kind: 'apartments', height: 24, roofShape: 'mansard' },
    { outer: [60, 50, 110, 50, 110, 35, 75, 35, 75, 10, 60, 10], kind: 'yes', levels: 6 }, // L-shape
    { outer: rect(140, 20, 165, 45), kind: 'residential' }, // no height, no levels → default
    { outer: rect(180, 15, 235, 70), kind: 'tower', height: 330, landmark: 'eiffel' },
  ],
  roads: [
    {
      pts: [0, 100, 125, 100, 250, 100],
      kind: 'secondary',
      name: 'Avenue de la Fixture',
      lanes: 2,
      oneway: false,
      roundabout: false,
      junctions: [1],
      before: [-20, 100],
      after: [270, 100],
    },
    {
      pts: [125, 100, 125, 180, 125, 250],
      kind: 'residential',
      name: 'Rue Pavée',
      oneway: true,
      surface: 'sett',
      roundabout: false,
      junctions: [0],
      after: [125, 270],
    },
    { pts: [150, 215, 200, 190, 235, 120], kind: 'footway', oneway: false, roundabout: false, junctions: [] },
  ],
  bridges: [{ pts: [135, 238, 190, 241, 245, 238], kind: 'primary', layer: 1, lanes: 2, name: 'Pont de la Fixture' }],
  areas: [{ kind: 'park', outer: rect(140, 110, 240, 225), holes: [rect(175, 140, 205, 170, true)] }],
  points: [
    { kind: 'tree', x: 150, z: 120 },
    { kind: 'tree', x: 160, z: 120 },
    { kind: 'tree', x: 230, z: 200 },
    { kind: 'tree', x: 30, z: 108 },
    { kind: 'tree', x: 60, z: 108 },
    { kind: 'subway_entrance', x: 100, z: 95 },
  ],
};
