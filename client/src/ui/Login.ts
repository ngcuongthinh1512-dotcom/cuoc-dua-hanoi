// Phase 6 track B (docs/plans/phase6.md §3.3, §3.11): the login screen over the loading world (SPEC §7, §8.10). A team types
// its 6-char code (remembered in localStorage, still needs a click on "Vào lại"); the Host switches to its password and
// watches (SPEC §17.40; so does a spectator code typed into the same box). A team that played before sees "Chào mừng trở
// lại, <đội>!" + a summary, then "Tiếp tục".
import { NET } from '@race/shared/protocol';
import { net, netClient } from '../config.ts';
import type { NetDown } from '../net/NetClient.ts';
import type { Session } from '../net/session.ts';
import './menu.css';
import './login.css';

type Store = Pick<Storage, 'getItem' | 'setItem'>;
type Summary = NonNullable<Session['summary']>;
const browserStore = (): Store => localStorage;

/** What players type → the code the server knows: upper case, no spaces ("k7m 2qx" → "K7M2QX"). */
export const normalizeCode = (s: string) => s.toUpperCase().replace(/\s+/g, '');

/** SPEC §8.10: the remembered team code ('' when none, or when storage is blocked / throws). */
export function readStoredCode(store: () => Store = browserStore): string {
  try {
    return store().getItem(netClient.storageKey) ?? '';
  } catch {
    return '';
  }
}

export function storeCode(code: string, store: () => Store = browserStore) {
  try {
    store().setItem(netClient.storageKey, code);
  } catch {
    /* private window / blocked site data: just not remembered */
  }
}

/** /api/login error → the line under the form. */
export function errorText(error: unknown, retryMs = 0): string {
  switch (error) {
    case 'bad_code':
      return 'Mã đội không đúng';
    case 'locked':
      return `Nhập sai quá nhiều lần. Thử lại sau ${Math.ceil(retryMs / 1000)} giây`;
    case 'bad_password':
      return 'Mật khẩu Host không đúng';
    case 'bad_race':
      return 'Link cuộc đua không hợp lệ. Hãy mở lại link Host đã gửi';
    default:
      return 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại';
  }
}

/** The #net panel while the game has no connection (NetClient status): 'closed' retries by itself, the rest is final. */
export const NET_DOWN: Readonly<Record<NetDown, string>> = {
  closed: 'Mất kết nối – đang nối lại…',
  otherDevice: 'Đội của bạn vừa đăng nhập trên thiết bị khác. Tải lại trang để chơi tiếp trên máy này.',
  badToken: 'Phiên đăng nhập đã hết hạn. Tải lại trang rồi nhập lại mã đội.',
  raceClosed: 'Cuộc đua đã đóng.',
  protocol: 'Máy chủ đã ngắt kết nối. Tải lại trang để vào lại.',
  version: 'Phiên bản game đã đổi. Hãy tải lại trang.',
  full: `Phòng xem đã đầy (tối đa ${NET.maxSpectators} khán giả). Hãy thử lại sau.`,
};
export const netDownText = (reason: NetDown) => NET_DOWN[reason];

/** "Chào mừng trở lại" lines: the current step (Phase 7; SPEC §17.23: no race clock), last seen. ponytail: "Bạn có 1 mật thư mới" needs the server to know which cards were read (Phase 8+). */
export function summaryLines(s: Summary): string[] {
  const clock = (ms: number) => new Date(ms).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  const step = typeof s.step === 'number' ? `Bước ${s.step + 1}` : s.step;
  return [
    ...(step ? [`Đang làm: ${step}`] : []),
    ...(s.lastSeen === null ? [] : [`Lần cuối trong game: ${clock(s.lastSeen)}`]),
  ];
}

const FORM = `<form class="menu-box login-box" novalidate>
  <h2>Cuộc đua Paris</h2>
  <p class="menu-note" data-k="note"></p>
  <label class="login-field"><span data-k="label"></span><input data-k="input" autocomplete="off" spellcheck="false" /></label>
  <p class="login-error" role="alert" data-k="error"></p>
  <div class="menu-main"><button type="submit" class="menu-resume" data-k="submit"></button></div>
  <button type="button" class="login-switch" data-k="switch"></button>
  <p class="menu-hint" data-k="race"></p>
</form>`;
const BACK = `<div class="menu-box login-box">
  <h2 data-k="title"></h2>
  <ul class="login-summary" data-k="list"></ul>
  <div class="menu-main"><button type="button" class="menu-resume" data-k="go">Tiếp tục</button></div>
</div>`;

function screen(html: string) {
  let root = document.getElementById('login');
  if (!root) document.body.append((root = Object.assign(document.createElement('div'), { id: 'login', className: 'menu' })));
  root.innerHTML = html;
  const k = <T extends HTMLElement>(key: string) => root.querySelector<T>(`[data-k="${key}"]`)!;
  return { root, k };
}

type Attempt = { ok: true; token: string; role?: 'host' | 'spectator'; team?: Session['team']; summary?: Summary } | { ok: false; error?: unknown; retryMs?: number };

async function post(body: object): Promise<Attempt> {
  try {
    const res = await fetch(`${net.apiBase}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return (await res.json()) as Attempt;
  } catch {
    return { ok: false, error: 'network' }; // offline, or the dev server without `npm run dev:api` (proxy error page)
  }
}

/** The code / password form; `submit` logs in (the caller closes the screen) or calls `error` with the line to show. */
function form(race: string, remembered: string, submit: (host: boolean, value: string, error: (t: string, retryMs?: number) => void) => Promise<void>) {
  const { root, k } = screen(FORM);
  const [input, submitBtn, error] = [k<HTMLInputElement>('input'), k<HTMLButtonElement>('submit'), k('error')];
  let host = false;
  let lockedUntil = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  const mode = () => {
    k('note').textContent = host ? 'Đăng nhập Host để theo dõi cả cuộc đua (xem camera các đội).' : `Nhập mã đội (${NET.codeLength} ký tự) mà Host đã gửi cho đội bạn, hoặc mã khán giả để xem.`;
    k('label').textContent = host ? 'Mật khẩu Host' : 'Mã đội';
    Object.assign(input, { type: host ? 'password' : 'text', value: host ? '' : remembered, maxLength: host ? 200 : NET.codeLength + 3 });
    input.classList.toggle('login-code', !host);
    submitBtn.textContent = host ? 'Đăng nhập Host' : remembered ? 'Vào lại' : 'Vào cuộc đua';
    k('switch').textContent = host ? 'Tôi là người chơi' : 'Tôi là Host';
    error.textContent = '';
    input.focus();
  };
  const show = (text: string, retryMs = 0) => {
    error.textContent = text;
    if (!retryMs) return;
    // SPEC §8.10: 5 wrong codes → locked; count down, the button stays off meanwhile
    lockedUntil = Date.now() + retryMs;
    submitBtn.disabled = true;
    clearInterval(timer);
    timer = setInterval(() => {
      const left = lockedUntil - Date.now();
      error.textContent = left > 0 ? errorText('locked', left) : '';
      if (left <= 0) (submitBtn.disabled = false), clearInterval(timer);
    }, 1000);
  };
  k('race').textContent = `Cuộc đua: ${race}`;
  k('switch').onclick = () => void ((host = !host), mode());
  root.querySelector('form')!.onsubmit = async (e) => {
    e.preventDefault();
    if (submitBtn.disabled) return;
    const value = host ? input.value : normalizeCode(input.value);
    if (!host && value.length !== NET.codeLength) return show(`Mã đội gồm ${NET.codeLength} ký tự`);
    if (host && !value) return show('Hãy nhập mật khẩu Host');
    submitBtn.disabled = true;
    error.textContent = 'Đang kiểm tra…';
    await submit(host, value, show);
    if (Date.now() >= lockedUntil) submitBtn.disabled = false;
  };
  mode();
}

/** SPEC §8.10 "Chào mừng trở lại": resolves on "Tiếp tục" (or Enter). */
function welcomeBack(name: string, s: Summary): Promise<void> {
  const { k } = screen(BACK);
  k('title').textContent = `Chào mừng trở lại, ${name}!`;
  k('list').replaceChildren(...summaryLines(s).map((t) => Object.assign(document.createElement('li'), { textContent: t })));
  const go = k<HTMLButtonElement>('go');
  go.focus();
  return new Promise((resolve) => void (go.onclick = () => resolve()));
}

const close = () => document.getElementById('login')?.remove();

/** Online start: the form until /api/login says yes (team: + "Chào mừng trở lại" when it played before). */
export function login(race: string): Promise<Session> {
  return new Promise((resolve) => {
    form(race, readStoredCode(), async (host, value, error) => {
      const r = await post(host ? { race, host: value } : { race, code: value });
      if (!r.ok) return error(errorText(r.error, r.retryMs), r.error === 'locked' ? r.retryMs : 0);
      if (host) return close(), resolve({ race, token: r.token, role: 'host' });
      storeCode(value);
      // SPEC §17.40: the spectator code goes through the same box; the server's answer decides the role
      if (r.role === 'spectator') return close(), resolve({ race, token: r.token, role: 'spectator' });
      const session: Session = { race, token: r.token, role: 'team', ...(r.team && { team: r.team }), ...(r.summary && { summary: r.summary }) };
      if (r.summary && r.summary.reconnects > 0) await welcomeBack(r.team?.name ?? value, r.summary);
      close();
      resolve(session);
    });
  });
}

/** DEV ?login / ?login=back (p6-login, p6-welcome-back): the screens with stand-in data over the offline world, not
 *  blocking it; a submit / "Tiếp tục" just closes them. */
export function previewLogin(back: boolean) {
  if (back) void welcomeBack('Đội Xanh', { reconnects: 2, lastSeen: Date.now() - 7 * 60_000, step: 'Thử thách 2' }).then(close);
  else form('paris', readStoredCode(), async () => close());
}
