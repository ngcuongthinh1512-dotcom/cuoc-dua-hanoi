import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { latLonToWorld, worldToLatLon } from '@race/shared';
import { checkFile, compass, loadMap, scanLeaks, secretStrings } from './leg-check.ts';
import { chunkKey, type ChunkData } from '../client/src/geo/chunkData.ts';
import { inRing } from '../client/src/geo/districts.ts';
import { jsonProblem, parseLeg } from '../shared/src/leg/index.ts';

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
    // only L6 (the SPEC §17.4 point): the start moved off the island vault (walkway under the metro, Passy side), docs/LEG_FORMAT.md §10
    expect(r.issues.filter((i) => i.level === 'warning').map((i) => i.where)).toEqual(['Bước 9 (L6) › điểm đến']);
  });

  it.each(['test/mini.json', 'test/paris-demo.filled.json', 'test/near.json'])('%s: 0 errors on the real map data', (f) => {
    const r = run(legs(f));
    expect(errors(r)).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('mini: no blank, no warning (docs/LEG_FORMAT.md §10 says so)', () => {
    expect(run(legs('test/mini.json')).issues).toEqual([]);
  });

  it('summary lists every point with street, district, OSM link and screenshot command', () => {
    const { report } = run(legs('test/mini.json'));
    expect(report).toContain('Place du Trocadéro, Quận 16');
    expect(report).toContain('https://www.openstreetmap.org/?mlat=48.86215&mlon=2.28843#map=19/48.86215/2.28843');
    expect(report).toContain('Vệ tinh: https://www.google.com/maps?q=48.86215,2.28843&t=k&z=19');
    // the game's spectator camera 65 m south-up of the point, a mat on it (organiser review: the old preview showed no point)
    const p = latLonToWorld(48.86215, 2.28843);
    const xz = `${+p.x.toFixed(1)},${+p.z.toFixed(1)}`;
    expect(report).toMatch(new RegExp(`Xem: npm run screenshot -- --path "/\\?cam=${p.x.toFixed(1)},[\\d.]+,${(p.z + 32.5).toFixed(1)},0,-60&boxes=L1,${xz}&mat&npc=0" --name leg-L1\n`));
    // in game: the clue box, the player 12 m back on the walking route from the start, facing it (verify3 m6: not inside the box)
    const g = new RegExp(`Trong game: http://localhost:5173/\\?start=([-\\d.]+),([-\\d.]+),(-?\\d+)&boxes=L1,${xz}\n`).exec(report)!;
    const [sx, sz, yaw] = [Number(g[1]), Number(g[2]), (Number(g[3]) * Math.PI) / 180];
    const d = Math.hypot(p.x - sx, p.z - sz);
    expect(d).toBeGreaterThan(8);
    expect(d).toBeLessThanOrEqual(12.1);
    expect((-Math.sin(yaw) * (p.x - sx) - Math.cos(yaw) * (p.z - sz)) / d).toBeGreaterThan(0.99); // forward (yaw 0 = north = −z) → the box
    expect(report).toMatch(/Trong game: [^\n]+&boxes=PS,[-\d.,]+&mat\n/); // the Pit Stop: its mat
    expect(report).toMatch(/Xem: [^\n]+&boxes=start,[-\d.,]+&mat&npc=0" --name leg-start\n/);
    expect(report).toContain('Hướng nhìn lúc vào: la bàn 327° (tây bắc) — "yawDeg": 33');
    expect(report).toContain('Bãi xe: 48.86250, 2.28780 (cách tâm 60 m)'); // a rack in the file is printed (review 2 F5)
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

  it('a point in the middle of the river is a warning; a bad timezone is an error (the server refuses the leg)', () => {
    const j = miniJson();
    let w = { x: 0, z: 0 };
    for (let x = -400; x < 400; x += 10) for (let z = 150; z < 500; z += 10) if (map.waterAt(x, z) === 'river' && !map.onBridge(x, z)) w = { x, z };
    expect(w.z).toBeGreaterThan(0);
    Object.assign(j.steps[2].destination, worldToLatLon(w.x, w.z)); // somewhere in the Seine
    const r = runT('w1.json', j);
    expect(r.ok).toBe(true);
    expect(r.issues.some((i) => i.level === 'warning' && i.message.includes('giữa sông') && i.message.includes('lên mặt cầu'))).toBe(true);
    const tz = runT('w2.json', { ...j, timezone: 'Viet/Nam' });
    expect(tz.ok).toBe(false);
    expect(tz.issues.filter((i) => i.where === 'múi giờ')).toEqual([expect.objectContaining({ level: 'error', message: expect.stringContaining('"Viet/Nam" không phải múi giờ hợp lệ') })]);
    // the time zone error does not hide the map checks (organiser review: two rounds to see the next error)
    expect(tz.issues.some((i) => i.level === 'warning' && i.message.includes('giữa sông'))).toBe(true);
    expect(tz.report).toContain('Các điểm trên bản đồ');
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
    expect(map.waterAt(p.x, p.z)).toBe(null);
    const r = runT('bh.json', j);
    // not "does not cross the river" (it does): this part of the deck stands over the island
    expect(r.issues.filter((i) => i.level === 'warning').map((i) => `${i.where}: ${i.message}`)).toEqual([expect.stringMatching(/^điểm xuất phát: nằm trên đoạn cầu bắc qua đất \(bờ \/ đảo\)/)]);
    // step 1 = the start (first clue handed out of game, Bir-Hakeim): the same warning once, and a note that the box opens at once
    Object.assign(j.steps[0].destination, { lat: 48.85569, lon: 2.28758, radius: 20 });
    delete j.steps[0].destination.bikeParking;
    const r2 = runT('bh2.json', j);
    expect(r2.issues.filter((i) => i.level === 'warning')).toHaveLength(1);
    expect(r2.report).toContain('Điểm xuất phát nằm trong vùng này');
  });

  it('a point beside a disconnected footpath: the distance is measured to the main walk network', () => {
    const j = miniJson();
    Object.assign(j.steps[0].destination, { lat: 48.86231, lon: 2.28528, radius: 20 });
    const w = latLonToWorld(48.86231, 2.28528);
    expect(map.geo.walk({ x: w.x, z: w.z }, { x: w.x, z: w.z })!.snapB).toBeGreaterThan(20);
    const r = runT('snap.json', j);
    expect(r.issues.some((i) => i.level === 'warning' && i.message.includes('đường đi bộ gần nhất'))).toBe(true);
  });

  it('where the file is: outside the project = fine; in the project (not worker/legs/) = warning; in client/ = error', () => {
    const at = (dir: string) => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'chang.json'), readFileSync(legs('test/mini.json'), 'utf8'));
      return checkFile(join(dir, 'chang.json'), { root: tmp, map, scanDirs: [] });
    };
    const whole = (r: { issues: { where: string }[] }) => r.issues.filter((i) => i.where === 'cả file');
    expect(whole(at(mkdtempSync(join(tmpdir(), 'chang-that-'))))).toEqual([]); // organiser review: no warning for the safe place
    const inRepo = at(join(tmp, 'ghi-chu'));
    expect(inRepo.ok).toBe(true);
    expect(whole(inRepo)).toEqual([expect.objectContaining({ level: 'warning', message: expect.stringContaining('NGOÀI thư mục dự án') })]);
    const shipped = at(join(tmp, 'client/public'));
    expect(shipped.ok).toBe(false);
    expect(errors(shipped)).toEqual([expect.stringContaining('nằm trong thư mục client/')]);
  });

  it('a fountain basin is not called a river; a box on a carriageway is a warning', () => {
    const j = miniJson();
    Object.assign(j.steps[0].destination, { lat: 48.8641, lon: 2.29715 }); // Fontaine du palais de Tokyo (water=basin)
    Object.assign(j.steps[2].destination, { lat: 48.86484, lon: 2.29695 }); // Avenue du Président Wilson, centre line
    const w = runT('pond.json', j).issues.filter((i) => i.level === 'warning').map((i) => `${i.where}: ${i.message}`);
    expect(w).toContain('Bước 1 (L1) › điểm đến: nằm giữa mặt nước (hồ / bể nước / đài phun nước), đội không đứng được; dời ra chỗ đất cạnh đó');
    expect(w.join('\n')).not.toMatch(/sông|lên mặt cầu/);
    expect(w).toContain('Bước 3 (L2) › điểm đến: tâm nằm giữa lòng đường xe chạy (Avenue du Président Wilson): hộp mật thư sẽ nằm giữa dòng xe; dời lên vỉa hè / quảng trường cạnh đó');
  });

  it('inside a building: a name and the nearest outdoor point, never the raw OSM value "(yes)"', () => {
    const b = insideBuilding();
    const j = miniJson();
    Object.assign(j.steps[2].destination, { lat: b.lat, lon: b.lon });
    const e = errors(runT('in.json', j)).find((m) => m.startsWith('Bước 3 (L2)'))!;
    expect(e).toMatch(/^Bước 3 \(L2\) › điểm đến: tâm vùng nằm trong một tòa nhà \(điểm ngoài nhà gần nhất: 48\.\d{5}, 2\.\d{5}, cách \d+ m/);
    expect(e).not.toContain('(yes)');
    const m = /gần nhất: ([\d.]+), ([\d.]+)/.exec(e)!;
    Object.assign(j.steps[2].destination, { lat: Number(m[1]), lon: Number(m[2]) }); // the suggestion passes
    expect(errors(runT('in2.json', j))).toEqual([]);
    const t = miniJson();
    Object.assign(t.steps[2].destination, { lat: 48.86427, lon: 2.29676 }); // Palais de Tokyo (a landmark): its name
    expect(errors(runT('in3.json', t))).toEqual([expect.stringMatching(/tòa nhà \(Palais de Tokyo; điểm ngoài nhà gần nhất: /)]);
  });

  it('under the Arc de Triomphe (both passages open in the game) is not inside a building; in a pier it is', () => {
    const j = miniJson();
    Object.assign(j.steps[2].destination, { lat: 48.873817, lon: 2.294916 }); // main passage, west mouth
    expect(errors(runT('arc1.json', j))).toEqual([]);
    Object.assign(j.steps[2].destination, { lat: 48.873876, lon: 2.295109 }); // transverse passage
    expect(errors(runT('arc3.json', j))).toEqual([]);
    Object.assign(j.steps[2].destination, { lat: 48.87387, lon: 2.295225 }); // a pier
    expect(errors(runT('arc2.json', j))).toEqual([expect.stringMatching(/^Bước 3 \(L2\) › điểm đến: tâm vùng nằm trong một tòa nhà \(Khải Hoàn Môn; điểm ngoài nhà gần nhất: /)]);
  });

  it('a bike rack of a task place / detour branch off the map is an error (review 2 F5: 111 km off passed)', () => {
    const j = miniJson();
    j.steps[1].task.location.bikeParking.lat = 47.8601;
    j.steps[3].branches[1].task.location.bikeParking.lon = 3.2972;
    const r = runT('rack.json', j);
    expect(r.ok).toBe(false);
    expect(errors(r)).toEqual([
      expect.stringMatching(/^Bước 2 \(T1\) › nhiệm vụ › nơi làm nhiệm vụ › bãi xe: \(47\.8601, 2\.2899\) nằm ngoài bản đồ đua/),
      expect.stringMatching(/^Bước 4 \(D1\) › nhánh B › nhiệm vụ › nơi làm nhiệm vụ › bãi xe: \(48\.8558, 3\.2972\) nằm ngoài bản đồ đua/),
    ]);
    // a destination rack off the map: reported once (shared/src/leg/check.ts says it too)
    const k = miniJson();
    k.steps[0].destination.bikeParking.lat = 47.8;
    expect(errors(runT('rack2.json', k))).toHaveLength(1);
  });

  it('a bike rack inside the map but far from its point (a typo) is a warning with the distance', () => {
    const j = miniJson();
    Object.assign(j.steps[1].task.location.bikeParking, { lat: 48.8606, lon: 2.29954 }); // ≈ 680 m east of T1, on Rue de l'Université
    const r = runT('rack-far.json', j);
    expect(r.ok).toBe(true);
    expect(r.issues.filter((i) => i.level === 'warning').map((i) => `${i.where}: ${i.message}`)).toEqual([
      expect.stringMatching(/^Bước 2 \(T1\) › nhiệm vụ › nơi làm nhiệm vụ › bãi xe: bãi xe cách tâm 6\d\d m, xa hơn 300 m \(gõ nhầm tọa độ\?\)/),
    ]);
  });

  it('yawDeg → compass bearing (yawDeg turns left: compass 34° NE is yawDeg -34)', () => {
    expect([compass(0), compass(-34), compass(33), compass(90), compass(-90), compass(180)]).toEqual([
      { deg: 0, name: 'bắc' }, { deg: 34, name: 'đông bắc' }, { deg: 327, name: 'tây bắc' }, { deg: 270, name: 'tây' }, { deg: 90, name: 'đông' }, { deg: 180, name: 'nam' },
    ]);
  });

  it('JSON mistakes of non-programmers come back as "dòng X, cột Y" with the likely cause', () => {
    const cases: [string, RegExp][] = [
      ['{\n  "lat": 48,85\n}', /dòng 2.*dấu phẩy thập phân/s],
      ['{\n  “id”: "a"\n}', /dòng 2.*ngoặc kép cong/s],
      ['{\n  "id": "a",\n}', /dòng 3.*dấu phẩy thừa/s],
      ['{\n  // chú thích\n  "id": "a"\n}', /dòng 2.*chú thích/s],
      ['{\n  "yawDeg": 33, // huong nhin\n  "id": "a"\n}', /dòng 2.*chú thích/s], // organiser review: an inline comment got no hint
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
    expect(r.report).toContain('không phải JSON hợp lệ: lỗi cú pháp (dòng 1, cột'); // the same Vietnamese text as the Host / server
  });
});
