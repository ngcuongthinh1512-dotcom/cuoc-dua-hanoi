// SPEC §17.40 watch mode, shared by spectators (spectator code), the Host in the game and a finished team (X): the bar at
// the top (◀ [● TEAM ▾] ▶ · Bay tự do), [ / ] / V keys, the chase camera behind the followed body (watch.ts followPose,
// smoothed). The followed team's body comes from RemotePlayers (ticks); the
// bar lists only online, racing teams and drops one that finished / went offline (auto-picks the next).
import type { TeamInfo } from '@race/shared/protocol';
import type { Input } from '../core/Input.ts';
import type { RemotePose } from '../net/RemotePlayers.ts';
import type { FreeFlyCamera } from '../player/FreeFlyCamera.ts';
import { type CamPose, followPose, nextSlot, smoothPose, watchable } from './watch.ts';
import './spectate.css';

const DEG = Math.PI / 180;
export const TEXT = {
  free: 'Bay tự do',
  none: 'Chưa có đội nào đang đua',
  waiting: 'đang chờ vị trí…',
  hintX: 'Phím X: xem các đội khác',
  backX: 'X: điều khiển lại nhân vật',
  keys: '[ ] đổi đội · V bay tự do',
} as const;

export interface SpectateDeps {
  /** The free-fly camera: the follow pose is applied through it (one camera convention; V continues from where it was). */
  fly: FreeFlyCamera;
  /** The followed team's body now (RemotePlayers.poseOf): null = no tick for it yet. */
  poseOf(slot: number): RemotePose | null;
  /** "Bay tự do" clicked / V: the caller locks the pointer for the mouse look. */
  onFree?(): void;
  /** A finished team's bar carries the way back ("X: điều khiển lại nhân vật"). */
  team?: boolean;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]) {
  const e = document.createElement(tag);
  Object.assign(e, props);
  e.append(...kids);
  return e;
}

export class Spectate {
  /** Followed team's slot; null = free fly. */
  slot: number | null = null;
  private teams = new Map<number, TeamInfo>();
  private cam: CamPose | null = null;
  private auto = true; // follow the first racing team as soon as there is one (until the user chose "Bay tự do")
  private shown = false;
  private readonly root: HTMLElement;
  private readonly sel = el('select', { title: 'Đội đang xem' });
  private readonly dot = el('span', { className: 'sp-dot' });
  private readonly freeBtn = el('button', { type: 'button', textContent: TEXT.free });
  private readonly note = el('div', { className: 'sp-note', hidden: true });

  constructor(private readonly d: SpectateDeps) {
    const prev = el('button', { type: 'button', textContent: '◀', title: 'Đội trước ([)', onclick: () => this.step(-1) });
    const next = el('button', { type: 'button', textContent: '▶', title: 'Đội sau (])', onclick: () => this.step(1) });
    this.sel.onchange = () => {
      this.pick(this.sel.value === '' ? null : Number(this.sel.value), true);
      this.sel.blur(); // core/Input.ts leaves keys to a focused <select>
    };
    this.freeBtn.onclick = () => this.pick(null, true);
    this.root = el('div', { className: 'sp-bar', hidden: true }, prev, this.dot, this.sel, next, this.freeBtn, el('span', { className: 'sp-keys', textContent: d.team ? `${TEXT.keys} · ${TEXT.backX}` : TEXT.keys }));
    document.body.append(this.root, this.note);
    this.refresh();
  }

  /** The camera is a followed body's (the caller leaves the pointer free for the bar and skips the free-fly input). */
  get following() {
    return this.shown && this.slot !== null;
  }

  /** The bar (and the camera) on / off. On: follow the first racing team again (a finished team pressing X twice). */
  show(on: boolean) {
    if (on === this.shown) return;
    this.shown = on;
    this.root.hidden = !on;
    document.body.classList.toggle('sp-on', on);
    if (on) (this.auto = true), (this.cam = null), this.refresh();
    if (on && this.following) document.exitPointerLock?.();
    if (!on) this.setNote('');
  }

  /** A small line under the bar's place ("Phím X: xem các đội khác" for a finished team), '' / null = none. */
  hint(text: string | null) {
    if (!this.shown) this.setNote(text ?? '');
  }

  /** Welcome.teams (every welcome, incl. reconnects). */
  setTeams(teams: readonly TeamInfo[]) {
    this.teams = new Map(teams.map((t) => [t.slot, { ...t }]));
    this.refresh();
  }

  /** `{t:'team'}`: online / racing changed. */
  team(slot: number, online: boolean, racing?: boolean) {
    const t = this.teams.get(slot);
    if (!t) return;
    t.online = online;
    if (racing !== undefined) t.racing = racing;
    this.refresh();
  }

  /** Keys, then the camera. True while following (the camera was placed here: no free-fly input this frame). */
  update(dt: number, input: Input): boolean {
    if (!this.shown) return false;
    if (input.wasPressed('spectateNext')) this.step(1);
    if (input.wasPressed('spectatePrev')) this.step(-1);
    if (input.wasPressed('flyToggle')) this.slot === null ? this.step(1) : this.pick(null, true);
    if (this.slot === null) return false;
    const p = this.d.poseOf(this.slot);
    if (!p) return this.setNote(TEXT.waiting), true; // the camera holds until its first tick
    const goal = followPose(p);
    const c = (this.cam = this.cam ? smoothPose(this.cam, goal, dt) : goal);
    this.d.fly.setPose(c.x, c.y, c.z, c.yaw / DEG, c.pitch / DEG);
    this.setNote('');
    return true;
  }

  private list() {
    return watchable(this.teams.values());
  }

  private step(dir: 1 | -1) {
    this.pick(nextSlot(this.list(), this.slot, dir), true);
  }

  /** Follow `slot` (null = free fly from where the camera is). `byUser`: the automatic first pick is over. */
  private pick(slot: number | null, byUser = false) {
    if (byUser) this.auto = false;
    const wasFollowing = this.following;
    this.slot = slot;
    this.cam = null;
    if (this.shown && slot === null && wasFollowing) this.d.onFree?.();
    if (this.shown && slot !== null && !wasFollowing) document.exitPointerLock?.(); // the bar is clickable while following
    this.refresh();
  }

  /** The bar from the list: options, the followed team's dot / name; a followed team that left the list → the next one. */
  private refresh() {
    const list = this.list();
    if (this.slot !== null && !list.some((t) => t.slot === this.slot)) this.slot = nextSlot(list, this.slot, 1);
    if (this.auto && this.slot === null && list.length) {
      this.slot = list[0]!.slot;
      if (this.shown) document.exitPointerLock?.();
    }
    const cur = this.slot === null ? undefined : this.teams.get(this.slot);
    this.sel.replaceChildren(
      el('option', { value: '', textContent: list.length ? TEXT.free : TEXT.none }),
      ...list.map((t) => el('option', { value: String(t.slot), textContent: t.name })),
    );
    this.sel.value = cur ? String(cur.slot) : '';
    this.dot.style.background = cur?.colour ?? 'transparent';
    this.freeBtn.classList.toggle('on', this.slot === null);
    if (this.shown && this.slot === null) this.setNote(list.length ? '' : TEXT.none);
  }

  private setNote(text: string) {
    this.note.textContent = text;
    this.note.hidden = !text;
  }
}
