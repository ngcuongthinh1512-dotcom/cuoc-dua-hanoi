// CETIQLO catalog (docs/plans/cetiqlo.md §0 / §2): every product line of the brief as a family with 2–4 colour variants, each
// variant one item with a stable id `category.family.colour`. Shelf poses come from layout.ts FIXTURES: a zone's families fill
// its fixtures' slots in order, so near-identical items (same shape, other colour; same colour, other material) sit side by
// side. Pure data: the server reads id / slot / category, the client everything.
import { FIXTURES, SHAPE_H, STORE, fixtureSlots } from './layout.ts';
import type { CatalogItem, Category, Display, Finish, PatternId, RemovedPatternId, ShapeId, SlotKind, Zone, ZoneId } from './types.ts';

export const COLOURS = {
  white: ['Trắng', '#F2F2F0'], black: ['Đen', '#1C1C1E'], grey: ['Xám', '#8E8E90'], lightgrey: ['Xám nhạt', '#C9C9C7'], charcoal: ['Than', '#3A3A3C'],
  navy: ['Xanh navy', '#1F2A5A'], blue: ['Xanh dương', '#2F5FA8'], lightblue: ['Xanh nhạt', '#A7C7E7'], denim: ['Xanh denim', '#3B5B8C'], lightdenim: ['Denim nhạt', '#7FA1C9'],
  beige: ['Be', '#D8C9A8'], cream: ['Kem', '#F3E8D2'], brown: ['Nâu', '#6B4A2E'], camel: ['Vàng camel', '#C19A5B'], olive: ['Xanh olive', '#6B6E3C'],
  red: ['Đỏ', '#C0262B'], wine: ['Đỏ đô', '#7A1F2E'], pink: ['Hồng', '#E8A0B4'], green: ['Xanh lá', '#3C7A4A'], teal: ['Xanh ngọc', '#2A9D8F'],
  yellow: ['Vàng', '#E9C34A'], orange: ['Cam', '#E07A2F'], purple: ['Tím', '#6D4C9F'],
  offwhite: ['Trắng ngà', '#ECE9E1'], ivory: ['Ngà', '#F5F0E1'], lightpink: ['Hồng nhạt', '#F3C6D0'], skyblue: ['Xanh da trời', '#8EC5E8'],
  darkgreen: ['Xanh rêu', '#2F4F3A'], mustard: ['Vàng mù tạt', '#D4A017'], rust: ['Nâu đỏ', '#B5542B'], khaki: ['Kaki', '#B8A77A'], sand: ['Cát', '#E0D3B5'],
  slate: ['Xám xanh', '#5D6B7A'], darknavy: ['Navy đậm', '#141C3A'], lavender: ['Tím nhạt', '#B9A6D6'], mint: ['Xanh bạc hà', '#A8DCC4'], coral: ['Cam san hô', '#F08A6E'],
} as const;
type ColourKey = keyof typeof COLOURS;

/** A colourway: one key, or [base, pattern colour] for a patterned family. */
type Way = ColourKey | [ColourKey, ColourKey];
interface Family {
  zone: ZoneId; family: string; name: string; nameEn: string; shape: ShapeId; material?: string; finish?: Finish; colours: Way[];
  pattern?: PatternId | RemovedPatternId; scale?: number;
}
const REMOVED: ReadonlySet<string> = new Set<RemovedPatternId>(['tartan', 'houndstooth', 'camo', 'tiedye', 'geo', 'corduroy', 'seersucker']);
// Zone → category / slot. Dresses, underwear, homewear, socks and umbrellas are decoys (no slot).
const ZONE_CAT: Record<ZoneId, { category: Category; slot?: SlotKind; floor: 1 | 2; name: string; nameEn: string }> = {
  tees: { category: 'top', slot: 'top', floor: 1, name: 'Áo thun & UT', nameEn: 'T-shirts & UT' },
  polo: { category: 'top', slot: 'top', floor: 1, name: 'Áo polo', nameEn: 'Polo shirts' },
  shirts: { category: 'top', slot: 'top', floor: 1, name: 'Sơ mi & áo kiểu', nameEn: 'Shirts & blouses' },
  sweats: { category: 'top', slot: 'top', floor: 1, name: 'Nỉ & hoodie', nameEn: 'Sweats & hoodies' },
  knit: { category: 'top', slot: 'top', floor: 1, name: 'Dệt kim & len', nameEn: 'Knitwear' },
  uv: { category: 'outer', slot: 'outer', floor: 1, name: 'Áo chống nắng UV', nameEn: 'UV protection' },
  fleece: { category: 'outer', slot: 'outer', floor: 1, name: 'Fleece', nameEn: 'Fleece' },
  down: { category: 'outer', slot: 'outer', floor: 1, name: 'Ultra Light Down', nameEn: 'Ultra Light Down' },
  padded: { category: 'outer', slot: 'outer', floor: 1, name: 'Áo dày', nameEn: 'Padded & down' },
  'fashion-outer': { category: 'outer', slot: 'outer', floor: 1, name: 'Áo khoác thời trang', nameEn: 'Fashion outerwear' },
  bags: { category: 'bag', slot: 'bag', floor: 1, name: 'Túi & balo', nameEn: 'Bags & backpacks' },
  'hats-scarves': { category: 'acc', slot: 'acc', floor: 1, name: 'Mũ & khăn', nameEn: 'Hats & scarves' },
  'sunglasses-umbrella': { category: 'acc', slot: 'acc', floor: 1, name: 'Kính râm & ô', nameEn: 'Sunglasses & umbrellas' },
  'belts-wallets': { category: 'acc', slot: 'acc', floor: 1, name: 'Thắt lưng & ví', nameEn: 'Belts & wallets' },
  'gloves-watches': { category: 'acc', slot: 'acc', floor: 1, name: 'Găng tay & đồng hồ', nameEn: 'Gloves & watches' },
  pants: { category: 'bottom', slot: 'bottom', floor: 2, name: 'Quần dài', nameEn: 'Pants' },
  jeans: { category: 'bottom', slot: 'bottom', floor: 2, name: 'Jeans', nameEn: 'Jeans' },
  joggers: { category: 'bottom', slot: 'bottom', floor: 2, name: 'Nỉ & jogger', nameEn: 'Sweatpants & joggers' },
  shorts: { category: 'bottom', slot: 'bottom', floor: 2, name: 'Quần short', nameEn: 'Shorts' },
  dresses: { category: 'dress', floor: 2, name: 'Đầm', nameEn: 'Dresses' },
  skirts: { category: 'bottom', slot: 'bottom', floor: 2, name: 'Chân váy', nameEn: 'Skirts' },
  'bras-undies': { category: 'underwear', floor: 2, name: 'Đồ lót', nameEn: 'Underwear' },
  homewear: { category: 'homewear', floor: 2, name: 'Đồ mặc nhà', nameEn: 'Loungewear' },
  'footwear-socks': { category: 'shoes', slot: 'shoes', floor: 2, name: 'Giày, dép & tất', nameEn: 'Footwear & socks' },
};
// Families whose zone says one category but which are something else (umbrellas in the sunglasses zone, socks with the shoes).
const FAMILY_CAT: Record<string, Category> = { 'umbrella-folding': 'umbrella', 'umbrella-dot': 'umbrella', 'umbrella-long': 'umbrella', 'umbrella-stripe': 'umbrella', 'umbrella-long-2': 'umbrella', 'socks-ankle': 'socks', 'socks-crew': 'socks', 'socks-crew-stripe': 'socks', 'socks-dot': 'socks', 'socks-border': 'socks', 'socks-ankle-dot': 'socks', 'socks-crew-2': 'socks' };

export const FAMILIES: Family[] = [
  // ---- floor 1 · ÁO ----
  { zone: 'tees', family: 'tee-crew', name: 'Áo thun cotton cổ tròn', nameEn: 'Crew neck T-shirt', shape: 'tee', material: 'Cotton', colours: ['white', 'black', 'grey', 'navy', 'pink', 'red', 'green', 'lightblue'] },
  { zone: 'tees', family: 'tee-dryex', name: 'Áo thun Dry-EX tay raglan', nameEn: 'Dry-EX raglan T-shirt', shape: 'tee-raglan', material: 'Dry-EX', colours: ['white', 'black', 'blue', 'grey', 'navy', 'red'] },
  { zone: 'tees', family: 'ut-print', name: 'Áo thun UT kẻ bản to màu', nameEn: 'UT colour-block tee', shape: 'tee', material: 'Cotton', finish: 'print', pattern: 'border', scale: 1, colours: [['teal', 'white'], ['coral', 'cream'], ['purple', 'yellow']] },
  { zone: 'tees', family: 'tee-airism', name: 'Áo thun AIRism có túi', nameEn: 'AIRism pocket T-shirt', shape: 'tee-pocket', material: 'AIRism', colours: ['beige', 'olive', 'wine', 'lightpink', 'skyblue'] },
  { zone: 'polo', family: 'polo-dryex', name: 'Áo polo Dry-EX', nameEn: 'Dry-EX polo', shape: 'polo', material: 'Dry-EX', colours: ['white', 'navy', 'red', 'grey', 'black', 'lightblue'] },
  { zone: 'polo', family: 'polo-pique', name: 'Áo polo pique', nameEn: 'Piqué polo', shape: 'polo', material: 'Pique', colours: ['cream', 'darkgreen', 'wine', 'mustard'] },
  { zone: 'shirts', family: 'shirt-oxford', name: 'Sơ mi Oxford', nameEn: 'Oxford shirt', shape: 'shirt', material: 'Oxford', colours: ['white', 'lightblue', 'pink', 'grey', 'navy'] },
  { zone: 'shirts', family: 'shirt-flannel', name: 'Sơ mi Flannel', nameEn: 'Flannel shirt', shape: 'shirt', material: 'Flannel', finish: 'knit', colours: ['red', 'green', 'rust'] },
  { zone: 'shirts', family: 'shirt-linen', name: 'Sơ mi Linen', nameEn: 'Linen shirt', shape: 'shirt', material: 'Linen', colours: ['mint', 'beige', 'skyblue', 'sand', 'olive'] },
  { zone: 'shirts', family: 'blouse-rayon', name: 'Áo kiểu Rayon', nameEn: 'Rayon blouse', shape: 'shirt', material: 'Rayon', finish: 'shiny', colours: ['cream', 'black', 'wine'] },
  { zone: 'sweats', family: 'hoodie-pullover', name: 'Hoodie chui đầu', nameEn: 'Pullover hoodie', shape: 'hoodie', material: 'Nỉ', colours: ['grey', 'black', 'navy', 'wine', 'beige'] },
  { zone: 'sweats', family: 'hoodie-zip', name: 'Hoodie khóa kéo', nameEn: 'Zip hoodie', shape: 'hoodie-zip', material: 'Nỉ', colours: ['grey', 'charcoal', 'olive'] },
  { zone: 'sweats', family: 'sweatshirt', name: 'Áo nỉ cổ tròn', nameEn: 'Crew sweatshirt', shape: 'sweatshirt', material: 'Nỉ', colours: ['lightgrey', 'wine', 'navy', 'black'] },
  { zone: 'knit', family: 'knit-merino', name: 'Áo len Merino', nameEn: 'Merino sweater', shape: 'sweater', material: 'Merino', finish: 'knit', colours: ['black', 'camel', 'navy', 'darkgreen', 'wine', 'grey'] },
  { zone: 'knit', family: 'knit-cashmere', name: 'Áo len Cashmere', nameEn: 'Cashmere sweater', shape: 'sweater', material: 'Cashmere', finish: 'knit', colours: ['cream', 'lightgrey', 'lavender', 'sand', 'charcoal'] },
  { zone: 'knit', family: 'knit-souffle', name: 'Áo len Souffle', nameEn: 'Soufflé yarn sweater', shape: 'sweater', material: 'Souffle', finish: 'knit', colours: ['pink', 'lightblue', 'beige'] },
  // ---- floor 1 · ÁO KHOÁC ----
  { zone: 'uv', family: 'uv-parka-dryex', name: 'Áo chống nắng Dry-EX', nameEn: 'Dry-EX UV parka', shape: 'parka', material: 'Dry-EX', colours: ['white', 'black', 'lightblue', 'navy', 'lightpink'] },
  { zone: 'uv', family: 'pocketable-parka', name: 'Pocketable Parka', nameEn: 'Pocketable parka', shape: 'parka', material: 'Nylon', finish: 'shiny', colours: ['slate', 'beige', 'olive'] },
  { zone: 'fleece', family: 'fleece-zip', name: 'Áo fleece khóa kéo', nameEn: 'Full-zip fleece', shape: 'fleece', material: 'Fleece', finish: 'knit', colours: ['cream', 'navy', 'brown'] },
  { zone: 'fleece', family: 'fleece-pullover', name: 'Áo fleece chui đầu', nameEn: 'Fleece pullover', shape: 'fleece-pullover', material: 'Fleece', finish: 'knit', colours: ['grey', 'green', 'navy', 'beige'] },
  { zone: 'down', family: 'uld-jacket', name: 'Áo Ultra Light Down', nameEn: 'Ultra Light Down jacket', shape: 'down', material: 'Lông vũ', finish: 'shiny', colours: ['black', 'navy', 'red', 'beige', 'lightblue', 'mustard', 'green'] },
  { zone: 'down', family: 'uld-hooded', name: 'Ultra Light Down có mũ', nameEn: 'Ultra Light Down hooded', shape: 'down', material: 'Lông vũ', finish: 'shiny', colours: ['olive', 'wine'] },
  { zone: 'padded', family: 'padded-coat', name: 'Áo khoác Padded', nameEn: 'Padded coat', shape: 'down-long', material: 'Padded', colours: ['charcoal', 'camel', 'darknavy', 'olive', 'wine'] },
  { zone: 'padded', family: 'seamless-down', name: 'Seamless Down parka', nameEn: 'Seamless Down parka', shape: 'padded', material: 'Lông vũ', finish: 'shiny', colours: ['black', 'grey', 'olive'] },
  { zone: 'fashion-outer', family: 'blazer', name: 'Áo blazer', nameEn: 'Blazer', shape: 'blazer', material: 'Len pha', colours: ['black', 'navy', 'beige', 'grey', 'charcoal'] },
  { zone: 'fashion-outer', family: 'trench', name: 'Áo trench', nameEn: 'Trench coat', shape: 'trench', material: 'Cotton', colours: ['beige', 'black', 'navy', 'olive'] },
  { zone: 'fashion-outer', family: 'cardigan', name: 'Áo cardigan', nameEn: 'Cardigan', shape: 'cardigan', material: 'Len', finish: 'knit', colours: ['cream', 'grey', 'green', 'navy', 'black'] },
  { zone: 'fashion-outer', family: 'denim-jacket', name: 'Áo khoác denim', nameEn: 'Denim jacket', shape: 'denim-jacket', material: 'Denim', finish: 'denim', colours: ['denim', 'lightdenim', 'black'] },
  // ---- floor 1 · PHỤ KIỆN ----
  { zone: 'bags', family: 'round-mini-bag', name: 'Túi đeo chéo Round Mini', nameEn: 'Round mini shoulder bag', shape: 'round-bag', material: 'Nylon', finish: 'shiny', colours: ['black', 'beige', 'green', 'red', 'navy', 'lavender'] },
  { zone: 'bags', family: 'tote-canvas', name: 'Túi tote canvas', nameEn: 'Canvas tote', shape: 'tote', material: 'Canvas', colours: ['cream', 'black', 'navy', 'olive', 'red'] },
  { zone: 'bags', family: 'backpack', name: 'Balo', nameEn: 'Backpack', shape: 'backpack', material: 'Nylon', colours: ['black', 'grey', 'olive', 'navy', 'red'] },
  { zone: 'hats-scarves', family: 'cap', name: 'Mũ lưỡi trai', nameEn: 'Cap', shape: 'cap', material: 'Cotton', colours: ['black', 'navy', 'beige', 'red', 'white', 'olive'] },
  { zone: 'hats-scarves', family: 'beanie', name: 'Mũ len', nameEn: 'Beanie', shape: 'beanie', material: 'Len', finish: 'knit', colours: ['black', 'grey', 'wine', 'navy', 'cream'] },
  { zone: 'hats-scarves', family: 'scarf-knit', name: 'Khăn len', nameEn: 'Knit scarf', shape: 'scarf', material: 'Len', finish: 'knit', colours: ['grey', 'camel', 'wine', 'darkgreen', 'navy'] },
  { zone: 'hats-scarves', family: 'scarf-heattech', name: 'Khăn HEATTECH', nameEn: 'HEATTECH scarf', shape: 'scarf', material: 'HEATTECH', colours: ['charcoal', 'darknavy'] },
  { zone: 'sunglasses-umbrella', family: 'sunglasses-uv', name: 'Kính râm chống UV', nameEn: 'UV sunglasses', shape: 'sunglasses', material: 'Nhựa', finish: 'shiny', colours: ['black', 'brown', 'teal', 'navy', 'wine'] },
  { zone: 'sunglasses-umbrella', family: 'umbrella-folding', name: 'Ô gấp', nameEn: 'Folding umbrella', shape: 'umbrella', material: 'Nylon', finish: 'shiny', colours: ['black', 'navy', 'yellow', 'red', 'green'] },
  // ---- floor 2 · QUẦN ----
  { zone: 'pants', family: 'smart-ankle', name: 'Smart Ankle Pants', nameEn: 'Smart ankle pants', shape: 'pants', material: 'Len pha', colours: ['black', 'grey', 'navy', 'olive', 'beige'] },
  { zone: 'pants', family: 'chinos', name: 'Quần chinos', nameEn: 'Chinos', shape: 'chinos', material: 'Cotton', colours: ['beige', 'olive', 'navy', 'black', 'grey'] },
  { zone: 'pants', family: 'trousers', name: 'Quần tây', nameEn: 'Dress trousers', shape: 'straight', material: 'Polyester', colours: ['black', 'charcoal', 'darknavy'] },
  { zone: 'pants', family: 'cargo', name: 'Quần cargo', nameEn: 'Cargo pants', shape: 'cargo', material: 'Cotton', colours: ['olive', 'black', 'beige', 'grey'] },
  { zone: 'jeans', family: 'jeans-ultra-stretch', name: 'Jeans Ultra Stretch', nameEn: 'Ultra Stretch jeans', shape: 'straight', material: 'Denim co giãn', finish: 'denim', colours: ['denim', 'lightdenim', 'darkgreen', 'wine'] },
  { zone: 'jeans', family: 'jeans-wide', name: 'Jeans ống rộng', nameEn: 'Wide-fit jeans', shape: 'jeans-wide', material: 'Denim', finish: 'denim', colours: ['denim', 'lightdenim', 'cream', 'black', 'darknavy'] },
  { zone: 'jeans', family: 'jeans-straight', name: 'Jeans ống suông', nameEn: 'Straight jeans', shape: 'jeans-straight', material: 'Denim', finish: 'denim', colours: ['denim', 'lightdenim', 'charcoal', 'white', 'beige'] },
  { zone: 'joggers', family: 'sweatpants', name: 'Quần nỉ', nameEn: 'Sweatpants', shape: 'sweatpants', material: 'Nỉ', colours: ['grey', 'black'] },
  { zone: 'joggers', family: 'jogger', name: 'Quần jogger', nameEn: 'Jogger pants', shape: 'jogger', material: 'Cotton', colours: ['black', 'navy', 'olive'] },
  { zone: 'shorts', family: 'shorts-sport', name: 'Short thể thao', nameEn: 'Active shorts', shape: 'shorts', material: 'Dry-EX', colours: ['black', 'navy', 'blue', 'grey', 'red'] },
  { zone: 'shorts', family: 'shorts-chino', name: 'Short kaki', nameEn: 'Chino shorts', shape: 'shorts-chino', material: 'Cotton', colours: ['beige', 'olive', 'navy'] },
  { zone: 'shorts', family: 'shorts-linen', name: 'Short linen', nameEn: 'Linen shorts', shape: 'shorts', material: 'Linen', colours: ['white', 'beige'] },
  { zone: 'shorts', family: 'shorts-georgette', name: 'Short georgette', nameEn: 'Georgette shorts', shape: 'shorts', material: 'Georgette', finish: 'shiny', colours: ['wine', 'lightpink'] },
  // ---- floor 2 · ĐẦM & CHÂN VÁY ----
  { zone: 'dresses', family: 'shirt-dress', name: 'Đầm sơ mi', nameEn: 'Shirt dress', shape: 'dress-shirt', material: 'Cotton', colours: ['white', 'lightblue', 'black'] },
  { zone: 'dresses', family: 'aline-dress', name: 'Đầm suông', nameEn: 'A-line dress', shape: 'dress-aline', material: 'Rayon', finish: 'shiny', colours: ['black', 'wine', 'green'] },
  { zone: 'dresses', family: 'maxi-dress', name: 'Đầm maxi', nameEn: 'Maxi dress', shape: 'dress-maxi', material: 'Linen', colours: ['beige', 'navy'] },
  { zone: 'skirts', family: 'skirt-pleated', name: 'Chân váy xếp ly', nameEn: 'Pleated skirt', shape: 'skirt-pleated', material: 'Polyester', finish: 'shiny', colours: ['black', 'beige', 'green'] },
  { zone: 'skirts', family: 'skirt-aline', name: 'Chân váy chữ A', nameEn: 'A-line skirt', shape: 'skirt-aline', material: 'Cotton', colours: ['black', 'navy', 'brown', 'beige', 'darkgreen'] },
  { zone: 'skirts', family: 'skirt-flare', name: 'Chân váy xòe', nameEn: 'Flared skirt', shape: 'skirt-flare', material: 'Rayon', colours: ['wine', 'cream'] },
  { zone: 'skirts', family: 'skirt-denim', name: 'Chân váy denim', nameEn: 'Denim skirt', shape: 'skirt-denim', material: 'Denim', finish: 'denim', colours: ['denim', 'lightdenim'] },
  // ---- floor 2 · ĐỒ LÓT & MẶC NHÀ ----
  { zone: 'bras-undies', family: 'bra-3dhold', name: 'Áo ngực 3D Hold', nameEn: '3D Hold wireless bra', shape: 'bra', material: 'Không gọng', finish: 'shiny', colours: ['black', 'beige', 'pink', 'navy', 'wine'] },
  { zone: 'bras-undies', family: 'bra-relax', name: 'Áo ngực Relax', nameEn: 'Relax wireless bra', shape: 'bra', material: 'Không gọng', colours: ['grey', 'cream'] },
  { zone: 'bras-undies', family: 'briefs-seamless', name: 'Quần lót seamless', nameEn: 'Seamless briefs', shape: 'briefs', material: 'Seamless', finish: 'shiny', colours: ['black', 'beige', 'navy'] },
  { zone: 'bras-undies', family: 'briefs-cotton', name: 'Quần lót cotton', nameEn: 'Cotton briefs', shape: 'briefs', material: 'Cotton', colours: ['white', 'grey'] },
  { zone: 'bras-undies', family: 'bratop', name: 'Bratop', nameEn: 'Bra top', shape: 'bratop', material: 'AIRism', colours: ['black', 'white', 'pink', 'grey', 'beige'] },
  { zone: 'homewear', family: 'pyjama', name: 'Bộ pyjama', nameEn: 'Pyjama set', shape: 'pyjama', material: 'Cotton', colours: ['lightblue', 'pink', 'grey'] },
  { zone: 'homewear', family: 'relaco-shorts', name: 'Quần Relaco', nameEn: 'Relaco shorts', shape: 'shorts', material: 'Rayon', colours: ['teal', 'darkgreen', 'mustard', 'sand'] },
  { zone: 'homewear', family: 'draping-pants', name: 'Quần draping', nameEn: 'Draping pants', shape: 'lounge-pants', material: 'Rayon', finish: 'shiny', colours: ['black', 'beige', 'navy', 'grey'] },
  // ---- floor 2 · GIÀY, DÉP, TẤT ----
  { zone: 'footwear-socks', family: 'sneaker', name: 'Giày sneaker', nameEn: 'Sneakers', shape: 'sneaker', material: 'Canvas', colours: ['white', 'black', 'navy', 'red', 'grey', 'green', 'beige'] },
  { zone: 'footwear-socks', family: 'loafer', name: 'Giày lười', nameEn: 'Loafers', shape: 'loafer', material: 'Da', finish: 'shiny', colours: ['black', 'brown', 'camel', 'navy', 'wine'] },
  { zone: 'footwear-socks', family: 'sandal', name: 'Sandal', nameEn: 'Sandals', shape: 'sandal', material: 'Nhựa', colours: ['black', 'beige', 'teal', 'white', 'brown'] },
  { zone: 'footwear-socks', family: 'slipper', name: 'Dép trong nhà', nameEn: 'Indoor slippers', shape: 'slipper', material: 'Nỉ', finish: 'knit', colours: ['grey', 'cream', 'pink', 'navy', 'lightblue'] },
  { zone: 'footwear-socks', family: 'boot', name: 'Giày boot', nameEn: 'Boots', shape: 'boot', material: 'Da', finish: 'shiny', colours: ['black', 'brown', 'camel'] },
  { zone: 'footwear-socks', family: 'sneaker-stripe', name: 'Sneaker sọc', nameEn: 'Striped sneakers', shape: 'sneaker', material: 'Canvas', pattern: 'border', colours: [['white', 'navy'], ['white', 'red']] },
  { zone: 'footwear-socks', family: 'socks-ankle', name: 'Tất cổ ngắn', nameEn: 'Ankle socks', shape: 'socks-ankle', material: 'Cotton', finish: 'knit', colours: ['white', 'black', 'grey', 'navy', 'pink'] },
  { zone: 'footwear-socks', family: 'socks-crew', name: 'Tất cổ cao', nameEn: 'Crew socks', shape: 'socks-crew', material: 'Cotton', finish: 'knit', colours: ['white', 'black', 'navy'] },
  // ================= round 2: more lines, distinct silhouettes, patterns (ids new) =================
  // ---- floor 1 · ÁO ----
  { zone: 'tees', family: 'tee-supima', name: 'Áo thun Supima henley', nameEn: 'Supima henley T-shirt', shape: 'tee-henley', material: 'Supima', colours: ['ivory', 'lightpink', 'skyblue', 'sand'] },
  { zone: 'tees', family: 'tee-v', name: 'Áo thun cổ V', nameEn: 'V-neck T-shirt', shape: 'tee-v', material: 'Cotton', colours: ['white', 'black', 'grey', 'navy', 'wine'] },
  { zone: 'tees', family: 'tee-long', name: 'Áo thun dài tay', nameEn: 'Long-sleeve T-shirt', shape: 'tee-long', material: 'Cotton', colours: ['white', 'black', 'olive', 'beige'] },
  { zone: 'tees', family: 'tank', name: 'Áo ba lỗ', nameEn: 'Tank top', shape: 'tank', material: 'AIRism', colours: ['white', 'black', 'grey'] },
  { zone: 'tees', family: 'crop-top', name: 'Áo croptop', nameEn: 'Crop top', shape: 'crop', material: 'Cotton', colours: ['white', 'black', 'pink', 'mint'] },
  { zone: 'tees', family: 'tee-oversized', name: 'Áo thun oversize', nameEn: 'Oversized T-shirt', shape: 'tee-oversized', material: 'Cotton dày', colours: ['offwhite', 'black', 'sand', 'slate'] },
  { zone: 'tees', family: 'tee-breton', name: 'Áo thun kẻ ngang', nameEn: 'Breton stripe T-shirt', shape: 'tee', material: 'Cotton', pattern: 'breton', colours: [['white', 'navy'], ['white', 'red'], ['cream', 'black'], ['navy', 'white']] },
  { zone: 'tees', family: 'tee-border', name: 'Áo thun kẻ bản to', nameEn: 'Border stripe T-shirt', shape: 'tee', material: 'Cotton', pattern: 'border', colours: [['white', 'navy'], ['grey', 'black'], ['yellow', 'navy']] },
  { zone: 'tees', family: 'ut-geo', name: 'Áo thun UT chấm to', nameEn: 'UT big-dot tee', shape: 'tee', material: 'Cotton', pattern: 'dot', scale: 1, colours: [['white', 'black'], ['black', 'white'], ['yellow', 'navy']] },
  { zone: 'tees', family: 'ut-waves', name: 'Áo thun UT sóng', nameEn: 'UT waves tee', shape: 'tee', material: 'Cotton', pattern: 'waves', colours: [['skyblue', 'white'], ['navy', 'white'], ['white', 'teal']] },
  { zone: 'tees', family: 'ut-dot', name: 'Áo thun UT chấm bi', nameEn: 'UT polka dot tee', shape: 'tee', material: 'Cotton', pattern: 'dot', colours: [['white', 'black'], ['pink', 'white'], ['navy', 'white']] },
  { zone: 'tees', family: 'tee-tiedye', name: 'Áo thun oversize mềm', nameEn: 'Soft oversized tee', shape: 'tee-oversized', material: 'Cotton', pattern: 'tiedye', colours: [['lavender', 'white'], ['mint', 'white'], ['coral', 'white']] },
  { zone: 'tees', family: 'tee-camo', name: 'Áo thun thể thao raglan', nameEn: 'Sport raglan tee', shape: 'tee-raglan', material: 'Cotton', pattern: 'camo', colours: [['olive', 'khaki'], ['charcoal', 'black']] },
  { zone: 'tees', family: 'tank-stripe', name: 'Áo ba lỗ kẻ', nameEn: 'Striped tank', shape: 'tank', material: 'Cotton', pattern: 'breton', colours: [['white', 'navy'], ['white', 'black']] },
  { zone: 'tees', family: 'tee-long-stripe', name: 'Áo thun dài tay kẻ', nameEn: 'Striped long-sleeve tee', shape: 'tee-long', material: 'Cotton', pattern: 'breton', colours: [['cream', 'navy'], ['white', 'red']] },
  { zone: 'polo', family: 'polo-long', name: 'Áo polo dài tay', nameEn: 'Long-sleeve polo', shape: 'polo-long', material: 'Cotton', colours: ['navy', 'black', 'wine', 'grey'] },
  { zone: 'polo', family: 'polo-stripe', name: 'Áo polo kẻ', nameEn: 'Striped polo', shape: 'polo', material: 'Pique', pattern: 'breton', colours: [['white', 'navy'], ['navy', 'white'], ['green', 'white']] },
  { zone: 'polo', family: 'polo-border', name: 'Áo polo viền', nameEn: 'Border polo', shape: 'polo', material: 'Dry-EX', pattern: 'border', colours: [['white', 'red'], ['navy', 'yellow']] },
  { zone: 'shirts', family: 'shirt-gingham', name: 'Sơ mi caro gingham', nameEn: 'Gingham shirt', shape: 'shirt', material: 'Cotton', pattern: 'gingham', colours: [['white', 'blue'], ['white', 'red'], ['white', 'black']] },
  { zone: 'shirts', family: 'shirt-flannel-check', name: 'Sơ mi flannel caro', nameEn: 'Check flannel shirt', shape: 'shirt', material: 'Flannel', finish: 'knit', pattern: 'windowpane', scale: 2.5, colours: [['red', 'black'], ['green', 'navy'], ['blue', 'black'], ['camel', 'brown']] },
  { zone: 'shirts', family: 'shirt-short-linen', name: 'Sơ mi linen ngắn tay', nameEn: 'Short-sleeve linen shirt', shape: 'shirt-short', material: 'Linen', colours: ['white', 'sand', 'skyblue', 'olive'] },
  { zone: 'shirts', family: 'shirt-band', name: 'Sơ mi cổ trụ', nameEn: 'Band collar shirt', shape: 'shirt-band', material: 'Cotton', colours: ['white', 'olive', 'navy', 'beige'] },
  { zone: 'shirts', family: 'shirt-camp-aloha', name: 'Sơ mi cổ vest hoa', nameEn: 'Camp collar floral shirt', shape: 'shirt-camp', material: 'Rayon', finish: 'shiny', pattern: 'floral', colours: [['navy', 'cream'], ['teal', 'white'], ['wine', 'cream']] },
  { zone: 'shirts', family: 'shirt-camp', name: 'Sơ mi cổ vest', nameEn: 'Camp collar shirt', shape: 'shirt-camp', material: 'Linen', colours: ['white', 'black', 'sand'] },
  { zone: 'shirts', family: 'shirt-pinstripe', name: 'Sơ mi kẻ nhỏ', nameEn: 'Pinstripe shirt', shape: 'shirt', material: 'Cotton', pattern: 'pinstripe', colours: [['white', 'navy'], ['lightblue', 'navy'], ['white', 'grey']] },
  { zone: 'shirts', family: 'shirt-seersucker', name: 'Sơ mi cotton ngắn tay', nameEn: 'Short-sleeve cotton shirt', shape: 'shirt-short', material: 'Seersucker', pattern: 'seersucker', colours: [['lightblue', 'white'], ['pink', 'white'], ['navy', 'white']] },
  { zone: 'shirts', family: 'shirt-windowpane', name: 'Sơ mi kẻ ô', nameEn: 'Windowpane shirt', shape: 'shirt', material: 'Cotton', pattern: 'windowpane', colours: [['white', 'navy'], ['beige', 'brown']] },
  { zone: 'shirts', family: 'blouse-floral', name: 'Áo kiểu hoa', nameEn: 'Floral blouse', shape: 'blouse', material: 'Rayon', finish: 'shiny', pattern: 'floral', colours: [['pink', 'white'], ['black', 'cream'], ['navy', 'lightpink']] },
  { zone: 'shirts', family: 'blouse-dot', name: 'Áo kiểu chấm bi', nameEn: 'Polka dot blouse', shape: 'blouse', material: 'Rayon', finish: 'shiny', pattern: 'dot', colours: [['white', 'black'], ['navy', 'white']] },
  { zone: 'shirts', family: 'blouse-plain', name: 'Áo kiểu tay bồng', nameEn: 'Puff-sleeve blouse', shape: 'blouse', material: 'Cotton', colours: ['white', 'lightpink', 'sand'] },
  { zone: 'sweats', family: 'quarter-zip', name: 'Áo nỉ khóa 1/4', nameEn: 'Quarter-zip sweat', shape: 'quarter-zip', material: 'Nỉ', colours: ['grey', 'navy', 'olive'] },
  { zone: 'sweats', family: 'sweatshirt-border', name: 'Áo nỉ kẻ bản to', nameEn: 'Border stripe sweatshirt', shape: 'sweatshirt', material: 'Nỉ', pattern: 'border', colours: [['grey', 'navy'], ['white', 'black']] },
  { zone: 'sweats', family: 'hoodie-camo', name: 'Hoodie dày', nameEn: 'Heavyweight hoodie', shape: 'hoodie', material: 'Nỉ', pattern: 'camo', colours: [['olive', 'khaki'], ['charcoal', 'black']] },
  { zone: 'sweats', family: 'sweatshirt-geo', name: 'Áo nỉ oversize', nameEn: 'Oversized sweatshirt', shape: 'sweatshirt', material: 'Nỉ', pattern: 'geo', colours: [['sand', 'red'], ['darkgreen', 'white']] },
  { zone: 'sweats', family: 'hoodie-geo', name: 'Hoodie khóa kéo nhẹ', nameEn: 'Light zip hoodie', shape: 'hoodie-zip', material: 'Nỉ', pattern: 'geo', colours: [['navy', 'white'], ['beige', 'black']] },
  { zone: 'knit', family: 'knit-v', name: 'Áo len cổ V', nameEn: 'V-neck sweater', shape: 'knit-v', material: 'Merino', finish: 'knit', colours: ['black', 'camel', 'navy', 'grey'] },
  { zone: 'knit', family: 'turtleneck', name: 'Áo len cổ lọ', nameEn: 'Turtleneck sweater', shape: 'turtleneck', material: 'Merino', finish: 'knit', colours: ['black', 'cream', 'wine', 'darkgreen'] },
  { zone: 'knit', family: 'mockneck', name: 'Áo len cổ cao nửa', nameEn: 'Mock neck sweater', shape: 'mockneck', material: 'Cashmere', finish: 'knit', colours: ['grey', 'navy', 'beige', 'rust', 'slate'] },
  { zone: 'knit', family: 'knit-vest', name: 'Áo gile len', nameEn: 'Knit vest', shape: 'knit-vest', material: 'Len', finish: 'knit', colours: ['navy', 'beige', 'darkgreen'] },
  { zone: 'knit', family: 'knit-breton', name: 'Áo len kẻ ngang', nameEn: 'Striped sweater', shape: 'sweater', material: 'Cotton', finish: 'knit', pattern: 'breton', colours: [['navy', 'white'], ['cream', 'navy']] },
  { zone: 'knit', family: 'knit-houndstooth', name: 'Áo len dày', nameEn: 'Chunky sweater', shape: 'sweater-chunky', material: 'Len', finish: 'knit', pattern: 'houndstooth', colours: [['black', 'white'], ['brown', 'cream']] },
  { zone: 'knit', family: 'knit-v-stripe', name: 'Áo len cổ V kẻ', nameEn: 'Striped V-neck', shape: 'knit-v', material: 'Len', finish: 'knit', pattern: 'border', colours: [['cream', 'wine'], ['navy', 'camel']] },
  // ---- floor 1 · ÁO KHOÁC ----
  { zone: 'uv', family: 'uv-zip', name: 'Áo chống nắng có mũ', nameEn: 'UV hooded zip', shape: 'uv-zip', material: 'AIRism', colours: ['white', 'black', 'navy', 'lavender'] },
  { zone: 'uv', family: 'uv-zip-mesh', name: 'Áo chống nắng lưới', nameEn: 'UV mesh zip', shape: 'uv-zip', material: 'Dry-EX', colours: ['grey', 'mint'] },
  { zone: 'fleece', family: 'fleece-check', name: 'Áo fleece dày', nameEn: 'Heavy fleece', shape: 'fleece', material: 'Fleece', finish: 'knit', pattern: 'tartan', colours: [['red', 'black'], ['green', 'navy']] },
  { zone: 'fleece', family: 'fleece-border', name: 'Áo fleece phối màu', nameEn: 'Colour-block fleece', shape: 'quarter-zip', material: 'Fleece', finish: 'knit', pattern: 'border', colours: [['cream', 'navy'], ['grey', 'black']] },
  { zone: 'down', family: 'puffer-vest', name: 'Áo gile lông vũ', nameEn: 'Puffer vest', shape: 'puffer-vest', material: 'Lông vũ', finish: 'shiny', colours: ['black', 'navy', 'olive', 'red'] },
  { zone: 'padded', family: 'down-long', name: 'Áo lông vũ dài', nameEn: 'Long down coat', shape: 'down-long', material: 'Lông vũ', finish: 'shiny', colours: ['black', 'beige', 'navy', 'darkgreen'] },
  { zone: 'fashion-outer', family: 'bomber', name: 'Áo bomber', nameEn: 'Bomber jacket', shape: 'bomber', material: 'Nylon', finish: 'shiny', colours: ['black', 'olive', 'navy', 'wine'] },
  { zone: 'fashion-outer', family: 'coach', name: 'Áo coach jacket', nameEn: 'Coach jacket', shape: 'coach', material: 'Nylon', colours: ['black', 'navy', 'beige'] },
  { zone: 'fashion-outer', family: 'wool-coat', name: 'Áo măng tô len', nameEn: 'Long wool coat', shape: 'wool-coat', material: 'Len', colours: ['camel', 'black', 'grey', 'darknavy'] },
  { zone: 'fashion-outer', family: 'blazer-windowpane', name: 'Blazer kẻ ô', nameEn: 'Windowpane blazer', shape: 'blazer', material: 'Len pha', pattern: 'windowpane', colours: [['grey', 'black'], ['navy', 'white']] },
  { zone: 'fashion-outer', family: 'blazer-pinstripe', name: 'Blazer kẻ nhỏ', nameEn: 'Pinstripe blazer', shape: 'blazer', material: 'Len pha', pattern: 'pinstripe', colours: [['navy', 'white'], ['charcoal', 'white']] },
  { zone: 'fashion-outer', family: 'denim-jacket-wash', name: 'Áo khoác denim bạc màu', nameEn: 'Washed denim jacket', shape: 'denim-jacket', material: 'Denim', finish: 'denim', pattern: 'wash', colours: [['lightdenim', 'white'], ['denim', 'lightdenim']] },
  { zone: 'fashion-outer', family: 'coach-camo', name: 'Coach jacket dày', nameEn: 'Heavy coach jacket', shape: 'coach', material: 'Nylon', pattern: 'camo', colours: [['olive', 'khaki'], ['grey', 'black']] },
  { zone: 'fashion-outer', family: 'cardigan-cord', name: 'Cardigan dày', nameEn: 'Chunky cardigan', shape: 'cardigan', material: 'Nhung tăm', pattern: 'corduroy', colours: [['brown', 'camel'], ['darkgreen', 'olive']] },
  // ---- floor 1 · PHỤ KIỆN ----
  { zone: 'bags', family: 'crossbody', name: 'Túi đeo chéo nhỏ', nameEn: 'Crossbody bag', shape: 'crossbody', material: 'Nylon', colours: ['black', 'beige', 'navy', 'red'] },
  { zone: 'bags', family: 'backpack-camo', name: 'Balo lớn', nameEn: 'Large backpack', shape: 'backpack', material: 'Nylon', pattern: 'camo', colours: [['khaki', 'olive'], ['charcoal', 'black']] },
  { zone: 'bags', family: 'tote-stripe', name: 'Túi tote kẻ', nameEn: 'Striped tote', shape: 'tote', material: 'Canvas', pattern: 'breton', colours: [['cream', 'navy'], ['white', 'red']] },
  { zone: 'bags', family: 'crossbody-dot', name: 'Túi đeo chéo chấm bi', nameEn: 'Polka dot crossbody', shape: 'crossbody', material: 'Nylon', pattern: 'dot', colours: [['black', 'white'], ['navy', 'white']] },
  { zone: 'hats-scarves', family: 'bucket-hat', name: 'Mũ bucket', nameEn: 'Bucket hat', shape: 'bucket-hat', material: 'Cotton', colours: ['black', 'beige', 'navy', 'white'] },
  { zone: 'hats-scarves', family: 'cap-stripe', name: 'Mũ lưỡi trai kẻ', nameEn: 'Striped cap', shape: 'cap', material: 'Cotton', pattern: 'breton', colours: [['navy', 'white'], ['red', 'white']] },
  { zone: 'hats-scarves', family: 'scarf-tartan', name: 'Khăn len caro', nameEn: 'Check knit scarf', shape: 'scarf', material: 'Len', finish: 'knit', pattern: 'gingham', scale: 1, colours: [['red', 'black'], ['green', 'navy'], ['camel', 'brown']] },
  { zone: 'hats-scarves', family: 'scarf-houndstooth', name: 'Khăn len kẻ', nameEn: 'Striped knit scarf', shape: 'scarf', material: 'Len', finish: 'knit', pattern: 'breton', colours: [['black', 'white'], ['brown', 'cream']] },
  { zone: 'hats-scarves', family: 'bucket-hat-camo', name: 'Mũ bucket vải dày', nameEn: 'Canvas bucket hat', shape: 'bucket-hat', material: 'Cotton', pattern: 'camo', colours: [['olive', 'khaki'], ['grey', 'black']] },
  { zone: 'sunglasses-umbrella', family: 'umbrella-dot', name: 'Ô gấp chấm bi', nameEn: 'Polka dot umbrella', shape: 'umbrella', material: 'Nylon', pattern: 'dot', colours: [['navy', 'white'], ['red', 'white']] },
  { zone: 'sunglasses-umbrella', family: 'sunglasses-round', name: 'Kính râm tròn', nameEn: 'Round sunglasses', shape: 'sunglasses', material: 'Kim loại', finish: 'shiny', colours: ['grey', 'camel', 'pink'] },
  // ---- floor 2 · QUẦN ----
  { zone: 'pants', family: 'wide-pants', name: 'Quần ống rộng', nameEn: 'Wide-leg pants', shape: 'wide', material: 'Polyester', colours: ['black', 'beige', 'olive', 'navy'] },
  { zone: 'pants', family: 'straight-pants', name: 'Quần ống đứng', nameEn: 'Straight pants', shape: 'straight', material: 'Cotton', colours: ['slate', 'grey', 'beige'] },
  { zone: 'pants', family: 'bootcut', name: 'Quần ống loe', nameEn: 'Bootcut pants', shape: 'bootcut', material: 'Polyester', colours: ['black', 'navy', 'brown'] },
  { zone: 'pants', family: 'pants-pinstripe', name: 'Quần tây kẻ nhỏ', nameEn: 'Pinstripe trousers', shape: 'straight', material: 'Len pha', pattern: 'pinstripe', colours: [['navy', 'white'], ['grey', 'white']] },
  { zone: 'pants', family: 'pants-windowpane', name: 'Quần tây kẻ ô', nameEn: 'Windowpane trousers', shape: 'wide', material: 'Len pha', pattern: 'windowpane', colours: [['grey', 'black'], ['beige', 'brown']] },
  { zone: 'pants', family: 'pants-cord', name: 'Quần tây dày', nameEn: 'Heavy trousers', shape: 'straight', material: 'Nhung tăm', pattern: 'corduroy', colours: [['brown', 'camel'], ['olive', 'khaki'], ['navy', 'slate']] },
  { zone: 'pants', family: 'parachute', name: 'Quần parachute', nameEn: 'Parachute pants', shape: 'cargo', material: 'Nylon', finish: 'shiny', colours: ['charcoal', 'khaki', 'slate'] },
  { zone: 'jeans', family: 'jeans-wide-wash', name: 'Jeans ống rộng bạc màu', nameEn: 'Washed wide jeans', shape: 'jeans-wide', material: 'Denim', finish: 'denim', pattern: 'wash', colours: [['denim', 'lightdenim'], ['darknavy', 'denim'], ['black', 'charcoal']] },
  { zone: 'jeans', family: 'jeans-straight-wash', name: 'Jeans ống suông bạc màu', nameEn: 'Washed straight jeans', shape: 'jeans-straight', material: 'Denim', finish: 'denim', pattern: 'wash', colours: [['denim', 'lightdenim'], ['lightdenim', 'white'], ['black', 'charcoal']] },
  { zone: 'jeans', family: 'jeans-bootcut', name: 'Jeans ống loe', nameEn: 'Bootcut jeans', shape: 'bootcut', material: 'Denim', finish: 'denim', colours: ['denim', 'lightdenim', 'darknavy'] },
  { zone: 'jeans', family: 'jeans-tapered', name: 'Jeans ống côn', nameEn: 'Tapered jeans', shape: 'jeans-tapered', material: 'Denim', finish: 'denim', colours: ['denim', 'black', 'lightdenim'] },
  { zone: 'jeans', family: 'jeans-ripped', name: 'Jeans rách', nameEn: 'Ripped jeans', shape: 'jeans-straight', material: 'Denim', finish: 'denim', pattern: 'wash', scale: 2, colours: [['lightdenim', 'white'], ['denim', 'lightdenim']] },
  { zone: 'jeans', family: 'jeans-cord', name: 'Jeans dày', nameEn: 'Heavy jeans', shape: 'jeans-straight', material: 'Nhung tăm', pattern: 'corduroy', colours: [['brown', 'camel'], ['olive', 'khaki'], ['navy', 'slate'], ['wine', 'rust']] },
  { zone: 'jeans', family: 'jeans-baggy', name: 'Jeans baggy', nameEn: 'Baggy jeans', shape: 'jeans-baggy', material: 'Denim', finish: 'denim', colours: ['lightdenim', 'denim', 'beige'] },
  { zone: 'joggers', family: 'sweatpants-plain', name: 'Quần nỉ ống suông', nameEn: 'Straight sweatpants', shape: 'sweatpants', material: 'Nỉ', colours: ['lightgrey', 'charcoal', 'navy'] },
  { zone: 'joggers', family: 'jogger-border', name: 'Jogger sọc bên', nameEn: 'Side-stripe joggers', shape: 'jogger', material: 'Nỉ', pattern: 'border', colours: [['grey', 'navy'], ['black', 'white']] },
  { zone: 'joggers', family: 'sweatpants-camo', name: 'Quần nỉ dày', nameEn: 'Heavy sweatpants', shape: 'sweatpants', material: 'Nỉ', pattern: 'camo', colours: [['olive', 'khaki'], ['slate', 'black']] },
  { zone: 'shorts', family: 'bermuda', name: 'Short bermuda', nameEn: 'Bermuda shorts', shape: 'bermuda', material: 'Cotton', colours: ['beige', 'olive', 'navy', 'black'] },
  { zone: 'shorts', family: 'cycling', name: 'Quần đùi ôm', nameEn: 'Cycling shorts', shape: 'cycling', material: 'AIRism', colours: ['black', 'navy', 'grey'] },
  { zone: 'shorts', family: 'shorts-gingham', name: 'Short caro gingham', nameEn: 'Gingham shorts', shape: 'shorts', material: 'Cotton', pattern: 'gingham', colours: [['white', 'blue'], ['white', 'black']] },
  { zone: 'shorts', family: 'shorts-floral', name: 'Short hoa', nameEn: 'Floral shorts', shape: 'shorts', material: 'Rayon', pattern: 'floral', colours: [['navy', 'cream'], ['pink', 'white']] },
  { zone: 'shorts', family: 'shorts-stripe', name: 'Short kẻ', nameEn: 'Striped shorts', shape: 'shorts', material: 'Cotton', pattern: 'breton', colours: [['navy', 'white'], ['red', 'white']] },
  { zone: 'shorts', family: 'shorts-camo', name: 'Short bermuda dày', nameEn: 'Heavy bermuda', shape: 'bermuda', material: 'Cotton', pattern: 'camo', colours: [['khaki', 'olive'], ['slate', 'black']] },
  { zone: 'shorts', family: 'bermuda-stripe', name: 'Bermuda kẻ nhỏ', nameEn: 'Pinstripe bermuda', shape: 'bermuda', material: 'Linen', pattern: 'pinstripe', colours: [['white', 'navy'], ['beige', 'brown']] },
  // ---- floor 2 · ĐẦM & CHÂN VÁY ----
  { zone: 'dresses', family: 'dress-slip', name: 'Đầm hai dây', nameEn: 'Slip dress', shape: 'dress-slip', material: 'Satin', finish: 'shiny', colours: ['black', 'wine', 'cream'] },
  { zone: 'dresses', family: 'dress-floral', name: 'Đầm hoa', nameEn: 'Floral dress', shape: 'dress-aline', material: 'Rayon', pattern: 'floral', colours: [['navy', 'cream'], ['black', 'pink'], ['teal', 'white']] },
  { zone: 'dresses', family: 'dress-stripe', name: 'Đầm sơ mi kẻ', nameEn: 'Striped shirt dress', shape: 'dress-shirt', material: 'Cotton', pattern: 'breton', colours: [['navy', 'white'], ['black', 'white']] },
  { zone: 'dresses', family: 'dress-gingham', name: 'Đầm caro', nameEn: 'Gingham dress', shape: 'dress-maxi', material: 'Cotton', pattern: 'gingham', colours: [['white', 'red'], ['white', 'black']] },
  { zone: 'skirts', family: 'skirt-mini', name: 'Chân váy mini', nameEn: 'Mini skirt', shape: 'skirt-mini', material: 'Cotton', colours: ['black', 'denim', 'beige'] },
  { zone: 'skirts', family: 'skirt-tennis', name: 'Chân váy tennis', nameEn: 'Tennis skirt', shape: 'skirt-tennis', material: 'Dry-EX', colours: ['white', 'navy', 'black'] },
  { zone: 'skirts', family: 'skirt-wrap', name: 'Chân váy quấn', nameEn: 'Wrap skirt', shape: 'skirt-wrap', material: 'Rayon', colours: ['black', 'wine', 'olive'] },
  { zone: 'skirts', family: 'skirt-midi', name: 'Chân váy midi', nameEn: 'Midi skirt', shape: 'skirt-midi', material: 'Polyester', colours: ['beige', 'navy', 'black', 'darkgreen'] },
  { zone: 'skirts', family: 'skirt-pleated-tartan', name: 'Chân váy xếp ly caro', nameEn: 'Check pleated skirt', shape: 'skirt-pleated', material: 'Len pha', pattern: 'gingham', scale: 1.5, colours: [['red', 'black'], ['green', 'navy'], ['grey', 'black']] },
  { zone: 'skirts', family: 'skirt-gingham', name: 'Chân váy caro gingham', nameEn: 'Gingham skirt', shape: 'skirt-aline', material: 'Cotton', pattern: 'gingham', colours: [['white', 'black'], ['white', 'red']] },
  { zone: 'skirts', family: 'skirt-floral-midi', name: 'Chân váy midi hoa', nameEn: 'Floral midi skirt', shape: 'skirt-midi', material: 'Rayon', pattern: 'floral', colours: [['navy', 'cream'], ['black', 'pink']] },
  { zone: 'skirts', family: 'skirt-denim-wash', name: 'Chân váy denim bạc màu', nameEn: 'Washed denim skirt', shape: 'skirt-denim', material: 'Denim', finish: 'denim', pattern: 'wash', colours: [['lightdenim', 'white'], ['denim', 'lightdenim']] },
  // ---- floor 2 · ĐỒ LÓT & MẶC NHÀ ----
  { zone: 'bras-undies', family: 'briefs-dot', name: 'Quần lót chấm bi', nameEn: 'Polka dot briefs', shape: 'briefs', material: 'Cotton', pattern: 'dot', colours: [['white', 'black'], ['pink', 'white']] },
  { zone: 'bras-undies', family: 'briefs-stripe', name: 'Quần lót kẻ', nameEn: 'Striped briefs', shape: 'briefs', material: 'Cotton', pattern: 'breton', colours: [['navy', 'white'], ['grey', 'white']] },
  { zone: 'homewear', family: 'pyjama-stripe', name: 'Bộ pyjama kẻ', nameEn: 'Striped pyjama set', shape: 'pyjama', material: 'Cotton', pattern: 'pinstripe', colours: [['lightblue', 'white'], ['navy', 'white'], ['pink', 'white']] },
  { zone: 'homewear', family: 'pyjama-gingham', name: 'Bộ pyjama caro', nameEn: 'Gingham pyjama set', shape: 'pyjama', material: 'Cotton', pattern: 'gingham', colours: [['white', 'navy'], ['white', 'red']] },
  { zone: 'homewear', family: 'lounge-check', name: 'Quần mặc nhà caro', nameEn: 'Check lounge pants', shape: 'lounge-pants', material: 'Flannel', pattern: 'windowpane', scale: 2.5, colours: [['red', 'black'], ['navy', 'green']] },
  // ---- floor 2 · GIÀY, DÉP, TẤT ----
  { zone: 'footwear-socks', family: 'socks-crew-stripe', name: 'Tất cổ cao kẻ', nameEn: 'Striped crew socks', shape: 'socks-crew', material: 'Cotton', finish: 'knit', pattern: 'breton', colours: [['white', 'navy'], ['white', 'red'], ['grey', 'black']] },
  { zone: 'footwear-socks', family: 'socks-dot', name: 'Tất chấm bi', nameEn: 'Polka dot socks', shape: 'socks-crew', material: 'Cotton', finish: 'knit', pattern: 'dot', colours: [['white', 'black'], ['navy', 'white']] },
  // ================= round 5 (2026-11-03): the back halves of both floors — more lines, more colourways, all unique =================
  // ---- floor 1 · ÁO ----
  { zone: 'tees', family: 'tee-v-2', name: 'Áo thun cổ V màu', nameEn: 'V-neck T-shirt (colours)', shape: 'tee-v', material: 'Cotton', colours: ['pink', 'lightblue', 'olive'] },
  { zone: 'tees', family: 'tee-pocket-2', name: 'Áo thun có túi màu trầm', nameEn: 'Pocket T-shirt (muted)', shape: 'tee-pocket', material: 'Cotton', colours: ['sand', 'slate', 'charcoal'] },
  { zone: 'tees', family: 'tank-2', name: 'Áo ba lỗ màu', nameEn: 'Tank top (colours)', shape: 'tank', material: 'AIRism', colours: ['navy', 'mint', 'pink'] },
  { zone: 'tees', family: 'crop-top-2', name: 'Áo croptop pastel', nameEn: 'Pastel crop top', shape: 'crop', material: 'Cotton', colours: ['lavender', 'sand'] },
  { zone: 'polo', family: 'polo-long-2', name: 'Áo polo dài tay xanh rêu', nameEn: 'Long-sleeve polo (green)', shape: 'polo-long', material: 'Cotton', colours: ['darkgreen'] },
  { zone: 'shirts', family: 'shirt-oxford-2', name: 'Sơ mi Oxford cát', nameEn: 'Oxford shirt (sand)', shape: 'shirt', material: 'Oxford', colours: ['lavender'] },
  { zone: 'sweats', family: 'sweatshirt-2', name: 'Áo nỉ cổ tròn màu', nameEn: 'Crew sweatshirt (colours)', shape: 'sweatshirt', material: 'Nỉ', colours: ['olive', 'grey', 'pink', 'skyblue'] },
  { zone: 'sweats', family: 'hoodie-pullover-2', name: 'Hoodie chui đầu màu', nameEn: 'Pullover hoodie (colours)', shape: 'hoodie', material: 'Nỉ', colours: ['darkgreen', 'sand', 'lightgrey'] },
  { zone: 'sweats', family: 'quarter-zip-2', name: 'Áo nỉ khóa 1/4 màu', nameEn: 'Quarter-zip (colours)', shape: 'quarter-zip', material: 'Nỉ', colours: ['black', 'wine', 'beige'] },
  { zone: 'sweats', family: 'hoodie-zip-2', name: 'Hoodie khóa kéo màu', nameEn: 'Zip hoodie (colours)', shape: 'hoodie-zip', material: 'Nỉ', colours: ['black', 'wine', 'sand'] },
  { zone: 'knit', family: 'knit-polo', name: 'Áo len cổ polo', nameEn: 'Knit polo', shape: 'knit-polo', material: 'Merino', finish: 'knit', colours: ['navy', 'cream', 'darkgreen', 'rust'] },
  { zone: 'knit', family: 'knit-halfzip', name: 'Áo len khóa 1/2', nameEn: 'Half-zip sweater', shape: 'knit-halfzip', material: 'Len', finish: 'knit', colours: ['grey', 'navy', 'camel', 'black'] },
  // ---- floor 1 · ÁO KHOÁC ----
  { zone: 'fashion-outer', family: 'anorak', name: 'Áo anorak', nameEn: 'Anorak', shape: 'anorak', material: 'Nylon', finish: 'shiny', colours: ['navy', 'red', 'mustard', 'olive'] },
  { zone: 'fashion-outer', family: 'varsity', name: 'Áo varsity', nameEn: 'Varsity jacket', shape: 'varsity', material: 'Len pha', colours: ['navy', 'black', 'wine'] },
  { zone: 'fashion-outer', family: 'quilted', name: 'Áo khoác chần bông', nameEn: 'Quilted jacket', shape: 'quilted', material: 'Polyester', colours: ['olive', 'navy', 'black'] },
  { zone: 'fashion-outer', family: 'blazer-2', name: 'Áo blazer màu', nameEn: 'Blazer (colours)', shape: 'blazer', material: 'Len pha', colours: ['olive', 'wine', 'camel'] },
  { zone: 'fashion-outer', family: 'trench-2', name: 'Áo trench màu', nameEn: 'Trench coat (colours)', shape: 'trench', material: 'Cotton', colours: ['sand', 'darknavy'] },
  { zone: 'fashion-outer', family: 'wool-coat-2', name: 'Áo măng tô len màu', nameEn: 'Wool coat (colours)', shape: 'wool-coat', material: 'Len', colours: ['beige', 'wine'] },
  { zone: 'fashion-outer', family: 'bomber-2', name: 'Áo bomber màu', nameEn: 'Bomber (colours)', shape: 'bomber', material: 'Nylon', finish: 'shiny', colours: ['grey', 'red', 'beige'] },
  { zone: 'fashion-outer', family: 'denim-jacket-2', name: 'Áo khoác denim màu', nameEn: 'Denim jacket (colours)', shape: 'denim-jacket', material: 'Denim', finish: 'denim', colours: ['white', 'darknavy'] },
  { zone: 'fashion-outer', family: 'cardigan-2', name: 'Áo cardigan màu', nameEn: 'Cardigan (colours)', shape: 'cardigan', material: 'Len', finish: 'knit', colours: ['camel', 'rust', 'lightgrey'] },
  { zone: 'fashion-outer', family: 'coach-2', name: 'Áo coach jacket màu', nameEn: 'Coach jacket (colours)', shape: 'coach', material: 'Nylon', colours: ['wine', 'slate'] },
  // ---- floor 1 · PHỤ KIỆN ----
  { zone: 'bags', family: 'duffel', name: 'Túi trống', nameEn: 'Duffel bag', shape: 'duffel', material: 'Nylon', colours: ['black', 'navy', 'olive'] },
  { zone: 'bags', family: 'waist-bag', name: 'Túi đeo hông', nameEn: 'Waist bag', shape: 'waist-bag', material: 'Nylon', finish: 'shiny', colours: ['black', 'grey', 'red', 'lightblue'] },
  { zone: 'bags', family: 'laptop-bag', name: 'Túi laptop', nameEn: 'Laptop bag', shape: 'laptop-bag', material: 'Canvas', colours: ['black', 'charcoal', 'camel'] },
  { zone: 'bags', family: 'shoulder-bag', name: 'Túi đeo vai', nameEn: 'Shoulder bag', shape: 'shoulder-bag', material: 'Da', finish: 'shiny', colours: ['black', 'beige', 'wine', 'darkgreen'] },
  { zone: 'bags', family: 'tote-dot', name: 'Túi tote chấm bi', nameEn: 'Polka dot tote', shape: 'tote', material: 'Canvas', pattern: 'dot', colours: [['cream', 'black'], ['navy', 'white']] },
  { zone: 'bags', family: 'backpack-stripe', name: 'Balo kẻ bản to', nameEn: 'Border stripe backpack', shape: 'backpack', material: 'Nylon', pattern: 'border', colours: [['navy', 'white'], ['grey', 'red']] },
  { zone: 'bags', family: 'round-mini-bag-2', name: 'Túi Round Mini màu', nameEn: 'Round mini bag (colours)', shape: 'round-bag', material: 'Nylon', finish: 'shiny', colours: ['pink', 'white', 'mustard'] },
  { zone: 'bags', family: 'tote-canvas-2', name: 'Túi tote canvas màu', nameEn: 'Canvas tote (colours)', shape: 'tote', material: 'Canvas', colours: ['sand', 'teal', 'pink'] },
  { zone: 'bags', family: 'crossbody-2', name: 'Túi đeo chéo màu', nameEn: 'Crossbody (colours)', shape: 'crossbody', material: 'Nylon', colours: ['olive', 'lavender', 'white'] },
  { zone: 'hats-scarves', family: 'beret', name: 'Mũ nồi', nameEn: 'Beret', shape: 'beret', material: 'Len', finish: 'knit', colours: ['black', 'red', 'camel', 'darkgreen'] },
  { zone: 'hats-scarves', family: 'visor', name: 'Mũ nửa đầu', nameEn: 'Visor', shape: 'visor', material: 'Cotton', colours: ['white', 'navy', 'pink'] },
  { zone: 'hats-scarves', family: 'bandana-gingham', name: 'Khăn bandana caro', nameEn: 'Gingham bandana', shape: 'bandana', material: 'Cotton', pattern: 'gingham', colours: [['red', 'white'], ['navy', 'white']] },
  { zone: 'hats-scarves', family: 'bandana-dot', name: 'Khăn bandana chấm bi', nameEn: 'Polka dot bandana', shape: 'bandana', material: 'Cotton', pattern: 'dot', colours: [['black', 'white'], ['teal', 'white']] },
  { zone: 'hats-scarves', family: 'beanie-stripe', name: 'Mũ len kẻ', nameEn: 'Striped beanie', shape: 'beanie', material: 'Len', finish: 'knit', pattern: 'breton', colours: [['navy', 'white'], ['grey', 'black'], ['wine', 'cream']] },
  { zone: 'hats-scarves', family: 'scarf-dot', name: 'Khăn chấm bi', nameEn: 'Polka dot scarf', shape: 'scarf', material: 'Rayon', finish: 'shiny', pattern: 'dot', colours: [['navy', 'white'], ['wine', 'cream'], ['black', 'white']] },
  { zone: 'hats-scarves', family: 'cap-2', name: 'Mũ lưỡi trai màu', nameEn: 'Cap (colours)', shape: 'cap', material: 'Cotton', colours: ['grey', 'pink', 'mustard'] },
  { zone: 'hats-scarves', family: 'bucket-hat-2', name: 'Mũ bucket màu', nameEn: 'Bucket hat (colours)', shape: 'bucket-hat', material: 'Cotton', colours: ['teal', 'pink', 'sand'] },
  { zone: 'hats-scarves', family: 'beanie-2', name: 'Mũ len màu', nameEn: 'Beanie (colours)', shape: 'beanie', material: 'Len', finish: 'knit', colours: ['teal', 'mustard', 'olive'] },
  { zone: 'hats-scarves', family: 'scarf-knit-2', name: 'Khăn len màu', nameEn: 'Knit scarf (colours)', shape: 'scarf', material: 'Len', finish: 'knit', colours: ['rust', 'mustard', 'slate'] },
  { zone: 'sunglasses-umbrella', family: 'sunglasses-sport', name: 'Kính râm thể thao', nameEn: 'Sport sunglasses', shape: 'sunglasses', material: 'Nhựa', finish: 'shiny', colours: ['mustard', 'slate', 'rust'] },
  { zone: 'sunglasses-umbrella', family: 'umbrella-long', name: 'Ô dài', nameEn: 'Long umbrella', shape: 'umbrella-long', material: 'Nylon', finish: 'shiny', colours: ['black', 'navy', 'red', 'darkgreen'] },
  { zone: 'sunglasses-umbrella', family: 'umbrella-long-2', name: 'Ô dài màu', nameEn: 'Long umbrella (colours)', shape: 'umbrella-long', material: 'Nylon', finish: 'shiny', colours: ['mustard', 'teal', 'pink'] },
  { zone: 'sunglasses-umbrella', family: 'umbrella-stripe', name: 'Ô gấp kẻ', nameEn: 'Striped umbrella', shape: 'umbrella', material: 'Nylon', pattern: 'breton', colours: [['navy', 'white'], ['red', 'white'], ['black', 'cream']] },
  { zone: 'belts-wallets', family: 'belt-leather', name: 'Thắt lưng da', nameEn: 'Leather belt', shape: 'belt', material: 'Da', finish: 'shiny', colours: ['black', 'brown', 'camel', 'wine', 'navy', 'darkgreen', 'grey'] },
  { zone: 'belts-wallets', family: 'belt-canvas', name: 'Thắt lưng vải', nameEn: 'Canvas belt', shape: 'belt', material: 'Canvas', colours: ['olive', 'beige', 'teal', 'red'] },
  { zone: 'belts-wallets', family: 'belt-braided', name: 'Thắt lưng bện', nameEn: 'Braided belt', shape: 'belt', material: 'Da', colours: ['rust', 'charcoal', 'sand'] },
  { zone: 'belts-wallets', family: 'wallet', name: 'Ví da', nameEn: 'Leather wallet', shape: 'wallet', material: 'Da', finish: 'shiny', colours: ['black', 'brown', 'camel', 'navy', 'wine', 'grey', 'teal'] },
  { zone: 'belts-wallets', family: 'cardholder', name: 'Ví đựng thẻ', nameEn: 'Card holder', shape: 'cardholder', material: 'Da', colours: ['black', 'grey', 'teal', 'mustard', 'red', 'navy'] },
  { zone: 'gloves-watches', family: 'gloves-knit', name: 'Găng tay len', nameEn: 'Knit gloves', shape: 'gloves', material: 'Len', finish: 'knit', colours: ['grey', 'black', 'navy', 'wine', 'cream', 'teal', 'mustard'] },
  { zone: 'gloves-watches', family: 'gloves-leather', name: 'Găng tay da', nameEn: 'Leather gloves', shape: 'gloves', material: 'Da', finish: 'shiny', colours: ['brown', 'camel', 'charcoal'] },
  { zone: 'gloves-watches', family: 'watch', name: 'Đồng hồ', nameEn: 'Watch', shape: 'watch', material: 'Kim loại', finish: 'shiny', colours: ['black', 'navy', 'brown', 'white', 'red', 'green', 'mustard', 'slate', 'pink'] },
  { zone: 'gloves-watches', family: 'watch-sport', name: 'Đồng hồ thể thao', nameEn: 'Sport watch', shape: 'watch', material: 'Nhựa', colours: ['charcoal', 'orange', 'teal'] },
  // ---- floor 2 · QUẦN ----
  { zone: 'pants', family: 'pants-pleated', name: 'Quần xếp ly', nameEn: 'Pleated pants', shape: 'wide', material: 'Polyester', colours: ['charcoal', 'sand', 'darknavy', 'grey'] },
  { zone: 'pants', family: 'pants-linen', name: 'Quần linen', nameEn: 'Linen pants', shape: 'straight', material: 'Linen', colours: ['sand', 'ivory', 'mint', 'skyblue'] },
  { zone: 'pants', family: 'smart-ankle-2', name: 'Smart Ankle Pants màu', nameEn: 'Smart ankle pants (colours)', shape: 'pants', material: 'Len pha', colours: ['charcoal', 'sand', 'darkgreen', 'wine'] },
  { zone: 'pants', family: 'chinos-2', name: 'Quần chinos màu', nameEn: 'Chinos (colours)', shape: 'chinos', material: 'Cotton', colours: ['sand', 'khaki', 'darkgreen', 'wine'] },
  { zone: 'pants', family: 'cargo-2', name: 'Quần cargo màu', nameEn: 'Cargo pants (colours)', shape: 'cargo', material: 'Cotton', colours: ['darkgreen', 'brown', 'navy'] },
  { zone: 'pants', family: 'wide-pants-2', name: 'Quần ống rộng màu', nameEn: 'Wide-leg pants (colours)', shape: 'wide', material: 'Polyester', colours: ['wine', 'cream', 'slate'] },
  { zone: 'pants', family: 'bootcut-2', name: 'Quần ống loe màu', nameEn: 'Bootcut (colours)', shape: 'bootcut', material: 'Polyester', colours: ['olive', 'wine'] },
  { zone: 'jeans', family: 'jeans-skinny', name: 'Jeans skinny', nameEn: 'Skinny jeans', shape: 'jeans-tapered', material: 'Denim co giãn', finish: 'denim', colours: ['darknavy', 'charcoal', 'wine'] },
  { zone: 'jeans', family: 'jeans-flare', name: 'Jeans ống loe màu', nameEn: 'Flare jeans (colours)', shape: 'bootcut', material: 'Denim', finish: 'denim', colours: ['lightblue', 'grey', 'white'] },
  { zone: 'jeans', family: 'jeans-cargo', name: 'Jeans cargo', nameEn: 'Cargo jeans', shape: 'cargo', material: 'Denim', finish: 'denim', colours: ['denim', 'lightdenim', 'darknavy'] },
  { zone: 'jeans', family: 'jeans-wide-2', name: 'Jeans ống rộng màu', nameEn: 'Wide jeans (colours)', shape: 'jeans-wide', material: 'Denim', finish: 'denim', colours: ['grey', 'olive'] },
  { zone: 'jeans', family: 'jeans-straight-2', name: 'Jeans ống suông màu', nameEn: 'Straight jeans (colours)', shape: 'jeans-straight', material: 'Denim', finish: 'denim', colours: ['black', 'grey', 'sand'] },
  { zone: 'jeans', family: 'jeans-baggy-2', name: 'Jeans baggy màu', nameEn: 'Baggy jeans (colours)', shape: 'jeans-baggy', material: 'Denim', finish: 'denim', colours: ['black', 'white', 'grey'] },
  { zone: 'jeans', family: 'jeans-tapered-2', name: 'Jeans ống côn màu', nameEn: 'Tapered jeans (colours)', shape: 'jeans-tapered', material: 'Denim', finish: 'denim', colours: ['grey', 'white', 'olive'] },
  { zone: 'jeans', family: 'jeans-ultra-stretch-2', name: 'Jeans Ultra Stretch màu', nameEn: 'Ultra Stretch (colours)', shape: 'straight', material: 'Denim co giãn', finish: 'denim', colours: ['lightblue', 'rust'] },
  { zone: 'joggers', family: 'track-pants', name: 'Quần track', nameEn: 'Track pants', shape: 'track-pants', material: 'Polyester', finish: 'shiny', colours: ['black', 'navy', 'red', 'darkgreen'] },
  { zone: 'joggers', family: 'jogger-cargo', name: 'Jogger cargo', nameEn: 'Cargo joggers', shape: 'jogger-cargo', material: 'Cotton', colours: ['olive', 'black', 'khaki'] },
  { zone: 'joggers', family: 'sweatpants-wide', name: 'Quần nỉ ống rộng', nameEn: 'Wide sweatpants', shape: 'sweatpants', material: 'Nỉ', colours: ['sand', 'darkgreen', 'wine', 'beige', 'skyblue', 'pink'] },
  { zone: 'joggers', family: 'jogger-2', name: 'Quần jogger màu', nameEn: 'Joggers (colours)', shape: 'jogger', material: 'Cotton', colours: ['grey', 'wine', 'darkgreen', 'charcoal'] },
  { zone: 'joggers', family: 'jogger-border-2', name: 'Jogger sọc bên navy', nameEn: 'Side-stripe joggers (navy)', shape: 'jogger', material: 'Nỉ', pattern: 'border', colours: [['navy', 'white']] },
  { zone: 'shorts', family: 'shorts-denim', name: 'Short denim', nameEn: 'Denim shorts', shape: 'shorts-denim', material: 'Denim', finish: 'denim', colours: ['denim', 'lightdenim', 'black', 'white'] },
  { zone: 'shorts', family: 'shorts-cargo', name: 'Short cargo', nameEn: 'Cargo shorts', shape: 'shorts-cargo', material: 'Cotton', colours: ['olive', 'khaki', 'black'] },
  { zone: 'shorts', family: 'shorts-swim', name: 'Short bơi sóng', nameEn: 'Wave swim shorts', shape: 'shorts', material: 'Polyester', finish: 'shiny', pattern: 'waves', colours: [['navy', 'white'], ['teal', 'white']] },
  { zone: 'shorts', family: 'shorts-sport-2', name: 'Short thể thao màu', nameEn: 'Active shorts (colours)', shape: 'shorts', material: 'Dry-EX', colours: ['olive', 'skyblue', 'yellow'] },
  { zone: 'shorts', family: 'bermuda-2', name: 'Short bermuda màu', nameEn: 'Bermuda (colours)', shape: 'bermuda', material: 'Cotton', colours: ['grey', 'white', 'sand'] },
  { zone: 'shorts', family: 'shorts-chino-2', name: 'Short kaki màu', nameEn: 'Chino shorts (colours)', shape: 'shorts-chino', material: 'Cotton', colours: ['black', 'grey', 'sand'] },
  { zone: 'shorts', family: 'cycling-2', name: 'Quần đùi ôm màu', nameEn: 'Cycling shorts (colours)', shape: 'cycling', material: 'AIRism', colours: ['wine', 'olive'] },
  // ---- floor 2 · ĐẦM & CHÂN VÁY ----
  { zone: 'dresses', family: 'dress-wrap', name: 'Đầm quấn', nameEn: 'Wrap dress', shape: 'dress-wrap', material: 'Rayon', colours: ['black', 'wine', 'darkgreen'] },
  { zone: 'dresses', family: 'dress-tee', name: 'Đầm thun', nameEn: 'T-shirt dress', shape: 'dress-tee', material: 'Cotton', colours: ['grey', 'black', 'navy', 'lightpink'] },
  { zone: 'dresses', family: 'dress-dot', name: 'Đầm chấm bi', nameEn: 'Polka dot dress', shape: 'dress-aline', material: 'Rayon', pattern: 'dot', colours: [['navy', 'white'], ['black', 'white']] },
  { zone: 'dresses', family: 'shirt-dress-2', name: 'Đầm sơ mi màu', nameEn: 'Shirt dress (colours)', shape: 'dress-shirt', material: 'Cotton', colours: ['sand', 'navy', 'pink'] },
  { zone: 'dresses', family: 'aline-dress-2', name: 'Đầm suông màu', nameEn: 'A-line dress (colours)', shape: 'dress-aline', material: 'Rayon', finish: 'shiny', colours: ['navy', 'cream', 'teal'] },
  { zone: 'dresses', family: 'dress-tee-2', name: 'Đầm thun màu', nameEn: 'T-shirt dress (colours)', shape: 'dress-tee', material: 'Cotton', colours: ['white', 'olive', 'wine', 'skyblue', 'sand'] },
  { zone: 'dresses', family: 'dress-wrap-2', name: 'Đầm quấn màu', nameEn: 'Wrap dress (colours)', shape: 'dress-wrap', material: 'Rayon', colours: ['navy', 'teal', 'rust', 'cream'] },
  { zone: 'dresses', family: 'maxi-dress-2', name: 'Đầm maxi màu', nameEn: 'Maxi dress (colours)', shape: 'dress-maxi', material: 'Linen', colours: ['black', 'green', 'wine'] },
  { zone: 'skirts', family: 'skirt-pencil', name: 'Chân váy bút chì', nameEn: 'Pencil skirt', shape: 'skirt-pencil', material: 'Polyester', colours: ['black', 'navy', 'grey', 'wine'] },
  { zone: 'skirts', family: 'skirt-cargo', name: 'Chân váy cargo', nameEn: 'Cargo skirt', shape: 'skirt-cargo', material: 'Cotton', colours: ['olive', 'khaki', 'black'] },
  { zone: 'skirts', family: 'skirt-satin', name: 'Chân váy midi satin', nameEn: 'Satin midi skirt', shape: 'skirt-midi', material: 'Satin', finish: 'shiny', colours: ['cream', 'pink', 'olive'] },
  { zone: 'skirts', family: 'skirt-aline-2', name: 'Chân váy chữ A màu', nameEn: 'A-line skirt (colours)', shape: 'skirt-aline', material: 'Cotton', colours: ['grey', 'wine', 'olive'] },
  { zone: 'skirts', family: 'skirt-pleated-2', name: 'Chân váy xếp ly màu', nameEn: 'Pleated skirt (colours)', shape: 'skirt-pleated', material: 'Polyester', finish: 'shiny', colours: ['navy', 'grey', 'wine'] },
  { zone: 'skirts', family: 'skirt-mini-2', name: 'Chân váy mini màu', nameEn: 'Mini skirt (colours)', shape: 'skirt-mini', material: 'Cotton', colours: ['white', 'navy', 'pink'] },
  { zone: 'skirts', family: 'skirt-tennis-2', name: 'Chân váy tennis pastel', nameEn: 'Tennis skirt (pastel)', shape: 'skirt-tennis', material: 'Dry-EX', colours: ['pink', 'mint'] },
  { zone: 'skirts', family: 'skirt-flare-2', name: 'Chân váy xòe màu', nameEn: 'Flared skirt (colours)', shape: 'skirt-flare', material: 'Rayon', colours: ['navy', 'black', 'pink'] },
  // ---- floor 2 · ĐỒ LÓT & MẶC NHÀ ----
  { zone: 'bras-undies', family: 'bratop-stripe', name: 'Bratop kẻ', nameEn: 'Striped bra top', shape: 'bratop', material: 'AIRism', pattern: 'breton', colours: [['white', 'navy'], ['grey', 'black']] },
  { zone: 'bras-undies', family: 'briefs-floral', name: 'Quần lót hoa', nameEn: 'Floral briefs', shape: 'briefs', material: 'Cotton', pattern: 'floral', colours: [['navy', 'cream'], ['pink', 'white']] },
  { zone: 'bras-undies', family: 'bra-lace', name: 'Áo ngực ren', nameEn: 'Lace bra', shape: 'bra', material: 'Ren', colours: ['lavender', 'mint', 'rust'] },
  { zone: 'bras-undies', family: 'bratop-2', name: 'Bratop pastel', nameEn: 'Bra top (pastel)', shape: 'bratop', material: 'AIRism', colours: ['mint', 'lavender'] },
  { zone: 'homewear', family: 'robe', name: 'Áo choàng tắm', nameEn: 'Bathrobe', shape: 'robe', material: 'Cotton', colours: ['grey', 'navy', 'cream', 'wine', 'black', 'pink'] },
  { zone: 'homewear', family: 'pyjama-dot', name: 'Bộ pyjama chấm bi', nameEn: 'Polka dot pyjama set', shape: 'pyjama', material: 'Cotton', pattern: 'dot', colours: [['white', 'navy'], ['pink', 'white'], ['lightblue', 'white']] },
  { zone: 'homewear', family: 'lounge-shorts', name: 'Short mặc nhà caro', nameEn: 'Gingham lounge shorts', shape: 'shorts', material: 'Cotton', pattern: 'gingham', colours: [['white', 'navy'], ['white', 'green']] },
  { zone: 'homewear', family: 'pyjama-2', name: 'Bộ pyjama màu', nameEn: 'Pyjama set (colours)', shape: 'pyjama', material: 'Cotton', colours: ['cream', 'navy', 'mint'] },
  { zone: 'homewear', family: 'relaco-shorts-2', name: 'Quần Relaco màu', nameEn: 'Relaco shorts (colours)', shape: 'shorts', material: 'Rayon', colours: ['charcoal', 'lightblue', 'lavender'] },
  { zone: 'homewear', family: 'draping-pants-2', name: 'Quần draping màu', nameEn: 'Draping pants (colours)', shape: 'lounge-pants', material: 'Rayon', finish: 'shiny', colours: ['olive', 'wine', 'cream'] },
  // ---- floor 2 · GIÀY, DÉP, TẤT ----
  { zone: 'footwear-socks', family: 'running-shoe', name: 'Giày chạy', nameEn: 'Running shoes', shape: 'running-shoe', material: 'Mesh', colours: ['white', 'black', 'navy', 'red', 'grey'] },
  { zone: 'footwear-socks', family: 'slip-on', name: 'Giày slip-on', nameEn: 'Slip-ons', shape: 'slip-on', material: 'Canvas', colours: ['black', 'navy', 'beige', 'white'] },
  { zone: 'footwear-socks', family: 'sneaker-hi', name: 'Sneaker cổ cao', nameEn: 'High-top sneakers', shape: 'sneaker-hi', material: 'Canvas', colours: ['white', 'black', 'red', 'navy'] },
  { zone: 'footwear-socks', family: 'boot-chelsea', name: 'Giày boot Chelsea', nameEn: 'Chelsea boots', shape: 'boot-chelsea', material: 'Da', finish: 'shiny', colours: ['black', 'brown', 'camel'] },
  { zone: 'footwear-socks', family: 'sneaker-dot', name: 'Sneaker chấm bi', nameEn: 'Polka dot sneakers', shape: 'sneaker', material: 'Canvas', pattern: 'dot', colours: [['white', 'black'], ['white', 'red']] },
  { zone: 'footwear-socks', family: 'socks-border', name: 'Tất cổ cao kẻ bản to', nameEn: 'Border stripe crew socks', shape: 'socks-crew', material: 'Cotton', finish: 'knit', pattern: 'border', colours: [['white', 'navy'], ['grey', 'black'], ['white', 'red']] },
  { zone: 'footwear-socks', family: 'socks-ankle-dot', name: 'Tất cổ ngắn chấm bi', nameEn: 'Polka dot ankle socks', shape: 'socks-ankle', material: 'Cotton', finish: 'knit', pattern: 'dot', colours: [['white', 'black'], ['pink', 'white']] },
  { zone: 'footwear-socks', family: 'socks-crew-2', name: 'Tất cổ cao màu', nameEn: 'Crew socks (colours)', shape: 'socks-crew', material: 'Cotton', finish: 'knit', colours: ['grey', 'wine'] },
];

const BOTTOMISH = new Set<ShapeId>(['pants', 'chinos', 'wide', 'straight', 'cargo', 'jogger', 'sweatpants', 'bootcut', 'bermuda', 'shorts', 'cycling', 'jeans-wide', 'jeans-straight', 'jeans-baggy', 'jeans-tapered', 'shorts-chino', 'lounge-pants', 'jogger-cargo', 'track-pants', 'shorts-denim', 'shorts-cargo']);
/** The shape actually drawn on the fixture: folded items on tables are slabs; everything else is itself. */
export function displayShape(shape: ShapeId, display: Display): ShapeId {
  return display !== 'fold' ? shape : BOTTOMISH.has(shape) ? 'fold-bottom' : 'fold-top';
}

function build(): CatalogItem[] {
  const out: CatalogItem[] = [];
  for (const floor of [1, 2] as const) {
    const floorY = floor === 1 ? 0 : STORE.floor2Y;
    const fixtures = FIXTURES[floor];
    const zones = [...new Set(fixtures.map((f) => f.zone))];
    for (const zone of zones) {
      const zc = ZONE_CAT[zone];
      // this zone's slots, fixture by fixture; the display shape's height is only known per item, so slots are generated lazily
      const fx = fixtures.filter((f) => f.zone === zone);
      let fi = 0, si = 0;
      const need = FAMILIES.filter((f) => f.zone === zone).reduce((n, f) => n + f.colours.length, 0);
      const cap = fx.reduce((n, f) => n + fixtureSlots(f, 0, 0.5).length, 0);
      if (need > cap) throw new Error(`cetiqlo catalog: zone ${zone} has ${need} items for ${cap} slots`);
      const next = (shape: ShapeId) => {
        for (;;) {
          const f = fx[fi];
          if (!f) throw new Error(`cetiqlo catalog: zone ${zone} ran out of slots`);
          const display: Display = f.kind === 'rail' ? 'hang' : f.kind === 'table' ? 'fold' : 'stand';
          const slots = fixtureSlots(f, floorY, SHAPE_H[displayShape(shape, display)]);
          if (si < slots.length) return slots[si++]!;
          fi++; si = 0;
        }
      };
      for (const fam of FAMILIES.filter((f) => f.zone === zone)) {
        const category = FAMILY_CAT[fam.family] ?? zc.category;
        const slot = FAMILY_CAT[fam.family] ? undefined : zc.slot;
        for (const way of fam.colours) {
          const [ck, c2] = Array.isArray(way) ? way : [way, undefined];
          const [name, hex] = COLOURS[ck];
          const s = next(fam.shape);
          const item: CatalogItem = {
            id: `${category}.${fam.family}.${ck}${c2 ? `-${c2}` : ''}`, family: fam.family, name: fam.name, nameEn: fam.nameEn, category, slot,
            colour: { name, hex }, material: fam.material, zone, floor, shelf: { x: s.x, y: s.y, z: s.z, yaw: s.yaw }, shape: fam.shape,
            display: s.display, finish: fam.finish ?? 'cotton',
          };
          if (fam.pattern && !REMOVED.has(fam.pattern)) {
            item.pattern = fam.pattern as PatternId;
            const [n2, h2] = COLOURS[c2 ?? 'white'];
            item.colour2 = { name: n2, hex: h2 };
            item.colour = { name: c2 ? `${name} / ${n2}` : name, hex };
            if (fam.scale) item.patternScale = fam.scale;
          }
          out.push(item);
        }
      }
    }
  }
  return out;
}

export const CATALOG: readonly CatalogItem[] = build();
export const ITEM_BY_ID: ReadonlyMap<string, CatalogItem> = new Map(CATALOG.map((i) => [i.id, i]));
/** What a shopper SEES: shape + colour + pattern (+ its colour and repeat). Owner 2026-11-03: every item in the store is a unique
 *  design hanging in exactly one place (both teams may take the same id; the server allows that) — shared/src/cetiqlo/unique.test.ts. */
export const designKey = (i: CatalogItem): string => `${i.shape}|${i.colour.hex}|${i.pattern ?? ''}|${i.colour2?.hex ?? ''}|${i.patternScale ?? ''}`;
export const itemsBySlot = (slot: SlotKind): CatalogItem[] => CATALOG.filter((i) => i.slot === slot);
export const itemsByZone = (zone: ZoneId): CatalogItem[] => CATALOG.filter((i) => i.zone === zone);

/** Zone signs hang from the ceiling over the zone's fixtures (centroid), facing the entrance (+z) or the aisle for wall rails. */
export const ZONES: readonly Zone[] = (Object.keys(ZONE_CAT) as ZoneId[]).map((id) => {
  const zc = ZONE_CAT[id];
  const fx = FIXTURES[zc.floor].filter((f) => f.zone === id);
  const cx = fx.reduce((s, f) => s + f.x, 0) / fx.length, cz = fx.reduce((s, f) => s + f.z, 0) / fx.length;
  const wall = Math.abs(fx[0]!.x) > STORE.halfW - 1; // a wall rail: the sign hangs 1.2 m off the wall, facing the aisle
  const floorY = zc.floor === 1 ? 0 : STORE.floor2Y;
  const ceil = floorY + (zc.floor === 1 ? STORE.floor2Y - STORE.slab : STORE.ceiling);
  return { id, name: zc.name, nameEn: zc.nameEn, floor: zc.floor, sign: { x: wall ? cx - Math.sign(cx) * 1.2 : cx, y: ceil - 0.7, z: cz < STORE.back + 1 ? cz + 1.4 : cz, yaw: wall ? fx[0]!.yaw : 0 } }; // back-wall shelves: 1.4 m into the room
});
