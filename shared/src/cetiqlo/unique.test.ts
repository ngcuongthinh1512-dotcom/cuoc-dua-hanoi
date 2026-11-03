// Owner 2026-11-03: "mỗi đồ vật trong store chỉ nên có duy nhất 1 cái" — no two catalog items look the same (same shape, colour,
// pattern, pattern colour and repeat), and every id hangs in exactly one slot. Run alone: npx vitest run shared/src/cetiqlo/unique.test.ts
import { describe, expect, it } from 'vitest';
import { CATALOG, designKey } from './catalog.ts';

describe('cetiqlo catalog: unique designs', () => {
  it('no two items share a design key', () => {
    const seen = new Map<string, string>();
    const dups: string[] = [];
    for (const i of CATALOG) {
      const k = designKey(i), first = seen.get(k);
      if (first) dups.push(`${first} ≡ ${i.id}`); else seen.set(k, i.id);
    }
    expect(dups, dups.join('\n')).toEqual([]);
  });
  it('no two items share an id or a shelf slot', () => {
    expect(new Set(CATALOG.map((i) => i.id)).size).toBe(CATALOG.length);
    expect(new Set(CATALOG.map((i) => `${i.floor}|${i.shelf.x.toFixed(2)}|${i.shelf.y.toFixed(2)}|${i.shelf.z.toFixed(2)}`)).size).toBe(CATALOG.length);
  });
});
