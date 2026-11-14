// Minimal Host page (docs/plans/phase6.md §3.19, `/host.html`; Phase 7 track E adds the race controls): password login → leg
// loading → teams, start times → race status → step_progress matrix + ranking, quota counters, shared bikes. Phase 10 replaces
// it with SPEC §13.
import type { RoadGraph, RoadGraphFile } from '@race/shared/graph';
import graphUrl from '@race/shared/data/roadgraph.json?url';
import { CLOSE, MEDIA, NET, type ClientMessage, type HostState, type LegIssueView, type ServerMessage } from '@race/shared/protocol';
import { hostPage, net } from '../config.ts';
import './host.css';
import { cetiqloLines, withAutoDemo, missingFixedTeams, checkMediaFile, corridorPoints, counterLines, demoExportText, demoState, exportConfirm, exportFileName, fetchExport, freshAlerts, freshQueue, legIssueLines, finishPenaltyMessage, legPenaltyLine, mediaErrorText, mediaNames, mediaPath, parseTeamLines, progressTable, queueRows, queueSig, reviewMessage, startRows, STATUS_LABEL, statusButtons, stuckAlerts, teamRows, undoMessage, undoRows, warnings, type ExportFormat, type ExportResult } from './hostView.ts';
import type { HostMap } from './hostMap.ts';
import { demoTick, withMapDemo } from './hostMapData.ts';

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
    el('h1', {}, 'Cuộc đua Hà Nội – Host'),
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
    if (Array.isArray(m)) return void hostMap?.tick(m); // SPEC §17.41: a tick of every online team (5 Hz while one moves)
    if (m.t === 'host.notice') return void addNotice(m.level, m.message);
    if (m.t === 'host.legResult') return void ((legResult = m), (sigs.leg = ''), state && render(state));
    if (m.t !== 'host.state') return;
    receivedAt = Date.now();
    soundNewQueue((state = m));
    render(m);
    hostMap?.update(m);
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
const queueHead = el('summary');
const notifyBtn = el('button', { className: 'small', onclick: () => void askNotify() });
const queueBox = el('section', { className: 'review-list' });
/** Phase 10: the queue folds (a <details>, open at every page load). Its summary is just "Chờ duyệt (n)": a button INSIDE a summary
 *  would fold the frame, so "Bật thông báo" is a sibling that host.css lays over the summary row. */
const queueDetails = el('details', { open: true }, queueHead, queueBox);
/** Phase 10 (V2): the "Hoàn tác (còn n s)" lines. Outside the <details>, so folding the queue never hides a button that has 10 s to live. */
const undoBar = el('div', { className: 'undo-bar' });
/** "Chờ duyệt (n)" + the undo lines: sticky at the top while something waits or can be undone (D16 (1)). */
const queueWrap = el('div', { className: 'queue-wrap' }, queueDetails, notifyBtn, undoBar);
// review fix (e2e F5): the matrix box's max-height subtracts this (host.css .matrix-wrap), so both fit an 800 px screen
new ResizeObserver(() => document.documentElement.style.setProperty('--queue-h', `${queueWrap.offsetHeight}px`)).observe(queueWrap);
const teamsBox = el('section');
/** "Điều hành" at a glance: online / finished / waiting for review / flagged (numbers only, rewritten by render()). */
const statsBar = el('div', { className: 'stats' });
const counters = el('section');
const bikes = el('section');
const candStatus = el('span', { className: 'note' }); // outlives render(): the status of the last "Tính hành lang" click
/** SPEC §17.40: one line under the player link: the spectator code + Sao chép + Đổi mã + how many are watching (drawSpectators). */
const specBox = el('p');
/** Leg 3 CETIQLO: queue + running match per room (read-only, cetiqloLines). */
const cqBox = el('div', { className: 'note' });
let specSig = '';
let computing = false;
let lastAttempt = 0; // throttles automatic retries (D11: recomputed by itself whenever the server holds no candidates)
let legResult: { ok: boolean; issues: LegIssueView[] } | null = null;
const notices: { level: 'error' | 'warning'; message: string; at: number }[] = [];
const sigs = { status: '', leg: '', start: '', queue: '', undo: '', matrix: '', media: '' };

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
  sigs.status = sigs.leg = sigs.start = sigs.queue = sigs.undo = sigs.matrix = sigs.media = '';
  drawNotify();
  const TABS = [['run', 'Điều hành'], ['setup', 'Thiết lập'], ['sys', 'Hệ thống']] as const;
  type Tab = (typeof TABS)[number][0];
  const saved = ((): string | null => { try { return sessionStorage.getItem('host-tab'); } catch { return null; } })();
  let tab: Tab = TABS.some(([k]) => k === saved) ? (saved as Tab) : state?.status === 'lobby' ? 'setup' : 'run'; // before the start: the setup; once racing: the live view
  const panels: Record<Tab, HTMLElement> = {
    run: el('div', { className: 'tab-panel' }, statsBar, statusBox, el('h2', {}, 'Tiến trình & xếp hạng (theo thứ tự về đích)'), matrixBox, el('h2', {}, 'Phạt vạch đích & thứ tự vào game'), startBox, el('h2', {}, 'Các đội'), teamsBox),
    setup: el('div', { className: 'tab-panel' },
      el('h2', {}, 'Tạo đội'),
      el('section', {}, el('button', { onclick: createFixedTeams, title: 'Tên và màu đã cố định (Hai Long 🐉, Chị 6, Pha hồn mông…): chỉ sinh mã đội' }, `Tạo ${hostPage.fixedTeams.length} đội cố định & sinh mã`), create, el('button', { onclick: createTeams }, 'Tạo đội & sinh mã')),
      el('h2', {}, 'Chặng'), legBox, el('h2', {}, 'Hình mật thư (R2)'), mediaBox, el('h2', {}, 'Xe chung'), bikes),
    sys: el('div', { className: 'tab-panel' }, el('h2', {}, 'Hạn mức Cloudflare (ước tính)'), counters),
  };
  const tabBtns = TABS.map(([k, label]) => el('button', { className: 'tab', onclick: () => pick(k) }, label));
  const pick = (k: Tab) => {
    tab = k;
    try { sessionStorage.setItem('host-tab', k); } catch { /* private window */ }
    TABS.forEach(([key], i) => { panels[key].hidden = key !== k; tabBtns[i]!.classList.toggle('on', key === k); });
    if (k === 'run') requestAnimationFrame(() => state && render(state)); // the matrix was hidden: its sticky sizes are right again
  };
  app.replaceChildren(
    el('div', { className: 'top' }, el('h1', {}, `Cuộc đua Hà Nội – Host · ${race}`),
      el('span', { className: 'link' }, 'Link người chơi: ', el('code', {}, link), ' ', el('button', { className: 'small', onclick: () => void navigator.clipboard?.writeText(link) }, 'Sao chép'))),
    specBox,
    cqBox,
    banner, noticeBox, err, queueWrap,
    el('nav', { className: 'tabs' }, ...tabBtns),
    ...Object.values(panels),
    mapPanel,
  );
  pick(tab);
  if (mapPanel.open) void openMap();
  drawNotices();
  if (state) render(state);
  else teamsBox.textContent = 'Đang chờ dữ liệu từ máy chủ…';
}

/** A bad line or a down socket must not eat what the Host typed: the textarea stays until host.state shows the new teams. */
/** The fixed cast: every name not in the race yet, with its colour; the server only makes the codes. */
function createFixedTeams() {
  const teams = missingFixedTeams(hostPage.fixedTeams, state?.teams ?? []);
  if (!teams.length) return void (err.textContent = `Đủ ${hostPage.fixedTeams.length} đội cố định rồi, không có đội nào để thêm.`);
  if (!send({ t: 'host.createTeams', teams })) return void (err.textContent = 'Đang mất kết nối, chưa gửi được.');
  err.textContent = '';
}

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

// ── SPEC §17.41: "Bản đồ trực tiếp", a floating panel (fixed bottom right, the title bar drags / folds it). hostMap.ts + the
// in-game map code load with the road graph when it first opens; the ticks / host.state reach it from connect(). ──
const mapPanel = el('details', { className: 'map-panel', open: false }, el('summary', { title: 'Kéo để di chuyển · nhấp để thu gọn / mở' }, 'Bản đồ trực tiếp')); // closed at load (the tables get the full width); opened it keeps a column free on a wide screen
const mapErr = el('p', { className: 'bad' });
let hostMap: HostMap | undefined;
let mapLoad: Promise<void> | undefined;
function openMap(): Promise<void> {
  return (mapLoad ??= import('./hostMap.ts').then(({ HostMap }) => HostMap.load(mapPanel, loadGraph())).then(
    (m) => void ((hostMap = m), mapErr.remove(), state && m.update(state)),
    (e) => void ((mapLoad = undefined), (mapErr.textContent = `Không tải được bản đồ: ${e instanceof Error ? e.message : String(e)}`), mapPanel.append(mapErr)),
  ));
}
mapPanel.addEventListener('toggle', () => void (mapPanel.open && openMap()));

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

// Phase 10 (SPEC §17.25): "Xuất dữ liệu thời gian". Both outlive drawStatus, which rebuilds its row whenever the race state changes.
const exportBtn = el('button', { title: 'Tải về bảng thời gian của từng đội (CSV cho Excel + JSON thô) để làm báo cáo cuối cuộc đua', onclick: () => void exportTimes() }, 'Xuất dữ liệu thời gian');
const answersBtn = el('button', { title: 'Tải về mọi đáp án các đội đã gửi (kể cả ghế đã chọn ở Thử thách 2), kèm giờ và kết quả: CSV cho Excel', onclick: () => void exportAnswers() }, 'Xuất đáp án các đội');
async function exportAnswers() {
  if (answersBtn.disabled) return;
  if (!hostToken) return void paintExport('Chỉ có khi nối với máy chủ thật.', 'bad');
  answersBtn.disabled = true;
  paintExport('Đang tải…', 'warn');
  const r = await fetch(`${net.apiBase}/race/${encodeURIComponent(race)}/answers`, { headers: { Authorization: `Bearer ${hostToken}` } }).catch(() => null);
  if (!r?.ok) paintExport(r ? `Máy chủ từ chối (mã ${r.status}).` : 'Không kết nối được máy chủ.', 'bad');
  else {
    saveBlob(await r.blob(), `race-${race}-dap-an.csv`);
    paintExport('Đã tải file đáp án (CSV).', 'on');
  }
  answersBtn.disabled = false;
}
const exportStat = el('span', { className: 'note' });
const paintExport = (text: string, className: string) => Object.assign(exportStat, { textContent: text, className });
/** Both files from the Worker (Host token in a header, never in the URL), each saved through a temporary <a download>; all or none,
 *  so a failed half is not mistaken for a full export. `?demo=1` (no server, no token): a sample built here. */
async function exportTimes() {
  const s = state;
  if (!s || exportBtn.disabled) return;
  const ask = exportConfirm(s.status);
  if (ask && !confirm(ask)) return;
  exportBtn.disabled = true;
  paintExport('Đang tải…', 'warn');
  const files = await Promise.all((['csv', 'json'] as ExportFormat[]).map((f): Promise<ExportResult> | ExportResult => hostToken
    ? fetchExport(fetch, net.apiBase, race, hostToken, f)
    : { ok: true, name: exportFileName(race, f), blob: new Blob([demoExportText(s, f)], { type: f === 'csv' ? 'text/csv;charset=utf-8' : 'application/json' }) }));
  const failed = files.flatMap((f) => (f.ok ? [] : [f.error]))[0];
  if (failed) paintExport(failed, 'bad');
  else {
    for (const f of files) if (f.ok) saveBlob(f.blob, f.name);
    paintExport(`Đã tải ${files.map((f) => (f.ok ? f.name : '')).join(' và ')}.`, 'on');
  }
  exportBtn.disabled = false;
}
function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function drawStatus(s: State) {
  once('status', JSON.stringify([s.status, s.leg?.id, s.leg?.issues, s.teams.map((t) => [t.name, t.finishAt === null])]), () => {
    statusBox.replaceChildren(
      el('div', { className: 'row' }, 'Trạng thái: ', el('b', { className: `st-${s.status}` }, STATUS_LABEL[s.status]),
        ...statusButtons(s).map((b) =>
          el('button', { className: b.danger ? 'danger' : '', onclick: () => {
            const cur = state && statusButtons(state).find((x) => x.op === b.op);
            if (!cur || (cur.confirm && !confirm(cur.confirm))) return;
            if (!send({ t: 'host.race', op: b.op })) addNotice('error', 'Đang mất kết nối, chưa gửi được.');
          } }, b.label)),
        exportBtn, answersBtn, exportStat),
      el('p', { className: 'note' }, 'Tạm dừng: đội vẫn đi lại được nhưng không mở hòm / làm nhiệm vụ được. Xếp hạng theo thứ tự về đích thực (không có đồng hồ từng đội). Kết thúc: đội chưa về đích nhận thông báo BỊ LOẠI.'),
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
      el('div', { className: 'row' }, 'Chặng có sẵn: ', sel, el('button', { disabled: locked, onclick: () => loadLeg({ id: sel.value }) }, 'Nạp'), ' · Nạp chặng từ file: ', file),
      locked ? el('p', { className: 'note' }, 'Chỉ nạp được khi cuộc đua chưa mở và chưa có đội nào vào game. Muốn đổi chặng: tạo cuộc đua mới (mã mới) → nạp chặng → tạo đội → phát mã → mở.') : '',
      legResult ? el('div', { className: legResult.ok ? 'on' : 'bad' }, legResult.ok ? 'Đã nạp chặng.' : 'Không nạp được chặng:') : '',
      ...(issues.length ? [el('ul', { className: 'issues' }, ...issues.map((i) => el('li', { className: i.level }, i.level === 'error' ? 'LỖI ' : i.level === 'warning' ? 'CẢNH BÁO ' : 'CÒN TRỐNG ', i.text)))] : []),
    );
  });
}

function drawStart(s: State) {
  const rows = startRows(s);
  once('start', JSON.stringify(rows), () => {
    // short columns first (review: Host tables at 1024 px); SPEC §17.23: no start-time input (no team clock any more)
    const tbl = rows.map((r) => {
      // Leg 3: "Phạt vạch đích" (host.finishPenalty): minutes + reason, Lưu / Xóa; the team sees it on its finish card
      const min = el('input', { type: 'number', min: '0', max: String(NET.finishPenaltyMax), step: '1', value: r.fpMinutes ? String(r.fpMinutes) : '', placeholder: 'phút', className: 'fp-min', title: 'Số phút phạt tại vạch đích' });
      const why = el('input', { value: r.fpReason, maxLength: NET.finishReasonMax, className: 'fp-why', title: 'Lý do (đội thấy: "Bị phạt n phút do <lý do>.")' });
      const save = (clear: boolean) => {
        const m = finishPenaltyMessage(r.id, clear ? '0' : min.value, why.value);
        if (typeof m === 'string') return addNotice('error', m);
        if (clear && !confirm(`Xóa phạt vạch đích của ${r.name}?`)) return;
        if (!send(m)) addNotice('error', 'Đang mất kết nối, chưa gửi được.');
      };
      return el('tr', {},
        el('td', {}, el('span', { className: 'dot', style: `background:${r.colour}` }), r.name),
        el('td', {}, r.stepLabel),
        el('td', {}, r.penalty),
        el('td', { className: 'fp' }, min, ' ', why, ' ', el('button', { className: 'small', onclick: () => save(false) }, 'Lưu'), ...(r.fpMinutes ? [' ', el('button', { className: 'small danger', onclick: () => save(true) }, 'Xóa')] : [])),
        el('td', {}, r.startOrder),
        el('td', {}, r.joined),
      );
    });
    startBox.replaceChildren(
      el('p', { className: 'note' }, 'Thứ tự đội vào game lần đầu (thông báo "Xuất phát ở vị trí thứ n"). Không có giờ xuất phát riêng: xếp hạng theo thứ tự về đích.'),
      tbl.length ? el('div', { className: 'scroll' }, el('table', { className: 'pin' }, el('tr', {}, ...['Đội', 'Bước hiện tại', 'Phạt', 'Phạt vạch đích (phút · lý do)', 'Thứ tự vào', 'Vào game lúc'].map((t) => el('th', {}, t))), ...tbl)) : 'Chưa có đội nào.',
    );
  });
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
  const { head, rows } = progressTable(s, now);
  if (!rows.length) return void ((sigs.matrix = ''), matrixBox.replaceChildren('Chưa có đội nào.'));
  const th = (t: string, title = '', className = '') => el('th', { title, className }, t);
  // Buttons in cells (D16 (3)): the table is rebuilt only when something but the running clocks changed, else a click that
  // lands while it is rebuilt is lost. The clocks ("chờ duyệt mm:ss", "⏳ mm:ss") are written in place below.
  const sig = JSON.stringify([head, rows.map((r) => [r.team, r.name, r.colour, r.rank, r.flagged, r.penalty, r.finish, r.cells.map((c) => [c.state, c.title, c.buttons])])]);
  once('matrix', sig, () => {
    cellTexts.length = 0;
    // Phase 10 (V1): the table scrolls inside its own box (.matrix-wrap: both ways), so the <thead> and the "Đội" column stay in
    // view (host.css). team (pinned) + ranking columns before the step columns: the result is readable at 1024 px without
    // scrolling sideways. A rebuild (any new answer) must not throw the Host back to the top left of a wide table.
    const old = matrixBox.querySelector('.matrix-wrap');
    const wrap = el('div', { className: 'scroll matrix-wrap' }, el('table', { className: 'matrix pin' },
      el('thead', {}, el('tr', {}, th('Đội'), th('Hạng', 'Thứ tự về đích thực (SPEC §17.22) + phạt vạch đích (giờ về đích + số phút phạt); BỊ LOẠI: đội về cuối cùng, hoặc chưa về khi Host bấm Kết thúc'), th('Phạt'), th('Về đích'), ...head.map((h) => th(h.label, h.title)))),
      el('tbody', {}, ...rows.map((r) => {
        const texts: HTMLElement[] = [];
        cellTexts.push(texts);
        return el('tr', {},
          el('td', {}, el('span', { className: 'dot', style: `background:${r.colour}` }), r.name, r.flagged ? el('span', { className: 'flag', title: 'Đội đang bị gắn cờ đỏ (lý do + nút "Xóa cờ" ở bảng "Các đội")' }, ' ⚑') : ''),
          el('td', { className: r.out ? 'bad' : '' }, r.rank), el('td', {}, r.penalty), el('td', {}, r.finish),
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
      })),
    ));
    const [left, top] = old ? [old.scrollLeft, old.scrollTop] : [0, 0];
    matrixBox.replaceChildren(wrap);
    wrap.scrollLeft = left; // only once it is in the page (an element nobody lays out cannot scroll)
    wrap.scrollTop = top;
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

/** Returns how many answers wait. SPEC §17.42: one card per answer in three framed parts — the head (team, step, wait clock,
 *  submit code), "ĐỘI TRẢ LỜI" (blue, the team's text big, earlier tries small, the KHỚP / Chưa khớp badge) and "ĐÁP ÁN ĐÚNG –
 *  chỉ Host thấy" (green, smaller, one chip per reference answer) — then the actions row (Duyệt far from Phạt). */
function drawQueue(s: State, now: number): number {
  const rows = queueRows(s, now);
  queueHead.textContent = `Chờ duyệt (${rows.length})`;
  once('queue', queueSig(s), () => {
    queueWaits.clear();
    queueBox.replaceChildren(...rows.map((r) => {
      const note = el('textarea', { rows: 1, maxLength: NET.noteMax, placeholder: 'Ghi chú của Host (đội không thấy)', value: noteDrafts.get(r.key) ?? r.note });
      note.addEventListener('input', () => noteDrafts.set(r.key, note.value));
      const wait = el('b', { className: 'rv-wait', title: 'Đội đã chờ Host duyệt bao lâu' }, r.waiting);
      queueWaits.set(r.key, wait);
      const copy = () => el('button', { className: 'small', title: 'Sao chép mã bài nộp', onclick: () => void navigator.clipboard?.writeText(r.code) }, 'Sao chép');
      const group: HTMLButtonElement[] = [];
      // SPEC §17.31: "Đúng ?/n" typed before Phạt (blank = no number); the team is told it only from scoreFromMinutes on
      const score = r.score ? el('input', { type: 'number', min: 0, max: r.score.scoreOf, step: 1, className: 'score', placeholder: '?', title: `Số phần đội làm đúng (0–${r.score.scoreOf}), gửi kèm Phạt; để trống = không báo số` }) : undefined;
      const scoreOf = (): number | undefined => {
        const v = score?.value.trim() ?? '';
        const n = Number(v);
        return v !== '' && Number.isInteger(n) && n >= 0 && n <= (r.score?.scoreOf ?? 0) ? n : undefined;
      };
      const btn = (label: string, className: string, op: 'approve' | 'penalize' | 'note') => {
        const b = el('button', { className, onclick: () => {
          fire(reviewMessage(r.team, r.step, op, op === 'note' ? undefined : r.id, note.value, op === 'penalize' ? scoreOf() : undefined), group);
          if (op !== 'note') noteDrafts.delete(r.key); // the answer leaves the queue; the note went with the decision
        } }, label);
        group.push(b);
        return b;
      };
      const chip = (cls: string, text: string, title = '') => el('span', { className: `chip ${cls}`, title }, text);
      const previous = r.previous.map((p) => el('div', { className: 'rv-prev' }, p));
      const badge = r.match ? el('span', { className: `rv-badge ${r.match}`, title: 'So khớp tự động (bỏ dấu, hoa / thường, khoảng trắng) với đáp án đúng – chỉ để tham khảo, Host vẫn quyết định' }, r.match === 'yes' ? 'KHỚP đáp án' : 'Chưa khớp') : '';
      const answer = r.text
        ? el('div', { className: 'rv-answer' },
          el('div', { className: 'rv-label' }, chip('team', 'ĐỘI TRẢ LỜI'), r.attempt > 1 ? el('span', { className: 'rv-nth' }, `Lần gửi thứ ${r.attempt}`) : '', badge),
          r.parts ? el('ol', { className: 'rv-parts' }, ...r.parts.map((p) => el('li', p.ok === undefined ? {} : { className: p.ok ? 'ok' : 'bad' }, el('span', { className: 'rv-part-label' }, p.label), el('span', { className: 'rv-text' }, p.text), p.ok === undefined ? '' : el('b', { className: 'rv-mark' }, p.ok ? '✓' : '✗')))) : el('div', { className: 'rv-text' }, r.text), ...previous, // SPEC §17.44: the N strings numbered (Leg 3: ✓ / ✗ per box, Host only)
          r.auto ? el('div', { className: `rv-auto ${r.auto.verdict}` }, r.auto.line) : '')
        : el('div', { className: 'rv-answer' },
          el('div', { className: 'rv-label' }, chip('team', 'ĐỘI BÁO ĐÃ GỬI BÀI QUA MESSENGER'), r.attempt > 1 ? el('span', { className: 'rv-nth' }, `Lần gửi thứ ${r.attempt}`) : ''),
          el('div', { className: 'rv-text' }, 'Mã bài nộp: ', el('code', { className: 'rv-bigcode' }, r.code), copy()),
          el('div', { className: 'rv-prev' }, 'Tìm ảnh gửi kèm đúng mã này trên Messenger rồi Duyệt / Phạt.'), ...previous);
      return el('div', { className: 'review', style: `--team:${r.colour}` },
        el('div', { className: 'rv-head' },
          el('span', { className: 'dot', style: `background:${r.colour}` }), el('b', { className: 'rv-team' }, r.name),
          el('span', { className: 'rv-step' }, `${r.label}${r.stepName ? ` · ${r.stepName}` : ''}${r.branchName ? ` · nhánh ${r.branchName}` : ''}`),
          wait, r.text ? el('span', { className: 'rv-code' }, 'mã bài nộp ', el('code', { className: 'code' }, r.code), copy()) : ''),
        answer,
        r.reference.length ? el('div', { className: 'rv-ref' }, chip('ref', '🔒 ĐÁP ÁN ĐÚNG – chỉ Host thấy', 'Đáp án tham khảo của chặng: đội không bao giờ thấy phần này'), ...r.reference.map((x) => el('span', { className: 'rv-refchip' }, x))) : '',
        r.auto ? autoActions(r, group) : el('div', { className: 'rv-actions' }, note, btn('Duyệt', 'ok big', 'approve'),
          ...(score && r.score ? [el('label', { className: 'score-box', title: 'Gửi kèm Phạt (SPEC §17.31); để trống = không báo số' }, 'Đúng ', score, `/${r.score.scoreOf}`), el('small', { className: 'score-hint' }, `gửi kèm Phạt · ${r.score.scoreHint}`)] : []),
          btn(`Phạt ${String(r.lockMinutes).replace('.', ',')} phút`, 'danger big', 'penalize'), btn('Lưu ghi chú', 'small', 'note')),
      );
    }));
  });
  for (const r of rows) {
    const w = queueWaits.get(r.key);
    if (!w) continue;
    if (w.textContent !== r.waiting) w.textContent = r.waiting;
    w.classList.toggle('slow', r.waitMs >= hostPage.queueSlowSeconds * 1000);
  }
  return rows.length;
}

/** Leg 3: the actions of an answer the server already graded + applied: "✓ Đồng ý" (it leaves the queue), "Đúng x/N" + "Cập nhật"
 *  (the number the team sees; the countdown stays), "Đúng – cho qua" (a Phạt overruled: lock lifted, the step done; only while
 *  it is the team's last answer on an unfinished step). */
function autoActions(r: ReturnType<typeof queueRows>[number], group: HTMLButtonElement[]): HTMLElement {
  const a = r.auto!;
  const b = (label: string, className: string, title: string, msg: () => ReturnType<typeof reviewMessage> | null) => {
    const x = el('button', { className, title, onclick: () => { const m = msg(); if (m) fire(m, group); } }, label);
    group.push(x);
    return x;
  };
  const input = el('input', { type: 'number', min: 0, max: a.of, step: 1, className: 'score', value: String(a.score), title: `Số ô đúng đội thấy (0–${a.of})` });
  const score = () => {
    const n = Number(input.value);
    return Number.isInteger(n) && n >= 0 && n <= a.of && n !== a.score ? reviewMessage(r.team, r.step, 'score', r.id, '', n) : null;
  };
  return el('div', { className: 'rv-actions' },
    b('✓ Đồng ý', 'ok big', 'Đồng ý với máy chấm: bỏ khỏi hàng chờ, đội không thấy gì thêm', () => reviewMessage(r.team, r.step, 'ack', r.id, '')),
    ...(a.verdict === 'penalized' ? [el('label', { className: 'score-box', title: 'Sửa số ô đúng đội thấy (đếm ngược phạt giữ nguyên)' }, 'Đúng ', input, `/${a.of}`), b('Cập nhật', 'small', 'Gửi số ô đúng mới cho đội', score)] : []),
    ...(a.canApprove ? [b('Đúng – cho qua', 'big', 'Không đồng ý phạt: gỡ đếm ngược, đội nhận mật thư kế (như Duyệt)', () => reviewMessage(r.team, r.step, 'approve', r.id, ''))] : []),
  );
}

const undoButtons = new Map<string, HTMLButtonElement>(); // undo key → its "Hoàn tác (còn n s)" (ticks every refresh)
/** Phase 10 (V2): one line + button per decision still undoable (host.state.undo; a reload keeps them). The lines are rebuilt only when
 *  the set changes (a click that lands on a button rewritten under it is lost); the countdown is written in place, and a decision
 *  that ran out of time drops out by itself, whether or not the server has sent a new state. Returns how many lines. */
function drawUndo(s: State, now: number): number {
  const rows = undoRows(s, now);
  once('undo', JSON.stringify(rows.map((r) => [r.key, r.op])), () => {
    undoButtons.clear();
    undoBar.replaceChildren(...rows.map((r) => {
      const btn = el('button', { className: 'small', title: 'Rút lại quyết định vừa rồi: thẻ của đội trở lại như trước (không hoàn tác được sau 10 giây, hoặc khi đội đã về đích / đi tiếp)', onclick: () => fire(undoMessage(r.team, r.step, r.id), [btn]) }, r.button);
      undoButtons.set(r.key, btn);
      return el('div', { className: `undo ${r.op}` }, el('span', { className: 'dot', style: `background:${r.colour}` }), r.text, btn);
    }));
  });
  for (const r of rows) {
    const b = undoButtons.get(r.key);
    if (b && b.textContent !== r.button) b.textContent = r.button;
  }
  return rows.length;
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

/** When the mouse went down (0 = it is up). "Các đội" and the bike buttons are rewritten every second; a press that straddles a
 *  rewrite never becomes a click, so that part of render() waits (≤ 1.5 s: a mouseup outside the window is never heard). */
let pressedAt = 0;
for (const [ev, down] of [['pointerdown', true], ['pointerup', false], ['pointercancel', false]] as const) addEventListener(ev, () => (pressedAt = down ? Date.now() : 0), true);

/** SPEC §17.40: the spectator code line (rebuilt only when the code / count changes: its buttons must not lose a click). */
function drawSpectators(s: State) {
  const sig = `${s.spectatorCode ?? ''}|${s.spectators ?? 0}`;
  if (sig === specSig && specBox.childNodes.length) return;
  specSig = sig;
  if (!s.spectatorCode) return void specBox.replaceChildren(); // the ?demo=1 state has none
  const code = s.spectatorCode;
  const rotate = () => {
    if (confirm('Đổi mã khán giả? Mã cũ hết hiệu lực ngay và khán giả đang xem bị ngắt.') && !send({ t: 'host.spectator', op: 'rotate' })) addNotice('error', 'Đang mất kết nối, chưa gửi được.');
  };
  specBox.replaceChildren(
    'Mã khán giả (nhập ở cùng ô mã đội để xem camera các đội, không chơi): ', el('code', {}, code), ' ',
    el('button', { className: 'small', onclick: () => void navigator.clipboard?.writeText(code) }, 'Sao chép'), ' ',
    el('button', { className: 'small', title: 'Mã cũ hết hiệu lực ngay, khán giả đang xem bị ngắt', onclick: rotate }, 'Đổi mã'),
    ` · ${s.spectators ?? 0} khán giả đang xem`,
  );
}

function render(s: State) {
  const th = (...h: string[]) => el('tr', {}, ...h.map((t) => el('th', {}, t)));
  const now = s.serverMs + (Date.now() - receivedAt);
  banner.replaceChildren(...[...warnings(s), ...stuckLines(s, now)].map((w) => el('div', {}, w)));
  const waiting = drawQueue(s, now);
  queueWrap.classList.toggle('has', waiting + drawUndo(s, now) > 0);
  const stat = (cls: string, k: string, v: number, of?: number) => el('div', { className: `stat ${cls}` }, el('div', { className: 'k' }, k), el('div', { className: 'v' }, String(v), of === undefined ? '' : el('small', {}, `/ ${of}`)));
  statsBar.replaceChildren(
    stat('ok', 'Đội online', s.teams.filter((t) => t.online).length, s.teams.length),
    stat('', 'Đã về đích', s.teams.filter((t) => t.finishAt !== null).length, s.teams.length),
    stat(waiting ? 'pend hot' : 'pend', 'Chờ duyệt', waiting),
    stat('warn', 'Cờ đỏ', s.teams.filter((t) => t.flagged).length),
  );
  drawSpectators(s);
  cqBox.replaceChildren(...cetiqloLines(s, now).map((l) => el('div', {}, l)));
  drawStatus(s);
  drawLeg(s);
  drawMedia(s);
  drawStart(s);
  drawMatrix(s, now);
  if (Date.now() - pressedAt < 1500) return; // below: tables rewritten on every call, not under a mouse press (the click would be lost)
  const rows = teamRows(s, now).map((r) =>
    el('tr', {},
      el('td', {}, el('span', { className: 'dot', style: `background:${r.colour}` }), r.name),
      el('td', {}, el('code', {}, r.code), ' ', el('button', { className: 'small', onclick: () => void navigator.clipboard?.writeText(r.code) }, 'Sao chép')),
      el('td', {}, r.player),
      el('td', { className: r.status === 'online' ? 'on' : 'off' }, r.status === 'online' ? 'Online' : 'Offline'),
      el('td', {}, r.lastSeen),
      el('td', {}, String(r.reconnects)),
      el('td', {}, r.position),
      // Phase 10 (V3): why + since when + "Xóa cờ". A mark only, no penalty; the server flags again if the team goes on (docs).
      el('td', { className: 'flag', title: 'Cờ đỏ chỉ là đánh dấu, đội không bị phạt. Lịch sử vi phạm vẫn còn trong nhật ký máy chủ.' }, ...(r.flagged ? [
        r.flagText, ' ',
        el('button', { className: 'small', onclick: () => {
          if (!confirm(`Xóa cờ đỏ của ${r.name}? Lịch sử vi phạm vẫn còn trong nhật ký máy chủ; nếu đội còn vi phạm, cờ sẽ gắn lại.`)) return;
          if (!send({ t: 'host.flag', op: 'clear', team: r.id })) addNotice('error', 'Đang mất kết nối, chưa gửi được.');
        } }, 'Xóa cờ'),
      ] : [])),
      el('td', {}, r.pos ? el('button', { className: 'small', title: 'Đặt một xe chung cạnh đội này', onclick: () => send({ t: 'host.bike', op: 'add', x: r.pos!.x + hostPage.addBikeOffset, z: r.pos!.z }) }, 'Thêm xe') : ''),
    ),
  );
  teamsBox.replaceChildren(rows.length ? el('div', { className: 'scroll' }, el('table', { className: 'pin' }, th('Đội', 'Mã đội', 'Người chơi', 'Trạng thái', 'Lần cuối', 'Vào lại', 'Vị trí (lat, lon)', 'Cờ', 'Xe'), ...rows)) : 'Chưa có đội nào.');
  counters.replaceChildren(el('dl', {}, ...counterLines(s).flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)])));
  const paused = s.spawning.paused;
  bikes.replaceChildren(
    el('div', { className: 'row' },
      `Đặt xe tự động: ${paused ? 'đang tạm dừng' : 'đang chạy'} · ứng viên: ${s.spawning.candidates}`,
      // vehicles.fixedBikes (BikeService.seedFixed: ids "f<fleet>-<n>"): still standing there, nobody's yet
      ...(s.bikes.some((b) => /^f\d+-/.test(b.id)) ? [` · xe cố định còn chờ: ${s.bikes.filter((b) => /^f\d+-/.test(b.id) && b.owner === null && !b.parked).length}`] : []),
      el('button', { className: 'small', onclick: () => send({ t: 'host.spawning', paused: !paused }) }, paused ? 'Tiếp tục' : 'Tạm dừng'),
    ),
    el('div', { className: 'row' }, el('button', { disabled: computing, onclick: () => void sendCandidates() }, 'Tính hành lang & gửi ứng viên'), candStatus),
  );
}

// ponytail: rewrites the tables once per refreshMs (keeps "x giây trước" running), no diffing; fine for ≤ 100 teams.
// Inputs and buttons (status, leg, start times) are rebuilt only when their data changes (`once`).
setInterval(() => state && teamsBox.isConnected && render(state), hostPage.refreshMs);

if (q.has('demo')) {
  state = withAutoDemo(withMapDemo(demoState(Date.now()))); // + 2 teams on the move (§17.41) + Leg 3 auto-graded answers
  receivedAt = Date.now();
  soundNewQueue(state); // the baseline: the demo queue is not "new"
  mediaStat.set('test-gia.jpg', { s: 'ok', size: 245_760 }); // canned (no server): one image uploaded, one missing
  mediaStat.set('test-gia-2.jpg', { s: 'missing' });
  // DEV stand-ins for the p10-* pictures: ?undoLeft=<s> keeps the undo lines alive that much longer (the picture is taken a few
  // seconds after the load), ?collapsed=1 folds the review queue, ?matrixScroll=<x|max>,<y> scrolls the matrix box (px)
  const extra = Number(q.get('undoLeft')) * 1000 || 0;
  if (extra) state = { ...state, undo: state.undo.map((u) => ({ ...u, until: u.until + extra })) };
  mainView();
  if (q.has('collapsed')) queueDetails.open = false;
  const [sx, sy] = (q.get('matrixScroll') ?? '').split(',');
  const wrap = matrixBox.querySelector('.matrix-wrap');
  if (wrap) {
    wrap.scrollLeft = sx === 'max' ? wrap.scrollWidth : Number(sx) || 0;
    wrap.scrollTop = Number(sy) || 0;
  }
  // SPEC §17.41: the online teams circle their places as server ticks would move them; ?mapBig=1 = the enlarged map (p11 picture)
  setInterval(() => state && hostMap?.tick(demoTick(state, Date.now())), 1000 / NET.tickHz);
  if (q.has('mapBig')) mapPanel.classList.add('big');
} else loginView();
// DEV / tests: the page can be read back without a server (demo: once the map panel drew, or failed to load).
void (mapLoad ?? Promise.resolve()).then(() => requestAnimationFrame(() => ((globalThis as { __READY__?: boolean }).__READY__ = true)));
