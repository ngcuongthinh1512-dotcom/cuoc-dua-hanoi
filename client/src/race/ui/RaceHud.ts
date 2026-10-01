// Phase 7 track C (docs/plans/phase7.md §5.3, §6 C): the race's DOM widgets, drawn only from what the server sent
// (RaceView / ClueCard / ZoneMember: never answers, never a later step):
//  - top-left mission card (SPEC §12: type icon + colour, label, clue summary, transport icon) + the full card that
//    opens when a new clue arrives (envelope animation, SPEC §8.3; Phase 7 task button "Hoàn thành (tạm)" → actions.task);
//  - Sổ mật thư (Tab, SPEC §8.11): reloaded from the server on every open (actions.book → showBook), current card pinned;
//  - "Xuất phát ở vị trí thứ n" at the right for raceHud.startOrderSeconds of sim time, then fades (SPEC §17.12);
//  - "Bấm F để mở hộp mật thư" prompt, Pit Stop penalty countdown, the host NPC's line after the check-in, "Tại điểm này".
// FOUNDATION STUB: signatures are the contract (main.ts / race/RaceClient.ts call them); track C implements. The module
// top level touches no DOM (Node tests import the pure parts).
import type { ClueCard, RaceView, TeamInfo, ZoneMember } from '@race/shared/protocol';

export interface RaceHudActions {
  /** Phase 7 stub task: the team says it did the task (`race task`; detour: the branch). */
  task(step: string, branch?: string): void;
  /** The Sổ mật thư opened: ask the server for the cards (`race book`). */
  book(): void;
}

export interface RaceHudFrame {
  /** s of sim clock (Player.simTime): banner timing / fades, deterministic screenshots. */
  simTime: number;
  /** ms, server clock estimate (NetClient.serverNow): the penalty countdown (RaceView.checkinAt). */
  serverNow: number;
  /** The body stands inside the current, unopened box's zone, on foot: show "Bấm F để mở hộp mật thư". */
  inZone: boolean;
}

export class RaceHud {
  constructor(readonly actions: RaceHudActions) {}

  /** welcome.view / `race` message; a card not seen before opens as the full card. */
  setView(_view: RaceView | null): void {}

  /** `book` answer (the cards in order). */
  showBook(_cards: readonly ClueCard[]): void {}

  /** Tab (main.ts): open (→ actions.book) / close. */
  toggleBook(): void {}

  /** The book or a full card is open: the body stops, keys go to the panel (main.ts modal()). */
  get open(): boolean {
    return false;
  }

  /** SPEC §17.12: once, at the first entry (welcome.showStartOrder). */
  startOrder(_n: number, _simTime: number): void {}

  /** SPEC §8.6: after the check-in, the host NPC's line (team name + official time when known). */
  finished(_team: string, _officialMs: number | null): void {}

  /** SPEC §7 "Tại điểm này" (`zone` message): the other teams here, named from welcome.teams. */
  zone(_members: readonly ZoneMember[], _teams: readonly TeamInfo[]): void {}

  update(_f: RaceHudFrame): void {}

  /** DEV, offline only (p7-* presets): stand-in data from the URL (?card=…, ?book, ?startOrder=n, ?finish, ?zone). */
  demo(_q: URLSearchParams): void {}
}
