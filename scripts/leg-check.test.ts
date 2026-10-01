import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { latLonToWorld, worldToLatLon } from '@race/shared';
import { checkFile, jsonProblem, loadMap, scanLeaks, secretStrings } from './leg-check.ts';
import { chunkKey, type ChunkData } from '../client/src/geo/chunkData.ts';
import { inRing } from '../client/src/geo/districts.ts';
import { parseLeg } from '../shared/src/leg/index.ts';

const root = join(import.meta.dirname, '..');
const map = loadMap(root);
const legs = (n: string) => join(root, 'worker/legs', n);
const run = (file: string, scanDirs: string[] = []) => checkFile(file, { root, map, scanDirs });
const tmp = mkdtempSync(join(tmpdir(), 'legcheck-'));
const miniJson = () => JSON.parse(readFileSync(legs('test/mini.json'), 'utf8'));
/** Writes a leg under <tmp>/worker/legs/ (no "outside worker/legs" warning). */
const put = (name: string, j: unknown) => {
  mkdirSync(join(tmp, 'worker/legs'), { recursive: true });
  const f = join(tmp, 'worker/legs', name);
  writeFileSync(f, typeof j === 'string' ? j : JSON.stringify(j));
  return f;
};
const runT = (name: string, j: unknown) => checkFile(put(name, j), { root: tmp, map, scanDirs: [] });
const errors = (r: { issues: { level: string; where: string; message: string }[] }) => r.issues.filter((i) => i.level === 'error').map((i) => `${i.where}: ${i.message}`);

/** A point inside a real solid building near the Louvre, found in the chunk data. */
function insideBuilding() {
  const c = latLonToWorld(48.8625, 2.33);
  const [ci, cj] = chunkKey(c.x, c.z).split('_').map(Number) as [number, number];
  const chunk = { buildings: [] as ChunkData['buildings'] };
  for (const [i, j] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) chunk.buildings.push(...(JSON.parse(readFileSync(join(root, 'client/public/data/chunks', `${ci + i!}_${cj + j!}.json`), 'utf8')) as ChunkData).buildings);
  for (const b of chunk.buildings) {
    if (b.kind === 'roof' || b.landmark || (b.minHeight ?? 0) > 0) continue;
    let [x, z, n] = [0, 0, b.outer.length / 2];
    for (let i = 0; i < b.outer.length; i += 2) (x += b.outer[i]! / n), (z += b.outer[i + 1]! / n);
    if (inRing(x, z, b.outer) && !(b.holes ?? []).some((h) => inRing(x, z, h))) return worldToLatLon(x, z);
  }
  throw new Error('no building found');
}

describe('leg:check (docs/LEG_FORMAT.md)', () => {
  it('paris-demo: valid, only blanks (and no error)', () => {
    const r = run(legs('paris-demo.json'));
    expect(r.ok).toBe(true);
    expect(r.issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(r.issues.some((i) => i.level === 'blank')).toBe(true);
    expect(r.issues.every((i) => i.level !== 'warning' || /đường đi bộ gần nhất|cây cầu/.test(i.message))).toBe(true);
  });

  it.each(['test/mini.json', 'test/paris-demo.filled.json', 'test/near.json'])('%s: 0 errors on the real map data', (f) => {
    const r = run(legs(f));
    expect(errors(r)).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('mini: no blanks; the only warning is the (intended) Bir-Hakeim viaduct start', () => {
    expect(run(legs('test/mini.json')).issues).toEqual([expect.objectContaining({ level: 'warning', where: 'điểm xuất phát' })]);
  });

  it('summary lists every point with street, district, OSM link and screenshot command', () => {
    const { report } = run(legs('test/mini.json'));
    expect(report).toContain('Place du Trocadéro, Quận 16');
    expect(report).toContain('https://www.openstreetmap.org/?mlat=48.86215&mlon=2.28843#map=19/48.86215/2.28843');
    expect(report).toContain('npm run screenshot -- --path "/preview.html?at=48.86215,2.28843&r=80" --name leg-L1');
    expect(report).toMatch(/Bước 4 \(D1\/B, detour\)/);
    expect(report).toMatch(/đi bộ ≈ \d+ m/);
  });

  it('suggests a bike rack that exists in OSM near a point without one', () => {
    expect(run(legs('test/paris-demo.filled.json')).report).toMatch(/Gợi ý bãi xe .*"bikeParking": \{ "lat": 48\.\d+, "lon": 2\.\d+ \}/);
  });

  it('a detour branch with its own place inside a building is an error', () => {
    const b = insideBuilding();
    const j = miniJson();
    Object.assign(j.steps[3].branches[1].task.location, { lat: b.lat, lon: b.lon });
    const e = errors(runT('b1.json', j));
    expect(e.some((m) => m.includes('nhánh B') && m.includes('trong một tòa nhà'))).toBe(true);
  });

  it('a bike rack inside the zone is a warning', () => {
    const j = miniJson();
    Object.assign(j.steps[0].destination.bikeParking, { lat: j.steps[0].destination.lat, lon: j.steps[0].destination.lon });
    const r = runT('b2.json', j);
    expect(r.ok).toBe(true);
    expect(r.issues.some((i) => i.level === 'warning' && i.message.includes('bãi xe cách tâm') && i.message.includes('trong vùng'))).toBe(true);
  });

  it('broken file: roadblock, radius 50, point in a Haussmann building, point off the map → the right lines, not ok', () => {
    const b = insideBuilding();
    const j = miniJson();
    j.steps[2].destination.radius = 50;
    j.steps[4].destination.lat = b.lat;
    j.steps[4].destination.lon = b.lon;
    j.steps.splice(1, 0, { id: 'RB', type: 'roadblock', label: 'x' });
    const r1 = runT('c1.json', j);
    expect(r1.ok).toBe(false);
    expect(errors(r1).join('\n')).toContain('loại bước "roadblock" không có');
    const k = miniJson();
    k.steps[2].destination.radius = 50;
    const r2 = runT('c2.json', k);
    expect(errors(r2)).toEqual([expect.stringMatching(/Bước 3 \(L2\) › điểm đến › bán kính: phải ≤ 40 m/)]);
    const m = miniJson();
    m.steps[4].destination.lat = b.lat;
    m.steps[4].destination.lon = b.lon;
    m.steps[5].destination.lat = b.lat;
    m.steps[5].destination.lon = b.lon;
    const r3 = runT('c3.json', m);
    expect(r3.ok).toBe(false);
    expect(errors(r3).some((x) => x.startsWith('Bước 5 (L3)') && x.includes('trong một tòa nhà'))).toBe(true);
    const o = miniJson();
    o.steps[0].destination.lat = 51.5;
    const r4 = runT('c4.json', o);
    expect(r4.ok).toBe(false);
    expect(errors(r4).some((x) => x.includes('ngoài bản đồ đua'))).toBe(true);
  });

  it('a point in the middle of the river is a warning; a bad timezone too', () => {
    const j = miniJson();
    let w = { x: 0, z: 0 };
    for (let x = -400; x < 400; x += 10) for (let z = 150; z < 500; z += 10) if (map.inWater(x, z) && !map.onBridge(x, z)) w = { x, z };
    expect(w.z).toBeGreaterThan(0);
    Object.assign(j.steps[2].destination, worldToLatLon(w.x, w.z)); // somewhere in the Seine
    j.timezone = 'Viet/Nam';
    const r = runT('w1.json', j);
    expect(r.issues.some((i) => i.level === 'warning' && i.message.includes('mặt nước'))).toBe(true);
    expect(r.issues.some((i) => i.level === 'warning' && i.where === 'múi giờ')).toBe(true);
  });

  it('leak scan: a clue / answer copied into a static folder is found, short answers are not searched', () => {
    const leg = parseLeg(miniJson());
    if (!leg.ok) throw new Error('mini invalid');
    const secrets = secretStrings(leg.leg);
    expect(secrets).toContain('(GIẢ) Lên quảng trường có tầm nhìn đẹp nhất ra \'bà đầm sắt\'.');
    expect(secrets.some((s) => s === '42')).toBe(false);
    const dir = mkdtempSync(join(tmpdir(), 'legleak-'));
    expect(scanLeaks([dir], secrets, dir)).toEqual([]);
    writeFileSync(join(dir, 'app.js'), `var x="${secrets[0]!.replace(/"/g, '\\"')}";`);
    writeFileSync(join(dir, 'data.json'), JSON.stringify({ c: secrets[1] }));
    const hits = scanLeaks([dir], secrets, dir);
    expect(hits.map((h) => h.where).sort()).toEqual(['app.js', 'data.json']);
    const r = checkFile(legs('test/mini.json'), { root, map, scanDirs: [dir] });
    expect(r.ok).toBe(false);
  });

  it('leak scan: an answer equal to a street / landmark name already shipped in the map data is only a warning', () => {
    const j = miniJson();
    j.steps.find((s: { id: string }) => s.id === 'T1').task.answers = ['Avenue des Champs-Élysées'];
    const f = put('leak-street.json', j);
    const r = checkFile(f, { root: tmp, map, scanDirs: [join(root, 'client/public')] });
    expect(r.ok).toBe(true);
    expect(r.issues.some((i) => i.level === 'warning' && i.message.includes('trùng một đáp án'))).toBe(true);
    // ...but a file holding 2+ secrets (a copy of the leg) stays an error
    const dir = mkdtempSync(join(tmpdir(), 'legleak2-'));
    writeFileSync(join(dir, 'copy.json'), JSON.stringify({ a: 'Avenue des Champs-Élysées', b: 'Khải Hoàn Môn là đáp án khác' }));
    j.steps.find((s: { id: string }) => s.id === 'T1').task.answers = ['Avenue des Champs-Élysées', 'Khải Hoàn Môn là đáp án khác'];
    expect(checkFile(put('leak-copy.json', j), { root: tmp, map, scanDirs: [dir] }).ok).toBe(false);
  });

  it('a start on the Bir-Hakeim viaduct over land (chunk bridge polygon) is a warning', () => {
    const j = miniJson();
    Object.assign(j.start, { lat: 48.85569, lon: 2.28758 });
    const p = latLonToWorld(48.85569, 2.28758);
    expect(map.onBridge(p.x, p.z)).toBe(true);
    expect(map.inWater(p.x, p.z)).toBe(false);
    const r = runT('bh.json', j);
    expect(r.issues.some((i) => i.level === 'warning' && i.where === 'điểm xuất phát' && i.message.includes('cầu'))).toBe(true);
  });

  it('a point beside a disconnected footpath: the distance is measured to the main walk network', () => {
    const j = miniJson();
    Object.assign(j.steps[0].destination, { lat: 48.86231, lon: 2.28528, radius: 20 });
    const w = latLonToWorld(48.86231, 2.28528);
    expect(map.geo.walk({ x: w.x, z: w.z }, { x: w.x, z: w.z })!.snapB).toBeGreaterThan(20);
    const r = runT('snap.json', j);
    expect(r.issues.some((i) => i.level === 'warning' && i.message.includes('đường đi bộ gần nhất'))).toBe(true);
  });

  it('a file outside worker/legs/ gets a warning', () => {
    const f = join(tmp, 'ngoai.json');
    writeFileSync(f, readFileSync(legs('test/mini.json'), 'utf8'));
    const r = checkFile(f, { root, map, scanDirs: [] });
    expect(r.ok).toBe(true);
    expect(r.issues.some((i) => i.level === 'warning' && i.message.includes('ngoài worker/legs/'))).toBe(true);
  });

  it('JSON mistakes of non-programmers come back as "dòng X, cột Y" with the likely cause', () => {
    const cases: [string, RegExp][] = [
      ['{\n  "lat": 48,85\n}', /dòng 2.*dấu phẩy thập phân/s],
      ['{\n  “id”: "a"\n}', /dòng 2.*ngoặc kép cong/s],
      ['{\n  "id": "a",\n}', /dòng 3.*dấu phẩy thừa/s],
      ['{\n  // chú thích\n  "id": "a"\n}', /dòng 2.*chú thích/s],
    ];
    for (const [text, re] of cases) {
      let msg = '';
      try {
        JSON.parse(text);
      } catch (e) {
        msg = jsonProblem(text, e);
      }
      expect(msg).toMatch(re);
    }
    const r = checkFile(put('bad.json', '{ "id": "x", }'), { root: tmp, map, scanDirs: [] });
    expect(r.ok).toBe(false);
    expect(r.report).toContain('không phải JSON hợp lệ');
  });
});
