// task.game "sang-com" win report check (codes from public/games/sang-com.html subCode('LANG VONG', t)).
import { describe, expect, it } from 'vitest';
import { gomCode, gomOk, sangComCode, sangComOk } from './tasks.ts';

describe('sang-com win report', () => {
  const t0 = 1_000_000;
  it('same hash as the game page', () => expect([sangComCode('03:41'), sangComCode('00:20')]).toEqual(['COM-6XHW6', 'COM-UTN4W']));
  it('accepts a matching code within the time since the task opened (+5 s)', () => {
    expect(sangComOk('03:41 COM-6XHW6', t0, t0 + 221_000)).toBe(true);
    expect(sangComOk(' 03:41 COM-6XHW6 ', t0, t0 + 216_000)).toBe(true); // 5 s slack
  });
  it('refuses a wrong code, a too short / too long time, no start, a bad shape', () => {
    expect(sangComOk('03:41 COM-6XHW7', t0, t0 + 999_000)).toBe(false);
    expect(sangComOk('00:19 COM-CKN8M', t0, t0 + 999_000)).toBe(false); // < 20 s
    expect(sangComOk('00:20 COM-UTN4W', t0, t0 + 20_000)).toBe(true);
    expect(sangComOk('03:41 COM-6XHW6', t0, t0 + 215_000)).toBe(false); // longer than the task has been open
    expect(sangComOk('03:41 COM-6XHW6', null, t0)).toBe(false);
    expect(sangComOk('3:41 COM-6XHW6', t0, t0 + 999_000)).toBe(false);
  });
});

// task.game "nan-gom" (codes from public/games/nan-gom.html makeCode('BAT TRANG', t))
describe('nan-gom win report', () => {
  const t0 = 1_000_000;
  it('same hash as the game page', () => expect([gomCode('07:32'), gomCode('01:00'), gomCode('00:59')]).toEqual(['GOM-5FCTA', 'GOM-JASF4', 'GOM-RSDVU']));
  it('accepts a matching code, ≥ 60 s, within the time since the task opened (+5 s)', () => {
    expect(gomOk('07:32 GOM-5FCTA', t0, t0 + 452_000)).toBe(true);
    expect(gomOk('07:32 GOM-5FCTA', t0, t0 + 447_000)).toBe(true);
    expect(gomOk('01:00 GOM-JASF4', t0, t0 + 60_000)).toBe(true);
  });
  it('refuses a wrong code, < 60 s, too long, no start, a COM code', () => {
    expect(gomOk('07:32 GOM-5FCTB', t0, t0 + 999_000)).toBe(false);
    expect(gomOk('00:59 GOM-RSDVU', t0, t0 + 999_000)).toBe(false);
    expect(gomOk('07:32 GOM-5FCTA', t0, t0 + 446_000)).toBe(false);
    expect(gomOk('07:32 GOM-5FCTA', null, t0)).toBe(false);
    expect(gomOk('03:41 COM-6XHW6', t0, t0 + 999_000)).toBe(false);
  });
});
