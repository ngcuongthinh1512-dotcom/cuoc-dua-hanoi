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
  // Petit Palais: no published height found (2026-09-28); g4's petitPalais DetailFn uses an estimated 34 m dome (TODO.md).
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
  { id: 'palais-de-tokyo', name: 'Palais de Tokyo', group: 'g4', osm: ['way/79219351', 'way/79219308', 'way/79219265'], view: [180, 250] }, // west wing, east wing (MAM), peristyle canopy
  // Crazy Horse (SPEC §17.8): the Haussmann block at 12 av. George V (way/69486346, 6 levels) that holds the cabaret
  // node/1292046637 (amenity=theatre, "Le Crazy horse de Paris", queried 2026-09-30: not in the tile cache). Façade on
  // the avenue = its west side; way/69486351 = the 1-level retail box on that side (showcase). View from across the avenue.
  { id: 'crazy-horse', name: 'Crazy Horse Paris', group: 'g4', osm: ['way/69486346', 'way/69486351'], view: [240, 50] },
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
  { id: 'la-defense', name: 'Khu La Défense', group: 'g5', osm: [], at: [48.89259, 2.23601], height: 110, view: [116, 4500] }, // camera over the Av. de la Grande-Armée, inside the map
];

export const LANDMARK_BY_ID = new Map(LANDMARKS.map((d) => [d.id, d]));

/** Paved plazas that are flat in reality but sloped in the AWS DEM (a surface model: roofs smear 5–10 m into them).
 *  Terrain.flattenPads levels the grid inside each ring ([lat, lon] corners, measured on the OSM outlines) to the
 *  quantile q of the DEM heights inside it. ponytail: 3 hand-drawn pads; the Concorde is left out (its obelisk base
 *  defines y = 0 and it slopes only ~2 m). */
export const PADS: readonly { name: string; q: number; ring: readonly [number, number][] }[] = [
  // Cour Napoléon: between the inner façades of the Richelieu / Denon wings, the Pavillon Sully to the wing ends (west).
  // Median: the Louvre around it counts its façades from its high ground (landmarks/parts recordGround).
  { name: 'Cour Napoléon', q: 0.5, ring: [[48.861832, 2.335003], [48.861162, 2.33778], [48.86009, 2.337186], [48.860759, 2.334408]] },
  // Parvis Notre-Dame from the Rue de la Cité, the cathedral and the Rue du Cloître along its north flank (one level).
  // Low quantile: open to the Seine, so it meets the quays (+1.5 m) as the real parvis does.
  { name: 'Parvis Notre-Dame', q: 0.1, ring: [[48.854232, 2.34764], [48.85304, 2.350845], [48.852429, 2.350324], [48.853621, 2.347119]] },
  // Quai de l'Horloge from the Pont Neuf past the Tour de l'Horloge, river wall to the façades (Place Dauphine houses,
  // Conciergerie, Palais de Justice): the roofs smeared 5–10 m mounds onto the quay; carveRiver then lifts it to its floor.
  {
    name: "Quai de l'Horloge", q: 0.5,
    ring: [
      [48.857333, 2.341319], [48.856713, 2.345202], [48.85656, 2.345679], [48.856254, 2.346565], [48.856074, 2.346469],
      [48.856371, 2.345611], [48.856533, 2.345202], [48.856578, 2.343472], [48.856874, 2.343295], [48.857252, 2.341319],
    ],
  },
];
