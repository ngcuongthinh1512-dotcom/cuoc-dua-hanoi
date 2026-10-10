// Landmark registry (SPEC §17.6, docs/plans/phase2b-assets.md §1 + §5.1). DOM-free and three-free: read by
// scripts/build-chunks.ts (tags BuildingRec.landmark, keeps parts / zone nodes), scripts/screenshot.ts (lm-<id>
// presets) and the client (world/landmarks/index.ts dispatches per id, group m1…m4, mf1, mf2 = one agent's file each).
// OSM ids checked against .cache/osm on 2026-10-06 (Macao, docs/plans/leg2-landmarks.md). Heights here only where OSM has none, with the source.
import type { LandmarkId } from './chunkData.ts';

export type LandmarkGroup = 'm1' | 'm2' | 'm3' | 'm4' | 'mf1' | 'mf2';

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

/** Leg 2 (Macao): the 30 landmarks (31 ids, Guia = fortress + lighthouse) chosen 2026-10-06, docs/plans/leg2-landmarks.md §0.
 *  `view` azimuths are first guesses for the base screenshots (`lm-<id>`); the groups may adjust them. */
export const LANDMARKS: readonly LandmarkDef[] = [
  { id: 'ruinas-sao-paulo', name: 'Ruínas de São Paulo', group: 'mf1', osm: ['way/1001795463', 'way/1001795464', 'way/192183185', 'way/192573692'], near: 25, view: [135, 80] }, // façade faces SE; OSM h 26.4 on the first outline, none on the second (steps); way/192573692 = Museu de Arte Sacra e Cripta (OSM h 30.3 made a generic 30 m block behind the façade; really one storey over the nave floor) → mf1 'museum'
  { id: 'sao-domingos', name: 'Nhà thờ São Domingos', group: 'm1', osm: ['way/192573688'], near: 20, view: [200, 70] },
  { id: 'se-catedral', name: 'Sé Catedral', group: 'm1', osm: ['way/330368426'], near: 20, view: [190, 90] }, // OSM has no height (church default), left to the group
  { id: 'sao-lourenco', name: 'Nhà thờ São Lourenço', group: 'm1', osm: ['way/279952093'], near: 15, view: [200, 90] }, // OSM h 40.5 (likely includes the hill)
  { id: 'santo-agostinho', name: 'Nhà thờ Santo Agostinho', group: 'm1', osm: ['way/389129453'], near: 15, view: [200, 90] }, // OSM h 39.2 (likely includes the hill)
  { id: 'ermida-penha', name: 'Nhà nguyện Penha', group: 'm1', osm: ['way/655240802', 'way/655240811'], near: 15, view: [220, 110] }, // OSM h 73.3 on the chapel (hill top)
  { id: 'leal-senado', name: 'Leal Senado', group: 'm2', osm: ['way/192573674'], near: 25, view: [100, 90] },
  { id: 'largo-senado', name: 'Largo do Senado', group: 'm2', osm: ['way/192573684'], near: 20, view: [60, 120] }, // pedestrian area (kind 'artwork': not extruded); way/713100572 is a duplicate of the same polygon, not registered
  { id: 'santa-casa', name: 'Santa Casa da Misericórdia', group: 'm2', osm: ['way/265433529'], near: 15, view: [120, 70] },
  { id: 'casa-mandarim', name: 'Casa do Mandarim', group: 'm2', osm: ['way/404235920', 'way/848078997'], near: 15, view: [180, 120] }, // way/404235920 = the museum site (no building tag), way/848078997 = the house
  { id: 'quartel-mouros', name: 'Quartel dos Mouros', group: 'm2', osm: ['way/192187335'], near: 15, view: [150, 110] },
  { id: 'teatro-dom-pedro', name: 'Nhà hát Dom Pedro V', group: 'm2', osm: ['way/389129455'], near: 15, view: [150, 90] },
  { id: 'fortaleza-monte', name: 'Fortaleza do Monte', group: 'm3', osm: ['way/46510080'], zone: 'way/46510080', near: 20, view: [150, 220] }, // OSM h 57.1 (includes the hill)
  { id: 'fortaleza-guia', name: 'Fortaleza da Guia', group: 'm3', osm: ['way/404669396'], zone: 'way/404669396', near: 20, view: [200, 170] }, // historic=fort, no building tag, no height
  { id: 'farol-guia', name: 'Hải đăng Guia', group: 'm3', osm: ['way/230576208'], near: 15, view: [220, 70] }, // OSM h 104.2 = hill + tower (the tower itself ≈ 15 m): the group decides
  { id: 'templo-ama', name: 'Chùa A-Ma', group: 'm3', osm: ['way/192187333', 'relation/18544991'], near: 25, view: [300, 90] }, // relation/18544991 = Largo do Pagode da Barra (the plaza in front)
  { id: 'kun-iam-tong', name: 'Kun Iam Tong', group: 'm3', osm: ['way/895766783', 'way/1111251970', 'way/1111251972'], near: 20, view: [200, 100] }, // no outline on the bus-stop node n/2165428407: the 3 temple halls 40–60 m away (building=temple, Tianhou Hall, Shakya Mani Hall)
  { id: 'jardim-lou-lim-ioc', name: 'Vườn Lou Lim Ioc', group: 'm3', osm: ['way/265433531'], zone: 'way/265433531', near: 10, view: [20, 260] }, // park polygon (kind 'artwork')
  { id: 'hotel-lisboa', name: 'Hotel Lisboa', group: 'm4', osm: [], zone: 'way/1313391925', near: 20, view: [200, 170] }, // zone = the resort site polygon: its 3 buildings (37 / 37 / 77 m) belong to the landmark
  { id: 'wynn-macau', name: 'Wynn Macau', group: 'm4', osm: ['relation/6279959'], zone: 'way/1215820171', near: 25, view: [250, 260] }, // zone = the resort site polygon: Wynn 94.5, Encore 177.5, Encore Tower, podium
  { id: 'mgm-macau', name: 'MGM Macau', group: 'm4', osm: ['way/605485397', 'way/192179915'], near: 25, view: [200, 250] },
  { id: 'sands-macau', name: 'Sands Macao', group: 'm4', osm: ['way/164195448', 'way/1418312721', 'way/1201888817', 'way/667429625'], near: 20, view: [160, 200] }, // way/1418312721 = the gold drum + crown (round, OSM h 61.8), G4; way/1201888817 = the hotel tower (h 116.7, inside the casino outline): gold glass, not a plain tower; way/667429625 = "Sands Macao Hotel" (no height, inside the casino outline, 12 of its 14 nodes ON it): drawn as nothing, a plain 20 m block z-fought with the casino's walls (audit a4)
  { id: 'bank-of-china', name: 'Bank of China', group: 'm4', osm: ['way/699456294', 'way/356056416'], near: 15, view: [180, 220] }, // way/356056416 = the tower's upper part (166 m, 38 levels, inside the 116.3 m outline): as a plain building it stuck out of the crown
  { id: 'fisherman-wharf', name: "Fisherman's Wharf", group: 'm4', osm: ['relation/4257072', 'relation/10387813', 'way/192180012'], near: 30, view: [320, 300] }, // relation/4257072 = the whole site (131 000 m², no building tag, kind 'artwork'); way/192180012 = the Roman Amphitheatre (9-point outline, no height): its Colosseum arcade follows THIS outline (an axis-aligned ellipse spilled over the neighbouring houses)
  { id: 'cultural-centre', name: 'Trung tâm Văn hóa Macao', group: 'm4', osm: ['way/192179917'], near: 20, view: [200, 170] },
  { id: 'kun-iam-statue', name: 'Tượng Kun Iam', group: 'm4', osm: ['way/231068755'], near: 25, view: [140, 100] }, // OSM: the Kun Iam Ecumenical Centre footprint, tourism=artwork, h 20 (= the 20 m statue); its plaza is way/192179912 (pedestrian)
  { id: 'portas-do-cerco', name: 'Portas do Cerco', group: 'm4', osm: ['way/173864406', 'way/138665744'], near: 20, view: [180, 120] },
  { id: 'praca-flor-de-lotus', name: 'Praça Flor de Lótus', group: 'm4', osm: ['way/192179907', 'way/192179914'], near: 20, view: [160, 200] }, // park polygon (kind 'artwork'); the gold lotus statue is a bare node n/7668244537 (22.19643, 113.55285, historic=monument), not kept by build-chunks
  { id: 'macau-tower', name: 'Macau Tower', group: 'mf2', osm: ['relation/21176879', 'relation/10366309'], near: 40, height: 338, view: [220, 420] }, // Macau Tower 338 m (Wikipedia / macautower.com.mo); OSM has no height on the tower outline
  { id: 'grand-lisboa', name: 'Grand Lisboa', group: 'mf2', osm: ['way/192182405', 'way/192182404'], near: 20, view: [100, 380] },
  { id: 'science-center', name: 'Trung tâm Khoa học Macao', group: 'mf1', osm: ['relation/2590433'], near: 25, view: [250, 260] }, // OSM has no height and no published figure I am sure of: left to the group
];

export const LANDMARK_BY_ID = new Map(LANDMARKS.map((d) => [d.id, d]));

/** Paved plazas that are flat in reality but sloped in the AWS DEM (Terrain.flattenPads levels the grid inside each ring
 *  [lat, lon] to the quantile q of the DEM heights inside it). Leg 2: none yet. */
export const PADS: readonly { name: string; q: number; ring: readonly [number, number][] }[] = [];
