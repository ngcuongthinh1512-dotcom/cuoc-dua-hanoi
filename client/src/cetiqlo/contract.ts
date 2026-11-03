// CETIQLO room (docs/plans/cetiqlo.md): the ONE file the room module imports its contracts through — the protocol (`cq.*`, §4 / §9.1, shared),
// the catalog (§2, shared) and the store scene (§7, the store agent's storeScene.ts / mannequin.ts). Adapting to a contract change = this
// file + the few call sites it names in cetiqloRoom.ts.
export type { CqBoardRow, CqBoardStatus, CqClientMessage, CqMark, CqMatchView, CqResult, CqServerMessage, CqTeamResult } from '@race/shared/protocol';
export type { CatalogItem, SlotKind } from '@race/shared/cetiqlo';
export type { StoreHandle } from './storeScene.ts';
export type { Mannequin as MannequinHandle } from './mannequin.ts';
