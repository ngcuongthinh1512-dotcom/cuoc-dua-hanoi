// `npm run leg:check -- <file.json>` (docs/plans/phase7.md D12, docs/LEG_FORMAT.md): checks a leg file before the Host
// loads it. Shape + rules (shared/src/leg/check.ts, the same the server applies) + the map facts the server never has:
// building footprints (client/public/data/chunks), walking routes (shared/data/roadgraph.json), water / bridges, a leak
// scan of the static assets, a summary table per point (street, district, OSM link, screenshot command) and suggested
// bike racks. Everything printed in Vietnamese. Exit 1 on any error.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { latLonToWorld, worldToLatLon } from '@race/shared';
import { RoadGraph, type RoadGraphFile, WayFlag, segPoint, shortestPath } from '@race/shared/graph';
import { type Leg, type LegGeo, type LegIssue, checkLeg, parseLeg, placeOf } from '@race/shared/leg';
import { CHUNK_SIZE, type ChunkData, type WaterData } from '../client/src/geo/chunkData.ts';
import { districtAt, inRing } from '../client/src/geo/districts.ts';
import { StreetLocator } from '../client/src/geo/locate.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** A building the game turns into a solid block (BuildingBuilder: canopies `building=roof` and parts raised off the
 *  ground leave the ground free; bridges / fountains / artworks are walkable; the Eiffel Tower is open underneath). */
// ponytail: same conditions as BuildingBuilder written down here (the builder runs in the browser, not importable
// without three); change both when the builder's rules change.
const OPEN_KINDS = new Set(['roof', 'bridge', 'fountain', 'artwork']);
const solid = (b: ChunkData['buildings'][number]) => !OPEN_KINDS.has(b.kind) && !(b.minHeight && b.minHeight > 2.5) && b.landmark !== 'eiffel';

interface MapData {
  geo: LegGeo;
  graph: RoadGraph;
  water: WaterData;
  street(x: number, z: number): string | undefined;
  district(x: number, z: number): number;
  inWater(x: number, z: number): boolean;
  onBridge(x: number, z: number): boolean;
}

export function loadMap(root = ROOT): MapData {
  const read = <T>(p: string) => JSON.parse(readFileSync(join(root, p), 'utf8')) as T;
  const graph = RoadGraph.decode(read<RoadGraphFile>('shared/data/roadgraph.json'));
  const water = read<WaterData>('client/public/data/water.json');
  const cache = new Map<string, ChunkData | null>();
  const chunk = (i: number, j: number) => {
    const k = `${i}_${j}`;
    if (!cache.has(k)) {
      const f = join(root, 'client/public/data/chunks', `${k}.json`);
      cache.set(k, existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as ChunkData) : null);
    }
    return cache.get(k);
  };
  const locator = new StreetLocator(graph);
  const inWater = (x: number, z: number) => water.polygons.some((p) => inRing(x, z, p.outer) && !(p.holes ?? []).some((h) => inRing(x, z, h)));
  /** Footprints (any kind) around (x, z) that contain it; a footprint may be stored in a neighbouring chunk. */
  const footprints = (x: number, z: number) => {
    const out: ChunkData['buildings'] = [];
    const [ci, cj] = [Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE)];
    for (let i = ci - 1; i <= ci + 1; i++)
      for (let j = cj - 1; j <= cj + 1; j++)
        for (const b of chunk(i, j)?.buildings ?? []) if (inRing(x, z, b.outer) && !(b.holes ?? []).some((h) => inRing(x, z, h))) out.push(b);
    return out;
  };
  // the chunk bridge polygon (plan D12: Bir-Hakeim over Île aux Cygnes) first, the graph's bridge edges as a fallback
  const onBridge = (x: number, z: number) =>
    footprints(x, z).some((b) => b.kind === 'bridge') ||
    graph.edgesNear(x, z, 8).some((e) => {
      const a = graph.edgeA[e]!, b = graph.edgeB[e]!;
      return graph.flags(e) & WayFlag.bridge && segPoint(x, z, graph.x[a]!, graph.z[a]!, graph.x[b]!, graph.z[b]!)[1] <= 6;
    });
  /** Distance to the nearest walkable edge of the main network (the only one the game can route on), Infinity if > 300 m. */
  const mainSnap = (x: number, z: number) => {
    let best = Infinity;
    for (const e of graph.edgesNear(x, z, 300)) {
      const a = graph.edgeA[e]!, b = graph.edgeB[e]!;
      if (graph.flags(e) & WayFlag.walk && graph.component[a] === graph.main)
        best = Math.min(best, segPoint(x, z, graph.x[a]!, graph.z[a]!, graph.x[b]!, graph.z[b]!)[1]);
    }
    return best;
  };
  const geo: LegGeo = {
    building: (x, z) => footprints(x, z).find(solid)?.kind ?? null,
    walk(a, b) {
      const [na, nb] = [graph.nearestNode(a.x, a.z, 'walk'), graph.nearestNode(b.x, b.z, 'walk')];
      const [snapA, snapB] = [mainSnap(a.x, a.z), mainSnap(b.x, b.z)];
      if (na < 0 || nb < 0 || snapB === Infinity) return null;
      const path = na === nb ? { length: 0 } : shortestPath(graph, na, nb, 'walk');
      return path ? { meters: path.length, snapA: Math.min(snapA, 300), snapB } : null;
    },
  };
  return { geo, graph, water, street: (x, z) => locator.at(x, z), district: (x, z) => districtAt(water.districts, x, z), inWater, onBridge };
}

/** Every string a team must not be able to read before solving (clues, task texts, answers) of ≥ `min` characters. */
export function secretStrings(leg: Leg, min = 12): string[] {
  const out = new Set<string>();
  for (const s of leg.steps) {
    if (s.type === 'route_info' || s.type === 'detour') out.add(s.clue);
    if (s.type === 'challenge') out.add(s.teaser);
    const tasks = s.type === 'detour' ? s.branches.map((b) => (out.add(b.summary), b.task)) : s.type === 'challenge' ? [s.task] : [];
    for (const t of tasks) [t.title, t.description, t.proofInstruction, ...t.answers].forEach((x) => out.add(x));
  }
  return [...out].map((x) => x.trim()).filter((x) => x.length >= min);
}

/** The answers among the secrets: short place names / street signs, so they may legitimately also be in the map data. */
export function answerStrings(leg: Leg, min = 12): Set<string> {
  const out = new Set<string>();
  for (const s of leg.steps) for (const t of s.type === 'detour' ? s.branches.map((b) => b.task) : s.type === 'challenge' ? [s.task] : []) t.answers.forEach((x) => x.trim().length >= min && out.add(x.trim()));
  return out;
}

const TEXT_EXT = /\.(json|js|mjs|html|css|txt|svg|map|md|csv)$/i;
function* walkFiles(dir: string): Generator<string> {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) yield* walkFiles(p);
    else if (TEXT_EXT.test(n)) yield p;
  }
}

/** SPEC §3: leg content must not sit in files the browser downloads. Plain text and its JSON-escaped form are searched.
 *  A clue / task text found, or 2+ different secrets in one file = ERROR (a copy of the leg). A lone answer in `weak` =
 *  WARNING: answers are often street / landmark names that the map files legitimately contain. */
export function scanLeaks(dirs: string[], strings: string[], root = ROOT, weak: Set<string> = new Set()): LegIssue[] {
  const out: LegIssue[] = [];
  const cut = (s: string) => `"${s.slice(0, 40)}${s.length > 40 ? '…' : ''}"`;
  const keys = strings.map((s) => [s, JSON.stringify(s).slice(1, -1), JSON.stringify(s).slice(1, -1).replace(/[^\x00-\x7f]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)] as const);
  for (const d of dirs) {
    if (!existsSync(d)) continue;
    for (const f of walkFiles(d)) {
      if (statSync(f).size > 64 * 1024 * 1024) continue;
      const text = readFileSync(f, 'utf8');
      const hits = keys.filter(([s, ...forms]) => text.includes(s) || forms.some((x) => text.includes(x))).map(([s]) => s);
      if (!hits.length) continue;
      const where = relative(root, f);
      if (hits.length === 1 && weak.has(hits[0]!))
        out.push({ level: 'warning', where, message: `chứa chữ ${cut(hits[0]!)} trùng một đáp án của chặng. Thường chỉ là tên đường / địa danh có sẵn trong bản đồ (không sao); nếu file này là bản chép chặng do bạn bỏ vào client/ thì xóa nó` });
      else out.push({ level: 'error', where, message: `chứa nguyên văn ${hits.map(cut).join(', ')} của chặng: file này tới máy người chơi, đội đọc được đáp án / mật thư. Nếu bạn đã bỏ file chặng hoặc bản chép của nó vào thư mục client/ thì xóa đi và build lại` });
    }
  }
  return out;
}

/** JSON.parse error → "dòng X, cột Y" + the usual mistakes of non-programmers (docs/LEG_FORMAT.md §10). */
export function jsonProblem(text: string, err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const m = /position (\d+)/.exec(msg);
  let where = '';
  if (m) {
    const pos = Number(m[1]);
    const before = text.slice(0, pos);
    where = ` (dòng ${before.split('\n').length}, cột ${pos - before.lastIndexOf('\n')})`;
  }
  const hints: string[] = [];
  if (/[“”‘’]/.test(text)) hints.push('có dấu ngoặc kép cong “ ” (thường do copy từ Word / Google Docs): thay bằng dấu ngoặc kép thẳng "');
  if (/"(lat|lon)"\s*:\s*-?\d+,\d/.test(text)) hints.push('tọa độ dùng dấu phẩy thập phân (48,85): phải dùng dấu chấm (48.85)');
  if (/,\s*[}\]]/.test(text)) hints.push('có dấu phẩy thừa ngay trước } hoặc ]: xóa dấu phẩy cuối cùng');
  if (/^\s*(\/\/|#)/m.test(text) || /\/\*/.test(text)) hints.push('JSON không có chú thích (// hoặc /* */): xóa các dòng chú thích');
  if (/'[A-Za-z_]+'\s*:/.test(text)) hints.push("tên trường dùng dấu nháy đơn ': phải dùng dấu ngoặc kép \"");
  return `${msg.replace(/ in JSON.*$/, '')}${where}${hints.length ? '\n  Có thể do: ' + hints.join('; ') : ''}`;
}

interface Pt { path: PropertyKey[]; x: number; z: number; r: number; lat: number; lon: number; id: string; label: string; step: number; rack: boolean }

/** Every place the team is sent to (start, route / Pit Stop destinations, challenge / branch places), in play order. */
function points(leg: Leg): Pt[] {
  const mk = (path: PropertyKey[], d: { lat: number; lon: number; radius: number; name: string; bikeParking?: unknown }, id: string, step: number): Pt => {
    const w = latLonToWorld(d.lat, d.lon);
    return { path, x: w.x, z: w.z, r: d.radius, lat: d.lat, lon: d.lon, id, label: d.name, step, rack: !!d.bikeParking };
  };
  const out: Pt[] = [mk(['start'], { ...leg.start, radius: 0 }, 'xuất phát', 0)];
  leg.steps.forEach((s, i) => {
    if (s.type === 'route_info' || s.type === 'pit_stop') out.push(mk(['steps', i, 'destination'], s.destination, s.id, i + 1));
    if (s.type === 'challenge' && s.task.location) out.push(mk(['steps', i, 'task', 'location'], s.task.location, s.id, i + 1));
    if (s.type === 'detour') s.branches.forEach((b, k) => b.task.location && out.push(mk(['steps', i, 'branches', k, 'task', 'location'], b.task.location, `${s.id}/${b.id}`, i + 1)));
  });
  return out;
}

/** Summary + warnings that need the map (water, bridges) + bike-rack suggestions. A bad time zone is an error of checkLeg. */
function mapReport(leg: Leg, map: MapData) {
  const issues: LegIssue[] = [];
  const lines: string[] = [];
  const add = (level: LegIssue['level'], path: PropertyKey[], message: string) => issues.push({ level, where: placeOf(leg, path), message });
  const rackPts = new Set<string>();
  const racks: [number, number][] = [];
  for (let i = 0; i < map.graph.file.bikeParking.length; i += 2) racks.push([map.graph.file.bikeParking[i]! / 10, map.graph.file.bikeParking[i + 1]! / 10]);
  let prev: Pt[] = [];
  let lastStep = -1;
  lines.push('', 'Các điểm trên bản đồ (mở link để xem điểm nằm ở đâu; chụp ảnh khu vực bằng lệnh "Xem"):');
  let cur: Pt[] = [];
  const pts = points(leg);
  for (const p of pts) {
    if (p.step !== lastStep) {
      if (cur.length) prev = cur;
      cur = [];
      lastStep = p.step;
    }
    cur.push(p);
    const [lat, lon] = [p.lat.toFixed(5), p.lon.toFixed(5)];
    const street = map.street(p.x, p.z);
    const dis = map.district(p.x, p.z);
    const walks = prev.map((q) => (Math.hypot(q.x - p.x, q.z - p.z) < 1 ? { meters: 0, snapA: 0, snapB: 0 } : map.geo.walk(q, p))).filter((w) => w !== null);
    const walk = walks.length ? `đi bộ ≈ ${Math.round(Math.min(...walks.map((w) => w.meters + w.snapA + w.snapB)))} m từ điểm trước` : p.step === 0 ? 'điểm xuất phát' : 'KHÔNG đi bộ tới được';
    const kind = p.step === 0 ? 'xuất phát' : leg.steps[p.step - 1]!.type;
    lines.push(`• ${p.step === 0 ? 'Xuất phát' : `Bước ${p.step} (${p.id}, ${kind})`}: ${p.label || '(chưa đặt tên)'}${p.r ? ` — vùng ${p.r} m` : ''} — ${walk}`);
    lines.push(`    ${street ?? 'không có tên đường gần đó'}${dis ? `, Quận ${dis}` : ''} — ${lat}, ${lon}`);
    lines.push(`    Bản đồ: https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=19/${lat}/${lon}`);
    lines.push(`    Xem: npm run screenshot -- --path "/preview.html?at=${lat},${lon}&r=80" --name leg-${p.step === 0 ? 'start' : p.id.replace(/\W+/g, '-')}`);
    const where = p.path;
    const bridge = map.onBridge(p.x, p.z);
    const wet = map.inWater(p.x, p.z);
    if (wet && !bridge) add('warning', where, 'nằm giữa mặt nước (sông), đội không đứng được; dời vào bờ hoặc lên cầu');
    if (bridge && !wet) add('warning', where, 'nằm trên một cây cầu / cầu cạn không bắc qua sông (cầu trên đất liền, vd. cầu cạn đường sắt): dễ đặt nhầm lên nóc; kiểm tra ở link bản đồ');
    // bike-rack suggestion (SPEC §6.4): a rack in the file, else the nearest graph rack 20–120 m away, else a spot on the walkable road
    const key = `${Math.round(p.x)}_${Math.round(p.z)}`;
    if (p.step > 0 && !p.rack && !rackPts.has(key)) {
      rackPts.add(key);
      let best: [number, number] | null = null, bd = Infinity;
      for (const r of racks) {
        const d = Math.hypot(r[0] - p.x, r[1] - p.z);
        if (d > p.r && d < 120 && d < bd) (bd = d), (best = r);
      }
      if (best) {
        const g = worldToLatLon(best[0], best[1]);
        lines.push(`    Gợi ý bãi xe (có sẵn trong OSM, cách ${Math.round(bd)} m): "bikeParking": { "lat": ${g.lat.toFixed(5)}, "lon": ${g.lon.toFixed(5)} }`);
      } else lines.push('    Chưa có bãi xe: xe bị bỏ lại đúng chỗ đội đang đứng (không lỗi; nếu muốn, thêm "bikeParking" ở vỉa hè ngay ngoài vùng).');
    }
  }
  return { issues, lines };
}

export interface CheckResult { ok: boolean; issues: LegIssue[]; report: string }

/** Runs every check on `file`; `scanDirs` = static-asset folders to search for leaked texts (default client/public + client/dist). */
export function checkFile(file: string, opts: { root?: string; scanDirs?: string[]; map?: MapData } = {}): CheckResult {
  const root = opts.root ?? ROOT;
  const lines: string[] = [];
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (e) {
    return { ok: false, issues: [], report: `Không đọc được file ${file}: ${e instanceof Error ? e.message : String(e)}` };
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    return { ok: false, issues: [], report: `LỖI  ${file} không phải JSON hợp lệ: ${jsonProblem(text, e)}\n\nKHÔNG hợp lệ.` };
  }
  const r = parseLeg(json);
  let issues = [...r.issues];
  if (r.ok) {
    const map = opts.map ?? loadMap(root);
    // checkLeg without geo already ran inside parseLeg; rerun with the map and keep only what is new
    const base = new Set(r.issues.map((i) => `${i.level}|${i.where}|${i.message}`));
    issues.push(...checkLeg(r.leg, map.geo).filter((i) => !base.has(`${i.level}|${i.where}|${i.message}`)));
    const rep = mapReport(r.leg, map);
    issues.push(...rep.issues);
    issues.push(...scanLeaks(opts.scanDirs ?? [join(root, 'client/public'), join(root, 'client/dist')], secretStrings(r.leg), root, answerStrings(r.leg)));
    lines.push(...rep.lines);
  }
  const rel = relative(join(root, 'worker/legs'), resolve(file));
  if (rel.startsWith('..') || rel.startsWith(sep))
    issues.push({ level: 'warning', where: 'cả file', message: 'file nằm ngoài worker/legs/: nội dung chặng thật nên để trong worker/legs/ (không bao giờ trong client/); đừng chép file này vào thư mục client/' });
  issues = issues.sort((a, b) => ['error', 'warning', 'blank'].indexOf(a.level) - ['error', 'warning', 'blank'].indexOf(b.level));
  const LABEL = { error: 'LỖI', warning: 'CẢNH BÁO', blank: 'CÒN TRỐNG' } as const;
  const out = issues.map((i) => `${LABEL[i.level]}  ${i.where}: ${i.message}`);
  const n = (l: keyof typeof LABEL) => issues.filter((i) => i.level === l).length;
  const ok = n('error') === 0;
  out.push(...lines);
  out.push(ok ? `\nHợp lệ: ${n('warning')} cảnh báo, ${n('blank')} ô còn trống.` : `\nKHÔNG hợp lệ: ${n('error')} lỗi (máy chủ sẽ từ chối file này hoặc đội sẽ không chơi được).`);
  return { ok, issues, report: out.join('\n') };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2];
  if (!file) {
    console.error('Cách dùng: npm run leg:check -- <đường-dẫn-file-chặng.json>   (ví dụ: npm run leg:check -- worker/legs/chang-that.json)');
    process.exit(2);
  }
  const r = checkFile(file);
  console.log(r.report);
  process.exit(r.ok ? 0 : 1);
}
