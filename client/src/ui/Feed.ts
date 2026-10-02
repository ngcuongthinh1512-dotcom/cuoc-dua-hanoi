// Phase 8B (docs/plans/phase8b.md §G; SPEC §17.19 (b)): the public feed in a bottom corner (config `feed.corner`, default
// bottom-left above the minimap, GTA chat style): "hh:mm · Đội X trả lời sai và bị phạt 3 phút[ · đúng 2/5]" /
// "hh:mm · Đội X đúng 5/5". Lines come from welcome.feed + `{t:'feed'}` (RaceClient → RaceHud.feed).
// FOUNDATION STUB — TODO(phase8b track C): feedText (4 cases: wrong before / after 70, right after 70, unknown slot), the
// DOM box (feed.lines newest, fading after feed.seconds, shown again on a new line), the "pop" of another team's line.
import type { FeedMessage, TeamInfo } from '@race/shared/protocol';

/** The Vietnamese line of one feed message (team name from welcome.teams by slot). TODO(phase8b track C). */
export function feedText(_m: FeedMessage, _teams: readonly TeamInfo[]): string {
  return '';
}

export class Feed {
  /** Every line received so far (welcome.feed first, oldest first), kept for the redraw. */
  readonly lines: FeedMessage[] = [];

  /** New lines (welcome: the kept ones; then one per `{t:'feed'}`). TODO(phase8b track C): draw. */
  push(ms: readonly FeedMessage[], _teams: readonly TeamInfo[]): void {
    this.lines.push(...ms);
  }
}
