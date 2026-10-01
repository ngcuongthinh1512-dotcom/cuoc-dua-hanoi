// SPEC §17.10 (2026-10-01): the current clue box is sent to a team only while it is within boxReveal.radius; it is taken
// away again only beyond radius + hysteresis, so a team walking along the boundary does not get a stream of
// reveal / hide messages (outgoing messages are free, but the box would blink). Pure: the Durable Object calls it every
// NET.boxCheckMs per online team, the client never needs it.
export interface BoxReveal {
  /** m from the box at which its position is sent (leg file `boxReveal.radius`, default 150, user decision 2026-10-01). */
  radius: number;
  /** m beyond the radius before a revealed box is hidden again (default 20). */
  hysteresis: number;
}

export const DEFAULT_BOX_REVEAL: BoxReveal = { radius: 150, hysteresis: 20 };

/** Should the box be visible now, given whether it was and the team's distance (m) to it? */
export function boxVisible(wasVisible: boolean, distance: number, r: BoxReveal = DEFAULT_BOX_REVEAL): boolean {
  return wasVisible ? distance <= r.radius + r.hysteresis : distance <= r.radius;
}
