// Landmark registry (SPEC §17.6, docs/plans/phase2b-assets.md §1 + §5.1). DOM-free and three-free: read by
// scripts/build-chunks.ts (tags BuildingRec.landmark, keeps parts / zone nodes), scripts/screenshot.ts (lm-<id>
// presets) and the client (world/landmarks/index.ts dispatches per id, group g1…g5 = one agent's file each).
// OSM ids checked against .cache/osm on 2026-09-28. Heights here only where OSM has none, with the source.
import type { LandmarkId } from './chunkData.ts';

export type LandmarkGroup = 'g1' | 'g2' | 'g3' | 'g4' | 'g5';

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

export const LANDMARKS: readonly LandmarkDef[] = [
  // ── g1 ──
  { id: 'eiffel', name: 'Tháp Eiffel', group: 'g1', osm: ['way/5013364'], view: [135, 400] },
  { id: 'arc', name: 'Khải Hoàn Môn', group: 'g1', osm: ['way/226413508'], near: 20, view: [120, 250] },
  // ── g2 (bridges: the decks come from the highway/railway bridge ways, BridgeBuilder) ──
  // Bir-Hakeim: the upper metro deck is the railway bridge chain way/371959822 (layer 2), statue node/3610838785.
  { id: 'bir-hakeim', name: 'Cầu Bir-Hakeim', group: 'g2', osm: ['way/183602168'], view: [60, 250] },
  // 4 corner pylons (building=yes, height 17) belong to the bridge; lamps / gilded statues are nodes on it.
  {
    id: 'alexandre-iii', name: 'Cầu Alexandre III', group: 'g2',
    osm: ['way/183620685', 'way/64959941', 'way/230227013', 'way/230227014', 'way/230227015'], near: 20, view: [90, 250],
  },
  { id: 'pont-neuf', name: 'Cầu Pont Neuf', group: 'g2', osm: ['way/53574149', 'way/53574164'], view: [250, 250] },
  { id: 'pont-des-arts', name: 'Cầu Pont des Arts', group: 'g2', osm: ['way/176396893'], view: [270, 200] },
  { id: 'alma', name: "Cầu Pont de l'Alma", group: 'g2', osm: ['way/183589443'], view: [90, 200] },
  { id: 'flamme', name: 'Ngọn lửa Tự do', group: 'g2', osm: ['way/92316094'], view: [180, 80] },
  // ── g3 ──
  { id: 'louvre', name: 'Bảo tàng Louvre', group: 'g3', osm: ['relation/3262297'], view: [250, 400] },
  { id: 'pyramid', name: 'Kim tự tháp Louvre', group: 'g3', osm: ['way/375076234'], view: [250, 150] },
  { id: 'carrousel', name: 'Khải Hoàn Môn Carrousel', group: 'g3', osm: ['way/227483542'], view: [270, 120] },
  { id: 'palais-royal', name: 'Palais-Royal', group: 'g3', osm: ['relation/3300400'], view: [180, 250] },
  // near 170: the whole Place de la Concorde (8 city statues = artwork areas, 8 rostral columns, lamps).
  { id: 'obelisk', name: 'Cột obelisk Luxor', group: 'g3', osm: ['way/72937686'], near: 170, view: [150, 150] },
  { id: 'concorde-fountains', name: 'Đài phun nước Concorde', group: 'g3', osm: ['way/72937684', 'way/72937685'], view: [180, 150] },
  { id: 'vendome', name: 'Cột Vendôme', group: 'g3', osm: ['way/227762241'], view: [180, 150] },
  { id: 'madeleine', name: 'Nhà thờ Madeleine', group: 'g3', osm: ['way/54180046'], view: [180, 250] },
  { id: 'opera', name: 'Nhà hát Opéra Garnier', group: 'g3', osm: ['way/54667456'], view: [160, 300] },
  // ── g4 ──
  // Grand Palais: "la verrière culmine à 45 m sous le dôme" (fr.wikipedia.org/wiki/Grand_Palais_(Paris)); the 8 OSM parts carry it.
  { id: 'grand-palais', name: 'Grand Palais', group: 'g4', osm: ['way/56185523'], view: [180, 300] },
  // Petit Palais: no published height found (2026-09-28); the generic fallback uses buildings.defaultHeight.
  { id: 'petit-palais', name: 'Petit Palais', group: 'g4', osm: ['relation/2778854'], view: [250, 200] },
  { id: 'orsay', name: 'Bảo tàng Orsay', group: 'g4', osm: ['way/63178753'], view: [0, 300] },
  { id: 'palais-bourbon', name: 'Palais Bourbon', group: 'g4', osm: ['relation/1019368'], view: [0, 300] },
  { id: 'invalides', name: 'Vòm Invalides', group: 'g4', osm: ['way/112452790'], view: [170, 300] },
  { id: 'hotel-invalides', name: 'Hôtel des Invalides', group: 'g4', osm: ['relation/1463538'], view: [0, 350] },
  // Zone = the landuse=military area: its 30 buildings (outlines) become this landmark.
  { id: 'ecole-militaire', name: 'École Militaire', group: 'g4', osm: [], zone: 'way/106312008', view: [315, 400] },
  { id: 'rodin', name: 'Bảo tàng Rodin (Hôtel Biron)', group: 'g4', osm: ['way/68568682'], near: 60, view: [90, 200] },
  // near 300: the Trocadéro gardens down to the Seine (58 fountain jets of the Fontaine de Varsovie, gilded statues).
  { id: 'chaillot', name: 'Palais de Chaillot / Trocadéro', group: 'g4', osm: ['relation/6826569'], near: 300, view: [135, 350] },
  { id: 'palais-de-tokyo', name: 'Palais de Tokyo', group: 'g4', osm: ['way/79219351'], view: [180, 250] },
  // ── g5 ──
  { id: 'notre-dame', name: 'Nhà thờ Đức Bà Paris', group: 'g5', osm: ['way/201611261'], view: [250, 300] },
  { id: 'sainte-chapelle', name: 'Sainte-Chapelle', group: 'g5', osm: ['relation/3344870'], view: [200, 200] },
  // Palais de Justice (288 parts incl. the Conciergerie towers César, Argent, Bonbec, Horloge; Sainte-Chapelle's go to it).
  { id: 'conciergerie', name: 'Conciergerie', group: 'g5', osm: ['relation/536982'], view: [0, 250] },
  { id: 'hotel-de-ville', name: 'Tòa thị chính Paris', group: 'g5', osm: ['relation/284089'], view: [250, 250] },
  { id: 'pompidou', name: 'Trung tâm Pompidou', group: 'g5', osm: ['way/55503397'], view: [270, 250] },
  { id: 'tour-saint-jacques', name: 'Tháp Saint-Jacques', group: 'g5', osm: ['way/20326709'], near: 40, view: [200, 200] },
  { id: 'saint-sulpice', name: 'Nhà thờ Saint-Sulpice', group: 'g5', osm: ['way/16077204'], view: [90, 250] },
  { id: 'pantheon', name: 'Điện Panthéon', group: 'g5', osm: ['way/16407465'], view: [270, 300] },
  { id: 'luxembourg', name: 'Cung điện Luxembourg', group: 'g5', osm: ['relation/975955'], view: [180, 300] },
  // Skyline (outside RACE_BBOX, silhouettes only). Sacré-Cœur: dome 83 m, basilica at 130 m altitude
  // (fr.wikipedia.org/wiki/Basilique_du_Sacré-Cœur_de_Montmartre).
  { id: 'sacre-coeur', name: 'Vương cung thánh đường Sacré-Cœur', group: 'g5', osm: [], at: [48.8868, 2.34303], height: 83, groundAsl: 130, view: [200, 2800] },
  // Tour Montparnasse: 210 m to the roof (en.wikipedia.org/wiki/Tour_Montparnasse). Ground: DEM edge value (outside the grid).
  { id: 'montparnasse', name: 'Tháp Montparnasse', group: 'g5', osm: [], at: [48.84211, 2.32201], height: 210, view: [350, 2000] },
  // La Défense: towers ≥ 60 m from client/public/data/skyline.json; Grande Arche 110 m (en.wikipedia.org/wiki/La_Grande_Arche).
  { id: 'la-defense', name: 'Khu La Défense', group: 'g5', osm: [], at: [48.89259, 2.23601], height: 110, view: [110, 4500] },
];

export const LANDMARK_BY_ID = new Map(LANDMARKS.map((d) => [d.id, d]));
