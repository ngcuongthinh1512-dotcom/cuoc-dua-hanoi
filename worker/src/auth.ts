// Login tokens (SPEC §3): HMAC-SHA256 over a tiny JSON payload, keyed with the only secret we have (HOST_PASSWORD).
// `body.sig`, both base64url. The race id inside stops a token from one race opening another; `e` = expiry (ms).
// Runs in the Worker (Host login), the Durable Object (team login + WebSocket upgrade) and Node tests (WebCrypto).
import { NET } from '@race/shared/protocol';

export const HOST = 'host';
/** SPEC §17.40: a spectator token's `t` = this prefix + the spectator code it was issued for (a rotated code kills it). */
const SPECTATOR_T = 's:';

export interface Claims {
  /** Race id. */
  r: string;
  /** Team id, HOST, or "s:<spectator code>". */
  t: string;
  /** Expiry, ms since the epoch. */
  e: number;
}

const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const hmacKey = (secret: string) => crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

export async function signToken(secret: string, claims: Claims): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(claims)));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

/** Claims of a valid, unexpired token for `race`; null otherwise (never throws on garbage). */
export async function verifyToken(secret: string, token: string | null | undefined, race: string, now = Date.now()): Promise<Claims | null> {
  try {
    const [body, sig] = (token ?? '').split('.');
    if (!body || !sig) return null;
    if (!(await crypto.subtle.verify('HMAC', await hmacKey(secret), unb64url(sig), enc.encode(body)))) return null;
    const c = JSON.parse(new TextDecoder().decode(unb64url(body))) as Partial<Claims>;
    if (c.r !== race || typeof c.t !== 'string' || !c.t || typeof c.e !== 'number' || c.e <= now) return null;
    return { r: c.r, t: c.t, e: c.e };
  } catch {
    return null;
  }
}

export const newClaims = (race: string, team: string, now = Date.now()): Claims => ({ r: race, t: team, e: now + NET.tokenTtlMs });
/** SPEC §17.40: claims of a spectator token for `code`. */
export const spectatorClaims = (race: string, code: string, now = Date.now()): Claims => newClaims(race, SPECTATOR_T + code, now);
/** The spectator code a token was issued for; null for a team / Host token. */
export const spectatorCodeOf = (c: Claims | null | undefined): string | null => (c?.t.startsWith(SPECTATOR_T) ? c.t.slice(SPECTATOR_T.length) : null);

/** Host password check without an early exit on the first differing character. */
export function constantTimeEqual(a: string, b: string): boolean {
  const x = enc.encode(a), y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
