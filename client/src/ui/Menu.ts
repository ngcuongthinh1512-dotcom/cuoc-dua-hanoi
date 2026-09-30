// Phase 5 track C (docs/plans/phase5.md §6 C): the real menu (SPEC §17.2: Esc, and opens by itself when the pointer is
// released): "Tiếp tục", "Kẹt? Về chỗ an toàn", settings (invert Y, mouse sensitivity), key table, race rules
// (docs/RACE_RULES.md), credits. The race never pauses (the menu says so).
// STUB (foundation): never opens (main.ts keeps showing the #help panel while the pointer is free).

export interface MenuActions {
  /** "Tiếp tục": main.ts locks the pointer again (a click is a user gesture). */
  resume(): void;
  /** "Kẹt? Về chỗ an toàn"; absent for the spectator (no body): button hidden. */
  respawn?: () => void;
}

export class Menu {
  constructor(readonly actions: MenuActions) {}

  get isOpen(): boolean {
    return false;
  }

  open(): void {}

  close(): void {}
}
