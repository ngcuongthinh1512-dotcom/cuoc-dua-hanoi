import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type Asset8c, assetPath, credits8c, licenceOk, mergeCredits, readManifest8c, shortLicence } from './manifest.ts';

const a = (file: string, licence: string, extra: Partial<Asset8c> = {}): Asset8c => ({ file, title: file, pageUrl: 'https://polyhaven.com/a/x', licence, author: 'A', ...extra });

/** A minimal GLB: header + JSON chunk. */
function glb(json: object) {
  let s = JSON.stringify(json);
  while (s.length % 4) s += ' ';
  const b = Buffer.alloc(20 + s.length);
  b.writeUInt32LE(0x46546c67, 0), b.writeUInt32LE(2, 4), b.writeUInt32LE(b.length, 8), b.writeUInt32LE(s.length, 12), b.writeUInt32LE(0x4e4f534a, 16);
  b.write(s, 20);
  return b;
}

describe('licence rule (SPEC §17.20)', () => {
  it.each(['CC0 1.0 Universal', 'CC0', 'Public domain', 'MIT', 'CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)', 'CC BY-SA 4.0', 'CC BY-NC 4.0', 'CC-BY-NC-SA-4.0'])('allows %s', (l) => expect(licenceOk(l)).toBe(true));
  it.each(['CC-BY-ND-4.0', 'CC BY-NC-ND 4.0', 'Standard', 'Editorial', 'personal use only', '', 'Quaternius Asset License v1.0'])('refuses %s', (l) => expect(licenceOk(l)).toBe(false));
  it('short names', () => {
    expect(shortLicence('CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)')).toBe('CC BY 4.0');
    expect(shortLicence('CC-BY-SA-4.0')).toBe('CC BY-SA 4.0');
    expect(shortLicence('CC0 1.0 Universal')).toBe('CC0 1.0 Universal');
  });
});

describe('readManifest8c + assetPath', () => {
  const dir = mkdtempSync(join(tmpdir(), '8c-'));
  mkdirSync(join(dir, 'sketchfab'));
  writeFileSync(join(dir, 'x.txt'), 'abc');
  const md5 = '900150983cd24fb0d6963f7d28e17f72'; // md5('abc')
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify([{ file: 'x.txt', title: 'X', pageUrl: 'https://polyhaven.com/a/x', licence: 'CC0', author: 'P', md5 }]));
  writeFileSync(join(dir, 'sketchfab/morris.glb'), glb({ asset: { version: '2.0', extras: { author: 'BigMax (https://sketchfab.com/bigmax)', license: 'CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)', source: 'https://sketchfab.com/3d-models/m', title: 'French Colonne Morris' } } }));

  it('reads the manifest and the Sketchfab extras', () => {
    const list = readManifest8c(dir);
    expect(list.map((x) => x.file)).toEqual(['x.txt', 'sketchfab/morris.glb']);
    expect(list[1]).toMatchObject({ author: 'BigMax (https://sketchfab.com/bigmax)', title: 'French Colonne Morris', pageUrl: 'https://sketchfab.com/3d-models/m' });
    expect(assetPath(dir, list, 'x.txt')).toBe(join(dir, 'x.txt'));
    expect(() => assetPath(dir, list, 'y.txt')).toThrow(/not in the manifest/);
    expect(() => assetPath(dir, [{ ...list[0]!, file: 'ambientcg/Grass004_2K-JPG.zip' }], 'ambientcg/Grass004_2K-JPG.zip')).toThrow(/not used/);
  });
  it('refuses an ND GLB and a wrong checksum', () => {
    const bad = mkdtempSync(join(tmpdir(), '8c-'));
    mkdirSync(join(bad, 'sketchfab'));
    writeFileSync(join(bad, 'manifest.json'), JSON.stringify([{ file: 'x.txt', licence: 'CC0', md5: 'ff' }]));
    writeFileSync(join(bad, 'x.txt'), 'abc');
    expect(() => assetPath(bad, readManifest8c(bad), 'x.txt')).toThrow(/md5 differs/);
    writeFileSync(join(bad, 'sketchfab/nd.glb'), glb({ asset: { extras: { license: 'CC-BY-ND-4.0', source: 'https://sketchfab.com/3d-models/n' } } }));
    expect(() => readManifest8c(bad)).toThrow(/outside SPEC §17.20/);
  });
});

describe('credits8c', () => {
  const list = [
    a('polyhaven/textures/asphalt_02/asphalt_02_diff_2k.jpg', 'CC0 1.0 Universal', { title: 'Asphalt 02', author: 'Rob Tuytel, Poly Haven' }),
    a('polyhaven/textures/asphalt_02/asphalt_02_arm_2k.jpg', 'CC0 1.0 Universal', { title: 'Asphalt 02', author: 'Rob Tuytel, Poly Haven' }),
    a('polyhaven/textures/roof_slates_03/roof_slates_03_diff_2k.jpg', 'CC0 1.0 Universal', { title: 'Roof Slates 03', author: 'Poly Haven', pageUrl: 'https://polyhaven.com/a/roof_slates_03' }),
    a('rocketbox/Assets/x.fbx', 'MIT'),
    a('polyhaven/textures/large_sandstone_blocks/large_sandstone_blocks_diff_2k.jpg', 'CC0 1.0 Universal'),
    a('ambientcg/Metal028_2K-JPG.zip', 'CC0 1.0 Universal'),
    a('sketchfab/fontaine_wallace.glb', 'CC-BY-4.0'),
    a('sketchfab/garbage_truck.glb', 'CC-BY-4.0'),
    a('sketchfab/animated_bird_pigeon.glb', 'CC-BY-4.0'),
    a('polyhaven/hdri/qwantani_puresky_1k.hdr', 'CC0 1.0 Universal'),
    a('sketchfab/french_colonne_morris.glb', 'CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)', { title: 'French Colonne Morris', author: 'BigMax', pageUrl: 'https://sketchfab.com/3d-models/m' }),
  ];
  it('groups CC0, one line per CC BY work, unused sets (facade textures, Rocketbox, cars, Wallace, pigeon, spare HDRI) left out', () => {
    const c = credits8c(list);
    expect(c).toHaveLength(2);
    expect(c[0]).toMatchObject({ title: 'Cột Morris: French Colonne Morris', licence: 'CC BY 4.0', url: 'https://sketchfab.com/3d-models/m', set: '8c' });
    expect(c[0]!.text).toBe('Cột Morris: "French Colonne Morris" – BigMax, CC BY 4.0, qua Sketchfab (đã chỉnh sửa)');
    expect(c[1]).toMatchObject({ title: 'Texture (Poly Haven)', url: 'https://polyhaven.com/' });
    expect(c[1]!.text).toBe('Texture: Asphalt 02, Roof Slates 03 – Rob Tuytel, Poly Haven, CC0 1.0 Universal, qua Poly Haven');
  });
  it('an unlabelled file is an error', () => expect(() => credits8c([a('sketchfab/new.glb', 'CC0')])).toThrow(/no credits label/));
  it('merge: at the end, idempotent', () => {
    const base = [{ title: 'Bản đồ', text: '', licence: 'ODbL', url: '' }];
    const once = mergeCredits(base, credits8c(list));
    expect(once.map((c) => c.title)).toEqual(['Bản đồ', 'Cột Morris: French Colonne Morris', 'Texture (Poly Haven)']);
    expect(mergeCredits(once, credits8c(list))).toEqual(once);
  });
  it('the real downloads (when present) all have a label and an allowed licence', () => {
    const dir = join(import.meta.dirname, '../../.cache/assets/8c');
    if (!existsSync(join(dir, 'manifest.json'))) return;
    const c = credits8c(readManifest8c(dir));
    expect(c.length).toBeGreaterThan(10);
    // fix A: full CC BY attribution (display name + profile URL), never an UNUSED file
    expect(c.find((x) => x.title.startsWith('Ngọn lửa'))?.author).toBe('emm (https://sketchfab.com/edemaistre)');
    for (const x of c.filter((q) => /^CC BY/.test(q.licence))) expect(x.author).toMatch(/\(https:\/\/sketchfab\.com\/[^)]+\)$/);
    expect(c.map((x) => x.text).join('\n')).not.toMatch(/Wallace|pigeon|Bồ câu|garbage|Rocketbox|sandstone|qwantani/i);
  });
});
