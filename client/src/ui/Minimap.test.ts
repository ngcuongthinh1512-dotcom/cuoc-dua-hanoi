// Phase 5 track A: minimap geometry (zoom, rotation, N on the rim, waypoint clamp, chunks in view). No DOM.
import { describe, expect, it } from 'vitest';
import { bikeTopSpeed, hud, minimap, movement } from '../config.ts';
import { clampToRim, rimPoint, targetMpp, toScreen, toWorld, type View, visibleChunks } from './Minimap.ts';

const [W, H] = [hud.minimap.width, hud.minimap.height];
const deg = Math.PI / 180;
const view = (heading: number, mpp: number, x = 125, z = 125): View => ({ x, z, heading, mpp, ax: W / 2, ay: H * minimap.anchorY });

describe('Minimap', () => {
  it('zooms out with speed: standing / walking → metersPerPx[0], bike top speed and above → [1], monotonic', () => {
    const [a, b] = minimap.metersPerPx;
    expect(targetMpp(0)).toBe(a);
    expect(targetMpp(movement.footSpeed)).toBe(a);
    expect(targetMpp((movement.footSpeed + bikeTopSpeed()) / 2)).toBeCloseTo((a + b) / 2, 9);
    expect(targetMpp(bikeTopSpeed())).toBeCloseTo(b, 9);
    expect(targetMpp(3 * bikeTopSpeed())).toBeCloseTo(b, 9);
    const s = Array.from({ length: 21 }, (_, i) => targetMpp((i / 20) * 1.2 * bikeTopSpeed()));
    expect(s.every((v, i) => i === 0 || v >= s[i - 1]!)).toBe(true);
  });

  it('turns with the camera: what the camera faces is straight up, world ↔ screen round trip', () => {
    for (const h of [0, 30, 90, 180, -135].map((d) => d * deg)) {
      const v = view(h, 1.3);
      const [sx, sy] = toScreen(v, v.x - 20 * Math.sin(h), v.z - 20 * Math.cos(h)); // 20 m ahead (forward = (−sin h, −cos h))
      expect(sx).toBeCloseTo(v.ax, 9);
      expect(sy).toBeCloseTo(v.ay - 20 / 1.3, 9);
      const [x, z] = toWorld(v, ...toScreen(v, 40, -310));
      expect(x).toBeCloseTo(40, 6);
      expect(z).toBeCloseTo(-310, 6);
    }
  });

  it('puts N on the rim where north points: top / right / bottom / left at heading 0 / 90° / 180° / −90°', () => {
    // heading + = turned left: facing west (90°) north is on the right; facing east (−90°) on the left.
    const m = 11;
    const n = (h: number) => {
      const v = view(h * deg, 1);
      return rimPoint(v.ax, v.ay, Math.sin(h * deg), -Math.cos(h * deg), m, m, W - m, H - m).map((c) => Math.round(c * 1e6) / 1e6);
    };
    expect(n(0)).toEqual([W / 2, m]);
    expect(n(90)).toEqual([W - m, H * minimap.anchorY]);
    expect(n(180)).toEqual([W / 2, H - m]);
    expect(n(-90)).toEqual([m, H * minimap.anchorY]);
    const [x, y] = n(45); // up-right: meets the top edge (the anchor is 123.5 px below it, 139 px from the right one)
    expect(y).toBe(m);
    expect(x).toBeCloseTo(W / 2 + (H * minimap.anchorY - m), 6);
  });

  it('clamps the waypoint to the rim along the line from the player', () => {
    const [ax, ay] = [150, 120];
    expect(clampToRim(ax, ay, 40, 60, 9, 9, W - 9, H - 9)).toEqual([40, 60]); // inside: unchanged
    const [x, y] = clampToRim(ax, ay, 1150, -380, 9, 9, W - 9, H - 9); // far up-right: direction (1000, −500)
    expect(x).toBeCloseTo(W - 9, 9);
    expect(y).toBeCloseTo(ay - (W - 9 - ax) / 2, 9);
    expect(clampToRim(ax, ay, ax, 5000, 9, 9, W - 9, H - 9)).toEqual([ax, H - 9]); // straight down
  });

  it('lists the chunks under the turned rectangle (hand counts), nearest first', () => {
    const sorted = (k: string[]) => [...k].sort();
    // Player in the middle of chunk 0_0. 0.8 m/px: x 5…245, z 26…178 → only 0_0.
    expect(visibleChunks(view(0, 0.8), W, H)).toEqual(['0_0']);
    // 1.6 m/px: x −115…365 (i −1…1), z −73…231 (j −1…0) → 6 chunks.
    expect(sorted(visibleChunks(view(0, 1.6), W, H))).toEqual(sorted(['-1_-1', '0_-1', '1_-1', '-1_0', '0_0', '1_0']));
    // 90° (facing west): screen x → world −z, screen y → world x: x −73…231, z −115…365 → i −1…0, j −1…1.
    expect(sorted(visibleChunks(view(90 * deg, 1.6), W, H))).toEqual(sorted(['-1_-1', '0_-1', '-1_0', '0_0', '-1_1', '0_1']));
    // 45°, 0.8 m/px: corners (−29, 140), (140, −29), (247, 78), (78, 247); the edge x + z = 110 keeps −1_−1 out.
    expect(sorted(visibleChunks(view(45 * deg, 0.8), W, H))).toEqual(sorted(['-1_0', '0_-1', '0_0']));
    // 45°, 1.6 m/px: corners (−184, 155), (155, −184), (370, 31), (31, 370), i.e. −29 ≤ x + z ≤ 401, |x − z| ≤ 339:
    // every chunk of i, j ∈ −1…1 but 1_1 (x + z ≥ 500); 1_−1 / −1_1 get in through their corner (250, 0) / (0, 250).
    expect(sorted(visibleChunks(view(45 * deg, 1.6), W, H))).toEqual(sorted(['-1_-1', '0_-1', '1_-1', '-1_0', '0_0', '1_0', '-1_1', '0_1']));
    expect(visibleChunks(view(0, 1.6), W, H)[0]).toBe('0_0');
  });
});
