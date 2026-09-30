// Phase 5 track C (docs/plans/phase5.md §6 C): player settings (menu "Cài đặt"): invert Y, mouse sensitivity. Read live
// by ThirdPersonCamera.look / FreeFlyCamera.update; saved per browser in localStorage (menu.storageKey, try/catch:
// blocked storage = defaults).
// STUB (foundation): defaults, not saved, not read by the cameras yet.
export interface Settings {
  invertY: boolean;
  /** × the camera's mouseSensitivity (menu.sensitivity range). */
  mouseSensitivity: number;
}

export const settings: Settings = { invertY: false, mouseSensitivity: 1 };

export function saveSettings(): void {}
