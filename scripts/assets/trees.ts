// Phase 8C track T2 (docs/plans/phase8c-graphics.md #2): the plane-tree atlas → client/public/textures/trees_{col,nrm}.webp
// (+ _1k twins). The tree geometry is procedural (client/src/world/Vegetation.ts createTreeMeshes); this target only paints
// the atlas it samples (TREE_ATLAS cells, in px of the 2048 × 1024 image):
//   bark     [0, 0, 1024, 1024]     bark_platanus (Poly Haven, CC0) colour / normal
//   leaves A [1024, 0, 512, 512]    a cluster of LeafSet030 leaves (ambientCG, CC0: brown oak leaves, re-tinted green)
//   leaves B [1536, 0, 512, 512]    another cluster, other greens
//   side     [1024, 512, 512, 512]  far impostor: the whole tree seen from the side (trunk + crown)
//   top      [1536, 512, 512, 512]  far impostor: the crown seen from above
// Alpha: leaves / impostors cut out (alphaTest in the material), bark opaque. Deterministic (seeded placement).
import sharp from 'sharp';
import { TREE_ATLAS as A, treeShape } from '../../client/src/world/Vegetation.ts';
import { type Target, writePublic, zipEntry } from './pipeline.ts';

/** mulberry32: the same atlas on every run. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GREENS = ['#6f9a3c', '#5d8a33', '#7fa84a', '#4f7a2c', '#8ab055'];

type Sprite = { input: Buffer; left: number; top: number };

/** The 16 leaves of LeafSet030 (4 × 4 cells of the 2K sheet) as RGBA PNG sprites, grey → `tint`. */
async function leaves(zip: string, px: number, tint: string) {
  const col = zipEntry(zip, 'LeafSet030_2K-JPG_Color.jpg');
  const alpha = await sharp(zipEntry(zip, 'LeafSet030_2K-JPG_Opacity.jpg')).greyscale().raw().toBuffer({ resolveWithObject: true });
  const rgb = await sharp(col).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const t = [1, 3, 5].map((i) => parseInt(tint.slice(i, i + 2), 16));
  const W = rgb.info.width;
  const ch = rgb.info.channels;
  const cell = W / 4;
  const out: Buffer[] = [];
  for (let k = 0; k < 16; k++) {
    const [cx, cy] = [(k % 4) * cell, Math.floor(k / 4) * cell];
    const buf = Buffer.alloc(cell * cell * 4);
    for (let y = 0; y < cell; y++) {
      for (let x = 0; x < cell; x++) {
        const s = (cy + y) * W + cx + x;
        const d = (y * cell + x) * 4;
        // brown leaf → its luminance × the green (veins and spots keep their contrast)
        const l = (0.3 * rgb.data[s * ch]! + 0.59 * rgb.data[s * ch + 1]! + 0.11 * rgb.data[s * ch + 2]!) / 255;
        for (let c = 0; c < 3; c++) buf[d + c] = Math.min(255, Math.round(t[c]! * l * 1.6));
        buf[d + 3] = alpha.data[s * alpha.info.channels]!;
      }
    }
    out.push(await sharp(buf, { raw: { width: cell, height: cell, channels: 4 } }).trim({ threshold: 1 }).resize(px, px, { fit: 'inside' }).png().toBuffer());
  }
  return out;
}

/** One rotated leaf sprite. */
const leaf = (src: Buffer, deg: number, px: number) => sharp(src).resize(px, px, { fit: 'inside' }).rotate(deg, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();

/** Leaves scattered over a disc / ellipse (normalised cell coordinates), denser in the middle; `fill` = a darker blob
 *  under them so the cluster reads as foliage, not as single leaves. */
async function cluster(sheets: Buffer[][], w: number, h: number, r: () => number, o: { n: number; leaf: number; ellipse: [number, number, number, number]; fill?: string; under?: Sprite[] }) {
  const [ex, ey, rx, ry] = o.ellipse;
  const parts: Sprite[] = [...(o.under ?? [])];
  if (o.fill) {
    const svg = `<svg width="${w}" height="${h}"><ellipse cx="${ex * w}" cy="${ey * h}" rx="${rx * w * 0.78}" ry="${ry * h * 0.78}" fill="${o.fill}"/></svg>`;
    parts.push({ input: Buffer.from(svg), left: 0, top: 0 });
  }
  for (let i = 0; i < o.n; i++) {
    const a = r() * 2 * Math.PI;
    const d = Math.sqrt(r()) * 0.95;
    const sheet = sheets[Math.floor(r() * sheets.length)]!;
    const px = Math.round(o.leaf * (0.75 + 0.5 * r()));
    const img = await leaf(sheet[Math.floor(r() * 16)]!, r() * 360, px);
    const m = await sharp(img).metadata();
    const x = Math.round(ex * w + Math.cos(a) * d * rx * w - m.width! / 2);
    const y = Math.round(ey * h + Math.sin(a) * d * ry * h - m.height! / 2);
    if (x < 0 || y < 0 || x + m.width! > w || y + m.height! > h) continue;
    parts.push({ input: img, left: x, top: y });
  }
  return sharp({ create: { width: w, height: h, channels: 4, background: { r: 60, g: 80, b: 40, alpha: 0 } } }).composite(parts).png().toBuffer();
}

export const trees: Target = async (ctx) => {
  const zip = ctx.file('ambientcg/LeafSet030_2K-JPG.zip');
  const sheets = await Promise.all(GREENS.map((g) => leaves(zip, 160, g)));
  const r = rng(8);
  const [W, H] = [2048, 1024];
  const bark = ctx.file('polyhaven/textures/bark_platanus/bark_platanus_diff_2k.jpg');
  const barkNrm = ctx.file('polyhaven/textures/bark_platanus/bark_platanus_nor_gl_2k.jpg');
  const cell = (c: readonly number[]) => ({ left: c[0]!, top: c[1]!, w: c[2]!, h: c[3]! });
  const [b, la, lb, side, top] = [A.bark, A.leavesA, A.leavesB, A.side, A.top].map(cell);
  const S = treeShape(1); // the impostors match the procedural tree (scale 1)
  const sideH = S.height * 1.02;
  const trunkPx = Math.max(6, Math.round((S.trunkRadius * 2 * side!.w) / sideH));
  const trunkH = Math.round((side!.h * S.crownY) / sideH);
  const trunk = await sharp(bark).resize(trunkPx, trunkH, { fit: 'cover' }).modulate({ brightness: 0.8 }).png().toBuffer();
  const parts: Sprite[] = [
    { input: await sharp(bark).resize(b!.w, b!.h).png().toBuffer(), left: b!.left, top: b!.top },
    { input: await cluster(sheets, la!.w, la!.h, r, { n: 200, leaf: 70, ellipse: [0.5, 0.5, 0.42, 0.42], fill: '#476b2b' }), left: la!.left, top: la!.top },
    { input: await cluster(sheets, lb!.w, lb!.h, r, { n: 200, leaf: 70, ellipse: [0.5, 0.5, 0.42, 0.42], fill: '#3f6226' }), left: lb!.left, top: lb!.top },
    {
      // side impostor: x ∈ [−W/2, W/2] over the cell width, y from the foot (cell bottom) to sideH (cell top)
      input: await cluster(sheets, side!.w, side!.h, r, {
        n: 520, leaf: 46, fill: '#3f6226',
        ellipse: [0.5, 1 - S.crownY / sideH, S.crownRadius / sideH, (S.crownHeight / 2) / sideH],
        under: [{ input: trunk, left: Math.round((side!.w - trunkPx) / 2), top: side!.h - trunkH }],
      }),
      left: side!.left, top: side!.top,
    },
    { input: await cluster(sheets, top!.w, top!.h, r, { n: 520, leaf: 46, ellipse: [0.5, 0.5, 0.46, 0.46], fill: '#3f6226' }), left: top!.left, top: top!.top },
  ];
  const col = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 60, g: 80, b: 40, alpha: 0 } } }).composite(parts).png().toBuffer();
  const nrm = await sharp({ create: { width: W, height: H, channels: 3, background: { r: 128, g: 128, b: 255 } } })
    .composite([{ input: await sharp(barkNrm).resize(b!.w, b!.h).png().toBuffer(), left: b!.left, top: b!.top }])
    .png()
    .toBuffer();
  for (const [name, img, q] of [['col', col, 88], ['nrm', nrm, 90]] as const) {
    writePublic(`textures/trees_${name}.webp`, await sharp(img).webp({ quality: q, alphaQuality: 100 }).toBuffer(), ctx.log);
    writePublic(`textures/trees_${name}_1k.webp`, await sharp(img).resize(W / 2, H / 2).webp({ quality: q, alphaQuality: 100 }).toBuffer(), ctx.log);
  }
};
