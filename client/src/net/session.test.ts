import { describe, expect, it } from 'vitest';
import { net, netClient } from '../config.ts';
import { errorText, normalizeCode, readStoredCode, storeCode, summaryLines } from '../ui/Login.ts';
import { isOnline, raceId, startSession } from './session.ts';

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
    expect(summaryLines({ reconnects: 1, lastSeen: null, raceTime: null })).toEqual(['Cuộc đua chưa bắt đầu']);
    expect(summaryLines({ reconnects: 1, lastSeen: null, raceTime: 3725 })).toEqual(['Thời gian đua: 1:02:05']);
  });
});
