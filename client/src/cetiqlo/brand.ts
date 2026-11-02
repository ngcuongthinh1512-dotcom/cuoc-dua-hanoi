// CETIQLO brand (docs/plans/cetiqlo.md §0): an original logo drawn procedurally — a red square #E60012 with bold white
// sans-serif text on two lines "CETI" / "QLO". No third-party logo, font or name. Canvas helpers for the facade, the checkout
// sign, the zone signs and a small bag icon for the HUD (data URL). Everything returns null without a DOM (Node tests).
export const BRAND_RED = '#E60012';
export const FONT = '"Helvetica Neue", Helvetica, Arial, "Segoe UI", sans-serif';

/** Draw the logo square into `ctx` with its top-left at (x, y) and side `s`. */
export function drawLogo(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.fillStyle = BRAND_RED;
  ctx.fillRect(x, y, s, s);
  ctx.fillStyle = '#fff';
  ctx.font = `900 ${s * 0.36}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('CETI', x + s / 2, y + s * 0.33);
  ctx.fillText('QLO', x + s / 2, y + s * 0.69);
}
/** A square canvas with the logo filling it. */
export function logoCanvas(size = 256): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  drawLogo(c.getContext('2d')!, 0, 0, size);
  return c;
}
export const logoDataUrl = (size = 128): string => logoCanvas(size)?.toDataURL() ?? '';
/** A small shopping-bag icon (red bag, white logo) for the HUD, as a data URL. */
export function bagIconDataUrl(size = 64): string {
  if (typeof document === 'undefined') return '';
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d')!, u = size / 64;
  x.strokeStyle = '#333';
  x.lineWidth = 3 * u;
  x.beginPath();
  x.moveTo(20 * u, 22 * u); x.quadraticCurveTo(20 * u, 6 * u, 32 * u, 6 * u); x.quadraticCurveTo(44 * u, 6 * u, 44 * u, 22 * u);
  x.stroke();
  x.fillStyle = BRAND_RED;
  x.fillRect(10 * u, 20 * u, 44 * u, 40 * u);
  x.fillStyle = '#fff';
  x.font = `900 ${12 * u}px ${FONT}`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('CETI', 32 * u, 34 * u);
  x.fillText('QLO', 32 * u, 47 * u);
  return c.toDataURL();
}
