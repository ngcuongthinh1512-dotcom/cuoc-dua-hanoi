// Phase 5 track C (docs/plans/phase5.md §6 C): player settings (menu "Cài đặt"): invert Y, mouse sensitivity. Read live
// by ThirdPersonCamera.look / FreeFlyCamera.update; saved per browser in localStorage (menu.storageKey). Importing
// touches no DOM; blocked or missing storage (private window, Node tests) = defaults.
import type { Avatar } from '@race/shared/protocol';
import { menu as M, graphics8c } from '../config.ts';
import { graphics, type Quality } from '../world/graphics.ts';

const Q = graphics8c.quality;

export interface Settings {
  /** Mouse up = look down (and the right stick the same). */
  invertY: boolean;
  /** × the camera's mouseSensitivity and gamepadLookSpeed (menu.sensitivity range). */
  mouseSensitivity: number;
  /** Leg 2 "Nhân vật": 0 = Nam, 1 = Nữ (CharacterModel avatar index); read once at load, sent to the server on connect. */
  avatar: 0 | 1;
}

const DEFAULTS: Readonly<Settings> = { invertY: false, mouseSensitivity: 1, avatar: 0 };

/** The live object: cameras read it every frame, the menu writes it (keep the identity). */
export const settings: Settings = { ...DEFAULTS };

export type SettingsStore = Pick<Storage, 'getItem' | 'setItem'>;

/** Into menu.sensitivity.min…max; anything that is not a finite number → 1. */
export const clampSensitivity = (v: number) => (Number.isFinite(v) ? Math.min(M.sensitivity.max, Math.max(M.sensitivity.min, v)) : DEFAULTS.mouseSensitivity);

// Reading `localStorage` itself throws when site data is blocked.
const browserStore = (): SettingsStore | undefined => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};

/** Defaults, then whatever valid fields the stored JSON has. Never throws. */
export function loadSettings(store: SettingsStore | undefined = browserStore()): void {
  Object.assign(settings, DEFAULTS);
  try {
    const saved = JSON.parse(store?.getItem(M.storageKey) ?? 'null') as Partial<Record<keyof Settings, unknown>> | null;
    if (typeof saved?.invertY === 'boolean') settings.invertY = saved.invertY;
    if (typeof saved?.mouseSensitivity === 'number') settings.mouseSensitivity = clampSensitivity(saved.mouseSensitivity);
    if (saved?.avatar === 0 || saved?.avatar === 1) settings.avatar = saved.avatar;
  } catch {
    // unreadable storage or broken JSON: defaults
  }
}

export function saveSettings(store: SettingsStore | undefined = browserStore()): void {
  try {
    store?.setItem(M.storageKey, JSON.stringify(settings));
  } catch {
    // blocked / full storage: the settings last for this session only
  }
}

loadSettings();

// Phase 8C T1: graphics quality ('low' | 'high'), its own key (graphics8c.quality.storageKey) because world/graphics.ts
// reads it once at load: a change applies after a reload.

/** Stores the quality choice; false when storage is blocked (the choice is then lost). */
export function saveQuality(q: Quality, store: SettingsStore | undefined = browserStore()): boolean {
  try {
    store!.setItem(Q.storageKey, q);
    return true;
  } catch {
    return false;
  }
}

/** The "Chất lượng đồ họa" row (select Cao / Thấp + hint) for the Esc menu's settings pane (ui/Menu.ts build). */
export function qualityRow(): HTMLElement {
  const select = document.createElement('select');
  select.id = 'menu-quality';
  select.append(new Option('Cao', 'high'), new Option('Thấp (máy yếu: tắt hậu kỳ, ảnh nhẹ hơn)', 'low'));
  select.value = graphics().quality;
  const label = document.createElement('label');
  label.htmlFor = select.id;
  label.textContent = 'Chất lượng đồ họa';
  const row = document.createElement('div');
  row.className = 'menu-row';
  row.append(label, select);
  const hint = document.createElement('p');
  hint.className = 'menu-hint';
  hint.textContent = 'Đổi chất lượng: áp dụng sau khi tải lại trang.';
  select.onchange = () => {
    hint.textContent = saveQuality(select.value as Quality)
      ? `Đã lưu "${select.selectedOptions[0]!.text}". Tải lại trang để áp dụng.`
      : 'Trình duyệt chặn lưu cài đặt: không lưu được.';
    select.blur(); // core/Input.ts ignores keys while a <select> has the focus (Esc, M…)
  };
  const box = document.createElement('div');
  box.append(row, hint);
  return box;
}

/** The player's avatar this page load: offline a DEV ?avatar=0|1 wins (screenshots), else the stored choice. */
export const pickAvatar = (q: URLSearchParams, online: boolean): Avatar => (!online && /^[0-6]$/.test(q.get('avatar') ?? '') ? (Number(q.get('avatar')) as Avatar) : settings.avatar);

/** The "Nhân vật" row (select Nam / Nữ + hint) for the Esc menu's settings pane: stored at once, applied after a reload
 *  (the body and the server's copy of the choice are made at load). */
export function avatarRow(): HTMLElement {
  const select = document.createElement('select');
  select.id = 'menu-avatar';
  select.append(new Option('Nam', '0'), new Option('Nữ', '1'));
  select.value = String(settings.avatar);
  const label = document.createElement('label');
  label.htmlFor = select.id;
  label.textContent = 'Nhân vật';
  const row = document.createElement('div');
  row.className = 'menu-row';
  row.append(label, select);
  const hint = document.createElement('p');
  hint.className = 'menu-hint';
  hint.textContent = 'Đổi nhân vật: áp dụng sau khi tải lại trang.';
  select.onchange = () => {
    settings.avatar = select.value === '1' ? 1 : 0;
    saveSettings();
    hint.textContent = `Đã chọn "${select.selectedOptions[0]!.text}". Tải lại trang để áp dụng.`;
    select.blur(); // core/Input.ts ignores keys while a <select> has the focus (Esc, M…)
  };
  const box = document.createElement('div');
  box.append(row, hint);
  return box;
}
