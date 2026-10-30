// Leg validation for the server (load) and `npm run leg:check` (CLI, + map data): zod shape → readable Vietnamese
// messages naming the step, then the rules zod cannot express (step order, Pit Stop, map bbox, blanks the Host must
// fill, answers leaking into texts). Geography that needs the chunk / road-graph files (inside a building, walkable from
// the previous point) is injected by the CLI through `LegGeo`; the Durable Object never has those files.
import { RACE_BBOX } from '../constants.ts';
import { latLonToWorld } from '../projection.ts';
import { compactAnswer, normalizeAnswer } from '../protocol/answers.ts';
import { MEDIA } from '../protocol/constants.ts';
import { FINISH_HOLDERS } from '../protocol/finish.ts';
import { LEG_LIMITS, type Leg, legSchema, type MediaItem, STEP_TYPES, type Task } from './schema.ts';
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
  bikeParking: 'bãi xe', branches: 'nhánh', task: 'nhiệm vụ', description: 'mô tả', media: 'hình / liên kết', location: 'nơi làm nhiệm vụ',
  kind: 'kiểu nhiệm vụ', verification: 'cách xác nhận', answers: 'đáp án', proofInstruction: 'hướng dẫn gửi bài',
  timeLimitMinutes: 'giới hạn thời gian (phút)', params: 'tham số mini-game', teaser: 'câu gợi ý', summary: 'mô tả ngắn', afterChoice: 'lời sau khi chọn', yawDeg: 'hướng nhìn (độ)',
  spreadMeters: 'khoảng rải đội (m)',
  // Phase 8 (docs/plans/phase8.md D2)
  referenceAnswers: 'đáp án tham khảo (chỉ Host)', retryLockMinutes: 'phút khóa sau khi bị phạt', branchSwitchLockMinutes: 'phút khóa khi đổi nhánh',
  scoreOf: 'số phần để báo đúng x/n', scoreFromMinutes: 'phút bắt đầu báo đúng x/n', parts: 'các ô (thử thách nhiều ô)', pick: 'cách chọn đáp án (chọn ghế)', showMarks: 'tô xanh / đỏ từng ô', room: 'phòng (room)', total: 'tổng số món', penaltyMinutesEach: 'phút phạt mỗi món chưa xong', hostAlerts: 'cảnh báo cho Host', stuckMinutes: 'phút kẹt một thử thách', url: 'liên kết',
  walkOnlyViolationMinutes: 'phút phạt đi xe ở lộ trình đi bộ', quitTaskMinutes: 'phút phạt bỏ thử thách',
  // SPEC §17.22 / §17.23
  announce: 'thông báo về đích', npc: 'lời NPC dẫn chương trình', toast: 'thông báo nhanh', card: 'thẻ về đích', first: 'bản về nhất', out: 'bản bị loại',
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
    else if (k === 'label' && path[i - 2] === 'media') out.push('nhãn liên kết'); // not the step's 'tên bước'
    else if (k === 'title' && path[i - 1] === 'credit') out.push('tên tác phẩm');
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
      if (i.path.at(-2) === 'media') return 'phải là một chuỗi ("https://…" hoặc "r2:<tên hình>") hoặc {"url": "…", "label": "…"}';
      return 'không đúng dạng nào được phép';
    case 'not_multiple_of':
      return `phải là bội số của ${n(i.divisor)}`;
    default:
      return 'giá trị không hợp lệ';
  }
}

/** Vietnamese diacritics / case / extra spaces do not matter (SPEC §11 "Quy tắc chung khi nhập đáp án"); Phase 8 compares
 *  answers with it too. Lives in protocol/answers.ts (zod-free) so the Host page can use it; re-exported here for the Worker. */
export { normalizeAnswer };

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
    add('error', ['timezone'], `"${leg.timezone}" không phải múi giờ hợp lệ; dùng tên múi giờ chuẩn dạng Châu_lục/Thành_phố (tên IANA), ví dụ "Asia/Ho_Chi_Minh", "Asia/Macau"`);
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
      add('warning', ['steps', last - 1, 'destination'], `cách thảm Chặng dừng ${Math.round(Math.hypot(a.x - b.x, a.z - b.z))} m; lộ trình cuối hoàn thành khi dẫm lên thảm Chặng dừng nên điểm này không được dùng`);
  }

  // blanks the Host must fill (SPEC §10, §13.1 readiness)
  const blank = (v: string | readonly string[], path: PropertyKey[], what: string) => (v.length ? 0 : add('blank', path, `${what} còn trống`));
  const labels = new Map<string, number>();
  steps.forEach((s, i) => {
    if (!s.label) add('blank', ['steps', i, 'label'], 'tên bước còn trống');
    // Phase 8 (gap 12): duplicate labels only warn (no numbering rule imposed, docs/plans/phase8.md §12 q9)
    else if (labels.has(s.label) && !held(s.label)) add('warning', ['steps', i, 'label'], `tên bước "${s.label}" trùng với bước ${labels.get(s.label)! + 1}: đội và Host khó phân biệt`);
    else labels.set(s.label, i);
    if (s.type === 'route_info') blank(s.clue, ['steps', i, 'clue'], 'mật thư');
    if (s.type === 'detour') blank(s.clue, ['steps', i, 'clue'], 'lời dẫn Lựa chọn kép');
    // Leg 3: a challenge in the GardeRobe room: the room is built under the box of the step before (its destination), so
    // the task has no place of its own and a step with a destination must precede it
    if (s.type === 'challenge' && s.room) {
      if (s.task.location) add('error', ['steps', i, 'task', 'location'], 'thử thách trong phòng (room) không có nơi riêng: phòng dựng dưới hòm của bước trước; bỏ "location"');
      const prev = steps[i - 1];
      const sameRoom = prev?.type === 'challenge' && prev.room === s.room; // T2 → T3 in the BOZAR hall: the team is already inside
      if (i === 0 || (prev!.type === 'challenge' && !sameRoom)) add('error', ['steps', i, 'room'], 'thử thách trong phòng (room) phải đứng ngay sau một bước có hòm (lộ trình / Lựa chọn kép), hoặc sau thử thách cùng phòng');
    }
    if (s.type === 'challenge' && s.pickup) {
      const prev = steps[i - 1];
      if (!s.room) add('error', ['steps', i, 'pickup'], 'điểm nhận mật thư (pickup) chỉ dùng trong phòng: thêm "room"');
      else if (prev?.type !== 'challenge' || prev.room !== s.room) add('error', ['steps', i, 'pickup'], 'điểm nhận mật thư (pickup) đứng sau một thử thách cùng phòng (đội đang ở trong phòng)');
      blank(s.pickup.clue, ['steps', i, 'pickup', 'clue'], 'mật thư nhận ở sân khấu');
      blank(s.pickup.prompt, ['steps', i, 'pickup', 'prompt'], 'dòng nhắc "Bấm F…"');
    }
    if (s.type === 'route_info' && s.room && (i === 0 || steps[i - 1]!.type === 'challenge')) add('error', ['steps', i, 'room'], 'lộ trình có phòng (room) phải đứng ngay sau một bước có hòm (lộ trình / Lựa chọn kép): phòng dựng dưới hòm vừa mở');
    const tasks = s.type === 'detour' ? s.branches.map((b, k) => [b.task, ['steps', i, 'branches', k, 'task']] as const) : s.type === 'challenge' ? [[s.task, ['steps', i, 'task']] as const] : [];
    if (s.type === 'detour') s.branches.forEach((b, k) => (blank(b.name, ['steps', i, 'branches', k, 'name'], 'tên nhánh'), blank(b.summary, ['steps', i, 'branches', k, 'summary'], 'mô tả ngắn của nhánh')));
    for (const [t, p] of tasks) {
      blank(t.title, [...p, 'title'], 'tiêu đề nhiệm vụ');
      blank(t.description, [...p, 'description'], 'mô tả nhiệm vụ');
      if (t.showMarks && !(t.parts && t.parts.every((x) => x.answers))) add('error', [...p, 'showMarks'], 'tô xanh / đỏ từng ô (showMarks) cần thử thách nhiều ô mà MỌI ô có đáp án (máy chủ tự chấm)');
      if (t.pick) {
        if (t.verification !== 'auto' || t.kind !== 'answer' || t.parts) add('error', [...p, 'pick'], 'thử thách chọn ghế (pick) do máy chủ tự chấm: dùng kiểu "answer", cách xác nhận "auto", không dùng nhiều ô (parts)');
        if (s.type !== 'challenge' || !s.room) add('error', [...p, 'pick'], 'thử thách chọn ghế (pick) phải nằm trong phòng (room "hall") của một thử thách');
      }
      if (t.parts) {
        // SPEC §17.44: a multi-box task is reviewed by the Host (no answers in the leg: nothing to grade with)
        if (t.verification !== 'host_approval') add('error', [...p, 'verification'], 'thử thách nhiều ô (parts) do Host duyệt: phải dùng cách xác nhận "host_approval" (máy chủ không có đáp án để tự chấm)');
        if (t.kind !== 'answer') add('error', [...p, 'kind'], `thử thách nhiều ô (parts) chỉ dùng với kiểu "answer" (đang là "${t.kind}")`);
        // Leg 3: per-box answers = auto-graded (all boxes or none: a half-graded task has no meaning)
        const graded = t.parts.filter((x) => x.answers).length;
        if (graded && graded < t.parts.length) add('error', [...p, 'parts'], `chỉ ${graded}/${t.parts.length} ô có đáp án (answers): máy chủ tự chấm khi MỌI ô có đáp án; thêm đáp án cho các ô còn lại hoặc bỏ hết`);
        t.parts.forEach((x, k) => x.answers?.forEach((a, j) => !held(a) && compactAnswer(a) === '' && add('error', [...p, 'parts', k, 'answers', j], 'đáp án rỗng sau khi bỏ dấu / khoảng trắng')));
        if (t.scoreOf !== undefined && t.scoreOf !== t.parts.length) add('warning', [...p, 'scoreOf'], `scoreOf (${t.scoreOf}) khác số ô (${t.parts.length}): bỏ scoreOf đi, "đúng x/n" lấy n = số ô`);
      }
      if (t.room) {
        // Leg 3: a room's completion goes to the Host's queue (the client is never trusted to finish a step by itself)
        if (s.type !== 'detour') add('error', [...p, 'room'], 'phòng (room) chỉ dùng cho nhánh của Lựa chọn kép (detour)');
        if (t.verification !== 'host_approval') add('error', [...p, 'verification'], 'nhánh có phòng (room) do Host duyệt khi đội báo xong: phải dùng cách xác nhận "host_approval"');
        if (t.parts) add('error', [...p, 'room'], 'không dùng phòng (room) cùng thử thách nhiều ô (parts)');
      }
      if (t.verification === 'auto' && t.kind !== 'free') blank(t.answers, [...p, 'answers'], 'đáp án (cách xác nhận "auto")');
      if (t.verification === 'auto' && t.kind === 'free') add('warning', [...p, 'kind'], 'nhiệm vụ "free" không tự chấm được: nên dùng cách xác nhận "host_approval"');
      // Phase 8 (gap 1): an answer typed in game + Host approval needs no proof instruction; a photo task (free) does. No
      // Host Facebook / Messenger link at all (SPEC §17.17: teams open Messenger outside the game)
      if (t.verification === 'host_approval' && t.kind === 'free') blank(t.proofInstruction, [...p, 'proofInstruction'], 'hướng dẫn gửi bài');
      if (t.kind !== 'answer' && t.kind !== 'free') add('warning', [...p, 'kind'], `kiểu "${t.kind}" chưa có trong game (hoãn): máy chủ xử lý như "answer" (đội gõ đáp án)`);
    }
    // Phase 8 (§17.16): each branch has its own box at its task place; without one it stands where the previous box
    // stood (on top of it). A branch still blank is listed above: its place comes with its content.
    if (s.type === 'detour')
      s.branches.forEach((b, k) => {
        if (!b.task.location && (b.task.title || b.task.description))
          add('warning', ['steps', i, 'branches', k, 'task', 'location'], 'nhánh không có nơi riêng: hòm nhánh đứng cùng chỗ hòm lộ trình trước (chồng lên nhau); nên cho nhánh một nơi riêng');
      });
  });
  // Phase 8 (gap 10): "[CHƯA NHẬP …]" = still a placeholder, listed like an empty field (also blocks a careless "Mở cuộc đua")
  walkStrings(leg, [], (v, path) => held(v) && add('blank', path, `còn giữ chỗ "${v.trim().slice(0, 40)}": nhập nội dung thật`));
  for (const k of ['retryLockMinutes', 'branchSwitchLockMinutes'] as const)
    if (leg.penalties[k] < 1) add('warning', ['penalties', k], `phạt dưới 1 phút (${leg.penalties[k]}): chỉ dùng cho chặng test`);

  // Phase 8 (D2 rule 5): media = an r2 image name the Host uploads, or an http(s) link
  const r2 = new Map<string, string>();
  for (const { item, path } of mediaItems(leg)) {
    const where = [...path, 'url'];
    if (item.url.startsWith(MEDIA.prefix)) {
      const name = item.url.slice(MEDIA.prefix.length);
      if (!MEDIA.name.test(name)) add('error', where, `tên hình "${name}" không hợp lệ: chỉ chữ không dấu, số, dấu . _ -, tối đa 64 ký tự, đuôi .jpg / .jpeg / .png / .webp`);
      else if (r2.has(name)) add('warning', where, `hình "${name}" đã dùng ở ${r2.get(name)}: kiểm tra có nhầm hình không`);
      else r2.set(name, placeOf(leg, path));
    } else if (!isWebLink(item.url)) add('error', where, `"${item.url}" không phải liên kết hợp lệ: phải bắt đầu bằng https:// (hoặc "r2:<tên hình>" cho hình tải lên trang Host)`);
  }

  // SPEC §3 / §8.3: an answer written into a text the team reads before solving it gives it away. Phase 8 (gap 9): only
  // the texts it can read by then: every step up to this one (card label, clue, teaser, task text, proof instruction,
  // link labels + link / image addresses, the place name). Of a detour: BOTH branches' texts, the other branch's task
  // included: it sits in the other branch's box, but §17.16 lets a team open that box, read it and switch branch ("Đổi
  // lựa chọn kép") before answering (verify-foundation S2).
  // R-5 (verify-d N1): a media url ("r2:<name>" or a link) reaches the team with the clue (the link on hover, the image path),
  // so a name like "palais-de-tokyo.jpg" gives the place away: compared with its separators turned into spaces.
  const urlText = (u: string) => u.replace(/[-_./:]+/g, ' ');
  const textsOf = (i: number): [string, PropertyKey[]][] => {
    const s = steps[i]!;
    const out: [string, PropertyKey[]][] = [[s.label, ['steps', i, 'label']]];
    const task = (t: Task, p: PropertyKey[]) => {
      out.push([t.title, [...p, 'title']], [t.description, [...p, 'description']], [t.location?.name ?? '', [...p, 'location', 'name']]); // the place name is on the card ("Địa điểm: …")
      out.push([t.proofInstruction, [...p, 'proofInstruction']]); // on a photo task's card
      t.media.forEach((m, k) => out.push([m.label, [...p, 'media', k, 'label']], [urlText(m.url), [...p, 'media', k, 'url']]));
    };
    if (s.type === 'route_info' || s.type === 'detour') {
      out.push([s.clue, ['steps', i, 'clue']]);
      s.media.forEach((m, k) => out.push([m.label, ['steps', i, 'media', k, 'label']], [urlText(m.url), ['steps', i, 'media', k, 'url']]));
    }
    if (s.type === 'challenge') (out.push([s.teaser, ['steps', i, 'teaser']]), task(s.task, ['steps', i, 'task']));
    if (s.type === 'detour')
      s.branches.forEach((b, k) => {
        out.push([b.name, ['steps', i, 'branches', k, 'name']], [b.summary, ['steps', i, 'branches', k, 'summary']], [b.afterChoice, ['steps', i, 'branches', k, 'afterChoice']]); // afterChoice: read right after choosing, before any box
        task(b.task, ['steps', i, 'branches', k, 'task']);
      });
    return out;
  };
  steps.forEach((s, i) => {
    const tasks = s.type === 'detour' ? s.branches.map((b) => [b.task, b.id] as const) : s.type === 'challenge' ? [[s.task, null] as const] : [];
    if (!tasks.length) return;
    const texts = [...new Map(steps.slice(0, i + 1).flatMap((_, j) => textsOf(j)).map((x) => [x[1].join('/'), x] as const)).values()]; // the shared button label once
    for (const [t, branch] of tasks)
      for (const [list, what] of [[t.answers, 'đáp án'], [t.referenceAnswers, 'đáp án tham khảo'], [(t.parts ?? []).flatMap((x) => x.answers ?? []), 'đáp án ô']] as [readonly string[], string][])
        for (const a of list.filter((x) => !held(x)).map(normalizeAnswer).filter((a) => a.length >= 3))
          for (const [x, p] of texts) if (normalizeAnswer(x).includes(a)) add('warning', p, `chứa ${what} "${a}" của bước ${i + 1} (${s.id}${branch ? `, nhánh ${branch}` : ''}): đội đọc được trước khi giải`);
  });

  announceRules(leg, add);

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

/** SPEC §17.22 / §17.23: the finish texts of the Pit Stop (announce): only the known placeholders; characters a team's screen
 *  shows (no control characters: error; outside Latin / Vietnamese / common punctuation, e.g. emoji: warning, the system
 *  font may draw a box). */
function announceRules(leg: Leg, add: (level: LegIssue['level'], path: PropertyKey[], message: string) => void) {
  leg.steps.forEach((s, i) => {
    if (s.type !== 'pit_stop' || !s.announce) return;
    walkStrings(s.announce, ['steps', i, 'announce'], (v, path) => {
      const t = v.normalize('NFC');
      const bad = [...new Set(t.match(/\{[^{}]*\}/g) ?? [])].filter((h) => !(FINISH_HOLDERS as readonly string[]).includes(h));
      if (bad.length) add('error', path, `chỗ giữ ${bad.map((b) => `"${b}"`).join(', ')} không có; chỉ dùng ${FINISH_HOLDERS.join(', ')}`);
      else if (/[{}]/.test(t.replace(/\{[^{}]*\}/g, ''))) add('error', path, `dấu { } lẻ: chỗ giữ phải viết đủ, ví dụ {n}; chỉ dùng ${FINISH_HOLDERS.join(', ')}`);
      if (/[\p{Cc}\p{Cf}]/u.test(t.replace(/\n/g, ''))) add('error', path, 'có ký tự điều khiển / vô hình (thường do copy từ nơi khác): gõ lại đoạn này');
      const odd = [...new Set(t.replace(/[\p{Cc}\p{Cf}\p{Script=Latin}\p{M}\p{N}\p{P}\p{Zs}\n+<=>^`|~°×$]/gu, ''))];
      if (odd.length) add('warning', path, `có ký tự ngoài bảng chữ Việt / Latin (${odd.slice(0, 5).join(' ')}): máy người chơi có thể hiện ô vuông`);
    });
  });
}

/** "[CHƯA NHẬP …]": a placeholder left in a draft (gap 10), whatever the case / Unicode form. */
const held = (v: string) => v.normalize('NFC').trim().toUpperCase().startsWith('[CHƯA NHẬP');

/** An http(s) link with a dotted host and no spaces (shared has no URL global: ES lib only). */
const isWebLink = (u: string) => /^https?:\/\/[^\s/?#.]+(\.[^\s/?#.]+)+([/?#]\S*)?$/i.test(u);

/** Every string of the parsed leg with its path. */
function walkStrings(v: unknown, path: PropertyKey[], fn: (s: string, path: PropertyKey[]) => void) {
  if (typeof v === 'string') fn(v, path);
  else if (Array.isArray(v)) v.forEach((x, k) => walkStrings(x, [...path, k], fn));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walkStrings(x, [...path, k], fn);
}

/** Every media item of a leg (route / detour clues, challenge and branch tasks) with its path. */
export function mediaItems(leg: Leg): { item: MediaItem; path: PropertyKey[] }[] {
  const out: { item: MediaItem; path: PropertyKey[] }[] = [];
  const add = (list: readonly MediaItem[], p: PropertyKey[]) => list.forEach((item, k) => out.push({ item, path: [...p, 'media', k] }));
  leg.steps.forEach((s, i) => {
    if (s.type === 'route_info' || s.type === 'detour') add(s.media, ['steps', i]);
    if (s.type === 'challenge') add(s.task.media, ['steps', i, 'task']);
    if (s.type === 'detour') s.branches.forEach((b, k) => add(b.task.media, ['steps', i, 'branches', k, 'task']));
  });
  return out;
}

/** The R2 image names a leg refers to ("r2:<name>", valid names only, once each): the Host page's upload list (D14). */
export const r2Names = (leg: Leg): string[] => [
  ...new Set(mediaItems(leg).map((m) => m.item.url).filter((u) => u.startsWith(MEDIA.prefix)).map((u) => u.slice(MEDIA.prefix.length)).filter((n) => MEDIA.name.test(n))),
];

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
