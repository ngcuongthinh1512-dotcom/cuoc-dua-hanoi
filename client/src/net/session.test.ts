import { describe, expect, it } from 'vitest';
import { net, netClient } from '../config.ts';
import { errorText, normalizeCode, readStoredCode, storeCode, summaryLines } from '../ui/Login.ts';
import { fetchMedia, isOnline, mediaUrl, raceId, startSession } from './session.ts';

describe('online or offline (docs/plans/phase6.md §3.17)', () => {
  it('offline unless a ?race= link (or PROD); ?offline=1 always wins', () => {
    expect(isOnline(new URLSearchParams(''), false)).toBe(false);
    expect(isOnline(new URLSearchParams('player&bike'), false)).toBe(false);
    expect(isOnline(new URLSearchParams('race=paris'), false)).toBe(true);
    expect(isOnline(new URLSearchParams(''), true)).toBe(true);
    expect(isOnline(new URLSearchParams('race=paris&offline=1'), true)).toBe(false);
  });

  it('the dev test world (no ?race=) starts with no session at all: every preset / ride-check runs as before', async () => {
    expect(await startSession(new URLSearchParams('player&bike&autoMove=walk'))).toBeNull();
  });

  it('race id from the link, net.defaultRace when missing or malformed', () => {
    expect(raceId(new URLSearchParams('race=paris-2026'))).toBe('paris-2026');
    expect(raceId(new URLSearchParams(''))).toBe(net.defaultRace);
    expect(raceId(new URLSearchParams('race=Paris!'))).toBe(net.defaultRace);
  });
});

describe('clue images (Phase 8 D13)', () => {
  const s = { race: 'paris', token: 'tok' };
  const fake = (status: number) => {
    const calls: [string, RequestInit | undefined][] = [];
    const get = (async (url: string, init?: RequestInit) => (calls.push([url, init]), new Response(status === 200 ? new Blob(['img'], { type: 'image/png' }) : null, { status }))) as typeof fetch;
    return { calls, get };
  };

  it('no session (offline) or a bad name → null, nothing fetched', async () => {
    const { calls, get } = fake(200);
    expect(await fetchMedia(null, 'r2:test-gia.jpg', get)).toBeNull();
    expect(await fetchMedia(undefined, 'test-gia.jpg', get)).toBeNull();
    expect(await fetchMedia(s, 'r2:../secret.jpg', get)).toBeNull();
    expect(await fetchMedia(s, 'r2:x.gif', get)).toBeNull();
    expect(calls).toEqual([]);
  });

  it('the token in a header (never the URL) → one blob URL per name; a 404 is asked again next time', async () => {
    const ok = fake(200);
    const a = await fetchMedia(s, 'r2:hinh-1.png', ok.get);
    expect(a).toMatch(/^blob:/);
    expect(await fetchMedia(s, 'hinh-1.png', ok.get)).toBe(a); // with or without the r2: prefix
    expect(ok.calls).toEqual([[mediaUrl('paris', 'hinh-1.png'), { headers: { Authorization: 'Bearer tok' } }]]);
    expect(ok.calls[0]![0]).toBe(`${net.apiBase}/race/paris/media/hinh-1.png`);
    const no = fake(404);
    expect(await fetchMedia(s, 'hinh-2.png', no.get)).toBeNull();
    expect(await fetchMedia(s, 'hinh-2.png', ok.get)).toMatch(/^blob:/);
    expect(no.calls.length).toBe(1);
    const down = (async () => {
      throw new TypeError('offline');
    }) as typeof fetch;
    expect(await fetchMedia(s, 'hinh-3.png', down)).toBeNull();
  });
});

describe('login screen (pure parts)', () => {
  it('normalises a typed code: upper case, no spaces', () => {
    expect(normalizeCode(' k7m 2qx ')).toBe('K7M2QX');
  });

  it('remembers the code; a throwing / missing storage still works', () => {
    const map = new Map<string, string>();
    const store = () => ({ getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) });
    expect(readStoredCode(store)).toBe('');
    storeCode('K7M2QX', store);
    expect(map.get(netClient.storageKey)).toBe('K7M2QX');
    expect(readStoredCode(store)).toBe('K7M2QX');
    const broken = () => {
      throw new Error('SecurityError');
    };
    expect(readStoredCode(broken)).toBe('');
    expect(() => storeCode('X', broken)).not.toThrow();
  });

  it('error lines and the welcome-back summary in Vietnamese', () => {
    expect(errorText('bad_code')).toBe('Mã đội không đúng');
    expect(errorText('locked', 59_001)).toBe('Nhập sai quá nhiều lần. Thử lại sau 60 giây');
    expect(errorText(undefined)).toMatch(/Không kết nối được máy chủ/);
    // SPEC §17.23: no race clock line; Phase 7: the current step (a label from the server, or an index)
    expect(summaryLines({ reconnects: 1, lastSeen: null })).toEqual([]);
    expect(summaryLines({ reconnects: 1, lastSeen: null, step: 'Thử thách 2' })).toEqual(['Đang làm: Thử thách 2']);
    expect(summaryLines({ reconnects: 1, lastSeen: null, step: 0 })[0]).toBe('Đang làm: Bước 1');
  });
});
