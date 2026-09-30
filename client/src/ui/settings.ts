// Phase 5 track C (docs/plans/phase5.md §6 C): player settings (menu "Cài đặt"): invert Y, mouse sensitivity. Read live
// by ThirdPersonCamera.look / FreeFlyCamera.update; saved per browser in localStorage (menu.storageKey). Importing
// touches no DOM; blocked or missing storage (private window, Node tests) = defaults.
import { menu as M } from '../config.ts';

export interface Settings {
  /** Mouse up = look down (and the right stick the same). */
  invertY: boolean;
  /** × the camera's mouseSensitivity and gamepadLookSpeed (menu.sensitivity range). */
  mouseSensitivity: number;
}

const DEFAULTS: Readonly<Settings> = { invertY: false, mouseSensitivity: 1 };

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
