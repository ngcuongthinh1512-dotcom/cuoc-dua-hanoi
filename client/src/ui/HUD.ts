// Phase 5 track D (docs/plans/phase5.md §3.6–3.8): bottom-right HUD (STYLE_GUIDE): street name (handwritten) + district
// on a change of place (hudWidgets.streetSeconds, then fades), "LABEL · value" blocks under it: race clock, speedometer
// (km/h + bike icon, riding only, SPEC §12). Top-left holds the Phase 7 mission card (race/ui/RaceHud.ts); Phase 7: the clock is the team's race clock (--:-- until the Host
// enters its start time) with "PHẠT +n phút" under it and the race status above it (not running). DOM is written only when
// a text changes; the module top level touches no DOM (tests import the pure parts in Node).
import { hud as H, hudWidgets as W } from '../config.ts';
import { districtLabel } from '../geo/districts.ts';
import type { RaceStatus } from '@race/shared/protocol';
import type { HudFrame } from './types.ts';

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Race clock, whole seconds: 37 → "00:37", 3725 → "1:02:05"; null = the Host has not entered the team's start time yet. */
export function formatClock(s: number | null): string {
  if (s == null) return '--:--';
  const t = Math.max(0, Math.floor(s));
  const [h, m, sec] = [Math.floor(t / 3600), Math.floor(t / 60) % 60, t % 60];
  return h ? `${h}:${pad2(m)}:${pad2(sec)}` : `${pad2(m)}:${pad2(sec)}`;
}

/** The status badge above the clock; null while running (or offline). */
export const statusLabel = (s: RaceStatus | undefined): string | null =>
  s === 'lobby' ? 'Chưa bắt đầu' : s === 'paused' ? 'Tạm dừng' : s === 'finished' ? 'Đã kết thúc' : null;

/** m/s → "19 km/h". */
export const formatSpeed = (ms: number) => `${Math.round(ms * 3.6)} km/h`;

/** When the place label shows: a new street name or a new district (re)starts it for streetSeconds of race clock (the
 *  sim clock: screenshots stay deterministic whatever the frame rate); the same place again, or no street name (parks,
 *  squares), shows nothing new. */
export class PlaceLabel {
  street = '';
  district = 0;
  private since = -Infinity;

  /** → whether the label shows at race time `time` (s). */
  update(street: string | undefined, district: number, time: number): boolean {
    if ((street && street !== this.street) || district !== this.district) {
      if (street) this.street = street;
      this.district = district;
      this.since = time;
    }
    return time - this.since < W.streetSeconds;
  }
}

// Two wheels, diamond frame, saddle, bars.
const BIKE_ICON =
  '<svg viewBox="0 0 24 16" width="21" height="14" fill="none" stroke="currentColor" stroke-width="1.8" ' +
  'stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:6px">' +
  '<circle cx="5" cy="11" r="4"/><circle cx="19" cy="11" r="4"/><path d="M5 11h6l5-7M9 4l2 7M5 11l4-7h7l3 7M7.5 3.5h3M16 4l-1-2h3"/></svg>';

function div(css: string, className = '') {
  const el = document.createElement('div');
  el.style.cssText = css;
  el.className = className;
  return el;
}
const setText = (el: HTMLElement, s: string) => void (el.textContent !== s && (el.textContent = s));

export class HUD {
  private readonly place = div(`text-align:right;opacity:0;transition:opacity ${W.streetFade}s`);
  private readonly street = div('font-size:30px;line-height:1.15;max-width:36vw;text-wrap:balance', 'hud-hand'); // long names: 2 lines
  private readonly district = div('font-size:19px;line-height:1.2', 'hud-hand');
  private readonly clock: HTMLElement;
  private readonly status = div('display:none;padding:1px 10px;font-size:13px;font-weight:700;letter-spacing:.06em;color:#ffd75e', 'hud-box');
  private readonly penaltyRow: HTMLElement;
  private readonly penalty: HTMLElement;
  private readonly speedRow: HTMLElement;
  private readonly speed: HTMLElement;
  private readonly label = new PlaceLabel();
  private shown = false;
  private riding = false;
  /** DEV only, offline (no race clock from the server): ?raceTime=--|<s>&penalty=<min>&raceStatus=lobby|paused|finished (p7-clock). */
  private readonly demo = import.meta.env.DEV && typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;

  constructor() {
    const root = div(
      `position:fixed;right:${H.margin}px;bottom:${W.bottom}px;display:flex;flex-direction:column;align-items:flex-end;` +
        `gap:${H.gap / 2}px;pointer-events:none`,
    );
    const row = (label: string) => {
      const box = div('display:flex;align-items:baseline;justify-content:space-between;gap:18px;min-width:180px;padding:2px 10px', 'hud-box');
      const name = document.createElement('span');
      name.style.cssText = 'font-size:12px;font-weight:600;letter-spacing:.08em;color:var(--hud-dim)';
      name.innerHTML = label;
      const value = document.createElement('span');
      value.style.cssText = 'font-size:20px;font-weight:700;font-variant-numeric:tabular-nums';
      box.append(name, value);
      return [box, value] as const;
    };
    let clockRow: HTMLElement;
    [clockRow, this.clock] = row('THỜI GIAN');
    [this.penaltyRow, this.penalty] = row('PHẠT');
    this.penaltyRow.style.display = 'none';
    this.penalty.style.color = '#ff8a7a';
    [this.speedRow, this.speed] = row(`${BIKE_ICON}TỐC ĐỘ`);
    this.speedRow.style.display = 'none'; // not `hidden`: the inline display:flex would win over it
    this.place.append(this.street, this.district);
    root.append(this.place, this.status, clockRow, this.penaltyRow, this.speedRow);
    document.body.append(root);
  }

  /** Every frame in player mode. */
  update(f: HudFrame, _dt: number): void {
    const on = this.label.update(f.street, f.district, f.time);
    if (on !== this.shown) this.place.style.opacity = (this.shown = on) ? '1' : '0';
    setText(this.street, this.label.street);
    setText(this.district, districtLabel(this.label.district));
    let [raceTime, penalty, status] = [f.raceTime, f.penaltyMinutes ?? 0, statusLabel(f.raceStatus)];
    if (f.raceTime === undefined && this.demo) {
      if (this.demo.has('raceTime')) raceTime = this.demo.get('raceTime') === '--' ? null : Number(this.demo.get('raceTime'));
      if (this.demo.has('penalty')) penalty = Number(this.demo.get('penalty'));
      if (this.demo.has('raceStatus')) status = statusLabel(this.demo.get('raceStatus') as RaceStatus);
    }
    if (!!status !== (this.status.style.display === 'block')) this.status.style.display = status ? 'block' : 'none';
    if (status) setText(this.status, status);
    setText(this.clock, formatClock(raceTime === undefined ? f.time : raceTime)); // undefined = offline: the sim clock
    const showPenalty = penalty > 0;
    if (showPenalty !== (this.penaltyRow.style.display === 'flex')) this.penaltyRow.style.display = showPenalty ? 'flex' : 'none';
    if (showPenalty) setText(this.penalty, `+${penalty} phút`);
    if (f.riding !== this.riding) this.speedRow.style.display = (this.riding = f.riding) ? 'flex' : 'none';
    if (f.riding) setText(this.speed, formatSpeed(f.speed));
  }
}
