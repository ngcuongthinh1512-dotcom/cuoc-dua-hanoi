// Leg validation for the server (load) and `npm run leg:check` (CLI, + map data): zod shape → readable Vietnamese
// messages naming the step, then the rules zod cannot express (step order, Pit Stop, map bbox, blanks the Host must
// fill, answers leaking into texts). Geography that needs the chunk / road-graph files (inside a building, walkable from
// the previous point) is injected by the CLI through `LegGeo`; the Durable Object never has those files.
import { RACE_BBOX } from '../constants.ts';
import { latLonToWorld } from '../projection.ts';
import { LEG_LIMITS, type Leg, legSchema, STEP_TYPES } from './schema.ts';
import { stepZones } from './zones.ts';

export interface LegIssue {
  /** error = refused (server will not load it); warning = loads, but look at it; blank = Host content still empty
   *  (SPEC §10: allowed in a draft, listed by the readiness check, SPEC §13.1). */
  level: 'error' | 'warning' | 'blank';
  /** Where, in Vietnamese: "Bước 3 (D1) › nhánh A › nhiệm vụ › tiêu đề". */
  where: string;
  message: string;
}

/** Map facts for the CLI (scripts/leg-check.ts builds them from client/public/data/chunks + shared/data/roadgraph.json). */
export interface LegGeo {
  /** Readable description of the solid building containing (x, z) (the CLI: the landmark's name if any + the nearest outdoor
   *  spot), printed as "nằm trong một tòa nhà (<this>)"; null = none (bridges, canopies and other walkable footprints too). */
  building(x: number, z: number): string | null;
  /** Walking route a → b on the road graph (m) + how far each end is from the graph (m); null = no route. */
  walk(a: { x: number; z: number }, b: { x: number; z: number }): { meters: number; snapA: number; snapB: number } | null;
}

export type ParsedLeg = { ok: true; leg: Leg; issues: LegIssue[] } | { ok: false; issues: LegIssue[] };

const FIELD: Record<string, string> = {
  id: 'mã', title: 'tiêu đề', timezone: 'múi giờ', eliminationLeg: 'chặng loại', mapLabels: 'nhãn bản đồ', presence: 'hiển thị đội khác',
  boxReveal: 'hiện hộp mật thư', penalties: 'phạt', movement: 'tốc độ', vehicles: 'xe đạp', clueBook: 'Sổ mật thư', hostApproval: 'Host duyệt',
  specials: 'yếu tố đặc biệt', start: 'điểm xuất phát', steps: 'các bước', type: 'loại bước', label: 'tên bước', clue: 'mật thư',
  transport: 'phương tiện', destination: 'điểm đến', name: 'tên', lat: 'vĩ độ (lat)', lon: 'kinh độ (lon)', radius: 'bán kính',
  bikeParking: 'bãi xe', branches: 'nhánh', task: 'nhiệm vụ', description: 'mô tả', media: 'ảnh/video', location: 'nơi làm nhiệm vụ',
  kind: 'kiểu nhiệm vụ', verification: 'cách xác nhận', answers: 'đáp án', proofInstruction: 'hướng dẫn gửi bài',
  timeLimitMinutes: 'giới hạn thời gian (phút)', params: 'tham số mini-game', teaser: 'câu gợi ý', summary: 'mô tả ngắn', yawDeg: 'hướng nhìn (độ)',
  spreadMeters: 'khoảng rải đội (m)', contactUrl: 'link Facebook của Host', contactLabel: 'chữ trên nút gửi bài',
};
const TYPE: Record<string, string> = { number: 'một số', string: 'chữ (trong dấu ngoặc kép)', boolean: 'true hoặc false', array: 'danh sách [...]', object: 'một khối {...}' };

const at = (root: unknown, path: readonly PropertyKey[]) => path.reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<PropertyKey, unknown>)[k] : undefined), root);

/** ['steps', 2, 'branches', 0, 'task', 'title'] → "Bước 3 (D1) › nhánh A › nhiệm vụ › tiêu đề" (ids read from `root`). */
export function placeOf(root: unknown, path: readonly PropertyKey[]): string {
  const out: string[] = [];
  for (let i = 0; i < path.length; i++) {
    const k = path[i]!;
    const next = path[i + 1];
    if ((k === 'steps' || k === 'branches') && typeof next === 'number') {
      const id = at(root, path.slice(0, i + 2).concat('id'));
      out.push(k === 'steps' ? `Bước ${next + 1}${typeof id === 'string' ? ` (${id})` : ''}` : `nhánh ${typeof id === 'string' ? id : next + 1}`);
      i++;
    } else if (typeof k === 'number') out.push(`mục ${k + 1}`);
    else out.push(FIELD[String(k)] ?? String(k));
  }
  return out.join(' › ') || 'cả file';
}

type ZodIssue = { code: string; path: PropertyKey[]; [k: string]: unknown };

function zodMessage(i: ZodIssue, root: unknown): string {
  const n = (v: unknown) => String(v);
  switch (i.code) {
    case 'invalid_type':
      return at(root, i.path) === undefined ? 'bị thiếu' : `phải là ${TYPE[n(i.expected)] ?? n(i.expected)}`;
    case 'too_small':
      if (i.origin === 'array') return i.exact ? `phải có đúng ${n(i.minimum)} mục` : `cần ít nhất ${n(i.minimum)} mục`;
      if (i.origin === 'string') return `cần ít nhất ${n(i.minimum)} ký tự`;
      return `phải ${i.inclusive ? '≥' : '>'} ${n(i.minimum)}${i.path.at(-1) === 'radius' ? ` m (bán kính ${LEG_LIMITS.radiusMin}–${LEG_LIMITS.radiusMax} m)` : ''}`;
    case 'too_big':
      if (i.origin === 'array') return i.exact ? `phải có đúng ${n(i.maximum)} mục` : `tối đa ${n(i.maximum)} mục`;
      if (i.origin === 'string') return `dài quá, tối đa ${n(i.maximum)} ký tự`;
      return `phải ${i.inclusive ? '≤' : '<'} ${n(i.maximum)}${i.path.at(-1) === 'radius' ? ` m (bán kính ${LEG_LIMITS.radiusMin}–${LEG_LIMITS.radiusMax} m)` : ''}`;
    case 'invalid_format':
      return i.path.at(-1) === 'id' && i.path.length === 1
        ? 'mã chặng chỉ gồm chữ thường a–z, số, gạch ngang (tối đa 32 ký tự, không bắt đầu bằng gạch ngang)'
        : 'mã chỉ gồm chữ, số, gạch ngang / gạch dưới, tối đa 16 ký tự, không dấu cách';
    case 'invalid_value':
      return `phải là một trong: ${(i.values as unknown[]).map((v) => JSON.stringify(v)).join(', ')}`;
    case 'unrecognized_keys':
      return `có trường lạ: ${(i.keys as string[]).map((k) => `"${k}"`).join(', ')} (gõ sai tên trường?)`;
    case 'invalid_union':
      if (i.discriminator === 'type')
        return `loại bước "${n(at(root, i.path))}" không có; chỉ dùng: ${STEP_TYPES.join(', ')} (trò chơi này không có Vượt rào / roadblock)`;
      if (i.path.at(-1) === 'transport') return 'phải là {"allowed": "any"} (tự chọn) hoặc {"mandatory": "walk"} (bắt buộc đi bộ)';
      return 'không đúng dạng nào được phép';
    case 'not_multiple_of':
      return `phải là bội số của ${n(i.divisor)}`;
    default:
      return 'giá trị không hợp lệ';
  }
}

/** Vietnamese diacritics / case / extra spaces do not matter (SPEC §11 "Quy tắc chung khi nhập đáp án"); Phase 8 compares
 *  answers with it too. */
export function normalizeAnswer(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** JSON.parse error of a leg file → Vietnamese "lỗi cú pháp (dòng X, cột Y)" + the usual mistakes of non-programmers
 *  (docs/LEG_FORMAT.md §10); never the engine's English text. */
export function jsonProblem(text: string, err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const m = /position (\d+)/.exec(msg);
  const pos = m ? Number(m[1]) : /end of JSON/.test(msg) ? text.length : null;
  let where = '';
  if (pos !== null) {
    const before = text.slice(0, pos);
    where = ` (dòng ${before.split('\n').length}, cột ${pos - before.lastIndexOf('\n')})`;
  }
  const hints: string[] = [];
  if (/[“”‘’]/.test(text)) hints.push('có dấu ngoặc kép cong “ ” (thường do copy từ Word / Google Docs): thay bằng dấu ngoặc kép thẳng "');
  if (/"(lat|lon)"\s*:\s*-?\d+,\d/.test(text)) hints.push('tọa độ dùng dấu phẩy thập phân (48,85): phải dùng dấu chấm (48.85)');
  if (/,\s*[}\]]/.test(text)) hints.push('có dấu phẩy thừa ngay trước } hoặc ]: xóa dấu phẩy cuối cùng');
  if (/(^|[\s,{[])\/\/|\/\*|^\s*#/m.test(text)) hints.push('JSON không có chú thích (// hoặc /* */): xóa các chú thích');
  if (/'[A-Za-z_]+'\s*:/.test(text)) hints.push("tên trường dùng dấu nháy đơn ': phải dùng dấu ngoặc kép \"");
  if (pos === text.length) hints.push('file bị cắt cụt hoặc rỗng: thiếu } hoặc ] ở cuối');
  return `lỗi cú pháp${where}${hints.length ? '. Có thể do: ' + hints.join('; ') : ''}`;
}

/** Shape (zod) + rules (checkLeg without map data). ok = no `error` issue: the server loads only such legs. */
export function parseLeg(input: unknown): ParsedLeg {
  const r = legSchema.safeParse(input);
  if (!r.success) return { ok: false, issues: r.error.issues.map((i) => ({ level: 'error', where: placeOf(input, i.path), message: zodMessage(i as unknown as ZodIssue, input) })) };
  const issues = checkLeg(r.data);
  return issues.some((i) => i.level === 'error') ? { ok: false, issues } : { ok: true, leg: r.data, issues };
}

const inBox = (p: { lat: number; lon: number }) => p.lat > RACE_BBOX.south && p.lat < RACE_BBOX.north && p.lon > RACE_BBOX.west && p.lon < RACE_BBOX.east;

/** The rules zod cannot express (docs/plans/phase7.md D12). With `geo` (CLI): building footprints + walking routes. */
export function checkLeg(leg: Leg, geo?: LegGeo): LegIssue[] {
  const out: LegIssue[] = [];
  const add = (level: LegIssue['level'], path: PropertyKey[], message: string) => out.push({ level, where: placeOf(leg, path), message });
  const steps = leg.steps;

  // the Host page formats every time in this zone (Intl throws on an unknown one: review fix, was a CLI warning only)
  try {
    new Intl.DateTimeFormat('en', { timeZone: leg.timezone });
  } catch {
    add('error', ['timezone'], `"${leg.timezone}" không phải múi giờ hợp lệ; dùng tên múi giờ chuẩn dạng Châu_lục/Thành_phố (tên IANA), ví dụ "Asia/Ho_Chi_Minh", "Europe/Paris"`);
  }

  // ids, order, Pit Stop
  const seen = new Set<string>();
  steps.forEach((s, i) => {
    if (seen.has(s.id)) add('error', ['steps', i, 'id'], `mã "${s.id}" trùng với một bước khác`);
    seen.add(s.id);
    if (s.type === 'detour' && s.branches[0]!.id === s.branches[1]!.id) add('error', ['steps', i, 'branches'], 'hai nhánh trùng mã');
  });
  if (steps[0]!.type !== 'route_info') add('error', ['steps', 0, 'type'], 'bước đầu tiên phải là lộ trình (route_info): đội nhận mật thư đầu tiên ở ngoài trò chơi');
  const pits = steps.flatMap((s, i) => (s.type === 'pit_stop' ? [i] : []));
  if (pits.length !== 1 || pits[0] !== steps.length - 1) add('error', ['steps'], 'phải có đúng một Chặng dừng (pit_stop) và nó là bước cuối cùng');
  const last = steps.length - 1;
  if (steps[last]!.type === 'pit_stop' && steps[last - 1]?.type !== 'route_info')
    add('error', ['steps', last], 'bước ngay trước Chặng dừng phải là lộ trình (route_info) dẫn tới Chặng dừng');

  // points: inside the map, the route to the Pit Stop ends at the Pit Stop
  outsideMap(out, leg);
  const pit = steps[last];
  const before = steps[last - 1];
  if (pit?.type === 'pit_stop' && before?.type === 'route_info') {
    const [a, b] = [latLonToWorld(before.destination.lat, before.destination.lon), latLonToWorld(pit.destination.lat, pit.destination.lon)];
    if (Math.hypot(a.x - b.x, a.z - b.z) > 5)
      add('warning', ['steps', last - 1, 'destination'], `cách thảm Chặng dừng ${Math.round(Math.hypot(a.x - b.x, a.z - b.z))} m; lộ trình cuối hoàn thành khi vào vùng Chặng dừng nên điểm này không được dùng`);
  }

  // blanks the Host must fill (SPEC §10, §13.1 readiness)
  const blank = (v: string | readonly string[], path: PropertyKey[], what: string) => (v.length ? 0 : add('blank', path, `${what} còn trống`));
  let hostTasks = 0;
  steps.forEach((s, i) => {
    if (!s.label) add('blank', ['steps', i, 'label'], 'tên bước còn trống');
    if (s.type === 'route_info') blank(s.clue, ['steps', i, 'clue'], 'mật thư');
    if (s.type === 'detour') blank(s.clue, ['steps', i, 'clue'], 'lời dẫn Lựa chọn kép');
    const tasks = s.type === 'detour' ? s.branches.map((b, k) => [b.task, ['steps', i, 'branches', k, 'task']] as const) : s.type === 'challenge' ? [[s.task, ['steps', i, 'task']] as const] : [];
    if (s.type === 'detour') s.branches.forEach((b, k) => (blank(b.name, ['steps', i, 'branches', k, 'name'], 'tên nhánh'), blank(b.summary, ['steps', i, 'branches', k, 'summary'], 'mô tả ngắn của nhánh')));
    for (const [t, p] of tasks) {
      blank(t.title, [...p, 'title'], 'tiêu đề nhiệm vụ');
      blank(t.description, [...p, 'description'], 'mô tả nhiệm vụ');
      if (t.verification === 'auto' && t.kind !== 'free') blank(t.answers, [...p, 'answers'], 'đáp án (cách xác nhận "auto")');
      if (t.verification === 'auto' && t.kind === 'free') add('warning', [...p, 'kind'], 'nhiệm vụ "free" không tự chấm được: nên dùng cách xác nhận "host_approval"');
      if (t.verification === 'host_approval') (hostTasks++, blank(t.proofInstruction, [...p, 'proofInstruction'], 'hướng dẫn gửi bài'));
    }
  });
  if (hostTasks && !leg.hostApproval.contactUrl) add('blank', ['hostApproval', 'contactUrl'], 'link Facebook của Host còn trống (có nhiệm vụ Host duyệt)');

  // SPEC §3 / §8.3: an answer written into a text the team reads before solving it gives it away
  const texts: [string, PropertyKey[]][] = [];
  steps.forEach((s, i) => {
    if (s.type === 'route_info' || s.type === 'detour') texts.push([s.clue, ['steps', i, 'clue']]);
    // a task place's name is on the card too ("Địa điểm: …")
    if (s.type === 'challenge') texts.push([s.teaser, ['steps', i, 'teaser']], [s.task.title, ['steps', i, 'task', 'title']], [s.task.description, ['steps', i, 'task', 'description']], [s.task.location?.name ?? '', ['steps', i, 'task', 'location', 'name']]);
    if (s.type === 'detour') s.branches.forEach((b, k) => texts.push([b.summary, ['steps', i, 'branches', k, 'summary']], [b.task.title, ['steps', i, 'branches', k, 'task', 'title']], [b.task.description, ['steps', i, 'branches', k, 'task', 'description']], [b.task.location?.name ?? '', ['steps', i, 'branches', k, 'task', 'location', 'name']]));
  });
  steps.forEach((s, i) => {
    const tasks = s.type === 'detour' ? s.branches.map((b) => b.task) : s.type === 'challenge' ? [s.task] : [];
    for (const a of tasks.flatMap((t) => t.answers).map(normalizeAnswer).filter((a) => a.length >= 3))
      for (const [t, p] of texts) if (normalizeAnswer(t).includes(a)) add('warning', p, `chứa đáp án "${a}" của bước ${i + 1} (${s.id}): đội đọc được trước khi giải`);
  });

  // map data (CLI only): every point a team must reach (step zones, each detour branch's own place) is outside buildings
  // and walkable from every point of the step before (both branch places → the next step); bike racks outside buildings,
  // outside their zone (SPEC §6.4: next to the point, not in it) and not a typo far off it.
  if (geo) {
    const zones = stepZones(leg);
    type Pt = { x: number; z: number; r: number; id: string; path: PropertyKey[] };
    const s0 = latLonToWorld(leg.start.lat, leg.start.lon);
    let prevs: Pt[] = [{ x: s0.x, z: s0.z, r: 0, id: 'xuất phát', path: ['start'] }];
    const sb = geo.building(s0.x, s0.z);
    if (sb) add('error', ['start'], `nằm trong một tòa nhà (${sb}); dời ra vỉa hè / quảng trường`);
    const rack = (d: { lat: number; lon: number; radius: number; bikeParking?: { lat: number; lon: number } | undefined } | null, path: PropertyKey[]) => {
      if (!d?.bikeParking) return;
      const [c, p] = [latLonToWorld(d.lat, d.lon), latLonToWorld(d.bikeParking.lat, d.bikeParking.lon)];
      const b = geo.building(p.x, p.z);
      if (b) add('error', [...path, 'bikeParking'], `bãi xe nằm trong một tòa nhà (${b}); dời ra vỉa hè`);
      const dist = Math.hypot(p.x - c.x, p.z - c.z);
      if (dist <= d.radius) add('warning', [...path, 'bikeParking'], `bãi xe cách tâm ${Math.round(dist)} m, nằm trong vùng (bán kính ${d.radius} m); nên đặt ngoài vùng ≈ ${leg.vehicles.bikeParking.offsetMeters} m`);
      else if (dist > LEG_LIMITS.rackFar && inBox(d.bikeParking)) // off the map: outsideMap's error already
        add('warning', [...path, 'bikeParking'], `bãi xe cách tâm ${Math.round(dist)} m, xa hơn ${LEG_LIMITS.rackFar} m (gõ nhầm tọa độ?); nên đặt ngay ngoài vùng ≈ ${leg.vehicles.bikeParking.offsetMeters} m`);
    };
    steps.forEach((s, i) => {
      const own: Pt[] =
        s.type === 'detour'
          ? s.branches.map((b, k) => ({ ...(b.task.location ? latLonToWorld(b.task.location.lat, b.task.location.lon) : zones[i]!), r: b.task.location?.radius ?? zones[i]!.r, id: `bước ${i + 1} (${s.id}) nhánh ${b.id}`, path: ['steps', i, 'branches', k, 'task', 'location'] }))
          : [{ ...zones[i]!, id: `bước ${i + 1} (${s.id})`, path: s.type === 'route_info' || s.type === 'pit_stop' ? ['steps', i, 'destination'] : ['steps', i, 'task', 'location'] }];
      if (s.type === 'route_info' || s.type === 'pit_stop') rack(s.destination, ['steps', i, 'destination']);
      if (s.type === 'challenge') rack(s.task.location, ['steps', i, 'task', 'location']);
      if (s.type === 'detour') s.branches.forEach((b, k) => rack(b.task.location, ['steps', i, 'branches', k, 'task', 'location']));
      const next: Pt[] = [];
      for (const z of own) {
        const from = prevs.filter((p) => p.x !== z.x || p.z !== z.z);
        if (from.length < prevs.length) { next.push(z); continue; } // same point as before (task here, the Pit Stop after its route)
        const b = geo.building(z.x, z.z);
        if (b) add('error', z.path, `tâm vùng nằm trong một tòa nhà (${b}); dời ra vỉa hè / quảng trường`);
        for (const p of from) {
          const w = geo.walk(p, z);
          if (!w) add('error', z.path, `không đi bộ tới được từ ${p.id} theo đồ thị đường`);
          else if (w.snapB > z.r) add('warning', z.path, `đường đi bộ gần nhất cách tâm ${Math.round(w.snapB)} m, xa hơn bán kính ${z.r} m`);
        }
        next.push(z);
      }
      prevs = next;
    });
  }
  return out;
}

/** Every point inside RACE_BBOX (SPEC §4.1). */
function outsideMap(out: LegIssue[], leg: Leg) {
  const pts: [{ lat: number; lon: number } | null | undefined, PropertyKey[]][] = [[leg.start, ['start']]];
  leg.steps.forEach((s, i) => {
    if (s.type === 'route_info' || s.type === 'pit_stop') pts.push([s.destination, ['steps', i, 'destination']], [s.destination.bikeParking, ['steps', i, 'destination', 'bikeParking']]);
    // a task place's rack too (review 2 F5: a typo 111 km off loaded on the server, BikeService.park moved the bike there)
    if (s.type === 'challenge') pts.push([s.task.location, ['steps', i, 'task', 'location']], [s.task.location?.bikeParking, ['steps', i, 'task', 'location', 'bikeParking']]);
    if (s.type === 'detour') s.branches.forEach((b, k) => pts.push([b.task.location, ['steps', i, 'branches', k, 'task', 'location']], [b.task.location?.bikeParking, ['steps', i, 'branches', k, 'task', 'location', 'bikeParking']]));
  });
  for (const [p, path] of pts)
    if (p && !inBox(p)) out.push({ level: 'error', where: placeOf(leg, path), message: `(${p.lat}, ${p.lon}) nằm ngoài bản đồ đua (vĩ độ ${RACE_BBOX.south}–${RACE_BBOX.north}, kinh độ ${RACE_BBOX.west}–${RACE_BBOX.east})` });
}
