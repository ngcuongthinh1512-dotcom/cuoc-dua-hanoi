// A chat bubble over a character's head (the Pit Stop host's finish announcement): a canvas sprite of constant size on screen,
// text redrawn per beat, hidden beyond maxDistance by an LOD. Words wrap at `wrapAt` chars; a `big` line (the rank) is drawn larger.
import { CanvasTexture, LOD, Object3D, SRGBColorSpace, Sprite, SpriteMaterial } from 'three';
import { character, raceClient } from '../config.ts';

const FAMILY = '"Be Vietnam Pro", "Segoe UI", system-ui, Arial, sans-serif';
const ensureFont = (): Promise<unknown> => document.fonts?.load(`500 32px ${FAMILY}`, 'Tôi xin thông báo, đội chơi ạ ê ơ ư 7') ?? Promise.resolve();

/** Greedy word wrap at `max` characters per line (a word longer than a line stands alone). */
export function wrapLines(text: string, max: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const w of text.split(/\s+/).filter(Boolean)) {
    if (cur && (cur + ' ' + w).length > max) (out.push(cur), (cur = w));
    else cur = cur ? cur + ' ' + w : w;
  }
  if (cur) out.push(cur);
  return out;
}

/** `tagY` = the name tag's foot (root-local y): the bubble's tail rests just above the tag's text. */
export function speechBubble(tagY: number) {
  const B = raceClient.host.bubble;
  const canvas = document.createElement('canvas');
  const sprite = new Sprite(new SpriteMaterial({ sizeAttenuation: false, depthWrite: false, depthTest: false, transparent: true }));
  sprite.center.set(0.5, 0);
  sprite.renderOrder = 998;
  const lod = new LOD();
  lod.position.y = tagY;
  lod.addLevel(sprite, 0);
  lod.addLevel(new Object3D(), B.maxDistance);
  lod.visible = false;
  const font = (px: number) => `500 ${px}px ${FAMILY}`;
  const SS = B.supersample; // the canvas is drawn at SS× and shown at 1×: crisp text, smooth edges
  let last: { text: string; big: boolean } | null = null;
  void ensureFont().then(() => last && api.set(last.text, last.big)).catch(() => undefined); // redraw once the serif is in
  const api = {
    lod,
    /** Draws `text` (empty = hide). A normal line carries a small "CETI" label; `big` (the rank) is the gold plate. */
    set(text: string, big = false) {
      last = { text, big };
      lod.visible = text !== '';
      if (!text) return;
      const px = big ? B.bigPx : B.fontPx;
      const ctx = canvas.getContext('2d')!;
      const lines = wrapLines(text, big ? 99 : B.wrapAt);
      ctx.font = font(px);
      const label = big ? '' : B.label;
      const labelPx = Math.round(px * 0.46);
      const textW = Math.max(...lines.map((l) => ctx.measureText(l).width));
      const pad = px * (big ? 0.9 : 0.8), m = B.glow; // m = room for the soft shadow / glow round the plate
      const lh = px * 1.28;
      const bodyH = Math.ceil(lines.length * lh + pad * 1.2 + (label ? labelPx * 1.5 : 0));
      const bodyW = Math.max(Math.ceil(textW + pad * 2), big ? Math.ceil(px * 3.2) : 0); // the rank plate is never a tall square
      const w = bodyW + m * 2, h = bodyH + B.tail + m * 2;
      canvas.width = Math.ceil(w * SS);
      canvas.height = Math.ceil(h * SS);
      ctx.scale(SS, SS);
      const [x0, y0] = [m, m];
      const r = Math.min(bodyH / 2, px * 0.62);
      const plate = new Path2D();
      plate.roundRect(x0, y0, bodyW, bodyH, r);
      plate.moveTo(w / 2 - B.tail * 0.8, y0 + bodyH - 0.5);
      plate.quadraticCurveTo(w / 2 - B.tail * 0.1, y0 + bodyH + 1, w / 2, y0 + bodyH + B.tail);
      plate.quadraticCurveTo(w / 2 + B.tail * 0.1, y0 + bodyH + 1, w / 2 + B.tail * 0.8, y0 + bodyH - 0.5);
      ctx.save();
      ctx.shadowColor = big ? B.bigGlow : B.shadow;
      ctx.shadowBlur = big ? m * 0.9 : m * 0.7;
      ctx.shadowOffsetY = big ? 0 : 3;
      const g = ctx.createLinearGradient(0, y0, 0, y0 + bodyH);
      g.addColorStop(0, big ? B.bigTop : B.top);
      g.addColorStop(1, big ? B.bigBottom : B.bottom);
      ctx.fillStyle = g;
      ctx.fill(plate);
      ctx.restore();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = big ? B.bigEdge : B.edge;
      ctx.stroke(plate);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      let y = y0 + pad * 0.6;
      if (label) {
        ctx.font = font(labelPx);
        ctx.fillStyle = B.labelInk;
        ctx.letterSpacing = `${(labelPx * 0.22).toFixed(1)}px`;
        ctx.fillText(label, w / 2, y + labelPx * 0.7);
        ctx.letterSpacing = '0px';
        y += labelPx * 1.5;
      }
      ctx.font = font(px);
      ctx.fillStyle = big ? B.bigInk : B.ink;
      if (big) ctx.letterSpacing = `${(px * 0.06).toFixed(1)}px`;
      lines.forEach((l, i) => ctx.fillText(l, w / 2, y + (i + 0.5) * lh));
      ctx.letterSpacing = '0px';
      // a texture's size is fixed once uploaded (immutable storage): every line gets a new one, the old one is freed
      const old = sprite.material.map;
      const map = new CanvasTexture(canvas);
      map.colorSpace = SRGBColorSpace;
      map.anisotropy = 4;
      sprite.material.map = map;
      sprite.material.needsUpdate = true;
      old?.dispose();
      sprite.scale.set(B.pxScale * w, B.pxScale * h, 1);
      // the tag is a screen-constant sprite (character.nameTag.scale of the screen high) anchored at its foot: lift the bubble past it
      sprite.center.set(0.5, (m * 0.2) / h - (character.nameTag.scale + B.gap) / (B.pxScale * h));
    },
    dispose() {
      sprite.material.map?.dispose();
      sprite.material.dispose();
    },
  };
  return api;
}
