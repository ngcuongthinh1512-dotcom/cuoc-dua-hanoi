// CETIQLO (docs/plans/cetiqlo.md §2): the catalog's shapes. Pure types, shared by the server (id / slot / category) and the
// client (everything). Keep additive: the server agent reads these.
export type SlotKind = 'top' | 'outer' | 'bottom' | 'shoes' | 'bag' | 'acc';
export type Category = SlotKind | 'dress' | 'underwear' | 'homewear' | 'socks' | 'umbrella';
export type ZoneId =
  | 'tees' | 'polo' | 'shirts' | 'sweats' | 'knit'
  | 'uv' | 'fleece' | 'down' | 'padded' | 'fashion-outer'
  | 'bags' | 'hats-scarves' | 'sunglasses-umbrella'
  | 'pants' | 'jeans' | 'joggers' | 'shorts' | 'dresses' | 'skirts' | 'bras-undies' | 'homewear' | 'footwear-socks';
/** Low-poly mesh ids built in client/src/cetiqlo/items.ts (one InstancedMesh each). Every id is a distinct silhouette. */
export type ShapeId =
  // tops
  | 'tee' | 'tee-v' | 'tee-long' | 'tank' | 'crop' | 'tee-oversized' | 'polo' | 'polo-long'
  | 'shirt' | 'shirt-short' | 'shirt-band' | 'shirt-camp' | 'blouse'
  | 'hoodie' | 'hoodie-zip' | 'sweatshirt' | 'quarter-zip'
  | 'sweater' | 'knit-v' | 'turtleneck' | 'mockneck' | 'cardigan' | 'knit-vest'
  // outerwear
  | 'parka' | 'uv-zip' | 'bomber' | 'fleece' | 'down' | 'down-long' | 'puffer-vest' | 'blazer' | 'trench' | 'coach' | 'denim-jacket' | 'wool-coat' | 'padded'
  // bags & accessories
  | 'tote' | 'round-bag' | 'backpack' | 'crossbody' | 'cap' | 'bucket-hat' | 'beanie' | 'scarf' | 'sunglasses' | 'umbrella'
  // bottoms
  | 'pants' | 'chinos' | 'wide' | 'straight' | 'cargo' | 'jogger' | 'sweatpants' | 'bootcut' | 'bermuda' | 'shorts' | 'cycling'
  | 'jeans-wide' | 'jeans-straight'
  // dresses & skirts
  | 'dress-shirt' | 'dress-aline' | 'dress-maxi' | 'dress-slip'
  | 'skirt-pleated' | 'skirt-aline' | 'skirt-flare' | 'skirt-mini' | 'skirt-tennis' | 'skirt-denim' | 'skirt-wrap' | 'skirt-midi'
  // underwear / homewear
  | 'bra' | 'briefs' | 'bratop' | 'pyjama' | 'lounge-pants'
  // footwear
  | 'sneaker' | 'loafer' | 'sandal' | 'slipper' | 'boot' | 'socks-ankle' | 'socks-crew'
  // folded slabs (table / bay display)
  | 'fold-top' | 'fold-bottom';
/** How the item sits on its fixture: hanging on a rail, folded (a slab) on a table / wall bay, or standing on a shelf. */
export type Display = 'hang' | 'fold' | 'stand';
/** Surface family: per-instance roughness in items.ts, not a texture. */
export type Finish = 'cotton' | 'denim' | 'knit' | 'shiny' | 'print';
/** Original procedural patterns (one 512² atlas, client/src/cetiqlo/patterns.ts), drawn in `colour2` over `colour`. */
export type PatternId =
  | 'breton' | 'pinstripe' | 'border' | 'gingham' | 'tartan' | 'windowpane' | 'houndstooth' | 'dot'
  | 'floral' | 'camo' | 'tiedye' | 'geo' | 'waves' | 'wash' | 'corduroy' | 'seersucker';

export interface Colour { name: string; hex: string }
export interface CatalogItem {
  id: string;               // 'top.tee-basic.white' (category.family.colour), unique, stable
  family: string;           // 'tee-basic' (same shape)
  name: string; nameEn: string;
  category: Category; slot?: SlotKind;   // slot present = may be drawn into a set
  colour: Colour;
  material?: string;        // 'Dry-EX' | 'Oxford' …
  zone: ZoneId;
  floor: 1 | 2;
  shelf: { x: number; y: number; z: number; yaw: number };  // ROOM-LOCAL metres, the item's centre
  shape: ShapeId;
  display: Display;
  finish: Finish;
  /** Pattern drawn in `colour2` (absent = plain). `patternScale` = repeats per UV tile (default per pattern). */
  pattern?: PatternId;
  colour2?: Colour;
  patternScale?: number;
}

export interface Zone {
  id: ZoneId;
  name: string; nameEn: string;
  floor: 1 | 2;
  /** The ceiling sign's centre (room-local) and its facing (rotation.y). */
  sign: { x: number; y: number; z: number; yaw: number };
}
