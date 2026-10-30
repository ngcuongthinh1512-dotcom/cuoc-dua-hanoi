// Landmark registry (SPEC §17.6, docs/plans/phase2b-assets.md §1 + §5.1). DOM-free and three-free: read by
// scripts/build-chunks.ts (tags BuildingRec.landmark, keeps parts / zone nodes), scripts/screenshot.ts (lm-<id>
// presets) and the client (world/landmarks/index.ts dispatches per id, group m1…m4, mf1, mf2 = one agent's file each).
// OSM ids checked against .cache/osm on 2026-10-06 (Brussels, docs/plans/leg3-landmarks.md). Heights here only where OSM has none, with the source.
import type { LandmarkId } from './chunkData.ts';

export type LandmarkGroup = 'b1' | 'b2' | 'b3' | 'b4';

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
  /** Screenshot preset lm-<id>: camera azimuth seen from the landmark (compass deg, 0 = north), distance (m) and,
   *  for a street-level view, the eye height (m above the ground at the camera; omitted = oblique from ≥ 45 m up). */
  view: [number, number, number?];
}

/** Default `near` (m): nodes on or right next to the outline (bridge lamps, statues on pylons). */
export const LANDMARK_NEAR = 12;

/** Leg 3 (Brussels): the landmark registry (filled once the OSM ids are checked against .cache/osm; docs/plans/leg3-landmarks.md).
 *  `view` azimuths are first guesses for the base screenshots (`lm-<id>`). */
export const LANDMARKS: readonly LandmarkDef[] = [
  { id: 'hotel-de-ville', name: 'Tòa thị chính Bruxelles', group: 'b1', osm: ['way/1126164595'], near: 25, view: [200, 120] },
  { id: 'maison-du-roi', name: 'Nhà Vua (Maison du Roi)', group: 'b1', osm: ['way/22411052'], near: 20, view: [220, 75] },
  { id: 'cathedrale-st-michel', name: 'Nhà thờ lớn Thánh Michel và Gudule', group: 'b1', osm: ['way/13431536'], near: 25, view: [270, 120] },
  { id: 'palais-royal', name: 'Cung điện Hoàng gia', group: 'b2', osm: ['relation/3299902'], near: 30, view: [330, 190] },
  { id: 'palais-de-justice', name: 'Cung điện Tư pháp', group: 'b2', osm: ['way/169173072'], near: 30, height: 48, /* ước lượng: khối chính ~48 m tới đỉnh phào; mái vòm dựng bằng code đạt ~104 m (Wikipedia) */ view: [30, 190] },
  { id: 'palais-de-la-nation', name: 'Cung điện Quốc dân (Quốc hội liên bang)', group: 'b2', osm: ['relation/3000389'], near: 25, height: 22, /* ước lượng */ view: [190, 170] },
  { id: 'st-jacques-coudenberg', name: 'Nhà thờ Saint-Jacques-sur-Coudenberg', group: 'b2', osm: ['way/27807684'], near: 20, view: [90, 90] },
  { id: 'bibliotheque-royale', name: 'Thư viện Hoàng gia Albert I', group: 'b3', osm: ['relation/3299807'], near: 25, height: 32, /* ước lượng */ view: [250, 150] },
  { id: 'bozar', name: 'Cung điện Mỹ thuật (BOZAR)', group: 'b3', osm: ['relation/3299877'], near: 25, view: [150, 140] },
  { id: 'carillon-mont-des-arts', name: 'Tháp chuông Mont des Arts', group: 'b3', osm: ['way/972110324'], near: 15, view: [120, 70] },
  { id: 'notre-dame-sablon', name: 'Nhà thờ Notre-Dame du Sablon', group: 'b3', osm: ['way/22407928'], near: 20, view: [340, 100] },
  { id: 'notre-dame-chapelle', name: 'Nhà thờ Notre-Dame de la Chapelle', group: 'b3', osm: ['way/22392312'], near: 20, view: [9, 100] },
  { id: 'bourse', name: 'Sở giao dịch (La Bourse)', group: 'b1', osm: ['way/13494623'], near: 20, view: [133, 90] },
  { id: 'la-monnaie', name: 'Nhà hát Hoàng gia La Monnaie', group: 'b1', osm: ['way/21758211'], near: 20, view: [201, 90] },
  { id: 'gare-centrale', name: 'Ga Trung tâm', group: 'b1', osm: ['way/674050897'], near: 25, height: 18, /* ước lượng: OSM chỉ có 5 tầng (16 m) */ view: [150, 120] },
  { id: 'tour-du-midi', name: 'Tháp Midi', group: 'b4', osm: ['way/1333365750'], near: 25, view: [90, 250] },
  { id: 'berlaymont', name: 'Berlaymont (Ủy ban châu Âu)', group: 'b4', osm: ['way/117777680'], near: 25, view: [200, 200] },
  { id: 'justus-lipsius', name: 'Justus Lipsius (Hội đồng châu Âu)', group: 'b4', osm: ['relation/3061904'], near: 25, view: [200, 200] },
  { id: 'arcades-cinquantenaire', name: 'Khải hoàn môn Cinquantenaire', group: 'b4', osm: ['way/117837711'], near: 30, view: [270, 160] },
  { id: 'sainte-catherine', name: 'Nhà thờ Sainte-Catherine', group: 'b2', osm: ['way/28302044'], near: 20, view: [149, 100] },
  { id: 'tour-sainte-catherine', name: 'Tháp Sainte-Catherine', group: 'b2', osm: ['way/244850898'], near: 15, height: 30, /* ước lượng */ view: [150, 70] },
  { id: 'saint-nicolas', name: 'Nhà thờ Saint-Nicolas', group: 'b1', osm: ['way/306856888'], near: 15, view: [156, 80] },
  { id: 'botanique', name: 'Le Botanique', group: 'b4', osm: ['way/240540020'], near: 25, view: [200, 120] },
  { id: 'tour-rogier', name: 'Tháp Rogier', group: 'b4', osm: ['way/240545386'], near: 20, view: [200, 300] },
  { id: 'madou-plaza', name: 'Madou Plaza Tower', group: 'b4', osm: ['way/225779438'], near: 20, view: [200, 260] },
  { id: 'begijnhof-st-jean', name: 'Nhà thờ Saint-Jean-Baptiste-au-Béguinage', group: 'b2', osm: ['way/243559501'], near: 15, view: [168, 90] },
  { id: 'notre-dame-riches-claires', name: 'Nhà thờ Notre-Dame aux Riches Claires', group: 'b2', osm: ['way/244955995'], near: 15, view: [96, 80] },
  // Added after the first 27 (docs/reports/leg3-landmarks.md §5). Grand-Place: the 26 buildings (OSM ids) whose outline touches the square way/3517898
  // (guild houses; Hôtel de Ville and Maison du Roi are their own landmarks): rendered by BuildingBuilder + stepped gilded gables (world/landmarks/d.ts).
  { id: 'grand-place', name: 'Grand-Place (nhà phường hội)', group: 'b1', osm: ['way/59917695', 'way/59917697', 'way/59917698', 'way/224509519', 'way/224509522', 'way/224509531', 'way/224509585', 'way/224509598', 'way/224509926', 'way/224509949', 'way/224510026', 'way/306856262', 'way/306856407', 'way/306856411', 'way/306856450', 'way/306856455', 'way/306856462', 'way/306856516', 'way/306856563', 'way/306856605', 'way/306856637', 'way/306856857', 'way/306856862', 'way/963740325', 'way/963740326', 'way/963740327'], near: 10, view: [20, 80] },
  // the fountain basin way under the statue node n/240866019 (Rue de l'Étuve); the bronze boy is built in code
  { id: 'manneken-pis', name: 'Manneken Pis', group: 'b1', osm: ['way/586397520'], near: 8, height: 6.5, /* tường đá sau hốc; tượng thật ≈ 0,55 m đứng ở ≈ 2,6 m */ view: [280, 14] },
  // Jeanneke-Pis (node n/249292417, a vertex of house no. 11): the niche is built on the house's SW wall at that node, facing the
  // dead-end Impasse de la Fidélité (world/landmarks/k.ts); the house itself stays an ordinary building
  { id: 'jeanneke-pis', name: 'Jeanneke-Pis', group: 'b1', osm: ['way/306856274'], near: 8, height: 4, /* bệ đá + vòm hốc; tượng ≈ 0,5 m */ view: [311, 14] },
  // Het Zinneke (node n/1490475849, on the pavement 2.5 m north of the corner house way/244955899, Rue des Chartreux): the bronze dog +
  // bollard are built in code in front of that house (k.ts)
  { id: 'zinneke-pis', name: 'Zinneke-Pis (Het Zinneke)', group: 'b2', osm: ['way/244955899'], near: 8, height: 4, /* ước lượng: chó 0,7 m, cột 0,9 m */ view: [340, 14] },
  { id: 'galeries-saint-hubert', name: 'Galeries Royales Saint-Hubert', group: 'b1', osm: ['way/306856680', 'way/306856681'], near: 15, height: 17, /* ước lượng */ view: [210, 130] },
  { id: 'parlement-europeen', name: 'Nghị viện châu Âu (Espace Léopold)', group: 'b4', osm: ['way/13550784', 'way/236195168'], near: 25, view: [250, 260] },
  // Congress Column 47 m (Wikipedia); the OSM node n/475214141 sits in the middle of the 21 × 17 m building way/477190248 (its podium)
  { id: 'colonne-du-congres', name: 'Cột Quốc hội (Colonne du Congrès)', group: 'b2', osm: ['way/477190248'], near: 15, height: 47, view: [200, 100] },
  // Rue de l'Étuve, a few steps from Manneken Pis; OSM has only a tourism=museum polygon (31 pts), no building tag
  { id: 'choco-story', name: 'Bảo tàng Choco-Story Brussels', group: 'b1', osm: ['way/1078916006'], near: 10, view: [160, 38] },
  // Theme set (chocolate / beer / comics / fries), user request 2026-10-19. Belgian Beer World is a museum node inside the Bourse (no outline of its own).
  { id: 'belgian-comic-strip-center', name: 'Trung tâm Truyện tranh Bỉ (Centre Belge de la Bande Dessinée)', group: 'b3', osm: ['way/87493075'], near: 15, height: 16, /* ước lượng */ view: [200, 80] },
  { id: 'maison-antoine', name: 'Maison Antoine (quán khoai tây chiên Place Jourdan)', group: 'b4', osm: ['way/88289893'], near: 8, height: 4, /* ước lượng */ view: [200, 35] },
  // Parc de Bruxelles / Warandepark (leisure=park way/3517578 is not a landmark outline kind): anchored on its central basin way/645499302 (fountain + water),
  // the statues, sculptures and fountain nodes of the park attach to it (near 130 m) and are drawn in code by e.ts
  { id: 'parc-de-bruxelles', name: 'Công viên Bruxelles (Parc de Bruxelles)', group: 'b2', osm: ['way/645499302'], near: 130, view: [200, 110] },
  // The two curved colonnade wings of the Cinquantenaire (world/landmarks/i.ts): north = the untagged museum building way/23216264
  // (its concave SW edge is the colonnade), south = the multipolygon building rel 3171598 (Art & History museum; the colonnade is its
  // building:part way/1283317674). Height = the colonnade roof (ước lượng ≈ 16 m), the halls behind keep their own part heights.
  { id: 'cinquantenaire-aile-nord', name: 'Cánh cột phía bắc Cinquantenaire', group: 'b4', osm: ['way/23216264'], near: 8, height: 16, view: [230, 150] },
  { id: 'cinquantenaire-aile-sud', name: 'Cánh cột phía nam Cinquantenaire', group: 'b4', osm: ['relation/3171598'], near: 8, height: 16, view: [320, 170] },
  // Rue Henri Maus 5 (south side of the Bourse): the bar's geocode 50.847789 N 4.349595 E falls inside way/264142187; way/264142295 is
  // its 2 m deep ground-floor strip toward the street (not built: the terrace stands there). Facade built after a photo (world/landmarks/l.ts).
  { id: 'big-game-sports-bar', name: 'The Big Game Brussels Sports Bar', group: 'b1', osm: ['way/264142187', 'way/264142295'], near: 8, height: 24, /* ước lượng: 5 tầng + mái */ view: [33, 40] },
  // Rue du Chêne 19: the museum node n/4895319021 lies inside the corner house way/257712542 ("Kleyne Sint-Jooris", UrbIS 8185639); its
  // 6.7 m front faces Rue du Chêne (NNE), the 17.8 m blind side wall with the mural runs along the Impasse du Val des Roses (NW face).
  // Facade + mural painted after photos (world/landmarks/m.ts). Street-level preset from Rue du Chêne west of the corner.
  { id: 'garderobe-manneken-pis', name: 'GardeRobe MannekenPis (bảo tàng trang phục Manneken Pis)', group: 'b1', osm: ['way/257712542'], near: 8, height: 18.5, /* ước lượng: 4 tầng + mái mansard */ view: [4, 18, 1.7] },
  // Rue de la Colline 13 (address confirmed by the user; the OSM address node n/10599227011, housenumber 13, lies on the front of
  // way/224509547, the house between way/224509559 and way/224510054 on the NW side of the street): 5.8 m front, no levels / height
  // in OSM. Facade built after photos (world/landmarks/n.ts). Street-level preset from the Grand-Place side of the street.
  { id: 'boutique-tintin', name: 'La Boutique Tintin (cửa hàng Tintin)', group: 'b1', osm: ['way/224509547'], near: 8, height: 16.5, /* ước lượng: trệt + 3 tầng + mái */ view: [160, 19, 1.7] },
];

export const LANDMARK_BY_ID = new Map(LANDMARKS.map((d) => [d.id, d]));

/** Paved plazas that are flat in reality but sloped in the AWS DEM (Terrain.flattenPads levels the grid inside each ring
 *  [lat, lon] to the quantile q of the DEM heights inside it). Leg 3: none yet. */
export const PADS: readonly { name: string; q: number; ring: readonly [number, number][] }[] = [];
