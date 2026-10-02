// Minimal Host page (docs/plans/phase6.md §3.19, `/host.html`; Phase 7 track E adds the race controls): password login → leg
// loading → teams, start times → race status → step_progress matrix + ranking, quota counters, shared bikes. Phase 10 replaces
// it with SPEC §13.
import type { RoadGraph, RoadGraphFile } from '@race/shared/graph';
import graphUrl from '@race/shared/data/roadgraph.json?url';
import { CLOSE, MEDIA, NET, type ClientMessage, type HostState, type LegIssueView, type ServerMessage } from '@race/shared/protocol';
import { hostPage, net } from '../config.ts';
import './host.css';
import { checkMediaFile, corridorPoints, counterLines, demoState, freshAlerts, freshQueue, inputToMs, legIssueLines, legPenaltyLine, louvreLines, mediaErrorText, mediaNames, mediaPath, parseTeamLines, progressTable, queueRows, queueSig, reviewMessage, startPreview, startRows, STATUS_LABEL, statusButtons, stuckAlerts, teamRows, warnings, withLouvreDemo } from './hostView.ts';

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
let hostToken = ''; // Authorization of the R2 image requests (D14); '' = demo / not logged in
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
  hostToken = token;
  const url =`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${net.apiBase}/race/${encodeURIComponent(race)}/ws?token=${encodeURIComponent(token)}`;
  ws = new WebSocket(url);
  ws.onmessage = (e) => {
    if (e.data === NET.pong) return;
    const m = JSON.parse(String(e.data)) as ServerMessage;
    if (Array.isArray(m)) return;
    if (m.t === 'host.notice') return void addNotice(m.level, m.message);
    if (m.t === 'host.legResult') return void ((legResult = m), (sigs.leg = ''), state && render(state));
    if (m.t !== 'host.state') return;
    receivedAt = Date.now();
    soundNewQueue((state = m));
    render(m);
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
const mediaBox = el('section');
const queueHead = el('h2');
const notifyBtn = el('button', { className: 'small', onclick: () => void askNotify() });
const queueBox = el('section', { className: 'review-list' });
/** "Chờ duyệt (n)": sticky at the top while something waits (D16 (1)). */
const queueWrap = el('div', { className: 'queue-wrap' }, el('div', { className: 'row' }, queueHead, notifyBtn), queueBox);
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
const sigs = { status: '', leg: '', start: '', queue: '', matrix: '', media: '' };

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
  sigs.status = sigs.leg = sigs.start = sigs.queue = sigs.matrix = sigs.media = '';
  drawNotify();
  app.replaceChildren(
    el('h1', {}, `Cuộc đua Paris – Host · ${race}`),
    el('p', {}, 'Link cho người chơi: ', el('code', {}, link), ' ', el('button', { className: 'small', onclick: () => void navigator.clipboard?.writeText(link) }, 'Sao chép')),
    banner, noticeBox, err, queueWrap,
    el('h2', {}, 'Cuộc đua'), statusBox,
    el('h2', {}, 'Chặng'), legBox,
    el('h2', {}, 'Hình mật thư (R2)'), mediaBox,
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
  once('leg', JSON.stringify([s.leg?.id, s.leg?.bundled, s.leg?.issues, s.leg?.penalties, s.leg?.stuckMinutes, s.status, s.teams.some((t) => t.startOrder !== null), legResult]), () => {
    const leg = s.leg;
    const locked = s.status !== 'lobby' || s.teams.some((t) => t.startOrder !== null);
    const sel = el('select', { disabled: locked }, ...(leg?.bundled ?? []).map((id) => el('option', { value: id, selected: id === leg?.id }, id)));
    const file = el('input', { type: 'file', accept: '.json,application/json', disabled: locked, onchange: () => pickFile(file) });
    const issues = legIssueLines([...(legResult?.issues ?? []), ...(legResult ? [] : (leg?.issues ?? []))]);
    legBox.replaceChildren(
      el('div', {}, leg ? el('b', {}, leg.title) : 'Chưa có chặng.', leg ? ` (mã ${leg.id}, múi giờ ${leg.timezone}, ${leg.steps.length} bước)` : ''),
      leg ? el('div', { className: 'note' }, legPenaltyLine(leg)) : '',
      ...(leg ? louvreLines(leg).map((l) => el('div', { className: 'note' }, l)) : []),
      el('div', { className: 'row' }, 'Chặng có sẵn: ', sel, el('button', { disabled: locked, onclick: () => loadLeg({ id: sel.value }) }, 'Nạp'), ' · Nạp chặng từ file: ', file),
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

/** Review buttons: after one press the group stays off for hostPage.reviewLockMs (the answer leaves the queue when host.state
 *  arrives; a double click is idempotent on the server). A down socket keeps them on and says so. */
function fire(msg: ClientMessage, group: HTMLButtonElement[]) {
  if (!send(msg)) return void addNotice('error', 'Đang mất kết nối, chưa gửi được.');
  for (const b of group) b.disabled = true;
  setTimeout(() => group.forEach((b) => (b.disabled = false)), hostPage.reviewLockMs);
}

const cellTexts: HTMLElement[][] = []; // matrix: per team row, per step: the text span (rewritten every second; the buttons are not)
function drawMatrix(s: State, now: number) {
  const { head, rows } = progressTable(s, now, showT ? 't' : 'real');
  if (!rows.length) return void ((sigs.matrix = ''), matrixBox.replaceChildren('Chưa có đội nào.'));
  const th = (t: string, title = '', className = '') => el('th', { title, className }, t);
  // Buttons in cells (D16 (3)): the table is rebuilt only when something but the running clocks changed, else a click that
  // lands while it is rebuilt is lost. The clocks ("chờ duyệt mm:ss", "⏳ mm:ss") are written in place below.
  const sig = JSON.stringify([head, rows.map((r) => [r.team, r.name, r.colour, r.rank, r.official, r.gap, r.penalty, r.approvalWait, r.finish, r.cells.map((c) => [c.state, c.title, c.buttons])])]);
  once('matrix', sig, () => {
    cellTexts.length = 0;
    // team (pinned) + ranking columns before the step columns: the result is readable at 1024 px without scrolling sideways
    matrixBox.replaceChildren(el('div', { className: 'scroll' }, el('table', { className: 'matrix pin' },
      el('tr', {}, th('Đội'), th('Hạng'), th('Chính thức'), th('Cách'), th('Phạt'), th('Bù giờ chờ duyệt', 'Tổng thời gian đội chờ Host duyệt (trừ khỏi giờ chính thức khi chặng không tính thời gian chờ)', 'wrap'), th('Về đích'), ...head.map((h) => th(h.label, h.title))),
      ...rows.map((r) => {
        const texts: HTMLElement[] = [];
        cellTexts.push(texts);
        return el('tr', {},
          el('td', {}, el('span', { className: 'dot', style: `background:${r.colour}` }), r.name),
          el('td', {}, r.rank), el('td', {}, r.official), el('td', {}, r.gap), el('td', {}, r.penalty), el('td', {}, r.approvalWait), el('td', {}, r.finish),
          ...r.cells.map((c) => {
            const text = el('span', {}, c.text);
            texts.push(text);
            const td = el('td', { className: `cell ${c.state}`, title: c.title }, text);
            const group: HTMLButtonElement[] = [];
            for (const b of c.buttons) {
              const btn = el('button', { className: `small ${b.op === 'approve' ? 'ok' : 'danger'}`, title: b.title, onclick: () => { if (!b.confirm || confirm(b.confirm)) fire(reviewMessage(b.team, b.step, b.op, b.id, ''), group); } }, b.label);
              group.push(btn);
              td.append(el('div', {}, btn));
            }
            return td;
          }),
        );
      }),
    )));
  });
  rows.forEach((r, ri) => r.cells.forEach((c, ci) => { const t = cellTexts[ri]?.[ci]; if (t && t.textContent !== c.text) t.textContent = c.text; }));
}

// ── Phase 8 (docs/plans/phase8.md D16, track E): review queue, sounds, notifications, stuck teams, R2 images ──

let actx: AudioContext | null = null;
/** A beep needs an AudioContext started by a user gesture: the first click / key (the login) does it. */
const unlockAudio = () => { try { actx ??= new AudioContext(); void actx.resume(); } catch { /* no audio: the banner and the queue still show */ } };
for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, unlockAudio, { once: true });
/** queue = a rising pair; stuck = four falling beeps (SPEC §8.9 (6) / D11). */
function beep(kind: 'queue' | 'stuck') {
  if (!actx || actx.state !== 'running') return;
  const notes = kind === 'queue' ? [880, 1320] : [520, 390, 520, 390];
  const t = actx.currentTime;
  const g = actx.createGain();
  g.gain.setValueAtTime(hostPage.beepVolume, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + notes.length * 0.18 + 0.1);
  g.connect(actx.destination);
  notes.forEach((f, i) => {
    const o = actx!.createOscillator();
    o.frequency.value = f;
    o.connect(g);
    o.start(t + i * 0.18);
    o.stop(t + i * 0.18 + 0.15);
  });
}
const canNotify = () => typeof Notification !== 'undefined';
function notify(title: string, body: string, tag: string) {
  if (!canNotify() || Notification.permission !== 'granted') return;
  try { new Notification(title, { body, tag }); } catch { /* some mobile browsers only allow it from a service worker */ }
}
function drawNotify() {
  const p = canNotify() ? Notification.permission : 'unsupported';
  notifyBtn.textContent = p === 'granted' ? 'Thông báo: đã bật' : p === 'denied' ? 'Thông báo bị chặn (mở khóa trong cài đặt trình duyệt)' : p === 'unsupported' ? 'Trình duyệt không có thông báo' : 'Bật thông báo';
  notifyBtn.disabled = p !== 'default';
}
async function askNotify() {
  unlockAudio();
  if (canNotify()) await Notification.requestPermission().catch(() => null);
  drawNotify();
}

const seenQueue = new Set<string>(); // team|step|id of every answer seen so far: only a new one sounds
let queueBaseline = true; // the first state of a page load is not "new"
const noteDrafts = new Map<string, string>(); // queue key → the Host's note box (survives a rebuild of the queue)
const queueWaits = new Map<string, HTMLElement>(); // queue key → its "chờ mm:ss" (ticks every second)
function soundNewQueue(s: State) {
  const fresh = freshQueue(seenQueue, queueRows(s, s.serverMs), queueBaseline);
  queueBaseline = false;
  if (!fresh.length || !hostPage.queueBeep) return;
  beep('queue');
  for (const r of fresh) notify(`${r.name}: chờ duyệt`, `${r.label}${r.branchName ? ` (nhánh ${r.branchName})` : ''} · ${r.text ? `«${r.text}»` : 'đã gửi bài qua Messenger'}`, r.key);
}

function drawQueue(s: State, now: number) {
  const rows = queueRows(s, now);
  queueHead.textContent = `Chờ duyệt (${rows.length})`;
  queueWrap.classList.toggle('has', rows.length > 0);
  once('queue', queueSig(s), () => {
    queueWaits.clear();
    queueBox.replaceChildren(...rows.map((r) => {
      const note = el('textarea', { rows: 1, maxLength: NET.noteMax, placeholder: 'Ghi chú của Host (đội không thấy)', value: noteDrafts.get(r.key) ?? r.note });
      note.addEventListener('input', () => noteDrafts.set(r.key, note.value));
      const wait = el('b', {}, r.waiting);
      queueWaits.set(r.key, wait);
      const group: HTMLButtonElement[] = [];
      const btn = (label: string, className: string, op: 'approve' | 'penalize' | 'note') => {
        const b = el('button', { className, onclick: () => {
          fire(reviewMessage(r.team, r.step, op, op === 'note' ? undefined : r.id, note.value), group);
          if (op !== 'note') noteDrafts.delete(r.key); // the answer leaves the queue; the note went with the decision
        } }, label);
        group.push(b);
        return b;
      };
      return el('div', { className: 'review' },
        el('div', { className: 'row' },
          el('span', { className: 'dot', style: `background:${r.colour}` }), el('b', {}, r.name), ` · ${r.label}${r.branchName ? ` · nhánh ${r.branchName}` : ''} · mã `,
          el('code', { className: 'code' }, r.code), el('button', { className: 'small', onclick: () => void navigator.clipboard?.writeText(r.code) }, 'Sao chép'), ' · chờ ', wait),
        el('div', { className: 'answer' }, r.text ? `«${r.text}»` : 'Đội báo đã gửi bài qua Messenger (đối chiếu ảnh với mã trên).'),
        r.reference.length ? el('div', { className: 'ref' }, el('b', {}, 'Đáp án tham khảo: '), r.reference.join(' | ')) : '',
        el('div', { className: 'row' }, note, btn('Duyệt', 'ok', 'approve'), btn(`Phạt ${String(r.lockMinutes).replace('.', ',')} phút`, 'danger', 'penalize'), btn('Lưu ghi chú', 'small', 'note')),
      );
    }));
  });
  for (const r of rows) {
    const w = queueWaits.get(r.key);
    if (w && w.textContent !== r.waiting) w.textContent = r.waiting;
  }
}

const alerted = new Map<string, number>(); // team|step → the stuck period already sounded (D11: tải lại trang thì báo lại một lần)
/** Red lines for the stuck teams + one beep / Notification per team and period. */
function stuckLines(s: State, now: number): string[] {
  const alerts = stuckAlerts(s, now);
  const fresh = freshAlerts(alerted, alerts, hostPage.alertRepeat);
  if (fresh.length) {
    beep('stuck');
    for (const a of fresh) notify('Đội làm lâu một thử thách', a.text, `stuck|${a.key}`);
  }
  return alerts.map((a) => `⏰ ${a.text}`);
}

type MediaStat = { s: 'checking' | 'ok' | 'missing' | 'error'; size?: number; msg?: string };
const mediaStat = new Map<string, MediaStat>();
const mediaEls = new Map<string, HTMLElement>();
const mediaUrl = (name: string) => mediaPath(net.apiBase, race, name);
const auth = () => ({ Authorization: `Bearer ${hostToken}` });
function paintMedia(name: string) {
  const m = mediaStat.get(name);
  const e = mediaEls.get(name);
  if (!e) return;
  e.textContent = !m ? '…' : m.s === 'checking' ? 'đang kiểm tra…' : m.s === 'ok' ? `✓ đã có${m.size ? ` (${Math.max(1, Math.round(m.size / 1024))} KB)` : ''}` : m.s === 'missing' ? '✗ chưa tải lên' : `? ${m.msg ?? 'lỗi'}`;
  e.className = m?.s === 'ok' ? 'on' : m?.s === 'missing' ? 'bad' : 'warn';
}
/** HEAD one image: exists? `quiet` = a periodic re-check of a missing one (no "đang kiểm tra" flicker). */
async function headMedia(name: string, quiet = false) {
  if (!hostToken) return; // demo: statuses are canned
  if (!quiet) (mediaStat.set(name, { s: 'checking' }), paintMedia(name));
  try {
    const r = await fetch(mediaUrl(name), { method: 'HEAD', headers: auth() });
    mediaStat.set(name, r.ok ? { s: 'ok', size: Number(r.headers.get('Content-Length')) || undefined } : r.status === 404 ? { s: 'missing' } : { s: 'error', msg: mediaErrorText(r.status) });
  } catch {
    mediaStat.set(name, { s: 'error', msg: 'Không kết nối được máy chủ.' });
  }
  paintMedia(name);
}
async function uploadMedia(name: string, file: File) {
  const bad = checkMediaFile(file);
  if (bad) return void addNotice('error', `${name}: ${bad}`);
  mediaStat.set(name, { s: 'checking' });
  paintMedia(name);
  try {
    const r = await fetch(mediaUrl(name), { method: 'PUT', headers: { ...auth(), 'Content-Type': file.type }, body: file });
    if (!r.ok) addNotice('error', `${name}: ${mediaErrorText(r.status)}`);
  } catch {
    addNotice('error', `${name}: không kết nối được máy chủ.`);
  }
  await headMedia(name);
}
async function viewMedia(name: string) {
  const w = window.open('', '_blank'); // opened now (a click), filled when the image arrives: a popup blocker allows only the first
  try {
    const r = await fetch(mediaUrl(name), { headers: auth() });
    if (!r.ok) throw new Error(mediaErrorText(r.status));
    const url = URL.createObjectURL(await r.blob());
    if (w) w.location.href = url;
    else window.open(url, '_blank');
  } catch (e) {
    w?.close();
    addNotice('error', `${name}: ${e instanceof Error ? e.message : 'không xem được hình'}`);
  }
}
function drawMedia(s: State) {
  const names = mediaNames(s);
  for (const n of names) if (!mediaStat.has(n)) void headMedia(n);
  once('media', names.join('|'), () => {
    mediaEls.clear();
    mediaBox.replaceChildren(
      el('p', { className: 'note' }, `Hình của chặng ("r2:<tên>") tải lên theo từng cuộc đua (mã ${race}): đổi mã cuộc đua thì tải lại. Tối đa ${MEDIA.maxBytes / 1048576} MB, jpg / png / webp; chỉ đội đã mở mật thư đó mới xem được. Tải lại hình cùng tên (sửa hình sai): đội đã xem phải tải lại trang (F5) mới thấy hình mới.`),
      ...(names.length ? [el('div', { className: 'media-grid' }, ...names.map((n) => {
        const status = el('span', {});
        mediaEls.set(n, status);
        const file = el('input', { type: 'file', accept: MEDIA.types.join(','), disabled: !hostToken, onchange: () => { const f = file.files?.[0]; file.value = ''; if (f) void uploadMedia(n, f); } });
        return el('div', { className: 'row' }, el('code', { className: 'code' }, n), status, file, el('button', { className: 'small', disabled: !hostToken, onclick: () => void viewMedia(n) }, 'Xem'));
      }))] : [el('p', { className: 'note' }, 'Chặng này không có hình tải lên (không có "r2:…").')]),
    );
    for (const n of names) paintMedia(n);
  });
}
setInterval(() => {
  if (document.hidden || !state) return;
  for (const n of mediaNames(state)) if (mediaStat.get(n)?.s === 'missing') void headMedia(n, true);
}, hostPage.mediaHeadRetryMs);

function render(s: State) {
  const th = (...h: string[]) => el('tr', {}, ...h.map((t) => el('th', {}, t)));
  const now = s.serverMs + (Date.now() - receivedAt);
  banner.replaceChildren(...[...warnings(s), ...stuckLines(s, now)].map((w) => el('div', {}, w)));
  drawQueue(s, now);
  drawStatus(s);
  drawLeg(s);
  drawMedia(s);
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
  state = q.has('louvre') ? withLouvreDemo(demoState(Date.now())) : demoState(Date.now());
  receivedAt = Date.now();
  soundNewQueue(state); // the baseline: the demo queue is not "new"
  mediaStat.set('test-gia.jpg', { s: 'ok', size: 245_760 }); // canned (no server): one image uploaded, one missing
  mediaStat.set('test-gia-2.jpg', { s: 'missing' });
  mainView();
} else loginView();
// DEV / tests: the page can be read back without a server.
(globalThis as { __READY__?: boolean }).__READY__ = true;
