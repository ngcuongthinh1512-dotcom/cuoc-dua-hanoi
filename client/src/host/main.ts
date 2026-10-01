// Minimal Host page (docs/plans/phase6.md §3.19, `/host.html`): password login → create teams → team codes, online
// status, last positions, estimated quota counters, shared bikes (candidates, manual add, pause). Phase 10 replaces it with SPEC §13.
import type { RoadGraph, RoadGraphFile } from '@race/shared/graph';
import graphUrl from '@race/shared/data/roadgraph.json?url';
import { CLOSE, NET, type ClientMessage, type HostState, type ServerMessage } from '@race/shared/protocol';
import { hostPage, net } from '../config.ts';
import './host.css';
import { counterLines, demoState, parseTeamLines, teamRows } from './hostView.ts';

/** Phase 6 track A adds `steps` (start + step destinations, world m) to host.state; optional so older servers still work. */
type State = HostState & { steps?: { id: string; x: number; z: number }[] };
type XZ = { x: number; z: number };
type SpawnCandidates = (g: RoadGraph, points: XZ[], checkpoints: XZ[], rules: typeof hostPage.corridor) => { segments: number[][]; decoys: number[] };
// ponytail: glob instead of a static import so this page builds before track C's spawnCandidates.ts is merged (empty until then);
// after the merge: `import { spawnCandidates } from './spawnCandidates.ts'` and call it directly.
const spawnModule = Object.values(import.meta.glob<{ spawnCandidates: SpawnCandidates }>('./spawnCandidates.ts'))[0];

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
    if (Array.isArray(m) || m.t !== 'host.state') return;
    receivedAt = Date.now();
    render((state = m));
    if (pending && m.teams.length >= pending) (create.value = ''), (pending = 0);
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
const teamsBox = el('section');
const counters = el('section');
const bikes = el('section');
const candStatus = el('span', { className: 'note' }); // outlives render(): the status of the last "Tính hành lang" click
let computing = false;

function mainView() {
  const link = `${location.origin}/?race=${encodeURIComponent(race)}`;
  app.replaceChildren(
    el('h1', {}, `Cuộc đua Paris – Host · ${race}`),
    el('p', {}, 'Link cho người chơi: ', el('code', {}, link), ' ', el('button', { className: 'small', onclick: () => void navigator.clipboard?.writeText(link) }, 'Sao chép')),
    el('h2', {}, 'Tạo đội'),
    el('section', {}, create, el('button', { onclick: createTeams }, 'Tạo đội & sinh mã')),
    err,
    el('h2', {}, 'Các đội'), teamsBox,
    el('h2', {}, 'Hạn mức Cloudflare (ước tính)'), counters,
    el('h2', {}, 'Xe chung'), bikes,
  );
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

/** SPEC §3 / §6.2: corridors + candidate points are computed HERE (no A* in the Durable Object), which only picks among them. */
async function sendCandidates() {
  const steps = state?.steps;
  if (!spawnModule) return void (candStatus.textContent = 'Thiếu spawnCandidates.ts (chưa ghép Track C).');
  if (!steps || steps.length < 2) return void (candStatus.textContent = 'Chặng chưa có đủ điểm (cần ≥ 2: xuất phát + đích) để tính hành lang.');
  computing = true;
  candStatus.textContent = 'Đang tải đồ thị đường và tính hành lang…';
  if (state) render(state);
  try {
    const [{ spawnCandidates }, g] = await Promise.all([spawnModule(), loadGraph()]);
    const { segments, decoys } = spawnCandidates(g, steps.map(({ x, z }) => ({ x, z })), [], hostPage.corridor);
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

function render(s: State) {
  const th = (...h: string[]) => el('tr', {}, ...h.map((t) => el('th', {}, t)));
  const now = s.serverMs + (Date.now() - receivedAt);
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
setInterval(() => state && teamsBox.isConnected && render(state), hostPage.refreshMs);

if (q.has('demo')) {
  state = demoState();
  mainView();
} else loginView();
// DEV / tests: the page can be read back without a server.
(globalThis as { __READY__?: boolean }).__READY__ = true;
