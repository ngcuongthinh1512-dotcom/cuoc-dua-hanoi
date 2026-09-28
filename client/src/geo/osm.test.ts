import { describe, expect, it } from 'vitest';
import { bridgeFacts, classify, parseDirection, parseNumber, partFacts, roadFacts } from './osm.ts';

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
    [{ 'building:part': 'yes' }, 'area', 'part'],
    [{ 'building:part': 'column', layer: '-1' }, 'area', { drop: 'underground' }],
    [{ tourism: 'artwork', artwork_type: 'statue' }, 'point', 'artwork'],
    [{ tourism: 'artwork', area: 'yes' }, 'area', 'artwork'],
    [{ highway: 'street_lamp' }, 'point', 'street_lamp'],
    [{ amenity: 'fountain' }, 'point', 'fountain'],
    [{ amenity: 'clock' }, 'point', 'clock'],
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

describe('parseDirection', () => {
  it.each([['SE', 135], ['nnw', 337.5], ['90', 90], ['-90', 270], ['405', 45], ['up', undefined], [undefined, undefined]] as const)(
    '%s → %s', (v, n) => expect(parseDirection(v)).toBe(n));
});

describe('facts', () => {
  it('parts: S3DB tags, compass letters converted, orientation validated', () => {
    expect(partFacts({ 'building:part': 'column', height: '36.2', min_height: '5', 'roof:shape': 'skillion', 'roof:direction': 'W',
      'roof:orientation': 'across', 'roof:material': 'gold', 'building:min_level': '2', 'roof:levels': '1', 'roof:height': '3 m' }))
      .toEqual({ kind: 'column', height: 36.2, minHeight: 5, roofShape: 'skillion', roofDirection: 270, roofOrientation: 'across',
        roofMaterial: 'gold', minLevel: 2, roofLevels: 1, roofHeight: 3 });
    expect(partFacts({ 'building:part': 'yes', 'roof:orientation': 'sideways' }).roofOrientation).toBeUndefined();
  });
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
