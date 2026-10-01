// Minimal Host page (docs/plans/phase6.md §3.19, `/host.html`): password login → create teams → team codes, online
// status, last positions, estimated quota counters, bike-spawn pause. Phase 10 replaces it with SPEC §13.
// ponytail: no spawn-candidate button yet (needs C's spawnCandidates + A's HostState.steps); full dashboard in Phase 10.
import type { ClientMessage, HostState, ServerMessage } from '@race/shared/protocol';
import { hostPage, net } from '../config.ts';
import './host.css';
import { counterLines, demoState, parseTeamLines, teamRows } from './hostView.ts';

const q = new URLSearchParams(location.search);
const app = document.getElementById('app')!;

// ponytail: props are untyped (Partial<HTMLElementTagNameMap[K]> is a union too big for tsc); `style` strings forward to cssText.
function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  Object.assign(e, props);
  e.append(...kids);
  return e;
}

let state: HostState | null = null;
let ws: WebSocket | null = null;
let race = q.get('race') ?? net.defaultRace;
const send = (m: ClientMessage) => ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify(m));

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

function connect(token: string) {
  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${net.apiBase}/race/${encodeURIComponent(race)}/ws?token=${encodeURIComponent(token)}`;
  ws = new WebSocket(url);
  ws.onmessage = (e) => {
    const m = JSON.parse(String(e.data)) as ServerMessage;
    if (!Array.isArray(m) && m.t === 'host.state') render((state = m));
  };
  ws.onclose = (e) => {
    if (e.code === 4401) return void ((err.textContent = 'Phiên hết hạn, đăng nhập lại.'), loginView());
    err.textContent = 'Mất kết nối, đang nối lại…';
    setTimeout(() => connect(token), hostPage.reconnectMs);
  };
  ws.onopen = () => (err.textContent = '');
}

// ── main view ──
const create = el('textarea', { placeholder: 'Mỗi dòng một đội: Tên đội; Tên người chơi\nĐội Xanh; An\nĐội Đỏ; Bình' });
const teamsBox = el('section');
const counters = el('section');
const bikes = el('section');

function mainView() {
  const link = `${location.origin}/?race=${encodeURIComponent(race)}`;
  app.replaceChildren(
    el('h1', {}, `Cuộc đua Paris – Host · ${race}`),
    el('p', {}, 'Link cho người chơi: ', el('code', {}, link), ' ', el('button', { className: 'small', onclick: () => void navigator.clipboard?.writeText(link) }, 'Sao chép')),
    el('h2', {}, 'Tạo đội'),
    el('section', {}, create, el('button', { onclick: () => {
      const teams = parseTeamLines(create.value, hostPage.colours, state?.teams.length ?? 0);
      if (teams.length) (send({ t: 'host.createTeams', teams }), (create.value = ''));
    } }, 'Tạo đội & sinh mã')),
    err,
    el('h2', {}, 'Các đội'), teamsBox,
    el('h2', {}, 'Hạn mức Cloudflare (ước tính)'), counters,
    el('h2', {}, 'Xe chung'), bikes,
  );
  if (state) render(state);
  else teamsBox.textContent = 'Đang chờ dữ liệu từ máy chủ…';
}

function render(s: HostState) {
  const th = (...h: string[]) => el('tr', {}, ...h.map((t) => el('th', {}, t)));
  const rows = teamRows(s).map((r) =>
    el('tr', {},
      el('td', {}, el('span', { className: 'dot', style: `background:${r.colour}` }), r.name),
      el('td', {}, el('code', {}, r.code), ' ', el('button', { className: 'small', onclick: () => void navigator.clipboard?.writeText(r.code) }, 'Sao chép')),
      el('td', {}, r.player),
      el('td', { className: r.status === 'online' ? 'on' : 'off' }, r.status === 'online' ? 'Online' : 'Offline'),
      el('td', {}, r.lastSeen),
      el('td', {}, String(r.reconnects)),
      el('td', {}, r.position),
      el('td', { className: 'flag' }, r.flagged ? 'Vượt tốc' : ''),
    ),
  );
  teamsBox.replaceChildren(rows.length ? el('table', {}, th('Đội', 'Mã đội', 'Người chơi', 'Trạng thái', 'Lần cuối', 'Vào lại', 'Vị trí (lat, lon)', ''), ...rows) : 'Chưa có đội nào.');
  counters.replaceChildren(el('dl', {}, ...counterLines(s).flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)])));
  const paused = s.spawning.paused;
  bikes.replaceChildren(
    el('div', { className: 'row' },
      `Đặt xe tự động: ${paused ? 'đang tạm dừng' : 'đang chạy'} · ứng viên: ${s.spawning.candidates}`,
      el('button', { className: 'small', onclick: () => send({ t: 'host.spawning', paused: !paused }) }, paused ? 'Tiếp tục' : 'Tạm dừng'),
    ),
  );
}

// ponytail: rewrites the tables once per refreshMs (also keeps "x giây trước" fresh), no diffing; fine for ≤ 100 teams.
setInterval(() => state && teamsBox.isConnected && render(state), hostPage.refreshMs);

if (q.has('demo')) {
  state = demoState();
  mainView();
} else loginView();
// DEV / tests: the page can be read back without a server.
(globalThis as { __READY__?: boolean }).__READY__ = true;
