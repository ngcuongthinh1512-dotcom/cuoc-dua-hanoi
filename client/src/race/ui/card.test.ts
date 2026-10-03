// Phase 8 track C: the challenge / Lựa chọn kép card (docs/plans/phase8.md D15), pure parts of format.ts. The DOM (RaceHud.ts) only
// draws `cardPanel`, so "which button exists in which state" is decided and tested here.
import { describe, expect, it } from 'vitest';
import { NET, submitCode, type AnswerStatus, type AnswerView, type BranchView, type ClueCard, type RaceView, type TaskView } from '@race/shared/protocol';
import { raceClient as C } from '../../config.ts';
import { answerLines, branchConfirmText, cardPanel, formatTimeOfDay, hudKey, liveStatus, lockLine, mediaViews, pendingLine, statusLine, summarize, timerLine } from './format.ts';

const textTask: TaskView = { title: 'Phép tính', description: 'Tính đi', media: [], kind: 'answer', verification: 'host_approval', input: 'text', proofInstruction: '', timeLimitMinutes: null };
const proofTask: TaskView = { ...textTask, title: 'Ảnh', description: 'Chụp ảnh', kind: 'free', input: 'proof', proofInstruction: 'Gửi ảnh' };
const branches = (a?: TaskView, b?: TaskView): BranchView[] => [
  { id: 'A', name: 'Lửa', summary: 'Tóm tắt lửa', ...(a ? { task: a } : {}) },
  { id: 'B', name: 'Nước', summary: 'Tóm tắt nước', ...(b ? { task: b } : {}) },
];
const ans = (id: number, status: AnswerStatus, at = id * 1000, text = `câu ${id}`): AnswerView => ({ id, text, at, status });
const card = (o: Partial<ClueCard>): ClueCard => ({ step: 'T1', type: 'challenge', label: 'Thử thách 1', text: 'Gợi ý', media: [], status: 'active', lockedUntil: null, lockKind: null, answers: [], receivedAt: 0, completedAt: null, ...o });
const challenge = (o: Partial<ClueCard> = {}) => card({ task: textTask, retryPenaltyMinutes: 3, ...o });
const detour = (o: Partial<ClueCard> = {}) => card({ step: 'D1', type: 'detour', label: 'Lựa chọn kép', branches: branches(), branch: null, switchPenaltyMinutes: 10, retryPenaltyMinutes: 3, ...o });
const view = (c: ClueCard, o: Partial<RaceView> = {}): RaceView => ({ status: 'running', finishAt: null, penaltyMinutes: 0, card: c, checkinAt: null, result: null, ...o });
const P = (c: ClueCard, now = 0, o: Partial<Parameters<typeof cardPanel>[1]> = {}) => cardPanel(c, { now, teamName: 'Đội Xanh', mode: 'card', ...o });
const key = (o: Partial<KeyboardEvent>) => ({ code: '', key: '', keyCode: 0, isComposing: false, ...o }) as KeyboardEvent;

describe('countdown (D9): lockLine / liveStatus / statusLine', () => {
  const locked = challenge({ status: 'locked', lockedUntil: 160_000, lockKind: 'retry' });
  const switched = detour({ status: 'switchLocked', branch: 'B', lockedUntil: 552_000, lockKind: 'switch' });
  it('retry: "Phạt: còn mm:ss trước khi trả lời lại", counting down (rounded up)', () => {
    expect(lockLine(view(locked), 0)).toBe('Phạt: còn 02:40 trước khi trả lời lại');
    expect(lockLine(view(locked), 400)).toBe('Phạt: còn 02:40 trước khi trả lời lại');
    expect(lockLine(view(locked), 159_000)).toBe('Phạt: còn 00:01 trước khi trả lời lại');
  });
  it('switch: names the branch the team switched to', () => {
    expect(lockLine(view(switched), 0)).toBe('Đổi lựa chọn kép: còn 09:12 · hòm nhánh Nước hiện khi hết giờ');
  });
  it('gone after lockedUntil + the flip slack; none for a card without a countdown, a finished race, no view', () => {
    expect(lockLine(view(locked), 160_000 + C.lockEndSlackMs - 1)).toBe('Phạt: còn 00:00 trước khi trả lời lại');
    expect(lockLine(view(locked), 160_000 + C.lockEndSlackMs)).toBeNull();
    expect(lockLine(view(challenge()), 0)).toBeNull();
    expect(lockLine(view(locked, { status: 'finished' }), 0)).toBeNull();
    expect(lockLine(view(locked, { finishAt: 5 }), 0)).toBeNull();
    expect(lockLine(null, 0)).toBeNull();
    expect(lockLine({ ...view(locked), card: null }, 0)).toBeNull();
  });
  it('the card flips by itself once the countdown + slack ran out: locked → active, switchLocked → goToBranch', () => {
    expect(liveStatus(locked, 160_000 + C.lockEndSlackMs - 1)).toBe('locked');
    expect(liveStatus(locked, 160_000 + C.lockEndSlackMs)).toBe('active');
    expect(liveStatus(switched, 552_000 + C.lockEndSlackMs)).toBe('goToBranch');
    expect(liveStatus(challenge({ status: 'pending' }), 9e9)).toBe('pending');
  });
  it('top-left state line: Chờ Host duyệt / Phạt / Đổi nhánh / Nhánh X · tới hòm nhánh / nothing', () => {
    const pending = challenge({ status: 'pending', answers: [ans(1, 'pending', 100_000)] });
    expect(statusLine(pending, 172_000)).toEqual({ kind: 'wait', text: 'Chờ Host duyệt · 01:12' });
    expect(statusLine(locked, 0)).toEqual({ kind: 'lock', text: 'Phạt: còn 02:40' });
    expect(statusLine(switched, 0)).toEqual({ kind: 'lock', text: 'Đổi nhánh: còn 09:12' });
    expect(statusLine(detour({ status: 'goToBranch', branch: 'A' }), 0)).toEqual({ kind: 'info', text: 'Nhánh Lửa · tới hòm nhánh' });
    expect(statusLine(switched, 552_000 + C.lockEndSlackMs)).toEqual({ kind: 'info', text: 'Nhánh Nước · tới hòm nhánh' });
    expect(statusLine(challenge(), 0)).toBeNull();
    expect(statusLine(card({ type: 'route_info' }), 0)).toBeNull();
  });
  it('timerLine: the open card line, same sentences', () => {
    expect(timerLine(locked, 0)).toEqual({ kind: 'lock', text: 'Phạt: còn 02:40 trước khi trả lời lại' });
    expect(timerLine(challenge({ status: 'pending', answers: [ans(1, 'pending', 0)] }), 5000)).toEqual({ kind: 'wait', text: 'Đang chờ Host duyệt · 00:05' });
    expect(timerLine(challenge(), 0)).toBeNull();
  });
});

describe('pending line', () => {
  it('"Đang chờ Host duyệt · mm:ss" counts up from the pending answer; rounds down; a clock a little behind shows 00:00', () => {
    const c = challenge({ status: 'pending', answers: [ans(1, 'penalized', 10_000), ans(2, 'pending', 100_000)] });
    expect(pendingLine(c, 172_000)).toBe('Đang chờ Host duyệt · 01:12');
    expect(pendingLine(c, 172_900)).toBe('Đang chờ Host duyệt · 01:12');
    expect(pendingLine(c, 3_700_000)).toBe('Đang chờ Host duyệt · 1:00:00');
    expect(pendingLine(c, 90_000)).toBe('Đang chờ Host duyệt · 00:00');
  });
  it('null unless the card is pending', () => {
    expect(pendingLine(challenge({ answers: [ans(1, 'pending')] }), 9000)).toBeNull();
    expect(pendingLine(challenge({ status: 'locked' }), 0)).toBeNull();
  });
});

describe('answer history', () => {
  it('newest on top, Vietnamese status text, time of day', () => {
    const lines = answerLines(challenge({ answers: [ans(1, 'wrong', 1000), ans(2, 'pending', 2000), ans(3, 'approved', 3000), ans(4, 'correct', 4000), ans(5, 'penalized', 5000)] }));
    expect(lines.map((l) => l.text)).toEqual(['«câu 5»', '«câu 4»', '«câu 3»', '«câu 2»', '«câu 1»']);
    expect(lines.map((l) => l.label)).toEqual(['Bị phạt 3 phút', 'Đúng', 'Đã duyệt', 'Chờ Host duyệt', 'Chưa đúng']);
    expect(lines[0]!.time).toBe(formatTimeOfDay(5000));
    expect(lines[0]!.time).toMatch(/^\d\d:\d\d:\d\d$/);
  });
  it('the penalty minutes come from the card, never a hard-coded 3 (a test leg says 0,1)', () => {
    const one = (m: number | undefined) => answerLines(challenge({ retryPenaltyMinutes: m, answers: [ans(1, 'penalized')] }))[0]!.label;
    expect(one(0.1)).toBe('Bị phạt 0,1 phút');
    expect(one(10)).toBe('Bị phạt 10 phút');
    expect(one(0)).toBe('Bị phạt'); // task.retryLockMinutes: 0 = no countdown
    expect(one(undefined)).toBe('Bị phạt');
    // SPEC §17.31: the Host's count rides on the server's answer (only when it chose to send it)
    expect(answerLines(challenge({ answers: [{ ...ans(1, 'penalized'), score: 2, of: 4 }] }))[0]!.label).toBe('Bị phạt 3 phút · đúng 2/4');
  });
  it('at most NET.answerHistory lines; "đã gửi bài" for a photo answer', () => {
    const many = Array.from({ length: NET.answerHistory + 5 }, (_, i) => ans(i + 1, 'wrong'));
    const lines = answerLines(challenge({ answers: many }));
    expect(lines).toHaveLength(NET.answerHistory);
    expect(lines[0]!.text).toBe(`«câu ${NET.answerHistory + 5}»`);
    expect(answerLines(challenge({ answers: [ans(1, 'pending', 1, '')] }))[0]!.text).toBe('đã gửi bài');
  });
});

describe('Đổi lựa chọn kép confirm', () => {
  it('names the penalty minutes, what is lost and where the box shows', () => {
    const c = detour({ status: 'goToBranch', branch: 'A' });
    const t = branchConfirmText(c, 'B');
    expect(t).toContain('10 phút');
    expect(t).toContain('Đổi sang nhánh Nước?');
    expect(t).toContain('mất tiến độ nhánh Lửa');
    expect(t).toContain('hòm nhánh Nước chỉ hiện khi hết đếm ngược');
    expect(branchConfirmText({ ...c, switchPenaltyMinutes: 0.2 }, 'B')).toContain('0,2 phút');
  });
});

describe('media', () => {
  it('r2:<name> → image; https → link labelled, else by host; bad names and non-http links are dropped', () => {
    const m = (url: string, label = '') => ({ url, label, kind: url.startsWith('r2:') ? ('image' as const) : ('link' as const) });
    expect(mediaViews([m('r2:anh-1.jpg', 'Ảnh'), m('r2:KHONG HOP LE.gif'), m('https://www.example.org/a/b?x=1'), m('https://fb.com/x', 'Facebook'), m('javascript:alert(1)'), m('http://localhost:8787/x')])).toEqual([
      { kind: 'image', name: 'anh-1.jpg', label: 'Ảnh' },
      { kind: 'link', href: 'https://www.example.org/a/b?x=1', label: 'example.org' },
      { kind: 'link', href: 'https://fb.com/x', label: 'Facebook' },
      { kind: 'link', href: 'http://localhost:8787/x', label: 'localhost' },
    ]);
    expect(mediaViews(undefined)).toEqual([]);
  });
  it('a task / branch task carries its own media into its block', () => {
    const t = { ...textTask, media: [{ url: 'r2:a.png', label: '', kind: 'image' as const }] };
    expect(summarize(challenge({ task: t })).blocks[0]!.media).toEqual([{ kind: 'image', name: 'a.png', label: '' }]);
    const d = detour({ branch: 'A', branchOpened: true, branches: branches(t) });
    expect(summarize(d).blocks.map((b) => b.media.length)).toEqual([1, 0]);
    expect(summarize(d).blocks[0]!.text).toBe('Tính đi'); // the chosen, opened branch shows its task, not its summary
  });
});

describe('card controls follow the card state (D5 / D6 / D15)', () => {
  const shape = (p: ReturnType<typeof P>) => ({ accept: p.accept, choose: p.choose, input: p.answerBox, proof: p.proof?.actions ?? null, switchTo: p.switchTo.map((s) => s.id) });

  it('teaser: only "Nhận thử thách"', () => {
    expect(shape(P(challenge({ status: 'teaser', task: undefined })))).toEqual({ accept: true, choose: [], input: false, proof: null, switchTo: [] });
  });
  it('challenge active: the answer box (and the history); pending: no box, the stopwatch; locked: no box, the countdown', () => {
    const history = [ans(1, 'penalized', 1000)];
    expect(shape(P(challenge({ answers: history })))).toEqual({ accept: false, choose: [], input: true, proof: null, switchTo: [] });
    expect(P(challenge({ answers: history })).history).toHaveLength(1);
    const pending = P(challenge({ status: 'pending', answers: [ans(1, 'pending', 0)] }), 5000);
    expect(shape(pending).input).toBe(false);
    expect(pending.line).toEqual({ kind: 'wait', text: 'Đang chờ Host duyệt · 00:05' });
    const locked = P(challenge({ status: 'locked', lockedUntil: 160_000, lockKind: 'retry' }));
    expect(shape(locked).input).toBe(false);
    expect(locked.line?.kind).toBe('lock');
    expect(shape(P(challenge({ status: 'locked', lockedUntil: 160_000, lockKind: 'retry' }), 160_000 + C.lockEndSlackMs)).input).toBe(true); // countdown over: typing again
  });
  it('detour choose: two choose buttons, NO "Đổi" button', () => {
    expect(shape(P(detour({ status: 'choose' })))).toEqual({ accept: false, choose: ['A', 'B'], input: false, proof: null, switchTo: [] });
  });
  it('detour goToBranch: "Đổi" present, note names the branch, no input', () => {
    const p = P(detour({ status: 'goToBranch', branch: 'A', switches: 2 }));
    expect(shape(p)).toEqual({ accept: false, choose: [], input: false, proof: null, switchTo: ['B'] });
    expect(p.note).toBe('Đang làm nhánh Lửa – tới hòm nhánh để nhận đề bài · Đã đổi nhánh 2 lần');
  });
  it('detour switchLocked: countdown, no button at all', () => {
    const p = P(detour({ status: 'switchLocked', branch: 'B', lockedUntil: 552_000, lockKind: 'switch' }));
    expect(shape(p)).toEqual({ accept: false, choose: [], input: false, proof: null, switchTo: [] });
    expect(p.line?.text).toContain('09:12');
  });
  it('branch task: active → input + "Đổi"; pending → NO input and NO "Đổi"; locked → "Đổi" present (§17.16: only pending forbids)', () => {
    const open = { branch: 'A', branchOpened: true, branches: branches(textTask) };
    expect(shape(P(detour({ ...open, status: 'active' })))).toEqual({ accept: false, choose: [], input: true, proof: null, switchTo: ['B'] });
    expect(shape(P(detour({ ...open, status: 'pending', answers: [ans(1, 'pending', 0)] })))).toEqual({ accept: false, choose: [], input: false, proof: null, switchTo: [] });
    const locked = P(detour({ ...open, status: 'locked', lockedUntil: 160_000, lockKind: 'retry' }));
    expect(shape(locked)).toEqual({ accept: false, choose: [], input: false, proof: null, switchTo: ['B'] });
    expect(locked.line?.kind).toBe('lock');
  });
  it('photo branch: "Tôi đã gửi bài" only while active, no Messenger link (SPEC §17.17); the code stays while pending / locked; no input box', () => {
    const open = { branch: 'B', branchOpened: true, branches: branches(undefined, proofTask) };
    const active = P(detour({ ...open, status: 'active' }));
    expect(active.answerBox).toBe(false);
    expect(active.proof).toEqual({ instruction: 'Gửi ảnh', code: 'Đội Xanh-D1-B', actions: true });
    expect(P(detour({ ...open, status: 'pending', answers: [ans(1, 'pending', 0, '')] })).proof).toMatchObject({ code: 'Đội Xanh-D1-B', actions: false });
    expect(P(detour({ ...open, status: 'locked', lockedUntil: 9e9, lockKind: 'retry' })).proof?.actions).toBe(false);
  });
  it('the submission code is the shared submitCode; a challenge has no branch part', () => {
    expect(submitCode('Đội Xanh', 'D1', 'A')).toBe('Đội Xanh-D1-A');
    expect(P(challenge({ task: proofTask, step: 'T2' })).proof?.code).toBe('Đội Xanh-T2');
    expect(P(detour({ branch: 'A', branchOpened: true, branches: branches(proofTask) })).proof?.code).toBe('Đội Xanh-D1-A');
  });
  it('done, or the Host ended the race (live false): nothing to press; the history is still readable on the card', () => {
    const done = P(challenge({ status: 'done', answers: [ans(1, 'approved')] }));
    expect(shape(done)).toEqual({ accept: false, choose: [], input: false, proof: null, switchTo: [] });
    expect(done.history).toHaveLength(1);
    expect(shape(P(challenge(), 0, { live: false })).input).toBe(false);
    expect(shape(P(detour({ status: 'choose' }), 0, { live: false })).choose).toEqual([]);
  });
});

describe('Sổ mật thư entry (mode book): read-only, never the answer history (SPEC §17.14)', () => {
  const secret = 'ĐÁP-ÁN-ĐÃ-GÕ';
  const full = challenge({ status: 'pending', answers: [ans(1, 'penalized', 1000, secret), ans(2, 'pending', 2000, secret)], switches: 1 });
  it('no history, no timer line, no controls, even for the pinned current card', () => {
    const p = P(full, 5000, { mode: 'book' });
    expect(p.history).toEqual([]);
    expect(p.line).toBeNull();
    expect(p.answerBox || p.accept || p.choose.length > 0 || p.switchTo.length > 0).toBe(false);
    expect(JSON.stringify(p)).not.toContain(secret);
    expect(JSON.stringify(summarize(full))).not.toContain(secret);
    const d = detour({ status: 'active', branch: 'A', branchOpened: true, branches: branches(textTask), answers: [ans(1, 'wrong', 1, secret)] });
    expect(JSON.stringify(P(d, 0, { mode: 'book' }))).not.toContain(secret);
    expect(JSON.stringify(P(d, 0, { mode: 'card' }))).toContain(secret); // the card itself does show them
  });
  it('a photo task still prints its submission code (and no send buttons); a detour shows the chosen branch and the switch count', () => {
    const p = P(detour({ status: 'active', branch: 'B', branchOpened: true, branches: branches(undefined, proofTask), switches: 1 }), 0, { mode: 'book' });
    expect(p.proof).toMatchObject({ code: 'Đội Xanh-D1-B', actions: false });
    expect(p.note).toBe('Đã đổi nhánh 1 lần');
    expect(p.blocks.find((b) => b.chosen)?.title).toBe('Nước');
  });
  it('summarize / panel say nothing beyond the ClueCard (a stray field on the object never reaches the screen)', () => {
    const leaky = { ...challenge(), referenceAnswers: ['BÍ-MẬT'], host_note: 'GHI-CHÚ' } as unknown as ClueCard;
    for (const out of [summarize(leaky), P(leaky), P(leaky, 0, { mode: 'book' })]) expect(JSON.stringify(out)).not.toMatch(/BÍ-MẬT|GHI-CHÚ/);
  });
});

describe('keys on an open card (hudKey)', () => {
  it('typing: Enter submits, but not while an IME composes (Telex / Unikey confirm the word with Enter)', () => {
    expect(hudKey(key({ code: 'Enter', key: 'Enter', keyCode: 13 }), true, false)).toBe('submit');
    expect(hudKey(key({ code: 'NumpadEnter', key: 'Enter', keyCode: 13 }), true, false)).toBe('submit');
    expect(hudKey(key({ code: 'Enter', key: 'Enter', keyCode: 13, isComposing: true }), true, false)).toBeNull();
    expect(hudKey(key({ code: 'Enter', key: 'Enter', keyCode: 229 }), true, false)).toBeNull(); // Safari: composition just ended, keyCode 229
    expect(hudKey(key({ code: 'Enter', key: 'Process', keyCode: 13 }), true, false)).toBeNull();
    expect(hudKey(key({ code: '', key: 'ế', keyCode: 0 }), true, false)).toBeNull(); // Unikey: converted letter, no physical code
  });
  it('typing: Space and digits are the text, Esc only leaves the box (never closes the card)', () => {
    for (const code of ['Space', 'Digit1', 'Digit2', 'Numpad1', 'KeyA', 'Tab']) expect(hudKey(key({ code, key: ' ' }), true, false)).toBeNull();
    expect(hudKey(key({ code: 'Escape', key: 'Escape' }), true, false)).toBe('blur');
    expect(hudKey(key({ code: 'Escape', key: 'Escape', isComposing: true }), true, false)).toBeNull(); // Esc cancels the composition only
  });
  it('not typing: Esc / Space close the card, Space does not close the Sổ, Enter = the primary button, 1 / 2 = the branch buttons', () => {
    expect(hudKey(key({ code: 'Escape' }), false, false)).toBe('close');
    expect(hudKey(key({ code: 'Escape' }), false, true)).toBe('close');
    expect(hudKey(key({ code: 'Space' }), false, false)).toBe('close');
    expect(hudKey(key({ code: 'Space' }), false, true)).toBeNull();
    expect(hudKey(key({ code: 'Enter' }), false, false)).toBe('primary');
    expect(hudKey(key({ code: 'NumpadEnter' }), false, false)).toBe('primary');
    expect(hudKey(key({ code: 'Digit1' }), false, false)).toBe('choose1');
    expect(hudKey(key({ code: 'Numpad2' }), false, false)).toBe('choose2');
    expect(hudKey(key({ code: 'Digit3' }), false, false)).toBeNull();
    expect(hudKey(key({ code: 'KeyW' }), false, false)).toBeNull();
  });
});
