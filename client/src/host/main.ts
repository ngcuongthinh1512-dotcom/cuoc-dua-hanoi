// Minimal Host page (docs/plans/phase6.md §3.19, `/host.html`; Phase 7 track E adds the race controls): password login → leg
// loading → teams, start times → race status → step_progress matrix + ranking, quota counters, shared bikes. Phase 10 replaces
// it with SPEC §13.
import type { RoadGraph, RoadGraphFile } from '@race/shared/graph';
import graphUrl from '@race/shared/data/roadgraph.json?url';
import { CLOSE, NET, type ClientMessage, type HostState, type LegIssueView, type ServerMessage } from '@race/shared/protocol';
import { hostPage, net } from '../config.ts';
import './host.css';
import { corridorPoints, counterLines, demoState, inputToMs, legIssueLines, parseTeamLines, progressTable, startPreview, startRows, STATUS_LABEL, statusButtons, teamRows, warnings } from './hostView.ts';

type State = HostState;
/** Lazy: the corridor code + road graph load only when candidates are computed (docs/plans/phase6.md §2.4). */
const spawnModule = () => import('./spawnCandidates.ts');

const q = new URLSearchParams(location.search);
const app = document.getElementById('app')!;

// ponytail: props are untyped (Partial<HTMLElementTagNameMap[K]> is a union too big for tsc); `style` strings forward to cssText.
function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  Object.assign(e, props);
  e.append(...kids);
  return e;
}

let state: State | null = null;
let receivedAt = Date.now(); // when `state` arrived: the server's clock now ≈ state.serverMs + (Date.now() − receivedAt)
let ws: WebSocket | null = null;
let race = q.get('race') ?? net.defaultRace;
/** True when the frame went out; false while the socket is down (the caller keeps what the Host typed). */
const send = (m: ClientMessage) => (ws?.readyState === WebSocket.OPEN ? (ws.send(JSON.stringify(m)), true) : false);

// Keepalive (docs/plans/phase6.md §3 decision 6): the server closes a socket silent for 30 s, the Host's too. The Durable
// Object answers 'ping' itself: not billed, does not wake it.
setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send(NET.ping), NET.pingMs);

// ── login ──
const err = el('p', { id: 'err' });
function loginView() {
  const raceIn = el('input', { value: race, size: 20 });
  const pwIn = el('input', { type: 'password', size: 20, autocomplete: 'current-password' });
  const go = async () => {
    race = raceIn.value.trim();
    err.textContent = '';
    const r = await fetch(`${net.apiBase}/login`, { method: 'POST', body: JSON.stringify({ race, host: pwIn.value }) }).catch(() => null);
    const body = (await r?.json().catch(() => null)) as { ok?: boolean; token?: string; error?: string } | null;
    if (!body?.ok || !body.token) return void (err.textContent = body?.error === 'bad_password' ? 'Sai mật khẩu Host.' : body?.error === 'bad_race' ? 'Mã cuộc đua không hợp lệ (a–z, 0–9, gạch ngang).' : 'Không kết nối được máy chủ.');
    connect(body.token);
    mainView();
  };
  pwIn.addEventListener('keydown', (e) => e.key === 'Enter' && void go());
  app.replaceChildren(
    el('h1', {}, 'Cuộc đua Paris – Host'),
    el('section', {}, el('label', {}, 'Mã cuộc đua ', raceIn), el('label', {}, 'Mật khẩu Host ', pwIn), el('button', { onclick: () => void go() }, 'Đăng nhập'), err),
  );
}

/** Team count the Host expects in host.state after "Tạo đội" (0 = nothing in flight): the textarea is cleared only then. */
let pending = 0;

function connect(token: string) {
  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${net.apiBase}/race/${encodeURIComponent(race)}/ws?token=${encodeURIComponent(token)}`;
  ws = new WebSocket(url);
  ws.onmessage = (e) => {
    if (e.data === NET.pong) return;
    const m = JSON.parse(String(e.data)) as ServerMessage;
    if (Array.isArray(m)) return;
    if (m.t === 'host.notice') return void addNotice(m.level, m.message);
    if (m.t === 'host.legResult') return void ((legResult = m), (sigs.leg = ''), state && render(state));
    if (m.t !== 'host.state') return;
    receivedAt = Date.now();
    render((state = m));
    if (pending && m.teams.length >= pending) (create.value = ''), (pending = 0);
    void autoCandidates();
  };
  ws.onclose = (e) => {
    pending = 0;
    if (e.code === CLOSE.badToken) return void ((err.textContent = 'Phiên hết hạn, đăng nhập lại.'), loginView());
    err.textContent = e.code === CLOSE.badMessage ? 'Máy chủ từ chối tin vừa gửi (mã 4400), đang nối lại… Kiểm tra lại nội dung rồi gửi lần nữa.' : 'Mất kết nối, đang nối lại…';
    setTimeout(() => connect(token), hostPage.reconnectMs);
  };
  ws.onopen = () => (err.textContent = '');
}

// ── main view ──
const create = el('textarea', { placeholder: 'Mỗi dòng một đội: Tên đội; Tên người chơi\nĐội Xanh; An\nĐội Đỏ; Bình' });
const banner = el('section', { className: 'alert' });
const noticeBox = el('section');
const statusBox = el('section');
const legBox = el('section');
const startBox = el('section');
const matrixBox = el('section');
const matrixMode = el('span', { className: 'row' });
const teamsBox = el('section');
const counters = el('section');
const bikes = el('section');
const candStatus = el('span', { className: 'note' }); // outlives render(): the status of the last "Tính hành lang" click
let computing = false;
let lastAttempt = 0; // throttles automatic retries (D11: recomputed by itself whenever the server holds no candidates)
let legResult: { ok: boolean; issues: LegIssueView[] } | null = null;
let showT = false; // §13.6: real time ⇄ T+ on each team's own clock
const notices: { level: 'error' | 'warning'; message: string; at: number }[] = [];
const drafts = new Map<string, string>(); // team id → what the Host typed in its start-time input (survives a rebuild)
const previews = new Map<string, { input: HTMLInputElement; out: HTMLElement }>();
const sigs = { status: '', leg: '', start: '' };

function addNotice(level: 'error' | 'warning', message: string) {
  notices.push({ level, message, at: Date.now() });
  drawNotices();
  setTimeout(drawNotices, hostPage.noticeMs + 50);
}
function drawNotices() {
  const live = notices.filter((n) => Date.now() - n.at < hostPage.noticeMs);
  notices.splice(0, notices.length, ...live);
  noticeBox.replaceChildren(...live.map((n) => el('div', { className: n.level === 'error' ? 'bad' : 'warn' }, n.message)));
}

function mainView() {
  const link = `${location.origin}/?race=${encodeURIComponent(race)}`;
  const modeBtn = (label: string, t: boolean) => el('button', { className: `small${showT === t ? ' sel' : ''}`, onclick: () => ((showT = t), drawModes(), state && render(state)) }, label);
  const drawModes = () => matrixMode.replaceChildren(modeBtn('Giờ thực', false), modeBtn('T+ (đồng hồ từng đội)', true));
  drawModes();
  sigs.status = sigs.leg = sigs.start = '';
  app.replaceChildren(
    el('h1', {}, `Cuộc đua Paris – Host · ${race}`),
    el('p', {}, 'Link cho người chơi: ', el('code', {}, link), ' ', el('button', { className: 'small', onclick: () => void navigator.clipboard?.writeText(link) }, 'Sao chép')),
    banner, noticeBox, err,
    el('h2', {}, 'Cuộc đua'), statusBox,
    el('h2', {}, 'Chặng'), legBox,
    el('h2', {}, 'Tạo đội'),
    el('section', {}, create, el('button', { onclick: createTeams }, 'Tạo đội & sinh mã')),
    el('h2', {}, 'Giờ xuất phát'), startBox,
    el('div', { className: 'row' }, el('h2', {}, 'Tiến trình & xếp hạng'), matrixMode), matrixBox,
    el('h2', {}, 'Các đội'), teamsBox,
    el('h2', {}, 'Hạn mức Cloudflare (ước tính)'), counters,
    el('h2', {}, 'Xe chung'), bikes,
  );
  drawNotices();
  if (state) render(state);
  else teamsBox.textContent = 'Đang chờ dữ liệu từ máy chủ…';
}

/** A bad line or a down socket must not eat what the Host typed: the textarea stays until host.state shows the new teams. */
function createTeams() {
  const { teams, error } = parseTeamLines(create.value, hostPage.colours, state?.teams.length ?? 0);
  if (error) return void (err.textContent = error);
  if (!teams.length) return;
  if (!send({ t: 'host.createTeams', teams })) return void (err.textContent = 'Đang mất kết nối, chưa gửi được. Nội dung vẫn còn trong ô nhập.');
  err.textContent = '';
  pending = (state?.teams.length ?? 0) + teams.length;
}

let graph: Promise<RoadGraph> | undefined;
/** 2.3 MB static asset + 27 ms decode, fetched on the first click only (docs/plans/phase6.md §2.4). */
function loadGraph() {
  return (graph ??= (async () => {
    const [{ RoadGraph, GRAPH_VERSION }, res] = await Promise.all([import('@race/shared/graph'), fetch(graphUrl)]);
    if (!res.ok) throw new Error(`roadgraph HTTP ${res.status}`);
    const file = (await res.json()) as RoadGraphFile;
    if (file.v !== GRAPH_VERSION) throw new Error(`roadgraph v${file.v} ≠ ${GRAPH_VERSION}`);
    return RoadGraph.decode(file);
  })().catch((e) => ((graph = undefined), Promise.reject(e))));
}

/** SPEC §3 / §6.2: corridors + candidate points are computed HERE (no A* in the Durable Object), which only picks among them.
 *  Route = start → every step's zone (both places of a detour) from `host.state.leg` (D11); checkpoints = every zone. */
async function sendCandidates() {
  const leg = state?.leg;
  if (!leg) return void (candStatus.textContent = 'Chưa nạp chặng nên chưa tính được hành lang.');
  const { points, checkpoints } = corridorPoints(leg);
  if (points.length < 2) return void (candStatus.textContent = 'Chặng chưa có đủ điểm (cần ≥ 2: xuất phát + đích) để tính hành lang.');
  computing = true;
  lastAttempt = Date.now();
  candStatus.textContent = 'Đang tải đồ thị đường và tính hành lang…';
  if (state) render(state);
  try {
    const [{ spawnCandidates }, g] = await Promise.all([spawnModule(), loadGraph()]);
    const { segments, decoys } = spawnCandidates(g, points, checkpoints, { corridorMeters: leg.vehicles.corridorMeters, minDistanceFromCheckpoint: leg.vehicles.minDistanceFromCheckpoint });
    const msg = { t: 'host.candidates', segments, decoys } as const;
    const bytes = JSON.stringify(msg).length;
    if (bytes > NET.maxHostBytes) throw new Error(`tin ${bytes} B vượt giới hạn ${NET.maxHostBytes} B`);
    candStatus.textContent = send(msg)
      ? `Đã gửi ${segments.reduce((n, s) => n + s.length / 2, 0)} ứng viên trên ${segments.length} đoạn + ${decoys.length / 2} điểm xe mồi (${(bytes / 1024).toFixed(1)} kB).`
      : 'Mất kết nối, chưa gửi được. Bấm lại khi đã nối.';
  } catch (e) {
    candStatus.textContent = `Không tính được: ${e instanceof Error ? e.message : String(e)}`;
  }
  computing = false;
  if (state) render(state);
}

/** D11: a leg loaded (or none computed yet: the server drops the old candidates when it loads a leg) → compute by itself. */
async function autoCandidates() {
  const s = state;
  if (!ws || computing || !s?.leg || s.spawning.candidates > 0 || Date.now() - lastAttempt < 10_000) return;
  await sendCandidates();
}

function loadLeg(msg: { id: string } | { json: string }) {
  if (!send({ t: 'host.leg', ...msg })) return void addNotice('error', 'Đang mất kết nối, chưa nạp được chặng.');
  legResult = null;
  lastAttempt = 0; // the server drops its candidates on every host.leg, even for the same id
}

function pickFile(input: HTMLInputElement) {
  const f = input.files?.[0];
  input.value = '';
  if (!f) return;
  if (f.size > hostPage.maxLegBytes) return void addNotice('error', `File chặng ${(f.size / 1024).toFixed(0)} KB, quá giới hạn ${hostPage.maxLegBytes / 1024} KB.`);
  void f.text().then((json) => loadLeg({ json }));
}

/** Rebuilds `box` only when `sig` changed (a button or input rewritten under the mouse every second would eat clicks and typing). */
function once(key: keyof typeof sigs, sig: string, build: () => void) {
  if (sigs[key] === sig) return;
  sigs[key] = sig;
  build();
}

function drawStatus(s: State) {
  once('status', JSON.stringify([s.status, s.leg?.id, s.leg?.issues, s.teams.map((t) => [t.name, t.startAt === null])]), () => {
    statusBox.replaceChildren(
      el('div', { className: 'row' }, 'Trạng thái: ', el('b', { className: `st-${s.status}` }, STATUS_LABEL[s.status]),
        ...statusButtons(s).map((b) =>
          el('button', { className: b.danger ? 'danger' : '', onclick: () => {
            const cur = state && statusButtons(state).find((x) => x.op === b.op);
            if (!cur || (cur.confirm && !confirm(cur.confirm))) return;
            if (!send({ t: 'host.race', op: b.op })) addNotice('error', 'Đang mất kết nối, chưa gửi được.');
          } }, b.label))),
      el('p', { className: 'note' }, 'Tạm dừng: đội vẫn đi lại được, đồng hồ vẫn chạy, thời gian tạm dừng không bị trừ.'),
    );
  });
}

function drawLeg(s: State) {
  once('leg', JSON.stringify([s.leg?.id, s.leg?.bundled, s.leg?.issues, s.status, s.teams.some((t) => t.startOrder !== null), legResult]), () => {
    const leg = s.leg;
    const locked = s.status !== 'lobby' || s.teams.some((t) => t.startOrder !== null);
    const sel = el('select', { disabled: locked }, ...(leg?.bundled ?? []).map((id) => el('option', { value: id, selected: id === leg?.id }, id)));
    const file = el('input', { type: 'file', accept: '.json,application/json', disabled: locked, onchange: () => pickFile(file) });
    const issues = legIssueLines([...(legResult?.issues ?? []), ...(legResult ? [] : (leg?.issues ?? []))]);
    legBox.replaceChildren(
      el('div', {}, leg ? el('b', {}, leg.title) : 'Chưa có chặng.', leg ? ` (mã ${leg.id}, múi giờ ${leg.timezone}, ${leg.steps.length} bước)` : ''),
      el('div', { className: 'row' }, 'Chặng có sẵn: ', sel, el('button', { disabled: locked, onclick: () => loadLeg({ id: sel.value }) }, 'Nạp'), ' hoặc file trên máy: ', file),
      locked ? el('p', { className: 'note' }, 'Chỉ nạp được khi cuộc đua chưa mở và chưa có đội nào vào game. Muốn đổi chặng: tạo cuộc đua mới (mã mới) → nạp chặng → tạo đội → phát mã → mở.') : '',
      legResult ? el('div', { className: legResult.ok ? 'on' : 'bad' }, legResult.ok ? 'Đã nạp chặng.' : 'Không nạp được chặng:') : '',
      ...(issues.length ? [el('ul', { className: 'issues' }, ...issues.map((i) => el('li', { className: i.level }, i.level === 'error' ? 'LỖI ' : i.level === 'warning' ? 'CẢNH BÁO ' : 'CÒN TRỐNG ', i.text)))] : []),
    );
  });
}

function drawStart(s: State) {
  const tz = s.leg?.timezone ?? 'Asia/Ho_Chi_Minh';
  const rows = startRows(s);
  once('start', JSON.stringify([tz, rows]), () => {
    previews.clear();
    const tbl = rows.map((r) => {
      const input = el('input', { type: 'datetime-local', step: '1', value: drafts.get(r.id) ?? r.input });
      input.addEventListener('input', () => (drafts.set(r.id, input.value), updatePreviews()));
      const out = el('span', { className: 'note preview' });
      previews.set(r.id, { input, out });
      const save = () => {
        const at = inputToMs(input.value, tz);
        if (at === null) return void addNotice('error', `${r.name}: chưa hiểu giờ đã nhập (cần ngày và giờ).`);
        if (send({ t: 'host.team', op: 'startAt', team: r.id, at })) drafts.delete(r.id);
        else addNotice('error', 'Đang mất kết nối, chưa gửi được.');
      };
      // short columns first, the wide input last: "Bước hiện tại" / "Phạt" stay visible at 1024 px (review: Host tables)
      return el('tr', {},
        el('td', {}, el('span', { className: 'dot', style: `background:${r.colour}` }), r.name),
        el('td', {}, r.stepLabel),
        el('td', {}, r.penalty),
        el('td', {}, r.startOrder),
        el('td', {}, r.joined),
        el('td', {}, input, ' ', el('button', { className: 'small', onclick: save }, 'Lưu'), ' ', el('button', { className: 'small', onclick: () => (drafts.delete(r.id), send({ t: 'host.team', op: 'startAt', team: r.id, at: 'now' })) }, 'Bây giờ'), ' ', el('button', { className: 'small', disabled: r.startAt === null, onclick: () => (drafts.delete(r.id), send({ t: 'host.team', op: 'startAt', team: r.id, at: null })) }, 'Xóa'), out),
      );
    });
    startBox.replaceChildren(
      el('p', { className: 'note' }, `Giờ nhập theo múi giờ của chặng: ${tz} (không phải múi giờ máy này). Đây là lúc đội nhận mật thư đầu tiên ngoài game.`),
      tbl.length ? el('div', { className: 'scroll' }, el('table', { className: 'pin' }, el('tr', {}, ...['Đội', 'Bước hiện tại', 'Phạt', 'Thứ tự vào', 'Vào game lúc', 'Giờ xuất phát'].map((t) => el('th', {}, t))), ...tbl)) : 'Chưa có đội nào.',
    );
    updatePreviews();
  });
}

/** "T+hh:mm:ss" under each input (the server's clock estimated now): a wrong time zone or day shows up before "Lưu". */
function updatePreviews() {
  const s = state;
  if (!s) return;
  const tz = s.leg?.timezone ?? 'Asia/Ho_Chi_Minh';
  const now = s.serverMs + (Date.now() - receivedAt);
  for (const [id, { input, out }] of previews) {
    const p = input.value ? startPreview(inputToMs(input.value, tz), now, s.teams.find((t) => t.id === id)?.finishAt ?? null) : null;
    out.textContent = p?.text ?? '';
    out.className = `note preview ${p?.level ?? ''}`;
  }
}

function drawMatrix(s: State, now: number) {
  const { head, rows } = progressTable(s, now, showT ? 't' : 'real');
  if (!rows.length) return void matrixBox.replaceChildren('Chưa có đội nào.');
  const th = (t: string, title = '') => el('th', { title }, t);
  // team (pinned) + ranking columns before the step columns: the result is readable at 1024 px without scrolling sideways
  matrixBox.replaceChildren(el('div', { className: 'scroll' }, el('table', { className: 'matrix pin' },
    el('tr', {}, th('Đội'), th('Hạng'), th('Chính thức'), th('Cách'), th('Phạt'), th('Về đích'), ...head.map((h) => th(h.label, h.title))),
    ...rows.map((r) => el('tr', {},
      el('td', {}, el('span', { className: 'dot', style: `background:${r.colour}` }), r.name),
      el('td', {}, r.rank), el('td', {}, r.official), el('td', {}, r.gap), el('td', {}, r.penalty), el('td', {}, r.finish),
      ...r.cells.map((c) => el('td', { className: `cell ${c.state}`, title: c.title }, c.text)),
    )),
  )));
}

function render(s: State) {
  const th = (...h: string[]) => el('tr', {}, ...h.map((t) => el('th', {}, t)));
  const now = s.serverMs + (Date.now() - receivedAt);
  banner.replaceChildren(...warnings(s).map((w) => el('div', {}, w)));
  drawStatus(s);
  drawLeg(s);
  drawStart(s);
  updatePreviews();
  drawMatrix(s, now);
  const rows = teamRows(s, now).map((r) =>
    el('tr', {},
      el('td', {}, el('span', { className: 'dot', style: `background:${r.colour}` }), r.name),
      el('td', {}, el('code', {}, r.code), ' ', el('button', { className: 'small', onclick: () => void navigator.clipboard?.writeText(r.code) }, 'Sao chép')),
      el('td', {}, r.player),
      el('td', { className: r.status === 'online' ? 'on' : 'off' }, r.status === 'online' ? 'Online' : 'Offline'),
      el('td', {}, r.lastSeen),
      el('td', {}, String(r.reconnects)),
      el('td', {}, r.position),
      el('td', { className: 'flag' }, r.flagged ? 'Vượt tốc' : ''),
      el('td', {}, r.pos ? el('button', { className: 'small', title: 'Đặt một xe chung cạnh đội này', onclick: () => send({ t: 'host.bike', op: 'add', x: r.pos!.x + hostPage.addBikeOffset, z: r.pos!.z }) }, 'Thêm xe') : ''),
    ),
  );
  teamsBox.replaceChildren(rows.length ? el('table', {}, th('Đội', 'Mã đội', 'Người chơi', 'Trạng thái', 'Lần cuối', 'Vào lại', 'Vị trí (lat, lon)', '', 'Xe'), ...rows) : 'Chưa có đội nào.');
  counters.replaceChildren(el('dl', {}, ...counterLines(s).flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)])));
  const paused = s.spawning.paused;
  bikes.replaceChildren(
    el('div', { className: 'row' },
      `Đặt xe tự động: ${paused ? 'đang tạm dừng' : 'đang chạy'} · ứng viên: ${s.spawning.candidates}`,
      el('button', { className: 'small', onclick: () => send({ t: 'host.spawning', paused: !paused }) }, paused ? 'Tiếp tục' : 'Tạm dừng'),
    ),
    el('div', { className: 'row' }, el('button', { disabled: computing, onclick: () => void sendCandidates() }, 'Tính hành lang & gửi ứng viên'), candStatus),
  );
}

// ponytail: rewrites the tables once per refreshMs (keeps "x giây trước" running), no diffing; fine for ≤ 100 teams.
// Inputs and buttons (status, leg, start times) are rebuilt only when their data changes (`once`).
setInterval(() => state && teamsBox.isConnected && render(state), hostPage.refreshMs);

if (q.has('demo')) {
  state = demoState(Date.now());
  receivedAt = Date.now();
  mainView();
} else loginView();
// DEV / tests: the page can be read back without a server.
(globalThis as { __READY__?: boolean }).__READY__ = true;
