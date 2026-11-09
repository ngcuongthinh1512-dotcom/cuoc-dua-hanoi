// Landmark registry (SPEC §17.6, docs/plans/phase2b-assets.md §1 + §5.1). DOM-free and three-free: read by
// scripts/build-chunks.ts (tags BuildingRec.landmark, keeps parts / zone nodes), scripts/screenshot.ts (lm-<id>
// presets) and the client (world/landmarks/index.ts dispatches per id, group m1…m4, mf1, mf2 = one agent's file each).
// OSM ids checked against .cache/osm on 2026-10-06 (Hà Nội, docs/reports/leg3-hanoi-landmarks.md). Heights here only where OSM has none, with the source.
import type { LandmarkId } from './chunkData.ts';

export type LandmarkGroup = 'h1' | 'h2' | 'h3' | 'h4'; // h1 hồ Gươm + Phố Cổ, h2 phố Pháp, h3 Đống Đa, h4 Hai Bà Trưng

export interface LandmarkDef {
  id: LandmarkId;
  name: string; // Vietnamese UI name
  group: LandmarkGroup;
  /** Outline elements ('way/…' | 'relation/…'): each becomes one BuildingRec with this landmark id. */
  osm: string[];
  /** Area element: every building whose centroid lies inside belongs to this landmark (École Militaire). */
  zone?: string;
  /** m around the outlines' bounding box where artwork / street_lamp / clock / fountain nodes are kept. */
  near?: number;
  /** Published total height (m) when OSM has none, source in a comment. */
  height?: number;
  /** Outside the map (skyline): position, altitude of the ground above sea level (m). */
  at?: [number, number];
  groundAsl?: number;
  /** Code-only detail without an OSM outline: world (x, z) of its `placed` entry (world/landmarks/h4.ts). */
  placed?: [number, number];
  /** Screenshot preset lm-<id>: camera azimuth seen from the landmark (compass deg, 0 = north), distance (m) and,
   *  for a street-level view, the eye height (m above the ground at the camera; omitted = oblique from ≥ 45 m up). */
  view: [number, number, number?];
}

/** Default `near` (m): nodes on or right next to the outline (bridge lamps, statues on pylons). */
export const LANDMARK_NEAR = 12;

/** Leg 3 (Hà Nội): the landmark registry, OSM ids checked against .cache/osm on 2026-11-01. `view` azimuths are first guesses for the base screenshots (`lm-<id>`). */
export const LANDMARKS: readonly LandmarkDef[] = [
  // ── Hoàn Kiếm: hồ Gươm, phố Pháp, Phố Cổ ──
  { id: 'thap-rua', name: 'Tháp Rùa', group: 'h1', osm: ['way/178995269'], near: 25, view: [200, 70] },
  { id: 'den-ngoc-son', name: 'Đền Ngọc Sơn', group: 'h1', osm: ['way/178995262', 'way/178995271'], near: 30, view: [250, 80] }, // way/178995271 = Đình Trấn Ba; cầu Thê Húc (way/9566542) do BridgeBuilder vẽ
  { id: 'tuong-ly-thai-to', name: 'Tượng đài Lý Thái Tổ', group: 'h1', osm: ['relation/21390321'], near: 30, view: [90, 60] }, // vườn hoa (kind artwork); tượng = node/443033827, cao 10,1 m
  { id: 'den-ba-kieu', name: 'Đền Bà Kiệu', group: 'h1', osm: ['relation/16640104'], near: 20, view: [200, 70] },
  { id: 'buu-dien', name: 'Bưu điện Hà Nội', group: 'h2', osm: ['way/704153620'], near: 20, view: [60, 80] },
  { id: 'ubnd', name: 'Trụ sở UBND TP Hà Nội', group: 'h2', osm: ['relation/16523383'], near: 25, view: [250, 110] },
  { id: 'nha-tho-lon', name: 'Nhà thờ Lớn Hà Nội', group: 'h2', osm: ['way/28912942'], near: 25, height: 31.5, /* OSM chỉ có 6,3 m ở khung ngoài, 12,6–18,9 m ở các part; hai tháp chuông ≈ 31,5 m (Wikipedia); dựng bằng code trong world/landmarks/nhatho.ts, mặt tiền quay về ĐÔNG-ĐÔNG BẮC ra quảng trường */ view: [60, 90] },
  { id: 'trang-tien-plaza', name: 'Tràng Tiền Plaza', group: 'h2', osm: ['relation/21381215'], near: 20, view: [210, 110] },
  { id: 'nha-hat-lon', name: 'Nhà hát Lớn Hà Nội', group: 'h2', osm: ['way/37933050'], near: 25, view: [200, 90] },
  { id: 'bao-tang-lich-su', name: 'Bảo tàng Lịch sử Quốc gia', group: 'h2', osm: ['way/37933255', 'way/37933256'], near: 25, view: [180, 100] },
  { id: 'metropole', name: 'Sofitel Legend Metropole', group: 'h2', osm: ['relation/21802486'], near: 20, view: [60, 90] },
  { id: 'hoa-lo', name: 'Nhà tù Hỏa Lò', group: 'h2', osm: ['way/340128580'], near: 20, view: [200, 90] },
  { id: 'ga-ha-noi', name: 'Ga Hà Nội', group: 'h2', osm: ['way/220305168'], near: 25, view: [250, 110] },
  { id: 'nha-tho-ham-long', name: 'Nhà thờ Hàm Long', group: 'h2', osm: ['way/944513319'], near: 15, view: [150, 80] },
  { id: 'thpt-tran-phu', name: 'Trường THPT Trần Phú – Hoàn Kiếm', group: 'h2', osm: ['way/704147271', 'way/704147270', 'way/704147269'], near: 20, height: 12.5, /* OSM building=school heritage=4 without heights; two colonial storeys under hipped roofs ≈ 12.5 m, the clock gable 14.2 m (owner photos); built in code in world/landmarks/tranphu.ts, the façade faces SSW onto Phố Hai Bà Trưng */ view: [198, 70, 1.7] },
  { id: 'luc-thuy', name: 'Nhà hàng Lục Thủy – Không gian Văn hóa Việt (16 Lê Thái Tổ)', group: 'h2', osm: ['way/701882954', 'way/701882953'], near: 8, height: 8.6, /* OSM: the villa outline + the "Không gian Văn hóa Việt" L-block without heights; two-storey white colonial villa ≈ 8.6 m to the eaves, the open terrace 4 m, the theatre block ≈ 9.5 m (owner photos); built in code in world/landmarks/lucthuy.ts, on the WEST side of Lê Thái Tổ, the façade faces EAST onto the street and the lake */ view: [80, 30, 1.7] },
  { id: 'cho-dong-xuan', name: 'Chợ Đồng Xuân', group: 'h1', osm: ['way/1255852379'], near: 25, view: [200, 100] },
  { id: 'o-quan-chuong', name: 'Ô Quan Chưởng', group: 'h1', osm: ['way/700627452'], near: 15, view: [270, 50] },
  { id: 'den-bach-ma', name: 'Đền Bạch Mã', group: 'h1', osm: ['way/700840711'], near: 15, view: [160, 60] },
  { id: 'bat-trang', name: 'Authentic Bat Trang – Pottery shop & workshop (115 Hàng Gai)', group: 'h1', osm: [], placed: [-292.27, 91.0], view: [325, 10, 1.7] }, // no OSM number 115 and no footprints on that stretch: placed on the south side of Hàng Gai 13 m before the Hàng Hòm corner (Google pin 21.031354, 105.849285; 95 = Church Boutique, 109–111 = Golden Silk east of it), neighbours = generated houses on synthetic plots (landmarks/batrang.ts); presets hanoi-batrang-*
  // Cầu Long Biên (way/874082896) is east of the three-district mask (its outline is dropped by district-mask.ts): no entry until the mask keeps it
  // ── Đống Đa ──
  { id: 'van-mieu', name: 'Văn Miếu – Quốc Tử Giám', group: 'h3', osm: ['way/702185155', 'way/702185143', 'way/702185144', 'way/702241362', 'way/702241363', 'way/702185149', 'way/702185150', 'way/702185156', 'way/702185157', 'way/702185158', 'way/702185159', 'way/702185160', 'way/702185162', 'way/702185163', 'way/702185164', 'way/702185165', 'way/702185166', 'way/702185176', 'way/702185187', 'way/702185188', 'way/702185189', 'way/702185190', 'way/702185186', 'way/702185138', 'way/702241311', 'way/702241314', 'way/702241315', 'way/702241316', 'way/702241331', 'way/702241327', 'way/702241328', 'way/37934138', 'way/37934139', 'way/702241326', 'way/702241324', 'way/702241325', 'way/702241280', 'way/702241281'], near: 40, view: [200, 110] }, // Khuê Văn Các + Văn Miếu Môn + cả khu (≈ 35 building=yes: Đại Trung Môn, nhà bia, Đại Thành, Thái Học…)
  { id: 'go-dong-da', name: 'Gò Đống Đa', group: 'h3', osm: ['way/29133247', 'way/838426608'], near: 40, view: [200, 110] }, // gò (park) + Đền thờ Quang Trung; tượng đài = node/5485636741
  { id: 'vincom-nct', name: 'Vincom Nguyễn Chí Thanh / Vinhomes / ROX Tower', group: 'h3', osm: ['way/1231417560', 'way/840562572', 'way/840562573'], near: 25, view: [200, 200] },
  { id: 'vincom-pham-ngoc-thach', name: 'Vincom Center Phạm Ngọc Thạch', group: 'h3', osm: ['way/136161117'], near: 25, height: 36, /* OSM: 8 retail levels, no height; ≈ 36 m estimated from the photos (facade ≈ 0.55 × its 64 m Đông Tác front) */ view: [255, 100, 22] }, // from the Phạm Ngọc Thạch – Đông Tác – Chùa Bộc junction onto the V-cut corner
  { id: 'cafe-hmm', name: 'Quán cà phê hmm… (13 Khương Thượng)', group: 'h3', osm: [], placed: [-2941.7, 2840.1], view: [296, 6, 1.5] }, // no OSM number 13: the west face of the 'university' L-block off the lane from Phố Khương Thượng near Tây Sơn (landmarks/cafe.ts); presets hn-cafe-*
  // ── Hai Bà Trưng ──
  { id: 'cv-thong-nhat', name: 'Công viên Thống Nhất', group: 'h4', osm: ['way/37933849'], near: 20, view: [200, 200] }, // park (kind artwork); hồ Bảy Mẫu = water
  { id: 'den-hai-ba-trung', name: 'Đền Hai Bà Trưng', group: 'h4', osm: ['relation/19179452'], near: 20, view: [200, 80] },
  { id: 'dhbk', name: 'Đại học Bách Khoa (nhà C1/C10)', group: 'h4', osm: ['way/158465677', 'way/821304201'], near: 25, view: [200, 120] },
  { id: 'vincom-ba-trieu', name: 'Vincom Center Hà Nội (Bà Triệu)', group: 'h4', osm: ['way/840204357'], near: 20, view: [200, 200] },
];

export const LANDMARK_BY_ID = new Map(LANDMARKS.map((d) => [d.id, d]));

/** Paved plazas that are flat in reality but sloped in the AWS DEM (Terrain.flattenPads levels the grid inside each ring
 *  [lat, lon] to the quantile q of the DEM heights inside it). Leg 3: none yet. */
export const PADS: readonly { name: string; q: number; ring: readonly [number, number][] }[] = [];
