// Track A (docs/plans/phase3.md). STUB until Track A lands: advances the mixer only, no state machine.
import type { CharacterModel } from './CharacterModel.ts';
import type { PlayerState } from './types.ts';

export type AnimState =
  | 'idle'
  | 'walk' // moveMode 'slow'
  | 'jog' // moveMode 'walk' (standard speed)
  | 'jumpStart'
  | 'air' // jump loop and fall
  | 'land'
  | 'swimIdle'
  | 'swimFwd'
  | 'openBox'
  | 'pickUp'
  | 'celebrate'
  | 'wave'
  | 'crash'
  | 'climbOut'
  | 'talk' // Phase 7 Pit Stop host NPC
  | 'cycle'; // Phase 4: sitting pose + leg IK

/** UAL clip per state for the player body (docs/plans/phase3.md table). Pedestrians (Phase 4B) pass their own map. */
export const UAL_CLIPS: Readonly<Partial<Record<AnimState, string>>> = {
  idle: 'Idle_Loop',
  walk: 'Walk_Loop',
  jog: 'Jog_Fwd_Loop',
  jumpStart: 'Jump_Start',
  air: 'Jump_Loop',
  land: 'Jump_Land',
  swimIdle: 'Swim_Idle_Loop',
  swimFwd: 'Swim_Fwd_Loop',
  openBox: 'Interact',
  pickUp: 'PickUp_Table',
  celebrate: 'Dance_Loop',
  wave: 'Idle_Talking_Loop', // fallback; the wave itself is a procedural right-arm layer
  crash: 'Hit_Chest', // then Death01, then back up
  climbOut: 'Jump_Land',
  talk: 'Idle_Talking_Loop',
  cycle: 'Driving_Loop',
};

/** Picks the clip for a PlayerState, crossfades, matches playback speed to the ground speed. Call once per frame. */
export class CharacterAnimator {
  state: AnimState = 'idle';

  constructor(
    private readonly model: CharacterModel,
    readonly clipMap: Readonly<Partial<Record<AnimState, string>>> = UAL_CLIPS,
  ) {}

  update(p: Readonly<PlayerState>, dt: number) {
    void p;
    this.model.mixer.update(dt);
  }
}
