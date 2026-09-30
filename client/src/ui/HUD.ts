// Phase 5 track D (docs/plans/phase5.md §6 D): bottom-right HUD (STYLE_GUIDE): street name (handwritten) + district on a
// change of street (hudWidgets.streetSeconds, then fades), "LABEL · value" blocks under it: race clock, speedometer
// (km/h + bike icon, riding only, SPEC §12). Top-left stays free for the Phase 7 mission card.
// STUB (foundation): no DOM.
import type { HudFrame } from './types.ts';

export class HUD {
  /** Every frame in player mode. */
  update(_f: HudFrame, _dt: number): void {}
}
