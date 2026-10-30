import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { latLonToWorld, worldToLatLon } from '@race/shared';
import { checkFile, compass, loadMap, scanLeaks, secretStrings } from './leg-check.ts';
import { chunkKey, type ChunkData } from '../client/src/geo/chunkData.ts';
import { inRing } from '../client/src/geo/districts.ts';
import { demoState } from '../client/src/host/hostView.ts';
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

/** A point inside a real solid building near the Grand-Place (Leg 3), found in the chunk data. */
function insideBuilding() {
  const c = latLonToWorld(50.84675, 4.35247);
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
  it('bruxelles-demo: valid, only blanks (and no error)', () => {
    const r = run(legs('bruxelles-demo.json'));
    expect(r.ok).toBe(true);
    expect(r.issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(r.issues.some((i) => i.level === 'blank')).toBe(true);
    // Leg 2: no warning at all (Paris had one for L6, the SPEC §17.4 point on the Bir-Hakeim walkway: a bridge over land)
    expect(r.issues.filter((i) => i.level === 'warning').map((i) => i.where)).toEqual([]);
  });

  it.each(['test/mini.json', 'test/bruxelles-demo.filled.json', 'test/near.json'])('%s: 0 errors on the real map data', (f) => {
    const r = run(legs(f));
    expect(errors(r)).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('mini: no blank, no warning (docs/LEG_FORMAT.md §10 says so)', () => {
    expect(run(legs('test/mini.json')).issues).toEqual([]);
  });

  it('summary lists every point with street, district, OSM link and screenshot command', () => {
    const { report } = run(legs('test/mini.json'));
    const l1 = miniJson().steps[0].destination; // L1 = Grand-Place (Leg 3)
    const [lat, lon] = [l1.lat.toFixed(5), l1.lon.toFixed(5)];
    expect(report).toContain('Commune Bruxelles'); // the district (a commune of Brussels) of L1; the middle of the square has no street name
    expect(report).toContain(`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=19/${lat}/${lon}`);
    expect(report).toContain(`Vệ tinh: https://www.google.com/maps?q=${lat},${lon}&t=k&z=19`);
    // the game's spectator camera 65 m south-up of the point, a mat on it (organiser review: the old preview showed no point)
    const p = latLonToWorld(l1.lat, l1.lon);
    const xz = `${+p.x.toFixed(1)},${+p.z.toFixed(1)}`;
    expect(report).toMatch(new RegExp(`Xem: npm run screenshot -- --path "/\\?cam=${+p.x.toFixed(1)},[\\d.]+,${+(p.z + 32.5).toFixed(1)},0,-60&boxes=L1,${xz}&mat&npc=0" --name leg-L1\n`));
    // in game: the clue box, the player 12 m back on the walking route from the start, facing it (verify3 m6: not inside the box)
    // (L1's box faces yawDeg 150: the 5th field of boxes=, docs/plans/phase8.md D17)
    const g = new RegExp(`Trong game: http://localhost:5173/\\?start=([-\\d.]+),([-\\d.]+),(-?\\d+)&boxes=L1,${xz},,${l1.yawDeg}\n`).exec(report)!;
    const [sx, sz, yaw] = [Number(g[1]), Number(g[2]), (Number(g[3]) * Math.PI) / 180];
    const d = Math.hypot(p.x - sx, p.z - sz);
    expect(d).toBeGreaterThan(8);
    expect(d).toBeLessThanOrEqual(12.1);
    expect((-Math.sin(yaw) * (p.x - sx) - Math.cos(yaw) * (p.z - sz)) / d).toBeGreaterThan(0.99); // forward (yaw 0 = north = −z) → the box
    expect(report).toMatch(/Trong game: [^\n]+&boxes=PS,[-\d.,]+&mat\n/); // the Pit Stop: its mat
    expect(report).toMatch(/Xem: [^\n]+&boxes=start,[-\d.,]+&mat&npc=0" --name leg-start\n/);
    expect(report).toContain('Hướng nhìn lúc vào: la bàn 327° (tây bắc) — "yawDeg": 33');
    const w = latLonToWorld(l1.bikeParking.lat, l1.bikeParking.lon);
    expect(report).toContain(`Bãi xe: ${l1.bikeParking.lat.toFixed(5)}, ${l1.bikeParking.lon.toFixed(5)} (cách tâm ${Math.round(Math.hypot(w.x - p.x, w.z - p.z))} m)`); // a rack in the file is printed (review 2 F5)
    expect(report).toMatch(/Bước 4 \(D1\/B, detour\)/);
    expect(report).toMatch(/đi bộ ≈ \d+ m/);
  });

  it('suggests a bike rack that exists in OSM near a point without one', () => {
    // Leg 3: Brussels OSM does have racks, but the test must not depend on them: a synthetic one 90 m east of L2 (Place Royale,
    // no rack in mini.json), outside its 40 m zone and within the 120 m the suggestion looks
    const l2 = latLonToWorld(50.84211, 4.36237);
    const graph = Object.assign(Object.create(map.graph), { file: { ...map.graph.file, bikeParking: [Math.round((l2.x + 90) * 10), Math.round(l2.z * 10)] } });
    const r = checkFile(legs('test/mini.json'), { root, map: { ...map, graph }, scanDirs: [] });
    expect(r.report).toMatch(/Gợi ý bãi xe \(có sẵn trong OSM, cách 90 m\): "bikeParking": \{ "lat": 50\.\d+, "lon": 4\.\d+ \}/);
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

  it('broken file: roadblock, radius 50, point in a building, point off the map → the right lines, not ok', () => {
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

  it('Leg 2 (leg2-fixes.md item 2): a point against a landmark outline and a Pit Stop mat over buildings are warnings', () => {
    const j = miniJson();
    // Leg 3: L1 on the cathedral nave; PS 1 m from the Maison du Roi's body on the Grand-Place, the mat (yawDeg 0) over buildings
    const ps = j.steps.find((s: { type: string }) => s.type === 'pit_stop').destination;
    Object.assign(j.steps[0].destination, { lat: 50.84782, lon: 4.36002 });
    Object.assign(ps, { lat: 50.84697, lon: 4.35308, yawDeg: 0 });
    const warn = runT('lm.json', j).issues.filter((i) => i.level === 'warning').map((i) => i.message);
    expect(warn.some((m) => m.includes('khuôn viên địa danh Nhà thờ lớn Thánh Michel và Gudule'))).toBe(true);
    expect(warn.some((m) => m.includes('khuôn viên địa danh Nhà Vua (Maison du Roi)'))).toBe(true);
    expect(warn.some((m) => /^thảm Chặng dừng [\d.]+ × [\d.]+ m/.test(m))).toBe(true);
  });

  it('a point in the middle of the river (Leg 3: the canal, a `river: true` polygon) is a warning; a bad timezone is an error (the server refuses the leg)', () => {
    const j = miniJson();
    const w = latLonToWorld(50.8498, 4.33544); // the canal, NW corner of the map
    expect(map.waterAt(w.x, w.z)).toBe('river');
    expect(map.onBridge(w.x, w.z)).toBe(false);
    Object.assign(j.steps[2].destination, { lat: 50.8498, lon: 4.33544 }); // in the canal
    const r = runT('w1.json', j);
    expect(r.ok).toBe(true);
    expect(r.issues.some((i) => i.level === 'warning' && i.message.includes('giữa biển') && i.message.includes('lên mặt cầu'))).toBe(true);
    const tz = runT('w2.json', { ...j, timezone: 'Viet/Nam' });
    expect(tz.ok).toBe(false);
    expect(tz.issues.filter((i) => i.where === 'múi giờ')).toEqual([expect.objectContaining({ level: 'error', message: expect.stringContaining('"Viet/Nam" không phải múi giờ hợp lệ') })]);
    // the time zone error does not hide the map checks (organiser review: two rounds to see the next error)
    expect(tz.issues.some((i) => i.level === 'warning' && i.message.includes('giữa biển'))).toBe(true);
    expect(tz.report).toContain('Các điểm trên bản đồ');
  });

  it('leak scan: a clue / answer copied into a static folder is found, short answers are not searched', () => {
    const leg = parseLeg(miniJson());
    if (!leg.ok) throw new Error('mini invalid');
    const secrets = secretStrings(leg.leg);
    expect(secrets).toContain(miniJson().steps[0].clue);
    expect(secrets.some((s) => s === '42')).toBe(false);
    // Leg 3: an auto-graded box's spellings are secrets too (long ones are searched in the static assets)
    const demo = parseLeg(JSON.parse(readFileSync(join(import.meta.dirname, '../worker/legs/bruxelles-demo.json'), 'utf8')));
    expect(demo.ok && secretStrings(demo.leg)).toContain('U-dơ-bê-ki-xtan');
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
    const street = 'Rue du Marché aux Herbes - Grasmarkt'; // Leg 3: a road name of the map (bilingual in OSM Brussels), shipped in the chunks
    j.steps.find((s: { id: string }) => s.id === 'T1').task.answers = [street];
    const f = put('leak-street.json', j);
    const r = checkFile(f, { root: tmp, map, scanDirs: [join(root, 'client/public')] });
    expect(r.ok).toBe(true);
    expect(r.issues.some((i) => i.level === 'warning' && i.message.includes('trùng một đáp án'))).toBe(true);
    // ...but a file holding 2+ secrets (a copy of the leg) stays an error
    const dir = mkdtempSync(join(tmpdir(), 'legleak2-'));
    writeFileSync(join(dir, 'copy.json'), JSON.stringify({ a: street, b: 'Đại Tam Ba là đáp án khác' }));
    j.steps.find((s: { id: string }) => s.id === 'T1').task.answers = [street, 'Đại Tam Ba là đáp án khác'];
    expect(checkFile(put('leak-copy.json', j), { root: tmp, map, scanDirs: [dir] }).ok).toBe(false);
  });

  it('a start on a bridge over land (Brussels: a footway viaduct; the graph\'s bridge edges) is a warning', () => {
    // Leg 2: Paris had the Bir-Hakeim viaduct over the Île aux Cygnes (a chunk bridge polygon); Macao's chunks hold no bridge
    // polygon, so the bridge is the footway overpass of the road graph (edge flagged bridge, no water under it)
    const j = miniJson();
    Object.assign(j.start, { lat: 50.84356, lon: 4.37798 });
    const p = latLonToWorld(50.84356, 4.37798);
    expect(map.onBridge(p.x, p.z)).toBe(true);
    expect(map.waterAt(p.x, p.z)).toBe(null);
    const r = runT('bh.json', j);
    // not "does not cross the river" (it does): this part of the deck stands over the island
    expect(r.issues.filter((i) => i.level === 'warning').map((i) => `${i.where}: ${i.message}`)).toEqual([expect.stringMatching(/^điểm xuất phát: nằm trên đoạn cầu bắc qua đất \(bờ \/ đảo\)/)]);
    // step 1 = the start (first clue handed out of game): the same warning once, and a note that the box opens at once
    Object.assign(j.steps[0].destination, { lat: 50.84356, lon: 4.37798, radius: 20 });
    delete j.steps[0].destination.bikeParking;
    const r2 = runT('bh2.json', j);
    expect(r2.issues.filter((i) => i.level === 'warning')).toHaveLength(1);
    expect(r2.report).toContain('Điểm xuất phát nằm trong vùng này');
  });

  it('a point beside a disconnected footpath: the distance is measured to the main walk network', () => {
    const j = miniJson();
    Object.assign(j.steps[0].destination, { lat: 50.85602, lon: 4.35188, radius: 20 }); // Leg 3: a path of a separate walk component, ≈ 35 m from the main network
    const w = latLonToWorld(50.85602, 4.35188);
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

  it('a pond / garden basin is not called a river; a box on a carriageway is a warning', () => {
    const j = miniJson();
    Object.assign(j.steps[0].destination, { lat: 50.84575, lon: 4.36399 }); // Leg 3: the basin of the Parc de Bruxelles (a non-river water polygon)
    Object.assign(j.steps[2].destination, { lat: 50.84438, lon: 4.37435 }); // Rue de la Loi, centre line
    const w = runT('pond.json', j).issues.filter((i) => i.level === 'warning').map((i) => `${i.where}: ${i.message}`);
    expect(w).toContain('Bước 1 (L1) › điểm đến: nằm giữa mặt nước (hồ / bể nước / đài phun nước), đội không đứng được; dời ra chỗ đất cạnh đó');
    expect(w.join('\n')).not.toMatch(/sông|lên mặt cầu/);
    expect(w).toContain('Bước 3 (L2) › điểm đến: tâm nằm giữa lòng đường xe chạy (Rue de la Loi - Wetstraat): hộp mật thư sẽ nằm giữa dòng xe; dời lên vỉa hè / quảng trường cạnh đó');
  });

  it('inside a building: a name and the nearest outdoor point, never the raw OSM value "(yes)"', () => {
    const b = insideBuilding();
    const j = miniJson();
    Object.assign(j.steps[2].destination, { lat: b.lat, lon: b.lon });
    const e = errors(runT('in.json', j)).find((m) => m.startsWith('Bước 3 (L2)'))!;
    expect(e).toMatch(/^Bước 3 \(L2\) › điểm đến: tâm vùng nằm trong một tòa nhà \(điểm ngoài nhà gần nhất: 50\.\d{5}, 4\.\d{5}, cách \d+ m/);
    expect(e).not.toContain('(yes)');
    const m = /gần nhất: ([\d.]+), ([\d.]+)/.exec(e)!;
    Object.assign(j.steps[2].destination, { lat: Number(m[1]), lon: Number(m[2]) }); // the suggestion passes
    expect(errors(runT('in2.json', j))).toEqual([]);
  });

  it('inside a landmark building: its name comes first (the cathedral)', () => {
    const t = miniJson();
    Object.assign(t.steps[2].destination, { lat: 50.84782, lon: 4.36002 }); // inside the cathedral outline (landmark 'cathedrale-st-michel')
    expect(errors(runT('in3.json', t))).toEqual([expect.stringMatching(/tòa nhà \([^;]+; điểm ngoài nhà gần nhất: /)]);
  });


  it('a bike rack of a task place / detour branch off the map is an error (review 2 F5: 111 km off passed)', () => {
    const j = miniJson();
    const [r1, r2] = [j.steps[1].task.location.bikeParking, j.steps[3].branches[1].task.location.bikeParking];
    r1.lat = 21.8601;
    r2.lon = 114.2972;
    const r = runT('rack.json', j);
    expect(r.ok).toBe(false);
    expect(errors(r)).toEqual([
      expect.stringMatching(new RegExp(`^Bước 2 \\(T1\\) › nhiệm vụ › nơi làm nhiệm vụ › bãi xe: \\(${r1.lat}, ${r1.lon}\\) nằm ngoài bản đồ đua`)),
      expect.stringMatching(new RegExp(`^Bước 4 \\(D1\\) › nhánh B › nhiệm vụ › nơi làm nhiệm vụ › bãi xe: \\(${r2.lat}, ${r2.lon}\\) nằm ngoài bản đồ đua`)),
    ]);
    // a destination rack off the map: reported once (shared/src/leg/check.ts says it too)
    const k = miniJson();
    k.steps[0].destination.bikeParking.lat = 21.8;
    expect(errors(runT('rack2.json', k))).toHaveLength(1);
  });

  it('a bike rack inside the map but far from its point (a typo) is a warning with the distance', () => {
    const j = miniJson();
    Object.assign(j.steps[1].task.location.bikeParking, { lat: 50.84426, lon: 4.371 }); // ≈ 680 m east of T1, in the European quarter
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

// Phase 8 track D (docs/plans/phase8.md D2 / D17): the new rules, seen the way an organiser sees them (the whole CLI run)
describe('leg:check Phase 8 (typed answers, branch boxes, media)', () => {
  const lvl = (r: { issues: { level: string; where: string; message: string }[] }, level: string) => r.issues.filter((i) => i.level === level).map((i) => `${i.where}: ${i.message}`);
  type Step = { id: string; [k: string]: any };
  const step = (j: { steps: Step[] }, id: string) => j.steps.find((s) => s.id === id)!;
  const branch = (j: { steps: Step[] }, id: string) => step(j, 'D1').branches.find((b: { id: string }) => b.id === id);

  it('the bundled legs: mini (0 warning) / filled / near have no error; bruxelles-demo only blanks (Leg 2: no warning, Paris had the L6 one)', () => {
    for (const f of ['test/mini.json', 'test/bruxelles-demo.filled.json', 'test/near.json']) expect(lvl(run(legs(f)), 'error')).toEqual([]);
    expect(run(legs('test/mini.json')).issues).toEqual([]);
    const demo = run(legs('bruxelles-demo.json'));
    expect(lvl(demo, 'error')).toEqual([]);
    expect(lvl(demo, 'warning')).toEqual([]);
    expect(lvl(demo, 'blank').length).toBeGreaterThan(0); // Leg 3: D1 is filled (Chocolate / Truyện Tranh), T1 / T2 and the mini-game texts still open
  });

  it('host_approval + a typed answer needs no proofInstruction (not a blank); a photo task (free) without one is a blank', () => {
    const j = miniJson();
    expect(step(j, 'T1').task).toMatchObject({ verification: 'host_approval' }); // kind not written = answer
    expect(step(j, 'T1').task.proofInstruction).toBeUndefined();
    expect(runT('p1.json', j).issues).toEqual([]);
    delete branch(j, 'B').task.proofInstruction; // D1/B: free + host_approval
    const r = runT('p2.json', j);
    expect(lvl(r, 'blank')).toEqual(['Bước 4 (D1) › nhánh B › nhiệm vụ › hướng dẫn gửi bài: hướng dẫn gửi bài còn trống']);
    expect(r.ok).toBe(true);
  });

  it('answer leaks are judged in step order: after the step is fine, before it (or in its own text) warns', () => {
    const j = miniJson();
    step(j, 'T1').task.answers = ['cầu Iéna']; // T1 = step 2
    step(j, 'L3').clue += ' Hãy nhớ: cầu Iéna.'; // step 5: read after T1 is solved
    expect(runT('o1.json', j).issues).toEqual([]);
    step(j, 'L2').clue += ' Gần cầu Iéna.'; // step 3: also after
    expect(runT('o2.json', j).issues).toEqual([]);
    step(j, 'L1').clue += ' Nơi ấy có cầu Iéna.'; // step 1: before
    expect(lvl(runT('o3.json', j), 'warning')).toEqual(['Bước 1 (L1) › mật thư: chứa đáp án "cau iena" của bước 2 (T1): đội đọc được trước khi giải']);
  });

  it('a reference answer (Host only) in a text the team reads is a warning; so is an answer in the other branch\'s task (switch branch, answer)', () => {
    const j = miniJson();
    step(j, 'T1').task.description += ' (đáp án gần như: bốn mươi hai)'; // reference answer of T1: "42 (bốn mươi hai) – GIẢ"
    step(j, 'T1').task.referenceAnswers = ['bốn mươi hai'];
    expect(lvl(runT('r1.json', j), 'warning')).toEqual(['Bước 2 (T1) › nhiệm vụ › mô tả: chứa đáp án tham khảo "bon muoi hai" của bước 2 (T1): đội đọc được trước khi giải']);
    const k = miniJson();
    branch(k, 'B').task.description += ' Nhánh kia ra: bảy.'; // A's answer sits in B's box: a team may open B's box, read it, switch to A and answer
    expect(lvl(runT('r2.json', k), 'warning')).toEqual(['Bước 4 (D1) › nhánh B › nhiệm vụ › mô tả: chứa đáp án "bay" của bước 4 (D1, nhánh A): đội đọc được trước khi giải']);
  });

  it('proofInstruction and the step label are scanned (verify-foundation S2 / M1)', () => {
    const j = miniJson();
    branch(j, 'B').task.proofInstruction = '(GIẢ) Gửi ảnh, đáp án là bảy.'; // A's answer in B's card
    step(j, 'T1').label = 'Thử thách bốn mươi hai';
    step(j, 'T1').task.referenceAnswers = ['bốn mươi hai'];
    expect(lvl(runT('m1.json', j), 'warning')).toEqual([
      'Bước 2 (T1) › tên bước: chứa đáp án tham khảo "bon muoi hai" của bước 2 (T1): đội đọc được trước khi giải',
      'Bước 4 (D1) › nhánh B › nhiệm vụ › hướng dẫn gửi bài: chứa đáp án "bay" của bước 4 (D1, nhánh A): đội đọc được trước khi giải',
    ]);
  });

  it('an old file with hostApproval.contactUrl "" / contactLabel passes without a word (SPEC §17.17: no Messenger button)', () => {
    const j = miniJson();
    j.hostApproval = { contactUrl: '', contactLabel: 'Gửi bảy cho Host' }; // B is a photo task; A's answer in the old label
    const r = runT('c1.json', j);
    expect(r.issues).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('"[CHƯA NHẬP …]" is a blank, a repeated step label a warning, a strange kind a warning', () => {
    const j = miniJson();
    step(j, 'L1').destination.name = '[CHƯA NHẬP tên điểm]';
    step(j, 'T1').task.answers = ['[CHƯA NHẬP đáp án]'];
    step(j, 'L3').label = 'Lộ trình 1';
    step(j, 'T1').task.kind = 'cipher';
    const r = runT('b3.json', j);
    expect(lvl(r, 'blank')).toEqual([
      'Bước 1 (L1) › điểm đến › tên: còn giữ chỗ "[CHƯA NHẬP tên điểm]": nhập nội dung thật',
      'Bước 2 (T1) › nhiệm vụ › đáp án › mục 1: còn giữ chỗ "[CHƯA NHẬP đáp án]": nhập nội dung thật',
    ]);
    expect(lvl(r, 'warning')).toEqual([
      expect.stringMatching(/^Bước 2 \(T1\) › nhiệm vụ › kiểu nhiệm vụ: kiểu "cipher" chưa có trong game/),
      'Bước 5 (L3) › tên bước: tên bước "Lộ trình 1" trùng với bước 1: đội và Host khó phân biệt',
    ]);
  });

  it('media: a wrong r2 name and a broken https link are errors; an https link to a picture file is a warning', () => {
    const j = miniJson();
    step(j, 'L1').media = ['r2:có dấu.jpg', 'https:/hong', { url: 'https://example.invalid/gia/anh.png', label: '(GIẢ) ảnh' }];
    const r = runT('md.json', j);
    expect(r.ok).toBe(false);
    expect(errors(r)).toEqual([
      expect.stringMatching(/^Bước 1 \(L1\) › hình \/ liên kết › mục 1 › liên kết: tên hình "có dấu.jpg" không hợp lệ/),
      expect.stringMatching(/^Bước 1 \(L1\) › hình \/ liên kết › mục 2 › liên kết: "https:\/hong" không phải liên kết hợp lệ/),
    ]);
    expect(lvl(r, 'warning')).toEqual([expect.stringMatching(/^Bước 1 \(L1\) › hình \/ liên kết › mục 3 › liên kết: "https:\/\/example\.invalid\/gia\/anh\.png" là liên kết tới một file hình.*r2:<tên hình>/)]);
  });

  it('a detour branch without a place of its own is a warning (its box would stand on the previous one)', () => {
    const j = miniJson();
    delete branch(j, 'A').task.location;
    expect(lvl(runT('np.json', j), 'warning')).toEqual([expect.stringMatching(/^Bước 4 \(D1\) › nhánh A › nhiệm vụ › nơi làm nhiệm vụ: nhánh không có nơi riêng: hòm nhánh đứng cùng chỗ hòm lộ trình trước/)]);
  });

  it('the table: branch boxes, the way each box faces, the images to upload, the reference-answer hint', () => {
    const { report } = run(legs('test/mini.json'));
    // the branch places' names come from the leg (mini.json is edited for Macao content: no hard-coded copy of its text)
    const bp = (id: string) => branch(miniJson(), id).task.location as { name: string; radius: number };
    expect(report).toContain(`• Bước 4 (D1/A, detour): ${bp('A').name} — hòm nhánh A — vùng ${bp('A').radius} m`);
    expect(report).toContain(`• Bước 4 (D1/B, detour): ${bp('B').name} — hòm nhánh B — vùng ${bp('B').radius} m`);
    expect(report).not.toMatch(/• Bước 2 \(T1, challenge\)[^\n]*hòm/); // no box at a challenge place
    expect(report).toContain('Hướng hòm: mặt trước quay về la bàn 210° (tây nam), đội đứng phía đó mới đọc được — "yawDeg": 150'); // L1
    expect(report).toContain('Hướng hòm: mặt trước quay về la bàn 225° (tây nam), đội đứng phía đó mới đọc được — "yawDeg": 135'); // D1/A
    expect(report).toContain('Hướng hòm: mặt trước quay về la bàn 0° (bắc), đội đứng phía đó mới đọc được — "yawDeg": 0 (mặc định)'); // D1/B
    expect(report).toMatch(/Trong game: [^\n]+&boxes=D1-A,[-\d.]+,[-\d.]+,,135\n/);
    expect(report).toMatch(/Trong game: [^\n]+&boxes=D1-B,[-\d.]+,[-\d.]+\n/); // yawDeg 0: not written
    expect(report).toContain('Hình cần tải lên trang Host (mục "Hình mật thư (R2)", sau khi nạp chặng; tải riêng cho từng cuộc đua; jpg / png / webp, tối đa 5 MB mỗi hình): 2 hình');
    expect(report).toContain('  • test-gia.jpg — dùng ở Bước 1 (L1) › hình / liên kết › mục 2');
    expect(report).toContain('  • test-gia-2.jpg — dùng ở Bước 2 (T1) › nhiệm vụ › hình / liên kết › mục 2');
    expect(report).not.toContain('chưa có "referenceAnswers"'); // mini's typed-answer task has one
    const j = miniJson();
    step(j, 'T1').task.referenceAnswers = [];
    const r = runT('hint.json', j);
    expect(r.report).toContain('chưa có "referenceAnswers" ở Bước 2 (T1).');
    expect(r.issues).toEqual([]); // a hint, not a warning
    const k = miniJson();
    step(k, 'L1').media = [];
    step(k, 'T1').task.media = [];
    expect(runT('nomedia.json', k).report).not.toContain('Hình cần tải');
  });

  it('SPEC §17.22: the finish texts (pit_stop.announce, they name the finish place) are secrets of the static scan too', () => {
    const parsed = parseLeg(miniJson());
    if (!parsed.ok) throw new Error('mini invalid');
    const secrets = secretStrings(parsed.leg);
    for (const x of ['(GIẢ) {tên đội} về đích thứ {n} tại Công viên Bruxelles!', '(GIẢ) {tên đội} BỊ LOẠI, hạng cuối {n}/{tổng}.']) expect(secrets).toContain(x);
    const dir = mkdtempSync(join(tmpdir(), 'legann-'));
    writeFileSync(join(dir, 'x.js'), JSON.stringify(['(GIẢ) {tên đội} về nhất tại Công viên Bruxelles!']));
    expect(errors(checkFile(legs('test/mini.json'), { root, map, scanDirs: [dir] }))).toEqual([expect.stringContaining('chứa nguyên văn "(GIẢ) {tên đội} về nhất')]);
  });

  it('static scan (F1): a reference answer in a shipped folder is an error unless it is a place name of the map (then a warning)', () => {
    const parsed = parseLeg(miniJson());
    if (!parsed.ok) throw new Error('mini invalid');
    const secrets = secretStrings(parsed.leg);
    const refs = ['42 (bốn mươi hai) – GIẢ', '(GIẢ) Ảnh thấy rõ mặt tiền thư viện phía sau'];
    for (const x of refs) expect(secrets).toContain(x);
    const lone = mkdtempSync(join(tmpdir(), 'legref1-'));
    writeFileSync(join(lone, 'x.json'), JSON.stringify({ a: refs[0] }));
    const r1 = checkFile(legs('test/mini.json'), { root, map, scanDirs: [lone] });
    expect(r1.ok).toBe(false); // not a place of the map: a leaked answer
    expect(errors(r1)).toEqual([expect.stringContaining('chứa nguyên văn "42 (bốn mươi hai)')]);
    // a reference answer equal to a landmark name (other case / accents) shipped in a static file: a warning only
    const j = miniJson();
    const placeAnswer = 'rue du marche aux herbes - grasmarkt'; // Leg 3: "Rue du Marché aux Herbes - Grasmarkt" without the accent, in lower case (Paris: 'cau alexandre iii')
    j.steps.find((s: { id: string }) => s.id === 'T1').task.referenceAnswers = [placeAnswer];
    const place = mkdtempSync(join(tmpdir(), 'legref3-'));
    writeFileSync(join(place, 'x.json'), JSON.stringify({ a: placeAnswer }));
    const r3 = checkFile(put('ref-place.json', j), { root: tmp, map, scanDirs: [place] });
    expect(r3.ok).toBe(true);
    expect(r3.issues.filter((i) => i.where.endsWith('x.json')).map((i) => [i.level, i.message.includes('trùng địa danh có sẵn trong bản đồ (không sao)')])).toEqual([['warning', true]]);
    const both = mkdtempSync(join(tmpdir(), 'legref2-'));
    writeFileSync(join(both, 'x.json'), JSON.stringify(refs));
    const r2 = checkFile(legs('test/mini.json'), { root, map, scanDirs: [both] });
    expect(r2.ok).toBe(false);
    expect(errors(r2)).toEqual([expect.stringContaining('chứa nguyên văn')]);
  });
  it('the Host page demo (demoState, shipped in client/dist) copies no text or answer of a bundled leg (R-6: leg:check mini = 0 warnings)', () => {
    const demo = JSON.stringify(demoState());
    for (const f of ['test/mini.json', 'test/near.json', 'bruxelles-demo.json']) {
      const parsed = parseLeg(JSON.parse(readFileSync(legs(f), 'utf8')));
      if (!parsed.ok) throw new Error(`${f} invalid`);
      for (const x of [...secretStrings(parsed.leg, 8)]) expect(demo, `${f}: ${x}`).not.toContain(JSON.stringify(x).slice(1, -1));
    }
  });
});
