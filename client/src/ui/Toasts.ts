// Phase 5 track C (docs/plans/phase5.md §6 C): the toast feed (STYLE_GUIDE: stacked just above the minimap), e.g.
// "Không đi xe trên bậc thang", "Xe này đã có đội sử dụng". The same text within toasts.repeatGap s is dropped. The DOM
// is created on first use (importing this module touches nothing: Player.ts imports it in Node tests).
// STUB (foundation): no-op.
import type { NoticeCode } from './types.ts';

export function toast(_text: string): void {}

/** A fixed game message (its Vietnamese text lives here). */
export function notice(_code: NoticeCode): void {}
