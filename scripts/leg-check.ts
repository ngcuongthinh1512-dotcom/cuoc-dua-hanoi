// `npm run leg:check -- <file.json>` (docs/plans/phase7.md D12, docs/LEG_FORMAT.md): checks a leg file before the Host
// loads it. Shape + rules (shared/src/leg/check.ts, the same the server applies; a rule error such as a bad time zone does
// not hide the rest) + the map facts the server never has: building footprints (client/public/data/chunks), walking routes
// (shared/data/roadgraph.json), water / bridges / carriageways, a leak scan of the static assets, a summary table per point
// (street, district, OSM / satellite links, screenshot command, in-game URL, bike rack) and suggested bike racks. Everything
// printed in Vietnamese. Exit 1 on any error.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { latLonToWorld, PIT_MAT, RACE_BBOX, worldToLatLon } from '@race/shared';
import { RoadGraph, type RoadGraphFile, WayFlag, pathPolyline, segPoint, shortestPath } from '@race/shared/graph';
import { MEDIA } from '@race/shared/protocol';
import { type Leg, type LegGeo, type LegIssue, checkLeg, jsonProblem, legSchema, mediaItems, normalizeAnswer, parseLeg, placeOf, r2Names, startSpot } from '@race/shared/leg';
import { roads, traffic } from '../client/src/config.ts';
import { CHUNK_SIZE, type ChunkData, type WaterData } from '../client/src/geo/chunkData.ts';
import { districtAt, districtLabel, inRing } from '../client/src/geo/districts.ts';
import { flatHeightGrid, heightAt, parseHeightGrid } from '../client/src/geo/heightGrid.ts';
import { LANDMARKS } from '../client/src/geo/landmarks.ts';
import { StreetLocator } from '../client/src/geo/locate.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** "Xem" screenshot: the game's spectator camera this far (m) from the point, from the south, looking down this much (°):
 *  at fov 70 and 16:9 the picture covers ≈ 160 × 105 m with the point in the middle. */
const VIEW = { distance: 65, pitchDeg: 60 };
/** "Trong game" link: the client dev server (`npm run dev`, Vite's default port). */
const DEV_URL = 'http://localhost:5173';
/** "Trong game" spawn this far (m) before the point, on the walking route from the step before (verify3 m6: spawned on the
 *  centre, the player stood inside the clue box). */
const APPROACH = 12;

/** A building the game turns into a solid block at (x, z) (BuildingBuilder: canopies `building=roof` and parts raised off
 *  the ground leave the ground free; bridges / fountains / artworks are walkable). */
// ponytail: same conditions as BuildingBuilder written down here (the builder runs in the browser, not importable
// without three); change both when the builder's rules change.
const OPEN_KINDS = new Set(['roof', 'bridge', 'fountain', 'artwork', 'ruins']); // ruins: façade + steps, walkable until mf1 gives it colliders
const solid = () => (b: ChunkData['buildings'][number]) =>
  !OPEN_KINDS.has(b.kind) && !(b.minHeight && b.minHeight > 2.5);
const LANDMARK_NAME = new Map(LANDMARKS.map((l) => [l.id, l.name]));
const fmt = (n: number) => n.toFixed(5);
const inBox = (p: { lat: number; lon: number }) => p.lat > RACE_BBOX.south && p.lat < RACE_BBOX.north && p.lon > RACE_BBOX.west && p.lon < RACE_BBOX.east;

interface MapData {
  geo: LegGeo;
  graph: RoadGraph;
  water: WaterData;
  street(x: number, z: number): string | undefined;
  district(x: number, z: number): number;
  /** The water polygon under (x, z): 'river' = the Seine, 'pond' = a basin / lake / fountain pool, null = dry. */
  waterAt(x: number, z: number): 'river' | 'pond' | null;
  onBridge(x: number, z: number): boolean;
  /** Name (or "đường không tên") of the NPC car road whose drawn carriageway covers (x, z), null = none. */
  carriageway(x: number, z: number): string | null;
  /** Ground height (DEM, m, y of the world) for the screenshot camera. */
  ground(x: number, z: number): number;
  /** Name of a landmark whose outline holds (x, z) or passes within LANDMARK_NEAR m (its detailed build: platform, steps,
   *  walls, may stand there), walkable squares excluded; null = none. */
  landmarkAt(x: number, z: number): string | null;
  /** Share (0…1) of the Pit Stop mat (PIT_MAT, long axis along yawDeg) over solid building footprints, sampled every 2 m. */
  matBlocked(x: number, z: number, yawDeg: number): number;
}

/** m: a point this close to a landmark outline gets the "built detail" warning (leg2-fixes.md item 2). */
const LANDMARK_NEAR = 1.5;
/** Landmark records the game leaves open (squares the teams walk on): no warning there. */
const WALKABLE_LANDMARKS = new Set(['largo-senado', 'praca-flor-de-lotus']);
const WALKABLE_RECORD = (b: ChunkData['buildings'][number]) => WALKABLE_LANDMARKS.has(b.landmark!) || (b.landmark === 'templo-ama' && b.kind === 'artwork'); // the Barra square

export function loadMap(root = ROOT): MapData {
  const read = <T>(p: string) => JSON.parse(readFileSync(join(root, p), 'utf8')) as T;
  const graph = RoadGraph.decode(read<RoadGraphFile>('shared/data/roadgraph.json'));
  const water = read<WaterData>('client/public/data/water.json');
  const dem = join(root, 'client/public/data/elevation');
  const grid = existsSync(`${dem}.bin`) ? parseHeightGrid(read<Parameters<typeof parseHeightGrid>[0]>('client/public/data/elevation.json'), readFileSync(`${dem}.bin`)) : flatHeightGrid();
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
  const waterAt = (x: number, z: number) => {
    const p = water.polygons.find((p) => inRing(x, z, p.outer) && !(p.holes ?? []).some((h) => inRing(x, z, h)));
    return p ? (p.river ? 'river' : 'pond') : null;
  };
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
  /** Distance to the nearest walkable edge of the main network (the only one the game can route on) within r, else Infinity. */
  const mainSnap = (x: number, z: number, r = 300) => {
    let best = Infinity;
    for (const e of graph.edgesNear(x, z, r)) {
      const a = graph.edgeA[e]!, b = graph.edgeB[e]!;
      if (graph.flags(e) & WayFlag.walk && graph.component[a] === graph.main)
        best = Math.min(best, segPoint(x, z, graph.x[a]!, graph.z[a]!, graph.x[b]!, graph.z[b]!)[1]);
    }
    return best <= r ? best : Infinity;
  };
  // ponytail: RoadBuilder.roadWidth written down here (RoadBuilder draws on a canvas: not importable under the scripts' Node
  // types); layers ignored (a footpath under a road bridge counts as on it). Change both when the drawn width changes.
  const carKinds = new Set(traffic.kinds);
  const half = (w: number[]) => {
    const name = w[3]! >= 0 ? graph.file.names[w[3]!] : undefined;
    const byName = name === undefined ? undefined : roads.widthByName[name];
    const single = !(w[1]! & WayFlag.oneway) || !!(w[1]! & WayFlag.roundabout);
    const kind = graph.file.kinds[w[0]!]!;
    return (byName !== undefined && single ? byName : w[4] ? w[4] / 10 : w[2] ? w[2] * roads.laneWidth : (roads.widthByKind[kind] ?? roads.defaultWidth)) / 2;
  };
  const carriageway = (x: number, z: number) => {
    for (const e of graph.edgesNear(x, z, 40)) {
      const w = graph.file.ways[graph.edgeWay[e]!]!;
      if (!(w[1]! & WayFlag.car) || !carKinds.has(graph.file.kinds[w[0]!]!)) continue;
      const a = graph.edgeA[e]!, b = graph.edgeB[e]!;
      if (segPoint(x, z, graph.x[a]!, graph.z[a]!, graph.x[b]!, graph.z[b]!)[1] < half(w)) return w[3]! >= 0 ? graph.file.names[w[3]!]! : 'đường không tên';
    }
    return null;
  };
  /** Nearest spot ≤ 150 m away a team can stand on: no solid building, no water off a bridge, no carriageway, ≤ 8 m from the
   *  main walk network (ring by ring, 3 m apart; in a ring the one closest to a footway). */
  const nearestOutdoor = (x: number, z: number) => {
    for (let r = 3; r <= 150; r += 3) {
      let best: { x: number; z: number; snap: number } | null = null;
      const n = Math.ceil((2 * Math.PI * r) / 3);
      for (let k = 0; k < n; k++) {
        const [px, pz] = [x + r * Math.cos((2 * Math.PI * k) / n), z + r * Math.sin((2 * Math.PI * k) / n)];
        if (footprints(px, pz).some(solid()) || (waterAt(px, pz) && !onBridge(px, pz)) || carriageway(px, pz)) continue;
        const snap = mainSnap(px, pz, 8);
        if (snap < (best?.snap ?? Infinity)) best = { x: px, z: pz, snap };
      }
      if (best) return { ...best, d: r };
    }
    return null;
  };
  const geo: LegGeo = {
    // Not the OSM `building` value ("yes" means nothing to an organiser): the landmark's name if any + the nearest outdoor
    // spot; checkLeg prints it as "… nằm trong một tòa nhà (<this>)".
    building(x, z) {
      const b = footprints(x, z).find(solid());
      if (!b) return null;
      const alt = nearestOutdoor(x, z);
      const g = alt && worldToLatLon(alt.x, alt.z);
      const street = alt && locator.at(alt.x, alt.z);
      const hint = alt && g ? `điểm ngoài nhà gần nhất: ${fmt(g.lat)}, ${fmt(g.lon)}, cách ${alt.d} m${street ? `, cạnh ${street}` : ''}` : 'không có chỗ ngoài nhà trong 150 m';
      const name = b.landmark && LANDMARK_NAME.get(b.landmark);
      return name ? `${name}; ${hint}` : hint;
    },
    walk(a, b) {
      // ≤ 300 m like mainSnap: a point off the map (a typo, still map-checked since a rule error no longer stops the run) would
      // make the unbounded ring search crawl the whole grid
      const [na, nb] = [graph.nearestNode(a.x, a.z, 'walk', 300), graph.nearestNode(b.x, b.z, 'walk', 300)];
      const [snapA, snapB] = [mainSnap(a.x, a.z), mainSnap(b.x, b.z)];
      if (na < 0 || nb < 0 || snapB === Infinity) return null;
      const path = na === nb ? { length: 0 } : shortestPath(graph, na, nb, 'walk');
      return path ? { meters: path.length, snapA: Math.min(snapA, 300), snapB } : null;
    },
  };
  // ponytail: the landmark details (client/src/world/landmarks) cannot run here (DOM / three types), so outlines + a margin
  // stand for their volumes; a platform or stair built far outside its outline (Ruínas' 60 m stair) is not seen.
  const segDist = (x: number, z: number, r: number[]) => {
    let d = Infinity;
    for (let i = 0, n = r.length; i < n; i += 2) d = Math.min(d, segPoint(x, z, r[i]!, r[i + 1]!, r[(i + 2) % n]!, r[(i + 3) % n]!)[1]);
    return d;
  };
  const landmarkAt = (x: number, z: number) => {
    const [ci, cj] = [Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE)];
    for (let i = ci - 1; i <= ci + 1; i++)
      for (let j = cj - 1; j <= cj + 1; j++)
        for (const b of chunk(i, j)?.buildings ?? []) {
          if (!b.landmark || WALKABLE_RECORD(b)) continue;
          if (inRing(x, z, b.outer) || segDist(x, z, b.outer) <= LANDMARK_NEAR) return LANDMARK_NAME.get(b.landmark) ?? b.landmark;
        }
    return null;
  };
  const matBlocked = (x: number, z: number, yawDeg: number) => {
    const [c, sn] = [Math.cos((yawDeg * Math.PI) / 180), Math.sin((yawDeg * Math.PI) / 180)];
    let [n, bad] = [0, 0];
    for (let u = -PIT_MAT.width / 2; u <= PIT_MAT.width / 2; u += 2)
      for (let v = -PIT_MAT.length / 2; v <= PIT_MAT.length / 2; v += 2) {
        n++;
        if (footprints(x + c * u + sn * v, z - sn * u + c * v).some(solid())) bad++;
      }
    return bad / n;
  };
  return {
    geo, graph, water, waterAt, onBridge, carriageway, landmarkAt, matBlocked,
    street: (x, z) => locator.at(x, z),
    district: (x, z) => districtAt(water.districts, x, z),
    ground: (x, z) => heightAt(grid, x, z),
  };
}

/** Every string a team must not be able to read before solving (clues, task texts, answers) of ≥ `min` characters. */
export function secretStrings(leg: Leg, min = 12): string[] {
  const out = new Set<string>();
  for (const s of leg.steps) {
    if (s.type === 'route_info' || s.type === 'detour') out.add(s.clue);
    if (s.type === 'challenge') out.add(s.teaser);
    const tasks = s.type === 'detour' ? s.branches.map((b) => (out.add(b.summary), b.task)) : s.type === 'challenge' ? [s.task] : [];
    for (const t of tasks) [t.title, t.description, t.proofInstruction, ...t.answers, ...t.referenceAnswers].forEach((x) => out.add(x)); // Phase 8: reference answers are Host-only
    // SPEC §17.22: the finish texts name the finish place: server-only until the team finishes
    if (s.type === 'pit_stop' && s.announce) for (const t of [s.announce, s.announce.first, s.announce.out]) [t?.npc, t?.toast, t?.card].forEach((x) => x && out.add(x));
  }
  return [...out].map((x) => x.trim()).filter((x) => x.length >= min);
}

/** The answers among the secrets: short place names / street signs, so they may legitimately also be in the map data. */
export function answerStrings(leg: Leg, min = 12): Set<string> {
  const out = new Set<string>();
  for (const s of leg.steps) for (const t of s.type === 'detour' ? s.branches.map((b) => b.task) : s.type === 'challenge' ? [s.task] : []) [...t.answers, ...t.referenceAnswers].forEach((x) => x.trim().length >= min && out.add(x.trim()));
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

/** F1: the answers (answers + referenceAnswers) equal to a place name the game already ships (road names of the map,
 *  landmark names), compared like answers (case / accents / spaces). */
export function placeAnswers(leg: Leg, places: Iterable<string>): Set<string> {
  const known = new Set([...places].map(normalizeAnswer));
  return new Set([...answerStrings(leg)].filter((a) => known.has(normalizeAnswer(a))));
}

/** The place names the game ships: road names (roadgraph = the same OSM names the chunks carry) + landmark names. */
const mapPlaces = (map: MapData) => [...map.graph.file.names, ...LANDMARKS.map((l) => l.name)];

/** SPEC §3: leg content must not sit in files the browser downloads. Plain text and its JSON-escaped form are searched.
 *  Any secret found = ERROR, except when every hit is in `places` (answers equal to a road / landmark name the map files
 *  legitimately contain, placeAnswers) = WARNING. */
export function scanLeaks(dirs: string[], strings: string[], root = ROOT, places: Set<string> = new Set()): LegIssue[] {
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
      if (hits.every((h) => places.has(h)))
        out.push({ level: 'warning', where, message: `chứa chữ ${hits.map(cut).join(', ')} trùng một đáp án của chặng: trùng địa danh có sẵn trong bản đồ (không sao); nếu file này là bản chép chặng do bạn bỏ vào client/ thì xóa nó` });
      else out.push({ level: 'error', where, message: `chứa nguyên văn ${hits.map(cut).join(', ')} của chặng: file này tới máy người chơi, đội đọc được đáp án / mật thư. Nếu bạn đã bỏ file chặng hoặc bản chép của nó vào thư mục client/ thì xóa đi và build lại` });
    }
  }
  return out;
}

/** `box`: a clue box stands here (a route's destination, a detour branch's own place) and faces `yawDeg`; not at a challenge
 *  place (no box: the next step's box stands at its own point) nor the Pit Stop (the mat). `branch`: the detour branch it is the box of. */
interface Pt { path: PropertyKey[]; x: number; z: number; r: number; lat: number; lon: number; id: string; label: string; step: number; rack: { lat: number; lon: number } | null; box: boolean; yawDeg: number; branch: string | null }

/** Every place the team is sent to (start, route / Pit Stop destinations, challenge / branch places), in play order. */
function points(leg: Leg): Pt[] {
  const mk = (path: PropertyKey[], d: { lat: number; lon: number; radius: number; name: string; bikeParking?: { lat: number; lon: number } | null; yawDeg?: number }, id: string, step: number, box = false, branch: string | null = null): Pt => {
    const w = latLonToWorld(d.lat, d.lon);
    return { path, x: w.x, z: w.z, r: d.radius, lat: d.lat, lon: d.lon, id, label: d.name, step, rack: d.bikeParking ?? null, box, yawDeg: d.yawDeg ?? 0, branch };
  };
  const out: Pt[] = [mk(['start'], { ...leg.start, radius: 0 }, 'xuất phát', 0)];
  leg.steps.forEach((s, i) => {
    if (s.type === 'route_info' || s.type === 'pit_stop') out.push(mk(['steps', i, 'destination'], s.destination, s.id, i + 1, s.type === 'route_info' && leg.steps[i + 1]?.type !== 'pit_stop'));
    if (s.type === 'challenge' && s.task.location) out.push(mk(['steps', i, 'task', 'location'], s.task.location, s.id, i + 1));
    if (s.type === 'detour') s.branches.forEach((b, k) => b.task.location && out.push(mk(['steps', i, 'branches', k, 'task', 'location'], b.task.location, `${s.id}/${b.id}`, i + 1, true, b.id)));
  });
  return out;
}

/** An https link to a picture file: it shows as a link, not as a picture (only "r2:<name>" is drawn on the card). */
const IMAGE_LINK = /\.(jpe?g|png|webp|gif|avif|bmp)([?#].*)?$/i;

/** What the organiser must do about media: the R2 images to upload on the Host page (docs/plans/phase8.md D14, D17), https
 *  links that look like pictures (warning), a one-line hint when a typed-answer task has no reference answer (D2 rule 9). */
function mediaReport(leg: Leg) {
  const issues: LegIssue[] = [];
  const lines: string[] = [];
  const used = new Map<string, string>(); // r2 name → where it is first used
  for (const { item, path } of mediaItems(leg)) {
    if (item.url.startsWith(MEDIA.prefix)) {
      const name = item.url.slice(MEDIA.prefix.length);
      if (!used.has(name)) used.set(name, placeOf(leg, path));
    } else if (IMAGE_LINK.test(item.url))
      issues.push({ level: 'warning', where: placeOf(leg, [...path, 'url']), message: `"${item.url}" là liên kết tới một file hình: đội chỉ thấy link bấm mở tab mới, hình không hiện trên thẻ. Muốn hiện hình trên thẻ: tải hình lên trang Host và ghi "r2:<tên hình>" (docs/LEG_FORMAT.md mục 7.2)` });
  }
  const names = r2Names(leg);
  if (names.length)
    lines.push(
      '',
      `Hình cần tải lên trang Host (mục "Hình mật thư (R2)", sau khi nạp chặng; tải riêng cho từng cuộc đua; jpg / png / webp, tối đa ${MEDIA.maxBytes / 1024 / 1024} MB mỗi hình): ${names.length} hình`,
      ...names.map((n) => `  • ${n} — dùng ở ${used.get(n)}`),
    );
  const bare: string[] = [];
  leg.steps.forEach((s, i) => {
    const tasks = s.type === 'detour' ? s.branches.map((b) => [b.task, `Bước ${i + 1} (${s.id}) › nhánh ${b.id}`] as const) : s.type === 'challenge' ? [[s.task, `Bước ${i + 1} (${s.id})`] as const] : [];
    for (const [t, where] of tasks) if (t.verification === 'host_approval' && t.kind !== 'free' && !t.referenceAnswers.length) bare.push(where);
  });
  if (bare.length)
    lines.push('', `Gợi ý: nhiệm vụ Host duyệt (đội gõ đáp án) chưa có "referenceAnswers" ở ${bare.join(', ')}. Đáp án tham khảo chỉ Host thấy cạnh câu trả lời của đội ở hàng chờ duyệt (để trống thì Host thấy "answers", cả hai trống thì không có gợi ý); thêm nếu có.`);
  return { issues, lines };
}

/** "Trong game" spawn: APPROACH m back from p along the walking route from `from`, facing p (yawDeg: 0 = north, + = left);
 *  no route (or `from` at p) → APPROACH m south of p, facing north. */
function approach(map: MapData, from: Pt | undefined, p: Pt) {
  const g = map.graph;
  const [a, b] = from ? [g.nearestNode(from.x, from.z, 'walk', 300), g.nearestNode(p.x, p.z, 'walk', 300)] : [-1, -1];
  const path = a >= 0 && b >= 0 && a !== b ? shortestPath(g, a, b, 'walk') : null;
  const line = path ? pathPolyline(g, path) : [];
  let [x, z, left] = [p.x, p.z, APPROACH];
  for (let i = line.length - 2; i >= 0 && left > 0; i -= 2) {
    const d = Math.hypot(line[i]! - x, line[i + 1]! - z);
    const t = Math.min(1, left / d);
    [x, z, left] = [x + (line[i]! - x) * t, z + (line[i + 1]! - z) * t, left - d * t];
  }
  if (Math.hypot(x - p.x, z - p.z) < 1) [x, z] = [p.x, p.z + APPROACH];
  return { x, z, yawDeg: Math.round((Math.atan2(x - p.x, z - p.z) * 180) / Math.PI) };
}

/** Compass bearing (°, clockwise from north) of a leg yawDeg (0 = north, + = turned left / west) and its Vietnamese name. */
export function compass(yawDeg: number): { deg: number; name: string } {
  const deg = Math.round((((-yawDeg % 360) + 360) % 360));
  const name = ['bắc', 'đông bắc', 'đông', 'đông nam', 'nam', 'tây nam', 'tây', 'tây bắc'][Math.round(deg / 45) % 8]!;
  return { deg: deg % 360, name };
}

/** Summary + warnings that need the map (water, bridges, carriageways, racks off the map) + bike-rack suggestions. */
function mapReport(leg: Leg, map: MapData) {
  const issues: LegIssue[] = [];
  const lines: string[] = [];
  const add = (level: LegIssue['level'], path: PropertyKey[], message: string) => issues.push({ level, where: placeOf(leg, path), message });
  const rackPts = new Set<string>();
  const warned = new Set<string>(); // a point repeated (the Pit Stop after its route, step 1 at the start): its map warnings once
  const racks: [number, number][] = [];
  for (let i = 0; i < map.graph.file.bikeParking.length; i += 2) racks.push([map.graph.file.bikeParking[i]! / 10, map.graph.file.bikeParking[i + 1]! / 10]);
  let prev: Pt[] = [];
  let lastStep = -1;
  lines.push(
    '',
    'Các điểm trên bản đồ. "Bản đồ" / "Vệ tinh": mở trong trình duyệt, có ghim đúng điểm. "Xem": dán vào Terminal → ảnh screenshots/leg-<mã>.png',
    'chụp xiên từ trên cao, khung ≈ 160 × 105 m, điểm ở GIỮA ảnh, đánh dấu bằng tấm thảm đỏ viền vàng (3 × 7 m, như thảm Chặng dừng) đặt đúng tâm; ảnh chưa vẽ vòng bán kính.',
    `"Trong game": mở khi máy đang chạy npm run dev → đứng cách điểm ${APPROACH} m trên đường đi bộ từ điểm trước, nhìn về phía điểm (thế giới thử, không cần cuộc đua).`,
    '"Hòm nhánh X": nơi riêng của nhánh X của Lựa chọn kép (chỉ hòm của nhánh đội đã chọn hiện, đề bài nằm trong hòm). "Hướng hòm": phía mặt trước của hòm, nơi đội đứng đọc (ghi "yawDeg" của điểm đó).',
  );
  let cur: Pt[] = [];
  const pts = points(leg);
  const s0 = pts[0]!;
  for (const p of pts) {
    if (p.step !== lastStep) {
      if (cur.length) prev = cur;
      cur = [];
      lastStep = p.step;
    }
    cur.push(p);
    const [lat, lon] = [fmt(p.lat), fmt(p.lon)];
    const street = map.street(p.x, p.z);
    const dis = map.district(p.x, p.z);
    const walks = prev.map((q) => (Math.hypot(q.x - p.x, q.z - p.z) < 1 ? { meters: 0, snapA: 0, snapB: 0 } : map.geo.walk(q, p))).filter((w) => w !== null);
    const walk = walks.length ? `đi bộ ≈ ${Math.round(Math.min(...walks.map((w) => w.meters + w.snapA + w.snapB)))} m từ điểm trước` : p.step === 0 ? 'điểm xuất phát' : 'KHÔNG đi bộ tới được';
    const step = p.step === 0 ? null : leg.steps[p.step - 1]!;
    lines.push(`• ${step ? `Bước ${p.step} (${p.id}, ${step.type})` : 'Xuất phát'}: ${p.label || '(chưa đặt tên)'}${p.branch ? ` — hòm nhánh ${p.branch}` : ''}${p.r ? ` — vùng ${p.r} m` : ''} — ${walk}`);
    lines.push(`    ${street ?? 'không có tên đường gần đó'}${dis ? `, ${districtLabel(dis)}` : ''} — ${lat}, ${lon}`);
    const xz = (x: number, z: number) => `${+x.toFixed(1)},${+z.toFixed(1)}`;
    if (!step) {
      const c = compass(leg.start.yawDeg);
      lines.push(`    Hướng nhìn lúc vào: la bàn ${c.deg}° (${c.name}) — "yawDeg": ${leg.start.yawDeg}; muốn nhìn hướng la bàn B° thì ghi "yawDeg": -B`);
    }
    if (p.box) {
      const c = compass(p.yawDeg);
      lines.push(`    Hướng hòm: mặt trước quay về la bàn ${c.deg}° (${c.name}), đội đứng phía đó mới đọc được — "yawDeg": ${p.yawDeg}${p.yawDeg ? '' : ' (mặc định)'}; muốn quay về la bàn B° thì ghi "yawDeg": -B`);
    }
    if (step && p.step === 1 && Math.hypot(p.x - s0.x, p.z - s0.z) <= p.r)
      lines.push('    Điểm xuất phát nằm trong vùng này: đội vào game là đã tới, mở được hộp ngay (đúng kiểu mật thư 1 phát ngoài game dẫn tới chính nơi xuất phát).');
    if (p.rack) { // a rack far off its point: shared/src/leg/check.ts warns (LEG_LIMITS.rackFar)
      const w = latLonToWorld(p.rack.lat, p.rack.lon);
      lines.push(`    Bãi xe: ${fmt(p.rack.lat)}, ${fmt(p.rack.lon)} (${inBox(p.rack) ? `cách tâm ${Math.round(Math.hypot(w.x - p.x, w.z - p.z))} m` : 'NGOÀI bản đồ đua'})`);
    }
    lines.push(`    Bản đồ: https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=19/${lat}/${lon}`);
    lines.push(`    Vệ tinh: https://www.google.com/maps?q=${lat},${lon}&t=k&z=19`);
    const pitch = (VIEW.pitchDeg * Math.PI) / 180;
    const cam = [p.x, map.ground(p.x, p.z) + VIEW.distance * Math.sin(pitch), p.z + VIEW.distance * Math.cos(pitch), 0, -VIEW.pitchDeg].map((v) => +v.toFixed(1)).join(',');
    const name = step ? p.id.replace(/\W+/g, '-') : 'start';
    // the Pit Stop mat as the marker: seen from 65 m a 0.6 m clue box is a few pixels (checked on screenshots)
    lines.push(`    Xem: npm run screenshot -- --path "/?cam=${cam}&boxes=${name},${xz(p.x, p.z)}&mat&npc=0" --name leg-${name}`);
    // in game: what the team will find there (the clue box; the mat at the Pit Stop)
    // the box's facing as the 5th field (`boxes=<name>,x,z,<opened?>,<yawDeg>`; omitted at 0 = the default, north)
    const marker = step ? `&boxes=${name},${xz(p.x, p.z)}${p.box && p.yawDeg ? `,,${p.yawDeg}` : ''}${step.type === 'pit_stop' ? '&mat' : ''}` : '';
    const spawn = step ? approach(map, prev.find((q) => Math.hypot(q.x - p.x, q.z - p.z) >= 1), p) : { ...startSpot(leg, 1), yawDeg: leg.start.yawDeg };
    lines.push(`    Trong game: ${DEV_URL}/?start=${xz(spawn.x, spawn.z)},${spawn.yawDeg}${marker}`);
    const where = p.path;
    const key = `${Math.round(p.x)}_${Math.round(p.z)}`;
    if (!warned.has(key)) {
      warned.add(key);
      const bridge = map.onBridge(p.x, p.z);
      const wet = map.waterAt(p.x, p.z);
      if (wet === 'river' && !bridge) add('warning', where, 'nằm giữa biển / sông (mặt nước lớn), đội không đứng được; dời vào bờ hoặc lên mặt cầu');
      if (wet === 'pond' && !bridge) add('warning', where, 'nằm giữa mặt nước (hồ / bể nước / đài phun nước), đội không đứng được; dời ra chỗ đất cạnh đó');
      if (bridge && !wet)
        add('warning', where, 'nằm trên đoạn cầu bắc qua đất (bờ / đảo), không phải qua mặt nước: kiểm tra đúng mặt cầu đi bộ, không phải nóc cầu cạn metro / đường sắt');
      // Leg 2 (leg2-fixes.md item 2): landmark details build platforms / steps / walls around their outlines (the demo's Pit
      // Stop stood in Leal Senado's body, its first box on the Ruínas platform)
      const lm = map.landmarkAt(p.x, p.z);
      if (lm) add('warning', where, `nằm trong / sát (≤ ${LANDMARK_NEAR} m) khuôn viên địa danh ${lm}: bệ, bậc thang, tường dựng chi tiết có thể che ${step?.type === 'pit_stop' ? 'thảm' : 'hộp'} hoặc chặn lối; dời ra sân / vỉa hè TRƯỚC mặt địa danh và xem ảnh (lệnh "Xem")`);
      const road = map.carriageway(p.x, p.z);
      if (road) add('warning', where, step
        ? `tâm nằm giữa lòng đường xe chạy (${road}): ${step.type === 'pit_stop' ? 'thảm Chặng dừng' : 'hộp mật thư'} sẽ nằm giữa dòng xe; dời lên vỉa hè / quảng trường cạnh đó`
        : `nằm giữa lòng đường xe chạy (${road}): đội vào game giữa dòng xe; dời lên vỉa hè / lối đi bộ`);
    }
    if (step?.type === 'pit_stop') { // after the warned-once block: the Pit Stop usually repeats the last route's point
      const share = map.matBlocked(p.x, p.z, p.yawDeg);
      if (share > 0.05) add('warning', where, `thảm Chặng dừng ${PIT_MAT.width} × ${PIT_MAT.length} m (cạnh dài theo "yawDeg": ${p.yawDeg}) chồng lên nhà ${Math.round(share * 100)} % diện tích: đội không đứng lên được phần đó, thảm bị che; dời tâm ra giữa quảng trường hoặc xoay "yawDeg" theo chiều dài quảng trường`);
    }
    // bike-rack suggestion (SPEC §6.4): a rack in the file, else the nearest graph rack 20–120 m away, else a spot on the walkable road
    if (step && !p.rack && !rackPts.has(key)) {
      rackPts.add(key);
      let best: [number, number] | null = null, bd = Infinity;
      for (const r of racks) {
        const d = Math.hypot(r[0] - p.x, r[1] - p.z);
        if (d > p.r && d < 120 && d < bd) (bd = d), (best = r);
      }
      if (best) {
        const g = worldToLatLon(best[0], best[1]);
        lines.push(`    Gợi ý bãi xe (có sẵn trong OSM, cách ${Math.round(bd)} m): "bikeParking": { "lat": ${fmt(g.lat)}, "lon": ${fmt(g.lon)} }`);
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
  // the shape is right but a rule failed (bad time zone, Pit Stop not last…): still check the map, so one run lists everything
  const shape = r.ok ? null : legSchema.safeParse(json);
  const leg = r.ok ? r.leg : shape?.success ? shape.data : null;
  if (leg) {
    const map = opts.map ?? loadMap(root);
    // checkLeg without geo already ran inside parseLeg: duplicates dropped below
    issues.push(...checkLeg(leg, map.geo));
    const rep = mapReport(leg, map);
    issues.push(...rep.issues);
    const media = mediaReport(leg);
    issues.push(...media.issues);
    issues.push(...scanLeaks(opts.scanDirs ?? [join(root, 'client/public'), join(root, 'client/dist')], secretStrings(leg), root, placeAnswers(leg, mapPlaces(map))));
    lines.push(...media.lines, ...rep.lines);
  }
  // SPEC §3: leg content never in client/ (shipped to every player); a real leg is best kept outside the project (no git)
  const inside = (dir: string) => ((rel) => !rel.startsWith('..') && !isAbsolute(rel))(relative(join(root, dir), resolve(file)));
  if (inside('client'))
    issues.push({ level: 'error', where: 'cả file', message: 'file chặng nằm trong thư mục client/: mọi thứ ở đó được gửi tới máy người chơi (đội đọc được đáp án). Chuyển file ra ngoài thư mục dự án' });
  else if (inside('.') && !inside('worker/legs'))
    issues.push({ level: 'warning', where: 'cả file', message: 'file chặng nằm trong thư mục dự án: dễ bị đưa lên git cùng mã nguồn. Chặng thật nên để NGOÀI thư mục dự án và chỉ chọn file khi nạp ở trang Host' });
  const key = (i: LegIssue) => `${i.level}|${i.where}|${i.message}`;
  issues = [...new Map(issues.map((i) => [key(i), i])).values()];
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
  if (!file || file === '--help' || file === '-h') {
    console.error('Cách dùng: npm run leg:check -- <đường-dẫn-file-chặng.json>   (ví dụ: npm run leg:check -- ~/Documents/chang-that/macao-1.json; hướng dẫn: docs/LEG_FORMAT.md)');
    process.exit(file ? 0 : 2);
  }
  const r = checkFile(file);
  console.log(r.report);
  process.exit(r.ok ? 0 : 1);
}
