import { describe, expect, it } from 'vitest';
import { bridgeFacts, classify, parseNumber, roadFacts } from './osm.ts';

describe('parseNumber', () => {
  it.each([
    ['20 m', 20], ['17m', 17], ['3;4', 3], ['~15', 15], ['12.5', 12.5], ['2,5', 2.5], ['-1', -1],
    ['abc', undefined], ['', undefined], ['20 ft', undefined], ['1.2.3', undefined], [undefined, undefined],
  ])('%s → %s', (v, n) => expect(parseNumber(v)).toBe(n));
});

describe('classify', () => {
  it.each([
    [{ highway: 'footway', footway: 'sidewalk' }, 'line', { drop: 'sidewalk' }],
    [{ highway: 'footway', footway: 'crossing' }, 'line', { drop: 'crossing' }],
    [{ highway: 'primary', tunnel: 'yes' }, 'line', { drop: 'tunnel' }],
    [{ highway: 'service', layer: '-1' }, 'line', { drop: 'underground' }],
    [{ 'building:part': 'yes' }, 'area', { drop: 'buildingPart' }],
    [{ highway: 'pedestrian', area: 'yes' }, 'area', { drop: 'highwayArea' }],
    [{ highway: 'primary', tunnel: 'no' }, 'line', 'road'],
    [{ highway: 'primary', bridge: 'yes', layer: '1' }, 'line', 'bridge'],
    [{ railway: 'subway', bridge: 'viaduct' }, 'line', 'bridge'],
    [{ railway: 'rail' }, 'line', undefined],
    [{ building: 'yes', 'building:part': 'no' }, 'area', 'building'],
    [{ building: 'no' }, 'area', undefined],
    [{ natural: 'tree' }, 'point', 'tree'],
    [{ railway: 'subway_entrance', layer: '-1' }, 'point', 'subway_entrance'],
    [{ natural: 'tree_row' }, 'line', 'tree_row'],
    [{ leisure: 'garden' }, 'area', 'park'],
    [{ landuse: 'grass' }, 'area', 'grass'],
    [{ natural: 'water', water: 'river' }, 'area', 'water'],
    [{ barrier: 'retaining_wall' }, 'line', 'quay'],
  ] as const)('%o (%s) → %o', (tags, shape, want) => expect(classify(tags, shape)).toEqual(want));
});

describe('facts', () => {
  it('roads: oneway, roundabouts, raw numbers only', () => {
    expect(roadFacts({ highway: 'primary', oneway: '-1', lanes: '3', width: '12 m' })).toMatchObject({ oneway: true, lanes: 3, width: 12, roundabout: false });
    expect(roadFacts({ highway: 'primary', junction: 'circular', name: 'Place Charles de Gaulle' })).toMatchObject({ oneway: true, roundabout: true, name: 'Place Charles de Gaulle' });
    expect(roadFacts({ highway: 'residential' })).toEqual({ kind: 'residential', oneway: false, roundabout: false });
  });
  it('bridges: default layer 1, names only on highways', () => {
    expect(bridgeFacts({ highway: 'primary', bridge: 'yes', name: 'Pont Alexandre III' })).toMatchObject({ kind: 'primary', layer: 1, name: 'Pont Alexandre III' });
    expect(bridgeFacts({ railway: 'subway', bridge: 'viaduct', layer: '2', name: 'Viaduc de Passy' })).toMatchObject({ kind: 'subway', layer: 2, name: undefined });
  });
});
