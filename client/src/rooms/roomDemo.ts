// DEV, offline only (main.ts `?roomDemo=chocolate|comic&team=<slot>&roomState=…`, presets p11-room-*): stand-in RaceViews that
// put the main client inside a Lựa chọn kép room without a server (invented UI text, never the leg's). Pure, tested in Node.
//  in       = inside, 2 of total made (default)        pending = total/total made, waiting for the Host's Duyệt
//  done     = then the next card arrives (Duyệt): the exit ring lights, the card is held
//  skipped  = "Bỏ qua" pressed: the next card arrives at once (ring + held card)
//  switch   = then "Đổi lựa chọn kép": switchLocked + leftRoom: the ring lights, the table locks, the team walks out by itself
//  switch-left = `switch`, then the body walks into the ring: the world in front of the old box, the countdown running
//  left     = `done`, then the body walks into the ring: back in the world, the next card pops
// kind hall (the BOZAR concert hall, challenge T2 with `room` + `pick: 'seat'`): in = picking the seat · done = T2 done: the stand-in
// card, T3 held until F at the stage pick-up spot · left = then walked out through the ring (T3 pops).
// kind garderobe (the GardeRobe challenge room, card T1 with `room`): in = answering inside (ring always lit) · done = T1
// completed (4/4): the next card held · left = then walked out through the ring. (`?close=n` = vitrine n's close-up: the room.)
import type { ClueCard, RaceView, RoomView, TaskView } from '@race/shared/protocol';

export type DemoRoomState = 'in' | 'pending' | 'done' | 'skipped' | 'switch' | 'left' | 'switch-left';
export const DEMO_ROOM_STATES: readonly DemoRoomState[] = ['in', 'pending', 'done', 'skipped', 'switch', 'left', 'switch-left'];

const T0 = Date.UTC(2026, 9, 1, 9, 0, 0);
const NOW = T0 + 1_800_000;
const ROOMS: Record<'chocolate' | 'comic', Omit<RoomView, 'done' | 'skipped'>> = { chocolate: { kind: 'chocolate', total: 5, penaltyMinutesEach: 20 }, comic: { kind: 'comic', total: 9, penaltyMinutesEach: 12 } };
type DetourKind = keyof typeof ROOMS;

const view = (card: ClueCard | null): RaceView => ({ status: 'running', finishAt: null, penaltyMinutes: 0, card, checkinAt: null, result: null });
const task = (kind: DetourKind, done: number, skipped: boolean): TaskView => ({
  title: kind === 'chocolate' ? 'Sô-cô-la' : 'Vẽ truyện tranh',
  description: kind === 'chocolate' ? 'Tới bàn của đội trong xưởng và làm đủ các loại sô-cô-la minh họa.' : 'Tới bàn vẽ của đội trong phòng tranh và vẽ lại đủ các bức minh họa.',
  media: [], kind: 'free', verification: 'host_approval', input: 'proof', proofInstruction: '', timeLimitMinutes: null,
  place: kind === 'chocolate' ? 'Xưởng sô-cô-la minh họa' : 'Phòng tranh minh họa',
  room: { ...ROOMS[kind], done: Math.min(done, ROOMS[kind].total), skipped },
});
const BRANCHES = (kind: DetourKind, t?: TaskView) => [
  { id: 'A', name: 'Sô-cô-la', summary: 'Làm thử vài loại kẹo sô-cô-la minh họa.', ...(kind === 'chocolate' && t ? { task: t } : {}) },
  { id: 'B', name: 'Vẽ truyện tranh', summary: 'Vẽ lại vài bức tranh minh họa theo mẫu.', ...(kind === 'comic' && t ? { task: t } : {}) },
];
/** The detour card of a team inside the `kind` room (branch A = chocolate, B = comic), `done` made. */
export function roomCard(kind: DetourKind, done: number, skipped = false, status: ClueCard['status'] = 'active'): ClueCard {
  const branch = kind === 'chocolate' ? 'A' : 'B';
  return {
    step: 'D1', type: 'detour', label: 'Lựa chọn kép', text: 'Lời dẫn minh họa: chọn một trong hai con đường.\nLưu ý: Mỗi lần đổi Lựa chọn kép, đội chơi sẽ bị phạt 10 phút.',
    media: [], branch, branchOpened: true, branches: BRANCHES(kind, task(kind, done, skipped)), switches: 0, switchPenaltyMinutes: 10, retryPenaltyMinutes: 3,
    status, lockedUntil: null, lockKind: null, answers: status === 'pending' ? [{ id: 1, text: `Hoàn thành phòng: ${ROOMS[kind].total}/${ROOMS[kind].total}`, at: NOW - 20_000, status: 'pending' }] : [], receivedAt: T0, completedAt: null,
  };
}
/** The GardeRobe challenge card (invented text): 4 answer boxes, played inside the museum room. */
export const GARDEROBE_CARD: ClueCard = {
  step: 'T1', type: 'challenge', label: 'Thử thách 1', text: '', media: [], room: 'garderobe', status: 'active', lockedUntil: null, lockKind: null, answers: [], receivedAt: T0, completedAt: null, retryPenaltyMinutes: 2,
  task: { title: 'Tủ đồ', description: 'Trước mặt đội là 4 bộ trang phục minh họa: ghi nước gốc của từng bộ vào 4 ô.', media: [], kind: 'answer', verification: 'host_approval', input: 'parts', partLabels: ['Bộ 1', 'Bộ 2', 'Bộ 3', 'Bộ 4'], proofInstruction: '', timeLimitMinutes: null },
};
/** The BOZAR hall card (invented text): challenge T2 "pick the seat", played inside the concert hall (no input box: F on a seat). */
export const HALL_CARD: ClueCard = {
  step: 'T2', type: 'challenge', label: 'Thử thách 2', text: '', media: [], room: 'hall', status: 'active', lockedUntil: null, lockKind: null, answers: [], receivedAt: T0, completedAt: null, retryPenaltyMinutes: 1,
  task: { title: 'Ai hay đi nhà hát', description: 'Tìm đúng chiếc ghế mà mật thư yêu cầu (minh họa).', media: [], kind: 'answer', verification: 'auto', input: 'seat', proofInstruction: '', timeLimitMinutes: null },
};
/** The BOZAR hall T3 card (invented text): held at the stage until F at the pick-up spot (`pickup`). */
export const HALL_T3_CARD: ClueCard = {
  step: 'T3', type: 'challenge', label: 'Thử thách 3', text: '', media: [], room: 'hall', status: 'active', lockedUntil: null, lockKind: null, answers: [], receivedAt: T0, completedAt: null, retryPenaltyMinutes: 3,
  pickup: { clue: 'Đội chơi đi lại gần sân khấu để nhận mật thư tiếp theo (minh họa).', prompt: 'Bấm F để nhận mật thư thử thách 3' },
  task: { title: 'Queen Elisabeth', description: 'Nghe 2 đoạn voice rồi điền tên bài hát và thí sinh (minh họa).', media: [], kind: 'answer', verification: 'host_approval', input: 'parts', partLabels: ['Câu 1 · Tiết mục', 'Câu 1 · Thí sinh', 'Câu 2 · Tiết mục', 'Câu 2 · Thí sinh'], proofInstruction: '', timeLimitMinutes: null },
};
/** The card after the detour step: the next route (invented text). */
export const NEXT_CARD: ClueCard = { step: 'L2', type: 'route_info', label: 'Lộ trình 2', text: 'Mật thư minh họa: đội tìm đường tới điểm kế tiếp để nhận mật thư đi tiếp.', transport: { allowed: 'any' }, media: [], status: 'active', lockedUntil: null, lockKind: null, answers: [], receivedAt: NOW, completedAt: null };

/** The views of a demo: `first` right away, `then` once the room is up (the server's next message). */
export function demoRoomViews(kind: RoomView['kind'], state: DemoRoomState): { first: RaceView; then: RaceView | null } {
  if (kind === 'hall') return { first: view(HALL_CARD), then: state === 'done' || state === 'left' ? view(HALL_T3_CARD) : null }; // T2 done → T3 held at the stage
  if (kind === 'garderobe') return { first: view(GARDEROBE_CARD), then: state === 'done' || state === 'left' ? view(NEXT_CARD) : null };
  const total = ROOMS[kind].total;
  switch (state) {
    case 'pending': return { first: view(roomCard(kind, total, false, 'pending')), then: null };
    case 'done': case 'left': return { first: view(roomCard(kind, total, false, 'pending')), then: view(NEXT_CARD) };
    case 'skipped': return { first: view(roomCard(kind, 2)), then: view(NEXT_CARD) };
    case 'switch': case 'switch-left': {
      const c = roomCard(kind, 2);
      return { first: view(c), then: view({ ...c, branch: kind === 'chocolate' ? 'B' : 'A', branchOpened: false, branches: BRANCHES(kind), status: 'switchLocked', switches: 1, lockedUntil: 600_000, lockKind: 'switch', leftRoom: kind }) }; // the offline serverNow is 0: "còn 10:00"
    }
    default: return { first: view(roomCard(kind, 2)), then: null };
  }
}

/** What the (absent) server would answer a `race room` report inside the demo: done grows / n of n → pending / skipped → the
 *  next card at once. */
export function demoRoomResult(v: RaceView, done: number, skipped: boolean): RaceView {
  const kind = v.card?.branch === 'B' ? 'comic' : 'chocolate';
  if (skipped) return view(NEXT_CARD);
  return view(roomCard(kind, done, false, done >= ROOMS[kind].total ? 'pending' : 'active'));
}
