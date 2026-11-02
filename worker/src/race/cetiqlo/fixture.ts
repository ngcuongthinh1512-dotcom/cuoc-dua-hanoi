// A small fake catalog (≥ 3 items per slot kind, ≥ 2 colours) for tests and for the server until the store agent's real catalog is wired
// (catalogSource.ts). Fake content only.
import type { CatalogItem, Category, ShapeId, SlotKind } from '@race/shared/cetiqlo';

const SLOT_ZONE = { top: 'tees', outer: 'uv', bottom: 'pants', shoes: 'footwear-socks', bag: 'bags', acc: 'hats-scarves' } as const;
const COLOURS = [{ name: 'Trắng', hex: '#ffffff' }, { name: 'Đen', hex: '#111111' }, { name: 'Xanh', hex: '#2a5fbf' }];

const SHAPE: Record<string, ShapeId> = { top: 'tee', outer: 'parka', bottom: 'pants', shoes: 'sneaker', bag: 'tote', acc: 'cap', dress: 'dress-aline', underwear: 'briefs' };

function make(kind: Category, slot: SlotKind | undefined, zone: CatalogItem['zone'], row: number): CatalogItem[] {
  return ['a', 'b'].flatMap((fam, f) => COLOURS.map((c, k) => ({
    id: `${kind}.${fam}.${c.name === 'Trắng' ? 'white' : c.name === 'Đen' ? 'black' : 'blue'}`,
    family: `${kind}-${fam}`, name: `${kind} ${fam}`, nameEn: `${kind} ${fam}`, category: kind, ...(slot ? { slot } : {}), colour: c, zone, floor: 1 as const,
    shelf: { x: row * 6 - 12 + f * 2, y: 0, z: -4 - k * 2, yaw: 0 }, shape: SHAPE[kind]!, display: 'hang' as const, finish: 'cotton' as const,
  })));
}

export const FIXTURE: readonly CatalogItem[] = [
  ...(Object.keys(SLOT_ZONE) as SlotKind[]).flatMap((k, row) => make(k, k, SLOT_ZONE[k], row)),
  ...make('dress', undefined, 'dresses', 6),
  ...make('underwear', undefined, 'bras-undies', 7),
];
