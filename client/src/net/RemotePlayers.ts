// Phase 6 track B (docs/plans/phase6.md §5.2): the other teams, rebuilt from ticks (SPEC §7): a PlayerState per slot
// interpolated remote.interpolationMs behind the server clock, drawn with CharacterModel + CharacterAnimator (team shirt,
// name tag) and a BikeModel while riding; ghosts (no Rapier body), hidden beyond presence.renderRadius.
import type { GestureKind, TeamInfo, TickEntry } from '@race/shared/protocol';
import type { Scene, Vector3 } from 'three';
import type { CharacterAsset } from '../player/CharacterModel.ts';
import type { BikeAsset } from '../vehicle/BikeModel.ts';

/** Foundation stub: draws nothing. Track B replaces the bodies, keeps the signatures. */
export class RemotePlayers {
  constructor(
    readonly scene: Scene,
    readonly asset: CharacterAsset,
    readonly bikeAsset: BikeAsset | null,
    /** m (Welcome.presence.renderRadius). */
    public renderRadius: number,
  ) {}

  /** Welcome.teams: names, colours, slots (also after a reconnect). */
  setTeams(_teams: readonly TeamInfo[]) {}

  setOnline(_slot: number, _online: boolean) {}

  /** One server tick: poses of the teams within the interest radius (never the local player). */
  apply(_serverMs: number, _entries: readonly TickEntry[]) {}

  /** G (wave) / R (bell) of another team (server `gesture`). */
  gesture(_slot: number, _g: GestureKind) {}

  /** Every frame: interpolate, animate, cull by distance from `viewer`. */
  update(_dt: number, _serverNow: number, _viewer: Vector3) {}

  /** Remote players drawn this frame (F3). */
  get count() {
    return 0;
  }

  dispose() {}
}
