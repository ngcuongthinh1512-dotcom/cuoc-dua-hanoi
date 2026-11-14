// Leg 3 (Hà Nội): Cầu Thê Húc + Đắc Nguyệt Lâu (hồ Hoàn Kiếm, way/9566542, chunk 0_0; registry 'cau-the-huc' /
// 'dac-nguyet-lau'). A PLACED detail (h4.ts `placed`): the bridge is no building record, and the gate has no OSM outline.
// Frame: origin TH_O = the island end of the OSM way, +a along the way to the shore (east), +w = south (the viewer's LEFT
// when walking to the island), y from the island ground. What stands where (a, w):
//   · gate Đắc Nguyệt Lâu at a = GATE_A (its own frame FG, a = 0 the mid-plane, the front at +0.68 looks at the bridge):
//     plastered wall with the arched passage (w ±0.92, real opening, walkable), two tall pillars with couplet boards, the
//     phoenix storey, two tiled roofs (hoành phi 得月樓 between them), two flank walls with the mosaic panels (turtle on the
//     left = south, kỳ lân on the right) under their own little roofs, two outer pillars, lotus-bud finials;
//   · forecourt: stone floor + plaster balustrade narrowing to the bridge head (FG a 0.55 … 3.2);
//   · the bridge DECK_A … DECK_B: BAYS bays, the deck top = ground + archAt(a) (a sine, RISE m at mid-span), plank deck,
//     girders, a trestle (cap beam + 2 piles into the lake bed) per bay line, post-and-rail parapet with X braces.
// BridgeBuilder skips this way (its OWN_DECK list): the deck here IS the walkable surface — collider = the deck top, the
// parapet as two thin walls, the gate piers / flank walls / balustrade (never the detail geometry, SPEC §5.9).
// Paint: ONE 2048² OffscreenCanvas atlas on 'mural3' (chunk 0_0 already has 'mural' = Đền Ngọc Sơn and 'mural2' = Tháp Bút)
// from the owner's AI tiles textures/hoankiem/{redwood,roof,plaster,stone,panel-turtle,panel-qilin}.webp, fetched by the
// chunk worker BEFORE the build (preloadTheHuc); boards, phoenix panel, inserts, lantern are drawn here. The hoành phi and
// the passage lantern have a twin on 'neonSign' (dusk / night only). Without OffscreenCanvas (tests) or a missing tile:
// flat colours. ≈ 9k triangles.
import { Color } from 'three';
import { props as PR } from '../../config.ts';
import type { ChunkData } from '../../geo/chunkData.ts';
import type { BuildCtx, BuildOut, MaterialId, MeshBucket } from '../buildTypes.ts';
import { hash01, MeshBuffer, mergeBuckets, type V3 } from '../geom.ts';
import { pushMatrix } from '../StreetProps.ts';
import { treeShape } from '../Vegetation.ts';
import { box as kbox, extrude, type Frame, loft, place, quadOut, triOut } from './kit.ts';

export const TH_O: [number, number] = [44.8, 153.9]; // island end of way/9566542
const TH_E: [number, number] = [90.8, 158.4]; // shore end
const LEN = Math.hypot(TH_E[0] - TH_O[0], TH_E[1] - TH_O[1]);
export const TH_UA = [(TH_E[0] - TH_O[0]) / LEN, (TH_E[1] - TH_O[1]) / LEN] as const;
export const TH_UW = [-TH_UA[1], TH_UA[0]] as const;
/** World (x, z) of frame point (a, w). */
export const thAt = (a: number, w: number) => [TH_O[0] + a * TH_UA[0] + w * TH_UW[0], TH_O[1] + a * TH_UA[1] + w * TH_UW[1]] as const;
export const TH_NAME = 'Cầu Thê Húc'; // BridgeRec.name of the way (BridgeBuilder OWN_DECK)
const GATE_A = 2.4; // 2.3 m clear of the OSM tree at (0.1, −2.1) behind its north pillar
const DECK_A = GATE_A + 3.2; // the bridge head on the stone abutment (shore line at a ≈ 3.7)
const DECK_B = LEN; // the shore end of the way (shore line at a ≈ 44.5)
const RISE = 1.9;
const BAYS = 20;
const HALF = 1.5; // deck half width = the parapet line (the generic footway deck was 3 m)
/** Deck top above the ground at a m along the axis (0 off the deck). ponytail: NPC walkers still use the straight deck
 *  line of npc/roads.ts heightOn; add this there if the crowd is to climb the arch. */
export const archAt = (a: number) =>
  a <= DECK_A || a >= DECK_B
    ? 0
    : RISE * Math.sin((Math.PI * (a - DECK_A)) / (DECK_B - DECK_A)) + 0.3 * Math.min(1, Math.min(a - DECK_A, DECK_B - a) / 1.2); // + a 1.2 m ramp over the lake kerb (0.18 m, Terrain.lakeKerbMesh)
/** Clue-box spot: the paved yard just inside the gate (≥ 3.4 m from the gate, the temple wall and the trees). */
export const TH_BOX = thAt(-3.2, 0);

const MAT: MaterialId = 'mural3';
const rgb = (hex: string): V3 => {
  const c = new Color(hex);
  return [c.r, c.g, c.b];
};

// ── atlas ──
const AS = 2048;
/** Atlas region (px); fb = flat colour without the atlas; m = metres the region covers when it is a seamless tile. */
interface Reg { x: number; y: number; w: number; h: number; fb: string; m?: number }
const PLASTER = '#9c9d9c';
const BOARD = '#efece3';
const R = {
  wood: { x: 16, y: 16, w: 512, h: 512, fb: '#c9432c', m: 2 } as Reg,
  roof: { x: 560, y: 16, w: 512, h: 512, fb: '#6d5b4e' } as Reg,
  plaster: { x: 1104, y: 16, w: 512, h: 512, fb: PLASTER, m: 3 } as Reg,
  stone: { x: 1648, y: 16, w: 384, h: 384, fb: '#aaa69c', m: 2.4 } as Reg,
  turtle: { x: 16, y: 560, w: 512, h: 382, fb: '#3fb2c4' } as Reg,
  qilin: { x: 560, y: 560, w: 512, h: 382, fb: '#3fb2c4' } as Reg,
  phoenix: { x: 1104, y: 560, w: 640, h: 320, fb: '#45b5c8' } as Reg,
  lattice: { x: 1104, y: 896, w: 448, h: 144, fb: PLASTER } as Reg, // two 1.1 m panels
  hoanh: { x: 16, y: 960, w: 384, h: 128, fb: '#a3201c' } as Reg,
  hoanhG: { x: 416, y: 960, w: 384, h: 128, fb: '#a3201c' } as Reg, // 55 % copy for the dusk twin
  couplet: Array.from({ length: 6 }, (_, k): Reg => ({ x: 16 + 88 * k, y: 1104, w: 72, h: 432, fb: BOARD })),
  hboard: [{ x: 1104, y: 1056, w: 320, h: 96, fb: BOARD }, { x: 1440, y: 1056, w: 320, h: 96, fb: BOARD }] as Reg[],
  insert: { x: 1776, y: 416, w: 128, h: 64, fb: '#6c6f72' } as Reg,
  blue: { x: 1776, y: 496, w: 96, h: 96, fb: '#2f6fa8' } as Reg,
  bird: { x: 1888, y: 496, w: 96, h: 96, fb: '#c9a23a' } as Reg,
  lantern: { x: 1776, y: 608, w: 96, h: 128, fb: '#c5281c' } as Reg,
  soffit: { x: 1888, y: 608, w: 48, h: 48, fb: '#4a2f26' } as Reg,
  gold: { x: 1952, y: 608, w: 48, h: 48, fb: '#b3923f' } as Reg,
};
// The gate's own texts (owner photo 60), boards read top → bottom; index = R.couplet
const COUPLETS = ['塵境僊洲有路通', '靈湖弱水隨緣渡', '樓當明月坐湖心', '橋引長虹棲島嶼', '宛在水中央', '不厭湖上月'];
const HBOARDS = ['書洛龜神', '圖河馬龍']; // written right → left: 神龜洛書 / 龍馬河圖
const CJK = '"Kaiti SC", "STKaiti", "Songti SC", "STSong", "Noto Serif CJK SC", "PingFang SC", "Microsoft YaHei", serif';

const FILES = ['redwood', 'roof', 'plaster', 'stone', 'panel-turtle', 'panel-qilin'] as const;
let tiles: Partial<Record<(typeof FILES)[number], ImageBitmap>> = {};
let loading: Promise<void> | undefined;
/** Fetches + decodes the tiles once per worker; never rejects (a missing tile = a flat region). `dataUrl` = …/data/. */
export function preloadTheHuc(dataUrl: string): Promise<void> {
  if (!dataUrl || typeof createImageBitmap === 'undefined' || typeof OffscreenCanvas === 'undefined') return Promise.resolve();
  return (loading ??= Promise.all(
    FILES.map((n) =>
      fetch(new URL(`../textures/hoankiem/${n}.webp`, dataUrl))
        .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((b) => createImageBitmap(b))
        .then((img) => void (tiles[n] = img))
        .catch(() => undefined),
    ),
  ).then(() => undefined));
}

type G = OffscreenCanvasRenderingContext2D;

/** A seamless tile over a region + a wrapped 10 px gutter (mip bleed), optionally washed with `tint`. */
function tile(g: G, img: ImageBitmap | undefined, r: Reg, tint?: string) {
  const pad = 10;
  g.save();
  g.translate(r.x, r.y);
  if (img) {
    const t = new OffscreenCanvas(r.w, r.h);
    t.getContext('2d')!.drawImage(img, 0, 0, r.w, r.h);
    g.fillStyle = g.createPattern(t, 'repeat')!;
  } else g.fillStyle = r.fb;
  g.fillRect(-pad, -pad, r.w + 2 * pad, r.h + 2 * pad);
  if (tint) {
    g.fillStyle = tint;
    g.fillRect(-pad, -pad, r.w + 2 * pad, r.h + 2 * pad);
  }
  g.restore();
}

/** White board, thin grey rule, black brush characters: vertical (top → bottom) or horizontal. `ratio` = the real board's
 *  long side / short side (the region is stretched onto it, so the glyphs are pre-squeezed to come out square). */
function board(g: G, r: Reg, text: string, vertical: boolean, ratio: number) {
  g.fillStyle = BOARD;
  g.fillRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8);
  g.strokeStyle = '#8d8f90';
  g.lineWidth = 3;
  g.strokeRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6);
  const [long, short] = vertical ? [r.h, r.w] : [r.w, r.h];
  const k = long / short / ratio; // > 1: the glyph must be drawn taller (along the board) than wide
  const cell = (long - 16) / text.length;
  const fs = Math.min(0.8 * short, (0.92 * cell) / k);
  g.fillStyle = '#16130f';
  g.font = `bold ${fs.toFixed(0)}px ${CJK}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  [...text].forEach((ch, i) => {
    g.save();
    if (vertical) g.translate(r.x + r.w / 2, r.y + 8 + (i + 0.5) * cell), g.scale(1, k);
    else g.translate(r.x + 8 + (i + 0.5) * cell, r.y + r.h / 2), g.scale(k, 1);
    g.fillText(ch, 0, 0);
    g.restore();
  });
}

/** One phoenix of the upper panel: fanned blue-green tail, yellow body, raised wing, crested head; faces +x (flip = −x). */
function phoenix(g: G, cx: number, cy: number, s: number, flip: boolean) {
  g.save();
  g.translate(cx, cy);
  g.scale(flip ? -s : s, s);
  g.lineCap = 'round';
  const feather = (col: string, w: number, pts: number[]) => {
    g.strokeStyle = col;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(pts[0]!, pts[1]!);
    g.bezierCurveTo(pts[2]!, pts[3]!, pts[4]!, pts[5]!, pts[6]!, pts[7]!);
    g.stroke();
  };
  // tail: long curled plumes away from the head
  feather('#1d5f8c', 9, [-20, 10, -70, -10, -95, 30, -70, 70]);
  feather('#2a8f86', 8, [-20, 14, -60, 20, -90, 60, -55, 96]);
  feather('#17486f', 7, [-18, 6, -80, -40, -112, -6, -100, 28]);
  feather('#3aa38f', 6, [-16, 18, -40, 50, -60, 84, -30, 110]);
  feather('#e9c14a', 3, [-20, 12, -64, 6, -84, 40, -66, 62]);
  // body + neck
  g.fillStyle = '#e2a62e';
  g.beginPath();
  g.ellipse(0, 12, 30, 19, -0.35, 0, 2 * Math.PI);
  g.fill();
  feather('#e2a62e', 13, [18, 0, 40, -18, 30, -44, 44, -58]);
  // wing
  g.fillStyle = '#1f6f93';
  g.beginPath();
  g.moveTo(-10, 4);
  g.bezierCurveTo(-34, -40, 0, -74, 26, -70);
  g.bezierCurveTo(8, -50, 14, -18, 10, 6);
  g.fill();
  feather('#7fd0c4', 3, [-6, -4, -18, -36, 2, -58, 18, -64]);
  feather('#7fd0c4', 3, [2, 0, -4, -26, 8, -44, 18, -52]);
  // head, crest, beak
  g.fillStyle = '#d9912a';
  g.beginPath();
  g.arc(47, -62, 9, 0, 2 * Math.PI);
  g.fill();
  feather('#c8352a', 4, [44, -70, 36, -84, 22, -84, 16, -76]);
  feather('#c8352a', 3, [48, -71, 46, -88, 34, -94, 28, -90]);
  g.fillStyle = '#f2e3b0';
  g.beginPath();
  g.moveTo(54, -66), g.lineTo(68, -60), g.lineTo(54, -57);
  g.fill();
  g.fillStyle = '#16130f';
  g.fillRect(48, -65, 3, 3);
  // legs
  feather('#b9772a', 3, [4, 28, 8, 40, 6, 48, 12, 54]);
  feather('#b9772a', 3, [-6, 28, -6, 40, -10, 48, -6, 56]);
  g.restore();
}

function paintAtlas(): ImageBitmap | undefined {
  if (typeof OffscreenCanvas === 'undefined') return;
  const c = new OffscreenCanvas(AS, AS);
  const g = c.getContext('2d');
  if (!g) return;
  g.fillStyle = PLASTER;
  g.fillRect(0, 0, AS, AS);
  tile(g, tiles.redwood, R.wood, 'rgba(214, 38, 22, 0.3)'); // the faded tile pulled back to vermilion
  tile(g, tiles.roof, R.roof);
  tile(g, tiles.plaster, R.plaster, 'rgba(128, 131, 134, 0.38)'); // the gate is cement grey, not whitewash
  tile(g, tiles.stone, R.stone, 'rgba(190, 186, 176, 0.35)');
  g.strokeStyle = 'rgba(60, 58, 54, 0.55)'; // paving joints every 0.6 m
  g.lineWidth = 2;
  for (let k = 0; k <= 4; k++) {
    g.strokeRect(R.stone.x + (k * R.stone.w) / 4, R.stone.y - 10, 0, R.stone.h + 20);
    g.strokeRect(R.stone.x - 10, R.stone.y + (k * R.stone.h) / 4, R.stone.w + 20, 0);
  }
  for (const [img, r] of [[tiles['panel-turtle'], R.turtle], [tiles['panel-qilin'], R.qilin]] as const) {
    if (img) g.drawImage(img, r.x, r.y, r.w, r.h);
    else g.fillStyle = r.fb, g.fillRect(r.x, r.y, r.w, r.h);
  }

  // phoenix panel: turquoise ground, waves along the foot, the round window between two phoenixes
  {
    const r = R.phoenix;
    const grad = g.createLinearGradient(0, r.y, 0, r.y + r.h);
    grad.addColorStop(0, '#58c4d6');
    grad.addColorStop(1, '#2f9fb8');
    g.fillStyle = grad;
    g.fillRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8);
    g.strokeStyle = '#1c6f9a';
    g.lineWidth = 5;
    for (let row = 0; row < 3; row++) {
      g.beginPath();
      for (let x = -20; x < r.w + 40; x += 40) g.arc(r.x + x + row * 13, r.y + r.h - 8 - row * 16, 20, Math.PI, 2 * Math.PI);
      g.stroke();
    }
    g.strokeStyle = '#e8f3f1';
    g.lineWidth = 2;
    for (let x = 0; x < r.w; x += 40) g.beginPath(), g.arc(r.x + x + 20, r.y + r.h - 22, 9, Math.PI * 0.9, Math.PI * 2.2), g.stroke();
    phoenix(g, r.x + 138, r.y + 176, 1.25, false);
    phoenix(g, r.x + r.w - 138, r.y + 176, 1.25, true);
    const [cx, cy, rad] = [r.x + r.w / 2, r.y + r.h / 2 - 6, 104];
    g.fillStyle = '#b9bbba'; // plaster rim
    g.beginPath(), g.arc(cx, cy, rad + 16, 0, 2 * Math.PI), g.fill();
    const hole = g.createLinearGradient(0, cy - rad, 0, cy + rad);
    hole.addColorStop(0, '#2a2420');
    hole.addColorStop(0.55, '#4b3b33');
    hole.addColorStop(0.56, '#6a5a50'); // the tiled roof of the temple behind
    hole.addColorStop(1, '#3a302b');
    g.fillStyle = hole;
    g.beginPath(), g.arc(cx, cy, rad, 0, 2 * Math.PI), g.fill();
    g.strokeStyle = '#7d7f80';
    g.lineWidth = 4;
    g.beginPath(), g.arc(cx, cy, rad + 16, 0, 2 * Math.PI), g.stroke();
  }

  // balustrade: two plaster panels with a pierced fret
  {
    const r = R.lattice;
    g.save();
    g.beginPath(), g.rect(r.x - 6, r.y - 6, r.w + 12, r.h + 12), g.clip();
    tile(g, tiles.plaster, { ...R.plaster, x: r.x, y: r.y });
    for (let k = 0; k < 2; k++) {
      const [x0, y0, w, h] = [r.x + k * (r.w / 2) + 26, r.y + 30, r.w / 2 - 52, r.h - 58];
      g.fillStyle = '#4f5254';
      g.fillRect(x0, y0, w, h);
      g.strokeStyle = '#a9abaa';
      g.lineWidth = 9;
      g.strokeRect(x0, y0, w, h);
      g.beginPath();
      g.moveTo(x0 + w / 2, y0), g.lineTo(x0 + w / 2, y0 + h);
      g.moveTo(x0, y0 + h / 2), g.lineTo(x0 + w, y0 + h / 2);
      g.rect(x0 + w / 4, y0 + h / 4, w / 2, h / 2);
      g.stroke();
      g.fillStyle = '#a9abaa';
      g.fillRect(x0 + w / 2 - 12, y0 + h / 2 - 12, 24, 24);
    }
    g.strokeStyle = 'rgba(70, 72, 74, 0.6)';
    g.lineWidth = 3;
    g.strokeRect(r.x, r.y + 12, r.w, r.h - 14);
    g.restore();
  }

  // hoành phi 得月樓: red lacquer, gilt frame, pale gold characters (the board reads 樓 月 得 from the left)
  {
    const r = R.hoanh;
    g.fillStyle = '#a81f1a';
    g.fillRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8);
    g.strokeStyle = '#d7b45a';
    g.lineWidth = 6;
    g.strokeRect(r.x + 6, r.y + 6, r.w - 12, r.h - 12);
    g.fillStyle = '#f6e7b4';
    g.font = `bold 86px ${CJK}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    [...'樓月得'].forEach((ch, i) => g.fillText(ch, r.x + r.w * (0.2 + 0.3 * i), r.y + r.h / 2 + 4));
    g.fillStyle = '#000000';
    g.fillRect(R.hoanhG.x - 4, R.hoanhG.y - 4, r.w + 8, r.h + 8);
    g.globalAlpha = 0.55;
    g.drawImage(c, r.x, r.y, r.w, r.h, R.hoanhG.x, R.hoanhG.y, r.w, r.h);
    g.globalAlpha = 1;
  }
  COUPLETS.forEach((t, i) => board(g, R.couplet[i]!, t, true, i < 2 ? 6 : i < 4 ? 5.7 : 3.4));
  HBOARDS.forEach((t, i) => board(g, R.hboard[i]!, t, false, 3.65));

  // small things: lintel cartouche, ceramic insets, lantern, flat swatches
  {
    const r = R.insert;
    g.fillStyle = '#8f9192';
    g.fillRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8);
    g.fillStyle = '#3f4244';
    g.beginPath(), g.roundRect(r.x + 8, r.y + 8, r.w - 16, r.h - 16, 20), g.fill();
    g.strokeStyle = '#c9cbc9';
    g.lineWidth = 4;
    g.beginPath();
    g.ellipse(r.x + r.w / 2, r.y + r.h / 2, 30, 12, 0, 0, 2 * Math.PI);
    g.moveTo(r.x + 26, r.y + r.h / 2), g.lineTo(r.x + r.w - 26, r.y + r.h / 2);
    g.stroke();
  }
  for (const [r, bg, fg] of [[R.blue, '#1d4f8e', '#e9eef2'], [R.bird, '#2f8fa8', '#e2b23a']] as const) {
    g.fillStyle = '#d9dcda';
    g.fillRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8);
    g.fillStyle = bg;
    g.fillRect(r.x + 8, r.y + 8, r.w - 16, r.h - 16);
    g.fillStyle = fg;
    for (let k = 0; k < 6; k++) {
      g.beginPath();
      g.ellipse(r.x + r.w / 2 + 16 * Math.cos(k * 1.047), r.y + r.h / 2 + 16 * Math.sin(k * 1.047), 12, 7, k * 1.047, 0, 2 * Math.PI);
      g.fill();
    }
    g.fillStyle = '#c8352a';
    g.beginPath(), g.arc(r.x + r.w / 2, r.y + r.h / 2, 7, 0, 2 * Math.PI), g.fill();
  }
  {
    const r = R.lantern;
    const grad = g.createLinearGradient(r.x, 0, r.x + r.w, 0);
    grad.addColorStop(0, '#d8301f');
    grad.addColorStop(0.5, '#ff6a3a');
    grad.addColorStop(1, '#d8301f');
    g.fillStyle = grad;
    g.fillRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8);
    g.fillStyle = '#e9c14a';
    g.fillRect(r.x - 4, r.y - 4, r.w + 8, 16);
    g.fillRect(r.x - 4, r.y + r.h - 12, r.w + 8, 16);
    g.fillStyle = 'rgba(120, 20, 12, 0.5)';
    for (let k = 0; k < 8; k++) g.fillRect(r.x + (k * r.w) / 8 - 1, r.y + 12, 2, r.h - 24);
  }
  for (const r of [R.soffit, R.gold]) g.fillStyle = r.fb, g.fillRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8);
  return c.transferToImageBitmap();
}

// ── painter: textured quads in a local frame (x = a, y up, z = w), or flat 'masonry' without the atlas ──
const dist = (p: V3, q: V3) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
type UV = readonly [number, number, number, number]; // u0, v0 (at a), u1, v1 (at c), region fractions, v up

class Paint {
  readonly tex?: MeshBuffer;
  readonly glow?: MeshBuffer;
  readonly solid = new MeshBuffer('masonry');
  constructor(textured: boolean) {
    if (textured) [this.tex, this.glow] = [new MeshBuffer(MAT), new MeshBuffer('neonSign')];
  }

  /** Quad a → b → c → d (a = bottom-left seen from outside) painted with region r: the whole region, or `uv`, or for a
   *  seamless tile (r.m) a window of the quad's own size in metres at a hashed offset. */
  face(r: Reg, a: V3, b: V3, c: V3, d: V3, out: V3, uv?: UV, buf = this.tex) {
    if (!buf) {
      this.solid.color = rgb(r.fb);
      quadOut(this.solid, a, b, c, d, out);
      return;
    }
    let [u0, v0, u1, v1] = uv ?? [0, 0, 1, 1];
    if (!uv && r.m) {
      const [fu, fv] = [Math.min(1, dist(a, b) / r.m), Math.min(1, dist(a, d) / r.m)];
      [u0, v0] = [(1 - fu) * hash01(a[0] * 3 + a[1] * 7, a[2] * 5 + c[1], 5), (1 - fv) * hash01(c[0] * 3 + a[1], a[2] * 7 + c[2], 6)];
      [u1, v1] = [u0 + fu, v0 + fv];
    }
    quadOut(buf, a, b, c, d, out, (r.x + u0 * r.w) / AS, (r.y + (1 - v0) * r.h) / AS, (r.x + u1 * r.w) / AS, (r.y + (1 - v1) * r.h) / AS);
  }
  /** Vertical face at a, normal dir·a, w0 < w1 (the viewer's left is +w when dir > 0). */
  fa(r: Reg, a: number, w0: number, w1: number, y0: number, y1: number, dir: number, uv?: UV, buf = this.tex) {
    const [l, k] = dir > 0 ? [w1, w0] : [w0, w1];
    this.face(r, [a, y0, l], [a, y0, k], [a, y1, k], [a, y1, l], [dir, 0, 0], uv, buf);
  }
  /** Vertical face at w, normal dir·w, a0 < a1. */
  fw(r: Reg, w: number, a0: number, a1: number, y0: number, y1: number, dir: number, uv?: UV) {
    const [l, k] = dir > 0 ? [a0, a1] : [a1, a0];
    this.face(r, [l, y0, w], [k, y0, w], [k, y1, w], [l, y1, w], [0, 0, dir], uv);
  }
  fy(r: Reg, y: number, a0: number, a1: number, w0: number, w1: number, dir = 1, uv?: UV) {
    this.face(r, [a0, y, w0], [a1, y, w0], [a1, y, w1], [a0, y, w1], [0, dir, 0], uv);
  }
  /** Box: four sides + top (+ bottom). */
  box(r: Reg, a0: number, a1: number, y0: number, y1: number, w0: number, w1: number, bottom = false) {
    this.fa(r, a1, w0, w1, y0, y1, 1);
    this.fa(r, a0, w0, w1, y0, y1, -1);
    this.fw(r, w1, a0, a1, y0, y1, 1);
    this.fw(r, w0, a0, a1, y0, y1, -1);
    this.fy(r, y1, a0, a1, w0, w1);
    if (bottom) this.fy(r, y0, a0, a1, w0, w1, -1);
  }
  /** Beam A → B in a vertical plane w = const: th high (across the beam in that plane), tw wide; the grain (v) along it. */
  bar(r: Reg, A: V3, B: V3, th: number, tw: number) {
    const l = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1;
    const [nx, ny] = [(-(B[1] - A[1]) / l) * (th / 2), ((B[0] - A[0]) / l) * (th / 2)];
    const p = (P: V3, sn: number, sw: number): V3 => [P[0] + sn * nx, P[1] + sn * ny, P[2] + (sw * tw) / 2];
    for (const sw of [1, -1]) this.face(r, p(A, -1, sw), p(A, 1, sw), p(B, 1, sw), p(B, -1, sw), [0, 0, sw]);
    for (const sn of [1, -1]) this.face(r, p(A, sn, -1), p(A, sn, 1), p(B, sn, 1), p(B, sn, -1), [sn * nx, sn * ny, 0]);
  }
  /** Lathe about the vertical through (a, w): profile [radius, y][] bottom → top, n sides; uv wraps the region once
   *  (seamless tiles: a window per facet). */
  lathe(r: Reg, a: number, w: number, prof: [number, number][], n = 8, buf = this.tex) {
    const at = (k: number, [rad, y]: [number, number]): V3 => [a + rad * Math.cos((2 * Math.PI * k) / n), y, w + rad * Math.sin((2 * Math.PI * k) / n)];
    for (let j = 0; j + 1 < prof.length; j++) {
      for (let k = 0; k < n; k++) {
        const m = (2 * Math.PI * (k + 0.5)) / n;
        const uv: UV | undefined = r.m ? undefined : [k / n, j / (prof.length - 1), (k + 1) / n, (j + 1) / (prof.length - 1)];
        this.face(r, at(k, prof[j]!), at(k + 1, prof[j]!), at(k + 1, prof[j + 1]!), at(k, prof[j + 1]!), [Math.cos(m), 0.01, Math.sin(m)], uv, buf);
      }
    }
  }
  col(hex: string) {
    this.solid.color = rgb(hex);
    return this.solid;
  }
  buckets(f: Frame, y0: number): MeshBucket[] {
    return [this.tex, this.glow, this.solid].flatMap((b) => (b?.vertexCount ? [place(b.bucket(), f, y0)] : []));
  }
}

/** Tiled roof on a rectangle centred (ca, cw): eaves ±EA × ±EW at y0 → the top rectangle ±TA × ±TW at y0 + H, sagging,
 *  the corners swept up by `lift`; tiles run down every slope (4 tiles per column, so columns meet on a tile joint);
 *  dark underside. */
function roof(p: Paint, ca: number, cw: number, y0: number, EA: number, EW: number, TA: number, TW: number, H: number, lift: number) {
  const n = 4;
  for (let side = 0; side < 4; side++) {
    const along = side < 2; // the eave runs along w
    const sg = side % 2 ? -1 : 1;
    const pt = (s: number, f: number): V3 => {
      const e = along ? [sg * EA, s * EW] : [s * EA, sg * EW];
      const t = along ? [sg * TA, s * TW] : [s * TA, sg * TW];
      return [ca + e[0]! + (t[0]! - e[0]!) * f, y0 + H * (0.3 * f + 0.7 * f * f) + lift * (1 - f) ** 2 * s ** 4, cw + e[1]! + (t[1]! - e[1]!) * f];
    };
    const m = Math.max(2, 2 * Math.round((along ? EW : EA) / 0.72));
    const vr = Math.min(1, Math.hypot(H, along ? EA - TA : EW - TW) / 2.2);
    const out: V3 = along ? [sg, 1.5, 0] : [0, 1.5, sg];
    for (let i = 0; i < m; i++) {
      for (let k = 0; k < n; k++) {
        const [s0, s1, f0, f1] = [(2 * i) / m - 1, (2 * (i + 1)) / m - 1, k / n, (k + 1) / n];
        const q = [pt(s0, f0), pt(s1, f0), pt(s1, f1), pt(s0, f1)] as const;
        p.face(R.roof, ...q, out, [(i % 2) * 0.5, f0 * vr, (i % 2) * 0.5 + 0.5, f1 * vr]);
        p.face(R.soffit, ...q, [-out[0], -1.5, -out[2]]);
      }
    }
  }
}

/** Cloud-scroll ridge / corner ornament (đầu đao): silhouette in (s outward, y up), × k. */
const SCROLL = [-0.3, 0, 0.45, 0, 0.7, 0.2, 0.78, 0.5, 0.62, 0.78, 0.36, 0.8, 0.26, 0.62, 0.4, 0.5, 0.5, 0.56, 0.56, 0.42, 0.46, 0.24, 0.2, 0.2, -0.05, 0.36, -0.3, 0.2];
const scroll = (k: number, s0: number, y0: number, dir: number) => SCROLL.map((v, i) => (i % 2 ? y0 + v * k : s0 + dir * v * k));
const GREY = '#77756f';
const BUD = '#8a4a3c';

/** Plain lathe on a 'masonry' buffer (finials). */
function lathe(buf: MeshBuffer, a: number, w: number, prof: [number, number][], n = 6) {
  loft(buf, prof.map(([r, y]) => Array.from({ length: n }, (_, k): V3 => [a + r * Math.cos((2 * Math.PI * k) / n), y, w + r * Math.sin((2 * Math.PI * k) / n)])));
}
/** Lotus-bud finial on a pillar top at height y. */
function finial(p: Paint, a: number, w: number, y: number, k = 1) {
  lathe(p.col(GREY), a, w, [[0.26 * k, y], [0.26 * k, y + 0.12 * k], [0.14 * k, y + 0.17 * k]]);
  lathe(p.col(BUD), a, w, [[0.13 * k, y + 0.17 * k], [0.24 * k, y + 0.34 * k], [0.25 * k, y + 0.5 * k], [0.13 * k, y + 0.74 * k], [0, y + 0.86 * k]]);
}

/** Đắc Nguyệt Lâu + forecourt, gate frame (a = 0 the mid-plane, +a the bridge); extras = buckets in other frames. */
function gate(p: Paint, fg: Frame, g: number, extras: MeshBucket[], solid: (a0: number, a1: number, w0: number, w1: number, y0: number, y1: number) => void) {
  const PL = R.plaster;
  const [D, OW, WW, OY, OH, TOP] = [0.55, 0.92, 1.8, 2.15, 0.5, 3.9];
  const archY = (w: number) => OY + OH * Math.sqrt(Math.max(0, 1 - (w / OW) ** 2));
  // central wall with the passage
  for (const dir of [1, -1]) {
    p.fa(PL, dir * D, OW, WW, 0, TOP, dir);
    p.fa(PL, dir * D, -WW, -OW, 0, TOP, dir);
    for (let k = 0; k < 8; k++) {
      const [w0, w1] = [-OW + (k * OW) / 4, -OW + ((k + 1) * OW) / 4];
      p.face(PL, [dir * D, archY(w0), w0], [dir * D, archY(w1), w1], [dir * D, TOP, w1], [dir * D, TOP, w0], [dir, 0, 0]);
    }
  }
  for (let k = 0; k < 8; k++) {
    const [w0, w1] = [-OW + (k * OW) / 4, -OW + ((k + 1) * OW) / 4];
    p.face(PL, [-D, archY(w0), w0], [D, archY(w0), w0], [D, archY(w1), w1], [-D, archY(w1), w1], [0, -1, 0]);
  }
  p.fw(PL, OW, -D, D, 0, OY, -1);
  p.fw(PL, -OW, -D, D, 0, OY, 1);
  // gilt line round the door recess, lintel cartouches, cornice
  for (const sg of [1, -1]) p.fa(R.gold, D + 0.012, Math.min(sg * 1.2, sg * 1.25), Math.max(sg * 1.2, sg * 1.25), 0, 3.05, 1);
  p.fa(R.gold, D + 0.012, -1.25, 1.25, 3.0, 3.05, 1);
  for (let k = -2; k <= 2; k++) p.fa(R.insert, D + 0.012, k * 0.66 - 0.21, k * 0.66 + 0.21, 3.36, 3.6, 1);
  p.box(PL, -0.72, 0.72, TOP, TOP + 0.15, -2.5, 2.5, true);

  // main pillars: couplets, ceramic insets, lotus bud
  for (const sg of [1, -1]) {
    const [w0, w1, wc] = [Math.min(sg * 1.8, sg * 2.45), Math.max(sg * 1.8, sg * 2.45), sg * 2.125];
    p.box(PL, -0.68, 0.68, 0, 4.55, w0, w1);
    p.box(PL, -0.74, 0.74, 0, 0.42, w0 - 0.06, w1 + 0.06);
    p.box(PL, -0.76, 0.76, 4.55, 4.68, w0 - 0.08, w1 + 0.08, true);
    const f = 0.692;
    p.fa(R.couplet[sg > 0 ? 0 : 1]!, f, wc - 0.17, wc + 0.17, 0.95, 3.0, 1);
    p.fa(R.bird, f, wc - 0.15, wc + 0.15, 0.52, 0.82, 1);
    p.fa(R.bird, f, wc - 0.15, wc + 0.15, 3.12, 3.42, 1);
    p.fa(R.blue, f, wc - 0.2, wc + 0.2, 3.98, 4.38, 1);
    finial(p, 0, wc, 4.68);
  }

  // phoenix storey between the pillar tops
  p.box(PL, -0.5, 0.5, TOP + 0.15, 5.35, -1.8, 1.8);
  for (const dir of [1, -1]) p.fa(R.phoenix, dir * 0.512, -1.2, 1.2, 4.12, 5.32, dir);
  for (const sg of [1, -1]) p.fa(R.couplet[sg > 0 ? 4 : 5]!, 0.512, Math.min(sg * 1.25, sg * 1.6), Math.max(sg * 1.25, sg * 1.6), 4.12, 5.32, 1);

  // the two roofs, the hoành phi storey between them, ridge + scrolls
  const horns: [number, number, number, number, number, number][] = []; // a, w, y, scale, diagonal (sa, sw)
  const roofAt = (ca: number, cw: number, y0: number, EA: number, EW: number, TA: number, TW: number, H: number, lift: number, k: number) => {
    roof(p, ca, cw, y0, EA, EW, TA, TW, H, lift);
    for (const sa of [1, -1]) for (const sw of [1, -1]) horns.push([ca + sa * EA, cw + sw * EW, y0 + lift, k, sa, sw]);
  };
  roofAt(0, 0, 5.35, 1.55, 2.55, 0.42, 1.05, 0.75, 0.35, 0.62);
  p.box(R.soffit, -0.4, 0.4, 6.05, 6.75, -1.0, 1.0);
  p.fa(R.hoanh, 0.415, -0.56, 0.56, 6.2, 6.6, 1);
  if (p.glow) p.fa(R.hoanhG, 0.425, -0.56, 0.56, 6.2, 6.6, 1, undefined, p.glow);
  roofAt(0, 0, 6.75, 1.3, 2.1, 0.03, 1.2, 0.7, 0.32, 0.62);
  kbox(p.col('#5b5650'), -0.07, 0.07, 7.38, 7.6, -1.25, 1.25);
  for (const sg of [1, -1]) extrude(p.col(GREY), scroll(0.95, sg * 1.0, 7.55, sg), 'x', -0.05, 0.05);

  // flank walls: mosaic panel, little roof, name board, top roof; outer pillars
  for (const sg of [1, -1]) {
    const wc = sg * 3.375;
    p.box(PL, -0.32, 0.32, -1, 2.9, wc - 0.925, wc + 0.925); // feet into the bank: the island's edge curves in under the flanks
    p.fa(sg > 0 ? R.turtle : R.qilin, 0.335, wc - 0.74, wc + 0.74, 0.72, 1.82, 1);
    roofAt(0, wc, 2.9, 0.62, 0.98, 0.2, 0.8, 0.3, 0.12, 0.3);
    p.box(PL, -0.18, 0.18, 3.2, 3.62, wc - 0.8, wc + 0.8);
    p.fa(R.hboard[sg > 0 ? 0 : 1]!, 0.185, wc - 0.62, wc + 0.62, 3.24, 3.58, 1);
    roofAt(0, wc, 3.62, 0.55, 0.95, 0.03, 0.7, 0.3, 0.12, 0.3);
    kbox(p.col('#5b5650'), -0.05, 0.05, 3.88, 4.0, wc - 0.72, wc + 0.72);
    const [w0, w1, pc] = [Math.min(sg * 4.3, sg * 4.85), Math.max(sg * 4.3, sg * 4.85), sg * 4.575];
    p.box(PL, -0.3, 0.3, -1, 3.7, w0, w1);
    p.box(PL, -0.36, 0.36, 3.7, 3.82, w0 - 0.06, w1 + 0.06, true);
    p.fa(R.couplet[sg > 0 ? 2 : 3]!, 0.305, pc - 0.15, pc + 0.15, 0.9, 2.6, 1);
    p.fa(R.blue, 0.305, pc - 0.14, pc + 0.14, 2.86, 3.14, 1);
    finial(p, 0, pc, 3.82, 0.85);
    solid(-0.7, 0.7, Math.min(sg * OW, sg * 2.5), Math.max(sg * OW, sg * 2.5), 0, 5);
    solid(-0.35, 0.35, Math.min(sg * 2.5, sg * 4.85), Math.max(sg * 2.5, sg * 4.85), 0, 4);
  }
  // corner scrolls, each in its own frame along the roof diagonal
  for (const [a, w, y, k, sa, sw] of horns) {
    const [da, dw] = [sa * Math.SQRT1_2, sw * Math.SQRT1_2];
    const b = new MeshBuffer('masonry');
    b.color = rgb(GREY);
    extrude(b, scroll(k, -0.25 * k, 0, 1), 'z', -0.035, 0.035);
    const f: Frame = { ...fg, cx: fg.cx + a * fg.ux - w * fg.uz, cz: fg.cz + a * fg.uz + w * fg.ux, ux: da * fg.ux - dw * fg.uz, uz: da * fg.uz + dw * fg.ux };
    extras.push(place(b.bucket(), f, g + y - 0.04));
  }

  // lantern in the passage (+ its dusk twin)
  const lan: [number, number][] = [[0.06, 2.1], [0.19, 2.2], [0.21, 2.33], [0.19, 2.46], [0.06, 2.56]];
  p.lathe(R.lantern, 0, 0, lan, 8);
  if (p.glow) p.lathe(R.lantern, 0, 0, lan.map(([r, y]): [number, number] => [r * 1.05, y]), 8, p.glow);
  kbox(p.col('#2a2320'), -0.01, 0.01, 2.56, 2.66, -0.01, 0.01);

  // floor: yard apron behind, passage, forecourt narrowing to the bridge head (0.6 m slabs)
  const slab = (a0: number, a1: number, w0: number, w1: number) => {
    for (let a = a0; a < a1 - 1e-6; a += 1.2) {
      for (let w = w0; w < w1 - 1e-6; w += 1.2) {
        const [ae, we] = [Math.min(a1, a + 1.2), Math.min(w1, w + 1.2)];
        p.fy(R.stone, 0.03, a, ae, w, we, 1, [0, 0, (ae - a) / 2.4, (we - w) / 2.4]);
      }
    }
  };
  slab(-2.4, -D, -1.8, 1.8);
  slab(-D, D, -OW, OW);
  slab(D, 1.9, -3.3, 3.3);
  const aMax = (w: number) => 1.9 + (1.3 * (3.3 - Math.abs(w))) / (3.3 - 1.62);
  for (let k = 0; k < 6; k++) {
    const [w0, w1] = [-3.3 + k * 1.1, -3.3 + (k + 1) * 1.1];
    p.face(R.stone, [1.9, 0.03, w0], [Math.min(3.2, aMax(w0)), 0.03, w0], [Math.min(3.2, aMax(w1)), 0.03, w1], [1.9, 0.03, w1], [0, 1, 0], [0, 0, 0.54, 0.46]);
  }
  // balustrade: flank wall → corner post → bridge-head post; the abutment's plaster skirt into the water under it
  for (const sg of [1, -1]) {
    const pts: [number, number][] = [[0.32, sg * 3.3], [1.9, sg * 3.3], [3.2, sg * 1.62]];
    for (let k = 0; k < 2; k++) {
      const [[a0, w0], [a1, w1]] = [pts[k]!, pts[k + 1]!];
      const l = Math.hypot(a1 - a0, w1 - w0);
      const [na, nw] = [((w1 - w0) / l) * 0.1, (-(a1 - a0) / l) * 0.1];
      const q = (a: number, w: number, y: number, s: number): V3 => [a + s * na, y, w + s * nw];
      for (const s of [1, -1]) p.face(R.lattice, q(a0, w0, 0, s), q(a1, w1, 0, s), q(a1, w1, 0.9, s), q(a0, w0, 0.9, s), [s * na, 0, s * nw], [0, 0, k ? 1 : 0.5, 1]);
      p.face(PL, q(a0, w0, 0.9, 1), q(a1, w1, 0.9, 1), q(a1, w1, 0.9, -1), q(a0, w0, 0.9, -1), [0, 1, 0]);
      const out = [sg * nw > 0 ? na : -na, sg * nw > 0 ? nw : -nw] as const; // away from the axis
      p.face(PL, [a0 + out[0], -1.2, w0 + out[1]], [a1 + out[0], -1.2, w1 + out[1]], [a1 + out[0], 0.03, w1 + out[1]], [a0 + out[0], 0.03, w0 + out[1]], [out[0], 0, out[1]]);
    }
    for (const [a, w] of pts.slice(1)) {
      p.box(PL, a - 0.16, a + 0.16, 0, 1.08, w - 0.16, w + 0.16);
      p.box(PL, a - 0.2, a + 0.2, 1.08, 1.16, w - 0.2, w + 0.2, true);
      lathe(p.col(GREY), a, w, [[0.12, 1.16], [0.16, 1.26], [0, 1.4]], 4);
    }
  }
  p.fa(PL, 3.2, -1.72, 1.72, -1.2, 0.03, 1);
}

/** The bridge, frame a from TH_O; y = 0 the ground. */
function bridge(p: Paint) {
  const W = R.wood;
  const L = DECK_B - DECK_A;
  const yAt = (a: number) => 0.03 + archAt(a);
  const n = 2 * BAYS;
  for (let i = 0; i < n; i++) {
    const [a0, a1] = [DECK_A + (i * L) / n, DECK_A + ((i + 1) * L) / n];
    const [y0, y1] = [yAt(a0), yAt(a1)];
    const u = (i % 2) * 0.5;
    p.face(W, [a0, y0, HALF], [a1, y1, HALF], [a1, y1, -HALF], [a0, y0, -HALF], [0, 1, 0], [u, 0, u + 0.5, 1]); // planks across
    p.face(R.soffit, [a0, y0 - 0.1, HALF], [a1, y1 - 0.1, HALF], [a1, y1 - 0.1, -HALF], [a0, y0 - 0.1, -HALF], [0, -1, 0]);
    for (const sg of [1, -1]) {
      const w = sg * (HALF + 0.02);
      p.face(W, [a0, y0 - 0.3, w], [a0, y0 + 0.02, w], [a1, y1 + 0.02, w], [a1, y1 - 0.3, w], [0, 0, sg]); // fascia, grain along
    }
  }
  const bay = L / BAYS;
  const at = (k: number) => DECK_A + k * bay;
  for (let k = 0; k <= BAYS; k++) {
    const a = at(k);
    const y = yAt(a);
    for (const sg of [1, -1]) {
      const w = sg * HALF;
      p.box(W, a - 0.065, a + 0.065, y - 0.3, y + 1.18, w - 0.065, w + 0.065);
      const top: V3 = [a, y + 1.3, w]; // pointed cap
      const c = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([da, dw]): V3 => [a + da! * 0.085, y + 1.18, w + dw! * 0.085]);
      for (let j = 0; j < 4; j++) triOut(p.col(R.wood.fb), c[j]!, c[(j + 1) % 4]!, top, [c[j]![0] + c[(j + 1) % 4]![0] - 2 * a, 1, c[j]![2] + c[(j + 1) % 4]![2] - 2 * w]);
      if (k === BAYS) continue;
      const [b, yb] = [at(k + 1), yAt(at(k + 1))];
      p.bar(W, [a, y + 1.0, w], [b, yb + 1.0, w], 0.1, 0.09); // top rail
      p.bar(W, [a, y + 0.22, w], [b, yb + 0.22, w], 0.08, 0.07); // bottom rail
      p.bar(W, [a + 0.06, y + 0.24, w], [b - 0.06, yb + 0.98, w], 0.055, 0.05); // X braces
      p.bar(W, [a + 0.06, y + 0.98, w], [b - 0.06, yb + 0.24, w], 0.055, 0.05);
    }
    if (k < BAYS) for (const w of [-0.9, 0.9]) p.bar(W, [a, y - 0.2, w], [at(k + 1), yAt(at(k + 1)) - 0.2, w], 0.2, 0.16); // girders
    if (k === 0 || k === BAYS) continue;
    p.box(W, a - 0.09, a + 0.09, y - 0.5, y - 0.3, -1.6, 1.6, true); // trestle: cap beam + two piles into the bed
    for (const w of [-1.1, 1.1]) p.lathe(W, a, w, [[0.11, -3], [0.11, y - 0.5]], 8);
  }
}

/** Phượng vĩ blossom clumps over the crown of a `tree` instance of scale k at (x, z): flat orange-red octahedra. */
function blossoms(buf: MeshBuffer, x: number, z: number, y: number, k: number, count: number) {
  const s = treeShape(k);
  const cols = ['#e5471c', '#f2691d', '#d93a1a', '#f58a2a'];
  for (let i = 0; i < count; i++) {
    const [h0, h1, h2] = [hash01(x + i, z, 31), hash01(x, z + i, 32), hash01(x + i, z - i, 33)];
    const v = -0.35 + 1.25 * h1;
    const rr = s.crownRadius * Math.sqrt(Math.max(0.05, 1 - v * v)) * (0.8 + 0.22 * h2);
    const c: V3 = [x + rr * Math.cos(h0 * 6.283), y + s.crownY + (v * s.crownHeight) / 2, z + rr * Math.sin(h0 * 6.283)];
    const [r, ry] = [0.32 + 0.3 * h2, 0.22 + 0.2 * h0];
    buf.color = rgb(cols[i % 4]!);
    const e: V3[] = [[r, 0, 0], [0, 0, r], [-r, 0, 0], [0, 0, -r]].map((d): V3 => [c[0] + d[0]!, c[1], c[2] + d[2]!]);
    for (let j = 0; j < 4; j++) {
      for (const sy of [1, -1]) {
        const m: V3 = [e[j]![0] + e[(j + 1) % 4]![0] - 2 * c[0], sy, e[j]![2] + e[(j + 1) % 4]![2] - 2 * c[2]];
        triOut(buf, e[j]!, e[(j + 1) % 4]!, [c[0], c[1] + sy * ry, c[2]], m);
      }
    }
  }
}

/** OSM trees of the island that hang over the gate, and the two flame trees planted here at the shore end (a, w, scale). */
const OSM_TREES: [number, number][] = [[45.1, 151.8], [42.6, 159.7]];
const FLAME: [number, number, number][] = [[47.6, 6.4, 0.8], [47.4, -6.8, 0.9]];

export function theHuc(_chunk: ChunkData, ctx: BuildCtx): BuildOut {
  const image = paintAtlas();
  const g = ctx.height(...thAt(GATE_A - 2, 0)); // island ground (flat: the shore is the same)
  const fb: Frame = { area: 0, a: 0, b: 0, cx: TH_O[0], cz: TH_O[1], ux: TH_UA[0], uz: TH_UA[1] };
  const [gx, gz] = thAt(GATE_A, 0);
  const fg: Frame = { ...fb, cx: gx, cz: gz };
  const cv: number[] = [];
  const ci: number[] = [];
  /** Collider quad in frame f (two-sided for Rapier). */
  const cq = (f: Frame, ...q: V3[]) => {
    const c = cv.length / 3;
    for (const [a, y, w] of q) cv.push(f.cx + a * f.ux - w * f.uz, g + y, f.cz + a * f.uz + w * f.ux);
    ci.push(c, c + 1, c + 2, c, c + 2, c + 3);
  };
  const cbox = (f: Frame) => (a0: number, a1: number, w0: number, w1: number, y0: number, y1: number) => {
    for (const [a, b, c, d] of [[a0, w0, a1, w0], [a1, w0, a1, w1], [a1, w1, a0, w1], [a0, w1, a0, w0]]) cq(f, [a!, y0, b!], [c!, y0, d!], [c!, y1, d!], [a!, y1, b!]);
    cq(f, [a0, y1, w0], [a1, y1, w0], [a1, y1, w1], [a0, y1, w1]);
  };

  const extras: MeshBucket[] = [];
  const pg = new Paint(!!image);
  gate(pg, fg, g, extras, cbox(fg));
  const pb = new Paint(!!image);
  bridge(pb);

  // colliders: forecourt floor (the abutment reaches over the water) + balustrade, deck top + parapet walls
  const hex: V3[] = [[0.55, 0.03, 3.3], [1.9, 0.03, 3.3], [3.2, 0.03, 1.62], [3.2, 0.03, -1.62], [1.9, 0.03, -3.3], [0.55, 0.03, -3.3]];
  cq(fg, hex[0]!, hex[1]!, hex[4]!, hex[5]!);
  cq(fg, hex[1]!, hex[2]!, hex[3]!, hex[4]!);
  for (const sg of [1, -1]) {
    cq(fg, [0.32, -1.2, sg * 3.3], [1.9, -1.2, sg * 3.3], [1.9, 1.0, sg * 3.3], [0.32, 1.0, sg * 3.3]);
    cq(fg, [1.9, -1.2, sg * 3.3], [3.2, -1.2, sg * 1.62], [3.2, 1.0, sg * 1.62], [1.9, 1.0, sg * 3.3]);
    cq(fg, [3.2, -1.2, sg * 1.62], [3.2, -1.2, sg * HALF], [3.2, 1.0, sg * HALF], [3.2, 1.0, sg * 1.62]);
  }
  const n = 2 * BAYS;
  for (let i = 0; i < n; i++) {
    const [a0, a1] = [DECK_A + (i * (DECK_B - DECK_A)) / n, DECK_A + ((i + 1) * (DECK_B - DECK_A)) / n];
    const [y0, y1] = [0.03 + archAt(a0), 0.03 + archAt(a1)];
    cq(fb, [a0, y0, HALF], [a1, y1, HALF], [a1, y1, -HALF], [a0, y0, -HALF]);
    for (const sg of [1, -1]) cq(fb, [a0, y0 - 0.4, sg * HALF], [a1, y1 - 0.4, sg * HALF], [a1, y1 + 1.05, sg * HALF], [a0, y0 + 1.05, sg * HALF]);
  }

  // flame trees: blossoms over two island trees (the OSM points Vegetation draws) + two planted at the shore end
  const fl = new MeshBuffer('masonry');
  const [s0, s1] = PR.treeScale as [number, number];
  for (const [x, z] of OSM_TREES) blossoms(fl, x, z, ctx.height(x, z) - 0.2, s0 + (s1 - s0) * hash01(x, z, 2), 110);
  const trees: number[] = [];
  for (const [a, w, k] of FLAME) {
    const [x, z] = thAt(a, w);
    const y = ctx.height(x, z) - 0.2;
    pushMatrix(trees, x, y, z, hash01(x, z, 1) * 2 * Math.PI, k);
    blossoms(fl, x, z, y, k, 130);
  }

  return {
    meshes: mergeBuckets([...pg.buckets(fg, g), ...pb.buckets(fb, g), ...extras, fl.bucket()]),
    instances: [{ kind: 'tree', matrices: new Float32Array(trees) }],
    colliders: [{ vertices: new Float32Array(cv), indices: new Uint32Array(ci) }],
    ...(image ? { textures: [{ material: MAT, image }, { material: 'neonSign' as const, image }] } : {}),
  };
}
