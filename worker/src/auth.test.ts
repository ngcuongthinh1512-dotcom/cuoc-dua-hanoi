import { describe, expect, it } from 'vitest';
import { constantTimeEqual, HOST, newClaims, signToken, spectatorClaims, spectatorCodeOf, verifyToken } from './auth.ts';

const SECRET = 'doi-mat-khau-nay';

describe('tokens', () => {
  it('signs and verifies team and Host claims', async () => {
    const team = await signToken(SECRET, newClaims('paris', 'team-1', 1000));
    expect(await verifyToken(SECRET, team, 'paris', 2000)).toEqual({ r: 'paris', t: 'team-1', e: expect.any(Number) });
    const host = await signToken(SECRET, newClaims('paris', HOST));
    expect((await verifyToken(SECRET, host, 'paris'))?.t).toBe(HOST);
    expect(team.length).toBeLessThan(120);
  });

  it('refuses other races, other secrets, tampering, expiry and garbage', async () => {
    const token = await signToken(SECRET, newClaims('paris', 'team-1', 1000));
    expect(await verifyToken(SECRET, token, 'lyon', 2000)).toBeNull();
    expect(await verifyToken('other', token, 'paris', 2000)).toBeNull();
    const [body, sig] = token.split('.') as [string, string];
    const forged = btoa(JSON.stringify({ r: 'paris', t: HOST, e: 9e15 })).replace(/=+$/, '');
    expect(await verifyToken(SECRET, `${forged}.${sig}`, 'paris', 2000)).toBeNull();
    expect(await verifyToken(SECRET, `${body}.${sig.slice(0, -2)}AA`, 'paris', 2000)).toBeNull();
    expect(await verifyToken(SECRET, token, 'paris', 1000 + 25 * 3_600_000)).toBeNull();
    for (const bad of [null, undefined, '', 'abc', 'a.b', '%%%.%%%', `${body}.`]) expect(await verifyToken(SECRET, bad, 'paris', 2000)).toBeNull();
  });

  it('SPEC §17.40: a spectator token names its code; team / Host tokens have none', async () => {
    const token = await signToken(SECRET, spectatorClaims('paris', 'KABCDE', 1000));
    expect(spectatorCodeOf(await verifyToken(SECRET, token, 'paris', 2000))).toBe('KABCDE');
    expect(spectatorCodeOf(newClaims('paris', 'team-1'))).toBeNull();
    expect(spectatorCodeOf(newClaims('paris', HOST))).toBeNull();
    expect(spectatorCodeOf(null)).toBeNull();
  });

  it('compares passwords without short-circuiting on length', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    expect(constantTimeEqual('abc', 'abcd')).toBe(false);
    expect(constantTimeEqual('', '')).toBe(true);
  });
});
