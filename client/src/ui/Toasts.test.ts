import { describe, expect, it } from 'vitest';
import { toasts } from '../config.ts';
import { NOTICES, nextFeed, notice, toast } from './Toasts.ts';
import type { NoticeCode } from './types.ts';

const texts = (feed: ReturnType<typeof nextFeed>) => feed.map((t) => t.text);

describe('toast feed (pure part)', () => {
  it('the same text within repeatGap s is dropped, after it the line comes back as new (never two same lines)', () => {
    let feed = nextFeed([], 'A', 0);
    feed = nextFeed(feed, 'B', 0.5);
    feed = nextFeed(feed, 'A', toasts.repeatGap - 0.1);
    expect(feed).toEqual([{ text: 'A', at: 0 }, { text: 'B', at: 0.5 }]);
    feed = nextFeed(feed, 'A', toasts.repeatGap + 0.1);
    expect(feed).toEqual([{ text: 'B', at: 0.5 }, { text: 'A', at: toasts.repeatGap + 0.1 }]);
  });

  it('a different text is not a repeat; lines older than toasts.seconds are gone', () => {
    let feed = nextFeed([], 'A', 0);
    feed = nextFeed(feed, 'B', 0.5);
    expect(texts(feed)).toEqual(['A', 'B']);
    feed = nextFeed(feed, 'C', toasts.seconds + 0.1); // A (0) expired, B (0.5) not yet
    expect(texts(feed)).toEqual(['B', 'C']);
    expect(texts(nextFeed(feed, 'D', 100))).toEqual(['D']);
  });

  it('beyond toasts.max lines the oldest go first', () => {
    let feed: ReturnType<typeof nextFeed> = [];
    const names = Array.from({ length: toasts.max + 2 }, (_, i) => `line ${i}`);
    names.forEach((n, i) => void (feed = nextFeed(feed, n, i * 0.1)));
    expect(texts(feed)).toEqual(names.slice(-toasts.max));
  });

  it('does not mutate the feed it was given', () => {
    const before = [{ text: 'A', at: 0 }] as const;
    nextFeed(before, 'B', 1);
    expect(before).toEqual([{ text: 'A', at: 0 }]);
  });
});

describe('notices', () => {
  it('every code has its own Vietnamese text (SPEC §6.3 / §6.6 wording)', () => {
    const codes: NoticeCode[] = ['bikeStairs', 'bikeTooFast', 'bikeTooFar', 'bikeTaken', 'respawn', 'respawnStairs', 'bikeLost', 'bikeGone', 'bikeParked', 'walkOnly',
      'raceNotOpen', 'racePaused', 'raceOver', 'boxFar', 'boxRiding', 'boxOpened', 'taskFar', 'clueNew', 'penaltyWait',
      'answerSent', 'answerWrong', 'answerPending', 'answerLocked', 'approved', 'penalized', 'branchChosen', 'branchSwitched', 'branchPending', 'taskNotStarted', // Phase 8
      'lockWrong', 'pickLimit', 'creditsLocked', // Phase 8B
      'reviewUndone', // Phase 10
      'bikeBroken']; // SPEC §17.30 decoy
    expect(Object.keys(NOTICES).sort()).toEqual([...codes].sort());
    expect(new Set(Object.values(NOTICES)).size).toBe(codes.length);
    expect(NOTICES.bikeStairs).toBe('Không đi xe trên bậc thang');
    expect(NOTICES.bikeTaken).toBe('Chậm một bước! Xe đang có người đi.'); // §17.34: no owner lock
    expect(NOTICES.respawnStairs).toBe('Đã đưa bạn lên bậc kè gần nhất');
    expect(NOTICES.bikeLost).toBe('Chậm một bước! Xe đã có người lấy.'); // SPEC §6.3
    expect(NOTICES.walkOnly).toBe('Lộ trình này bắt buộc đi bộ'); // SPEC §6.5
    // the server's boxRiding also answers a task / check-in on a bike (D4); raceOver also a bike claim refused 'finished'
    expect(NOTICES.boxRiding).toBe('Xuống xe trước đã: không mở hòm, làm nhiệm vụ hay check-in khi đang ngồi xe');
    expect(NOTICES.raceOver).toMatch(/^Cuộc đua của đội bạn đã kết thúc: không lấy xe/);
  });

  it('one word for the clue box: "hòm (mật thư)", never "hộp" (SPEC §17.15, review visual#6)', () => {
    expect(Object.values(NOTICES).filter((t) => /hộp/i.test(t))).toEqual([]);
    expect(NOTICES.boxFar).toBe('Hãy vào gần hòm mật thư hơn');
  });

  it('importing and calling toast / notice in Node (no DOM) is harmless', () => {
    expect(typeof document).toBe('undefined');
    expect(() => (toast('x'), notice('bikeStairs'))).not.toThrow();
  });
});
