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
  /** Screenshot preset lm-<id>: camera azimuth seen from the landmark (compass deg, 0 = north) and distance (m). */
  view: [number, number];
}

/** Default `near` (m): nodes on or right next to the outline (bridge lamps, statues on pylons). */
export const LANDMARK_NEAR = 12;

/** Leg 3 (Brussels): the landmark registry (filled once the OSM ids are checked against .cache/osm; docs/plans/leg3-landmarks.md).
 *  `view` azimuths are first guesses for the base screenshots (`lm-<id>`). */
export const LANDMARKS: readonly LandmarkDef[] = [
  { id: 'hotel-de-ville', name: 'Tòa thị chính Bruxelles', group: 'b1', osm: ['way/1126164595'], near: 25, view: [200, 120] },
  { id: 'maison-du-roi', name: 'Nhà Vua (Maison du Roi)', group: 'b1', osm: ['way/22411052'], near: 20, view: [220, 75] },
  { id: 'cathedrale-st-michel', name: 'Nhà thờ lớn Thánh Michel và Gudule', group: 'b1', osm: ['way/13431536'], near: 25, view: [270, 120] },
  { id: 'palais-royal', name: 'Cung điện Hoàng gia', group: 'b2', osm: ['relation/3299902'], near: 30, view: [150, 200] },
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
];

export const LANDMARK_BY_ID = new Map(LANDMARKS.map((d) => [d.id, d]));

/** Paved plazas that are flat in reality but sloped in the AWS DEM (Terrain.flattenPads levels the grid inside each ring
 *  [lat, lon] to the quantile q of the DEM heights inside it). Leg 3: none yet. */
export const PADS: readonly { name: string; q: number; ring: readonly [number, number][] }[] = [];
