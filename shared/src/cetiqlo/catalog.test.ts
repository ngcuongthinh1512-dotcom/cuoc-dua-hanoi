import { describe, expect, it } from 'vitest';
import { CATALOG, ITEM_BY_ID, ZONES, displayShape, itemsBySlot } from './catalog.ts';
import { SHAPE_H, STORE } from './layout.ts';
import type { SlotKind } from './types.ts';

describe('cetiqlo catalog', () => {
  it('500–700 items with unique stable ids category.family.colour', () => {
    expect(CATALOG.length).toBeGreaterThanOrEqual(500);
    expect(CATALOG.length).toBeLessThanOrEqual(700);
    expect(new Set(CATALOG.map((i) => i.id)).size).toBe(CATALOG.length);
    for (const i of CATALOG) {
      expect(i.id).toBe(`${i.category}.${i.family}.${i.id.split('.')[2]}`);
      if (i.pattern) expect(i.colour2).toBeDefined();
      expect(ITEM_BY_ID.get(i.id)).toBe(i);
      expect(i.colour.hex).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
  it('every slot kind has ≥ 6 items and ≥ 3 families; decoys carry no slot', () => {
    for (const s of ['top', 'outer', 'bottom', 'shoes', 'bag', 'acc'] as SlotKind[]) {
      const items = itemsBySlot(s);
      expect(items.length, s).toBeGreaterThanOrEqual(6);
      expect(new Set(items.map((i) => i.family)).size, s).toBeGreaterThanOrEqual(3);
    }
    for (const i of CATALOG) {
      if (['dress', 'underwear', 'homewear', 'socks', 'umbrella'].includes(i.category)) expect(i.slot, i.id).toBeUndefined();
      else expect(i.slot, i.id).toBe(i.category);
    }
    expect(CATALOG.some((i) => i.category === 'bottom' && i.shape.startsWith('skirt'))).toBe(true); // skirts are bottoms
  });
  it('2–8 colours per family, same-family items adjacent on the same fixture', () => {
    const fams = new Map<string, typeof CATALOG[number][]>();
    for (const i of CATALOG) fams.set(i.family, [...(fams.get(i.family) ?? []), i]);
    for (const [fam, items] of fams) {
      expect(items.length, fam).toBeGreaterThanOrEqual(2);
      expect(items.length, fam).toBeLessThanOrEqual(8);
      let far = 0;
      for (let k = 1; k < items.length; k++) {
        const a = items[k - 1]!.shelf, b = items[k]!.shelf;
        if (Math.hypot(a.x - b.x, a.z - b.z) + Math.abs(a.y - b.y) > 4) far++; // not on the same fixture
      }
      expect(far, fam).toBeLessThanOrEqual(1); // a family may straddle one fixture boundary of its zone, never more
    }
  });
  it('shelves inside the store, on their floor, ≥ 0.25 m apart, with a known shape', () => {
    for (const i of CATALOG) {
      expect(Math.abs(i.shelf.x)).toBeLessThan(STORE.halfW);
      expect(i.shelf.z).toBeGreaterThan(STORE.back);
      expect(i.shelf.z).toBeLessThan(STORE.lobbyZ);
      const floorY = i.floor === 1 ? 0 : STORE.floor2Y;
      expect(i.shelf.y).toBeGreaterThan(floorY);
      expect(i.shelf.y).toBeLessThan(floorY + 2.4);
      expect(SHAPE_H[i.shape]).toBeGreaterThan(0);
      expect(SHAPE_H[displayShape(i.shape, i.display)]).toBeGreaterThan(0);
    }
    for (let a = 0; a < CATALOG.length; a++) for (let b = a + 1; b < CATALOG.length; b++) {
      const p = CATALOG[a]!.shelf, q = CATALOG[b]!.shelf;
      expect(Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z), `${CATALOG[a]!.id} vs ${CATALOG[b]!.id}`).toBeGreaterThanOrEqual(0.25);
    }
  });
  it('24 zones, bilingual, signs under their floor\'s ceiling', () => {
    expect(ZONES.length).toBe(24);
    for (const z of ZONES) {
      const floorY = z.floor === 1 ? 0 : STORE.floor2Y;
      expect(z.sign.y).toBeGreaterThan(floorY + 2.4);
      expect(z.sign.y).toBeLessThan(floorY + STORE.ceiling);
      expect(CATALOG.some((i) => i.zone === z.id)).toBe(true);
    }
  });
});
