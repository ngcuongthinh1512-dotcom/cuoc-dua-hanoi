// Visual check (SPEC §16): npm run screenshot [preset] → screenshots/<preset>.png
// Any page: npm run screenshot -- --path "/preview.html?fixture=1" --name fixture → screenshots/fixture.png
// Landmarks (Phase 2B): lm-<id> (oblique view per geo/landmarks.ts `view`), leg-L1…leg-L6 (street level at the demo
// leg destinations). Several at once: npm run screenshot -- lm-notre-dame lm-pantheon
// Player (Phase 3): p3-* presets; a bare prefix runs its group: npm run screenshot -- p3
import { existsSync, readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { latLonToWorld } from '@race/shared';
import { type Leg, startSpot } from '@race/shared/leg';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { flyCamera, roads } from '../client/src/config.ts';
import { type ChunkData, type ChunkIndex, ringArea } from '../client/src/geo/chunkData.ts';
import { ringCentroid } from '../client/src/geo/clip.ts';
import { LANDMARKS } from '../client/src/geo/landmarks.ts';
import { flatHeightGrid, heightAt, parseHeightGrid } from '../client/src/geo/heightGrid.ts';
import { flattenPads } from '../client/src/world/Terrain.ts';

const root = join(import.meta.dirname, '..');

// DEM with the plaza pads levelled like the game's, but not river-carved (y relative to the obelisk), so eye heights are
// above the ground.
const dem = join(root, 'client/public/data/elevation');
const grid = existsSync(`${dem}.bin`)
  ? parseHeightGrid(JSON.parse(readFileSync(`${dem}.json`, 'utf8')), readFileSync(`${dem}.bin`))
  : flatHeightGrid();
flattenPads(grid);
/** Game URL with ?cam= at (lat, lon), `up` m above the terrain; yaw 0 = north, 90 = west, −90 = east. */
const cam = (lat: number, lon: number, up: number, yawDeg: number, pitchDeg: number) => {
  const p = latLonToWorld(lat, lon);
  return `/?cam=${[p.x, heightAt(grid, p.x, p.z) + up, p.z, yawDeg, pitchDeg].map((v) => +v.toFixed(2)).join(',')}`;
};
/** Same at world (x, z). */
const camAt = (x: number, z: number, up: number, yawDeg: number, pitchDeg: number) =>
  `/?cam=${[x, heightAt(grid, x, z) + up, z, yawDeg, pitchDeg].map((v) => +v.toFixed(2)).join(',')}`;
const yawTo = (lat: number, lon: number, lat2: number, lon2: number) => {
  const a = latLonToWorld(lat, lon);
  const b = latLonToWorld(lat2, lon2);
  return (Math.atan2(a.x - b.x, a.z - b.z) * 180) / Math.PI;
};

// Camera presets as client URL overrides: ?cam=x,y,z,yawDeg,pitchDeg and ?debug=1.
const { x, z, yawDeg } = flyCamera.spawn;
const eye = 35 / Math.hypot(x, z); // 35 m behind the obelisk on the spawn line, facing the Arc de Triomphe
const PRESETS: Record<string, string> = {
  topdown: '/?cam=0,3800,0,0,-90', // north up; 3.8 km fits the whole bbox at 16:9 (south edge is 2.3 km away)
  player: `/?cam=${(x * eye).toFixed(2)},1.7,${(z * eye).toFixed(2)},${yawDeg.toFixed(2)},8`,
  debug: '/?debug=1', // default spawn view
  // Phase 2 (docs/plans/phase2.md step 0)
  etoile: cam(48.8738, 2.295, 600, 0, -90),
  champs: cam(48.8697, 2.308, 1100, 0, -90),
  eiffel: cam(48.853, 2.301, 250, 45, -25), // NW toward Trocadéro, the tower in front
  street: cam(48.8703, 2.306, 1.7, yawTo(48.8703, 2.306, 48.8738, 2.295), 1), // Champs-Élysées centre line, facing the Arc
  seine: cam(48.86365, 2.31354, 12, -90, -5), // Pont Alexandre III, facing east (river DEM + 12 m ≈ above the deck)
  edge: cam(48.86, 2.2855, 20, 90, -10), // ~37 m inside the west bbox edge, facing out
};

// Phase 3 (docs/plans/phase3.md "Screenshot presets"): player mode. ?player[=x,z,yawDeg] (feet on the ground), camMode,
// orbit (° of camera yaw from behind the body), action, autoMove, wait (s simulated before __READY__). Owner in brackets.
const playerAt = (lat: number, lon: number, yawDeg: number, extra = '') => {
  const p = latLonToWorld(lat, lon);
  return `/?player=${[p.x, p.z, yawDeg].map((v) => +v.toFixed(2)).join(',')}${extra}`;
};
Object.assign(PRESETS, {
  'p3-idle': '/?player', // [A, C] idle at the Concorde spawn, near camera behind the shoulder
  'p3-face': '/?player&orbit=160', // [A] face, team shirt, trousers, name tag
  'p3-jog': '/?player&autoMove=walk&wait=2', // [A] Jog_Fwd at footSpeed, feet not sliding; [C] follow + FOV
  'p3-slow': '/?player&autoMove=slow&wait=2', // [A] Walk at the slow-walk speed
  'p3-far': '/?player&camMode=far', // [C]
  'p3-first': '/?player&camMode=first', // [C]
  'p3-wall': playerAt(48.868171, 2.322384, -24.1), // [C] back 1.2 m from a Rue Royale facade: arm shortened, no clipping
  'p3-swim': playerAt(48.8637, 2.3155, 90, '&wait=2'), // [B, A] in the Seine ~95 m east of Pont Alexandre III, facing it
  'p3-swimfwd': playerAt(48.8637, 2.3155, 90, '&autoMove=walk&wait=3'), // [integration] Swim_Fwd_Loop lifted to the surface
  'p3-wave': '/?player&orbit=160&action=wave&wait=1.2', // [A]
  'p3-openbox': '/?player&orbit=120&action=openBox&wait=1', // [A]
  'p3-celebrate': '/?player&orbit=160&action=celebrate&wait=1.5', // [A]
  'p3-crash': '/?player&orbit=110&action=crash&wait=1.5', // [A] on the ground
  'p3-debug': '/?player&debug=1', // [integration] F3 player line
  // Integration views (world x/z taken from the chunk road lines / measured in the game): walking up Rue Royale toward
  // the Madeleine; the climb-out half-way (swimming south to the Quai d'Orsay wall 3 m ahead with Space held); Rue de la
  // Huchette (≈ 6 m wide) with the camera swung toward a facade (arm shortened); the dev-only character turntable.
  'p3-street': '/?player=87.8,-184.5,-25.97&autoMove=walk&wait=4',
  'p3-climb': '/?player=-414.5,248,180&autoMove=walk&jump&wait=1.3',
  'p3-narrow': '/?player=1778.45,1381.35,-109.3&orbit=70',
  'p3-turntable': '/character.html',
});

/** ?bike&autoMove=walk from `back` m before (lat, lon), heading yawDeg toward it (crash / stairs runs). */
const rideInto = (lat: number, lon: number, yawDeg: number, back: number, extra = '') => {
  const p = latLonToWorld(lat, lon);
  const y = (yawDeg * Math.PI) / 180;
  return `/?player=${[p.x + Math.sin(y) * back, p.z + Math.cos(y) * back, yawDeg].map((v) => +v.toFixed(2)).join(',')}&bike&autoMove=walk${extra}`;
};
// Phase 4 (docs/plans/phase4.md §8): p4-* presets. ?bike = start mounted on a dev bike, autoTurn=left|right holds A / D.
Object.assign(PRESETS, {
  // [A] bike model + rider. Turntable (/bike.html, params in client/src/vehicle/bikePreview.ts): side, three-quarter,
  // rear; parked on the kickstand with a lock marker / ridden at 5 m/s / crank sweep / leaning / fallen after a crash.
  'p4-bike-model': '/bike.html?items=90,145,0&owner=%232c6bd8&sparkle=1',
  'p4-bike-rider': '/bike.html?items=90,145,0&rider=1&speed=5&t=2',
  'p4-bike-crank': '/bike.html?items=90@0,90@90,90@180,90@270&rider=1',
  'p4-bike-lean': '/bike.html?items=180,145&rider=1&lean=20&steer=-8&speed=5&t=2',
  'p4-bike-crash': '/bike.html?items=60&crash=1&t=1.6',
  // In game (need track B's ?bike): side view, feet on the pedals; leaning into a left turn
  'p4-ride-side': '/?bike&autoMove=walk&orbit=90&wait=2',
  'p4-ride-lean': '/?bike&autoMove=walk&autoTurn=left&wait=2',
  // [B] physics + interaction
  'p4-mount': '/?player&orbit=-50&wait=1', // dev bike 3 m east of the spawn, sparkling, within F reach
  'p4-ride': '/?player&bike&autoMove=walk&wait=3', // on the Champs-Élysées side of Concorde: bike camera, FOV up
  'p4-ride-turn': '/?player&bike&autoMove=walk&autoTurn=left&wait=2.5&debug=1', // leaning into a left turn
  'p4-cobbles': '/?player&bike&autoMove=walk&wait=4&debug=1', // onto the Champs-Élysées setts: F3 "đá lát"
  'p4-stairs-block': '/?player=-2380.2,409.3,136&bike&autoMove=walk&orbit=70&wait=3&debug=1', // jardins du Trocadéro steps: stopped at the first step (with track D's stair colliders)
  'p4-crash': rideInto(48.868171, 2.322384, -24.1, 6, '&camMode=far&orbit=25&wait=3.2&debug=1'), // into the p3-wall facade at top speed: lying next to the bike
  // [D] stairs + junctions: a 3 m Trocadéro garden flight (jardins du Trocadéro) from the side; a quay flight on the north bank east of
  // Pont Alexandre III seen from the water; a swimmer 7 m past its foot swimming in and up; the Concorde Guimard well;
  // Rue du Louvre × Rue Berger, a junction ON the 6_1 border (its west arm lies in 5_1: sign + lamp gap now).
  'p4-steps': camAt(-2424.7, 433.7, 8, 135.7, -38),
  'p4-quay-stairs': '/?cam=-326,-2.5,168,0,4',
  'p4-swim-exit': '/?player=-342,127.1,-90&autoMove=walk&wait=8&orbit=60',
  'p4-metro': camAt(111.1 - 5 * 0.895, 15 - 5 * 0.446, 5.5, -116.5, -45), // entrance yaw −116.5° (arch toward the road)
  'p4-border-junction': '/?player=1512,352,46',
  // [integration] road graph overlay in game (?graph=1 = N in the F3 panel), 900 m top-down over Concorde;
  // riding seen from behind (bike chase camera) on the Concorde setts
  'p4-graph': '/?cam=0,900,0,0,-90&graph=1',
  'p4-ride-rear': '/?player&bike&autoMove=walk&autoTurn=right&wait=1.5',
});

// Phase 4B (docs/plans/phase4b.md §6–7): p4b-* presets, NPCs on (the spectator ?cam= has them too; &npc=0 turns them
// off). Each track adds its presets under its own line only.
Object.assign(PRESETS, {
  // [A] NPC assets on the dev-only turntable /npc.html (params in client/src/npc/npcPreview.ts)
  'p4b-cars': '/npc.html?show=cars', // 10 vehicles, side view, paints, scooter / moto riders
  'p4b-peds': '/npc.html?show=peds&clip=walk&t=0.4', // 4 avatars, LOD0 in front, LOD1 behind
  'p4b-peds-idle': '/npc.html?show=peds&clip=sit,phone,wave&t=1.5', // seated (stand-in chair), phone, wave

  // [B] traffic, spectator views after the warm-up (coordinates only: drawn once track D wires the cars in)
  // Anchored near the ring centre (−1916, −922; the NPCs fill around the camera): 85 m SE of it, 150 m up, looking NW
  // down at the ring.
  'p4b-etoile': camAt(-1856, -862, 150, 45, -58) + '&npcDensity=1.5',
  // 12 m behind a queue of 4 cars stopped at a red light (graph node 103 at ≈ (916, −20), found by simulating the game's
  // fill + warm-up at this camera: the light phases are deterministic, offset hash01(node) × cycle), 3.5 m up, −8°.
  // Traffic / light changes move the queue: re-find it the same way.
  'p4b-red': camAt(924.4, -7.1, 3.5, 22.9, -8) + '&npcDensity=1',
  'p4b-bridge': '/?cam=-500,26,215,74,-25', // 26 m over the river east of Pont Alexandre III, looking down at the deck
  'p4b-concorde': camAt(70, 90, 40, 38, -30), // Place de la Concorde from the south-east, looking at the obelisk and the Champs-Élysées

  // [C] pedestrians (shown once track D's renderer is merged): standing on the east Rue Royale sidewalk (kerb + 1.75 m, edge 21480)
  // looking up the street; the zebra at the Rue Royale × Place de la Concorde crossing seen from its east kerb; a Tuileries
  // chair (npc/crowd.ts seatsNear) seen from the path it faces
  'p4b-sidewalk': '/?player=105.1,-201.1,-26&wait=5&npcDensity=1',
  'p4b-crossing': camAt(86.3, -149.4, 3.5, 64, -10),
  'p4b-park': camAt(391.6, 258.6, 1.7, 154.4, -3),

  // [D] in game: p4b-street, p4b-bike-car, p4b-dodge, p4b-zone, p4b-density
  // Rue Royale toward the Madeleine (p3-street); the van stands across the road 12 m ahead of the rider (crash beside
  // it); the ring (radius + npc.zoneMargin) around the player shows with F3; Place de l'Opéra facing the Opéra Garnier.
  // npcDensity=1: fixed (headless Chrome's low FPS would lower the automatic density).
  'p4b-street': '/?player=87.8,-184.5,-25.97&autoMove=walk&wait=4&debug=1&npcDensity=1',
  'p4b-bike-car': '/?player=87.8,-184.5,-25.97&bike&autoMove=walk&npcTest=car:van@93.06,-195.29,64.03&orbit=60&wait=4.5&npcDensity=1',
  'p4b-dodge': '/?player=94.2,-181.4,-25.97&autoMove=walk&wait=6&npcDensity=1',
  'p4b-zone': '/?player=87.8,-184.5,-25.97&npcZone=87.8,-184.5,20&camMode=far&debug=1&npcDensity=1',
  'p4b-density': playerAt(48.8706, 2.332, 0, '&debug=1&wait=2&npcDensity=1'),
});

// Phase 5 (docs/plans/phase5.md §7): p5-* presets, HUD on (player mode). URL hooks (main.ts): gps=x,z (waypoint),
// map[=metersPerPx] (full map open), menu (menu open), respawn=s ("Kẹt? Về chỗ an toàn" after s simulated seconds).
// Each track adds its presets under its own line only.
Object.assign(PRESETS, {
  // [A] minimap (standing / turned / zoomed out on the bike), full map (whole / street names)
  'p5-minimap': '/?player&wait=1', // Concorde spawn, facing the Arc de Triomphe: heading up, N on the rim
  'p5-minimap-turn': '/?player&orbit=90&gps=766,-715&wait=1', // camera turned 90° left: map turned, N moved; Opéra waypoint on the rim
  'p5-minimap-bike': '/?player&bike&autoMove=walk&npc=0&wait=2', // riding west on the Concorde: zoomed out (≈ metersPerPx[1]); no NPCs, 2 s: 30 s budget in SwiftShader
  'p5-fullmap': '/?player&map&gps=766,-715', // whole map (base raster), player arrow, waypoint
  'p5-fullmap-streets': '/?player&map=1&gps=766,-715', // 1 m/px around the Concorde: vector redraw + street names

  // [B] GPS route on the minimap and the full map, bike route around stairs. The route is drawn by track A (minimap /
  // full map); until then these only run the GPS (scratch check: window.__GAME__.gps().route / .remaining / .stats).
  'p5-gps': '/?player&gps=810.6,-569.4&wait=2', // Concorde spawn → Place de l'Opéra (48.8706, 2.3322), on foot, ≈ 1.25 km
  'p5-gps-map': '/?player&gps=810.6,-569.4&map=2&wait=2', // the same route on the full map at 2 m/px
  // Trocadéro esplanade → foot of the Eiffel Tower (48.8584, 2.2945) on the bike: walking goes down 3 stair flights
  // (929 m), the bike route detours around them (1172 m)
  'p5-gps-bike': '/?player=-2412,331,-135&bike&gps=-1955.6,787.3&wait=3',

  // [C] menu, toasts (bike at the stairs, F refused), respawn out of the Seine
  'p5-menu': '/?player&menu', // menu open (settings tab), race-continues note, "Kẹt?" button
  'p5-toast-stairs': '/?player=-2380.2,409.3,136&bike&autoMove=walk&orbit=70&wait=3', // p4-stairs-block: stopped at the first step → toast "Không đi xe trên bậc thang"
  'p5-respawn': playerAt(48.8637, 2.3155, 90, '&respawn=1.7&wait=2'), // p3-swim, then "Kẹt?" after 1.7 s (swimming by then): on the coping at the top of the nearest quay flight + toast

  // [D] location label + clock, speedometer, street sign with the district line, F3 panel
  // Rue Royale walking toward the Madeleine (street name from track B's locator); riding across Concorde; the Rue Royale
  // plaque at its Concorde corner (StreetProps sign (78.5, −148.8), plaque along (0.433, −0.902)) from 2.5 m on the road
  // side; F3 at the top right with the HUD line.
  'p5-hud': '/?player=87.8,-184.5,-25.97&autoMove=walk&wait=2',
  'p5-hud-bike': '/?player&bike&autoMove=walk&wait=3',
  'p5-sign': camAt(76.25, -149.88, 2.3, -115.6, 3) + '&npc=0',
  'p5-debug': '/?player&debug=1',
});

// [B] fake remote players in front of the Concorde spawn (facing the Arc): slot,x,z,yawDeg,mode[,action]
const PEERS = '0,-22.5,-6.4,-25.75,walk;1,-24.8,-17.5,154.25,bike;2,-17.8,-11.4,-115.75,walk,wave';
// Phase 6 (docs/plans/phase6.md §7): p6-* presets. The screenshot server is Vite only (no wrangler), so online views use
// dev-only stand-ins the tracks add as URL hooks (?peers=… fake remote players, ?login login screen, ?bikes=… server-bike
// stand-ins, /host.html?demo=1). Each track adds its presets under its own line only.
Object.assign(PRESETS, {
  // [A] server: no screenshots (worker tests + `npm run sim`)
  // [B] login screen, "Chào mừng trở lại", remote players (walking, riding, waving) around the spawn, F3 network line
  'p6-login': '/?login&npc=0', // team-code form (DEV stand-in, offline world behind it)
  'p6-welcome-back': '/?login=back&npc=0', // "Chào mừng trở lại, Đội Xanh!" + summary + "Tiếp tục"
  'p6-peers': `/?player&npc=0&wait=2&peers=${PEERS}`, // in front of the spawn: walking across, riding (leaning), waving at us
  'p6-debug': `/?player&npc=0&wait=2&debug=1&peers=${PEERS}`, // F3 "Mạng:" line (offline: stand-in count)
  'p6-boxes': '/?player&npc=0&boxes=L2,-18,-10.9;L1,-25.2,-7.7,opened', // SPEC §17.10: current box (closed) + an opened one (lid up, stripes dimmed)
  // [C] shared bikes: free (sparkle), another team's (lock), own; claim refused toast. ?bikes=<kind,…> turns the dev
  // bikes (bike.devSpawns) into server-like stand-ins in order (vehicle/Bikes.ts applyStandIns).
  'p6-bikes': '/?player&bikes=free,mine,other&camMode=far&orbit=-64&wait=1', // looking north: free (3 m E, sparkle), Đội Xanh's (blue lock, back right), own (red lock, bottom left)
  'p6-bike-lost': '/?player&bikes=lost&orbit=-50&wait=0.2&npc=0', // toast "Chậm một bước!" (bikes.notify = notice); no NPCs + short wait: the 4 s toast must still be up
  // [D] Host page: team codes, online status, counters (demo data, no server)
  'p6-host': '/host.html?demo=1', // [D]
});

// [B] demo leg start spots (startSpot, as the server sends welcome.start); mat / box views mid Pont d'Iéna (a deck over the
// Seine: the placement ray must pick the deck; the demo Pit Stop's centre is ON the Louvre glass pyramid)
const DEMO_LEG = JSON.parse(readFileSync(join(root, 'worker/legs/paris-demo.json'), 'utf8')) as Leg;
const startAt = (n: number) => {
  const s = startSpot(DEMO_LEG, n);
  return [s.x, s.z, (s.yaw * 180) / Math.PI].map((v) => +v.toFixed(2)).join(',');
};
/** The spread spot nearest the island vault (phase7-fix3-host-tools.md: ≥ 16 m off its mouth since the start moved to the
 *  walkway under the metro, Passy side). */
const ISLAND_SPOT = 4;
const PIT = (({ x, z }) => ({ x: +x.toFixed(1), z: +z.toFixed(1) }))(latLonToWorld(48.8596, 2.29243));
/** Clue box on the Concorde (p6-boxes' current one), camera 3 m away 35° right of its front (+z), eye 1.9 m, looking down at it. */
const boxView = (opened: string) => camAt(-18 + 3 * Math.sin(0.61), -10.9 + 3 * Math.cos(0.61), 1.9, 35, -19) + `&npc=0&boxes=L2,-18,-10.9${opened}`;
/** The `street` view (Champs-Élysées centre line, facing the Arc) with a box 150 m ahead on that line. */
const FAR = (() => {
  const [a, b] = [latLonToWorld(48.8703, 2.306), latLonToWorld(48.8738, 2.295)];
  const k = 150 / Math.hypot(b.x - a.x, b.z - a.z);
  return `${PRESETS.street}&npc=0&boxes=L2,${[a.x + (b.x - a.x) * k, a.z + (b.z - a.z) * k].map((v) => v.toFixed(1)).join(',')}`;
})();
// Phase 7 (docs/plans/phase7.md §7): p7-* presets, offline stand-ins only (the screenshot server is Vite, no wrangler):
// RaceHud.demo(query) (?card=, ?book, ?startOrder=, ?finish, ?zone) and Bir-Hakeim / Pit Stop views. Each track adds its
// presets under its own line only.
Object.assign(PRESETS, {
  // [A] server: no screenshots (worker tests + harness)
  // [B] start spawn on the Bir-Hakeim road deck (not on the metro viaduct), box opening (openBox), Pit Stop mat + host NPC, celebrate
  // ?start=x,z,yawDeg = welcome.start of the demo leg's n-th team (same spawn path); F3: feet ≈ 1.3, not 7.2 (metro top)
  'p7-start': `/?start=${startAt(1)}&wait=1&debug=1&camMode=far&npc=0`,
  'p7-start-island': `/?start=${startAt(ISLAND_SPOT)}&wait=1&debug=1&orbit=120&npc=0`, // the spot nearest the Île aux Cygnes vault: open walkway, the deck under the metro
  'p7-openbox': `/?player=${PIT.x},${PIT.z + 4},0&boxes=L6,${PIT.x + 0.9},${PIT.z + 2.6}&action=openBox&wait=0.9&orbit=140&npc=0`, // box ahead, opening it, "Bấm F" prompt
  'p7-mat': `/?player=${PIT.x - 4},${PIT.z + 9},-24&boxes=PS,${PIT.x},${PIT.z}&mat&wait=1.5&camMode=far&npc=0`, // mat + host NPC waving at the team
  'p7-celebrate': `/?player=${PIT.x},${PIT.z + 0.5},180&boxes=PS,${PIT.x},${PIT.z}&mat&action=celebrate&wait=1.2&orbit=160&npc=0`,
  // the organiser's prop (config clueBox): 3/4 front view from 3 m, closed / opened (the lid hinges at the back, −z), and
  // from 150 m (the reveal radius) up the Champs-Élysées
  'p7-box-close': boxView(''),
  'p7-box-opened': boxView(',opened'),
  'p7-box-far': FAR,
  // [C] clue card (each step type), full card popup, Sổ mật thư, "Xuất phát ở vị trí thứ n", Pit Stop line, clock --:-- / penalty
  ...Object.fromEntries(
    Object.entries({
      'p7-card': 'card=route', // top-left mission card, route clue (yellow, bike icon)
      'p7-card-detour': 'card=detour',
      'p7-card-challenge': 'card=challenge',
      'p7-card-full': 'card=challenge&full', // the full card popup (envelope animation finished)
      'p7-book': 'book', // Sổ mật thư: current card pinned, then the earlier ones
      'p7-start-order': 'startOrder=3', // "Xuất phát ở vị trí thứ 3" (right)
      'p7-finish': 'card=pit&finish&raceTime=6135', // host NPC line after the check-in
      'p7-pit': 'card=pit&checkin=134&penalty=3&raceTime=3725', // Pit Stop penalty countdown + clock + PHẠT row
      'p7-clock': 'raceTime=--&raceStatus=lobby', // clock "--:--" (no start time entered yet) + "Chưa bắt đầu" badge above it
      'p7-zone': 'card=route&zone', // "Tại điểm này"
    }).map(([k, q]) => [k, `/?player&npc=0&wait=1&${q}`]),
  ),
  // the book / full card over the minimap, street label and clock on a small window (VIEWPORT below; visual review)
  'p7-book-small': '/?player&npc=0&wait=1&book',
  'p7-card-full-small': '/?player&npc=0&wait=1&card=challenge&full',
  // [D] leg format + validator: no screenshots
  // [E] Host page: start time inputs, step_progress matrix, ranking (demo data)
  'p7-host': '/host.html?demo=1',
});

// Phase 2B landmark views: target = area-weighted centroid of the landmark's outlines (chunk data) or its skyline
// point, camera `view` = [azimuth seen from the landmark, distance], raised ~ 0.35 × distance and looking at it.
const worldCam = (x: number, y: number, z: number, tx: number, ty: number, tz: number) => {
  const yaw = (Math.atan2(x - tx, z - tz) * 180) / Math.PI;
  const pitch = (-Math.atan2(y - ty, Math.hypot(x - tx, z - tz)) * 180) / Math.PI;
  return `/?cam=${[x, y, z, yaw, pitch].map((v) => +v.toFixed(2)).join(',')}`;
};
const ground = (x: number, z: number) => heightAt(grid, x, z);
const dataDir = join(root, 'client/public/data/chunks');
if (existsSync(join(dataDir, 'index.json'))) {
  const targets = new Map<string, { x: number; z: number; w: number; top: number }>();
  for (const key of (JSON.parse(readFileSync(join(dataDir, 'index.json'), 'utf8')) as ChunkIndex).keys) {
    for (const b of (JSON.parse(readFileSync(join(dataDir, `${key}.json`), 'utf8')) as ChunkData).buildings) {
      if (!b.landmark) continue;
      const [cx, cz] = ringCentroid(b.outer);
      const w = Math.abs(ringArea(b.outer)) || 1;
      const top = Math.max(b.height ?? 20, ...(b.parts ?? []).map((q) => q.height ?? 0));
      const t = targets.get(b.landmark) ?? { x: 0, z: 0, w: 0, top: 0 };
      targets.set(b.landmark, { x: t.x + cx * w, z: t.z + cz * w, w: t.w + w, top: Math.max(t.top, top) });
    }
  }
  for (const d of LANDMARKS) {
    const [az, dist] = d.view;
    const [dx, dz] = [Math.sin((az * Math.PI) / 180), -Math.cos((az * Math.PI) / 180)];
    const t = targets.get(d.id);
    if (d.at) {
      const p = latLonToWorld(d.at[0], d.at[1]);
      const [x, z] = [p.x + dx * dist, p.z + dz * dist];
      PRESETS[`lm-${d.id}`] = worldCam(x, ground(x, z) + 60, z, p.x, ground(x, z) + 60 + (d.height ?? 50) / 2, p.z);
    } else if (t) {
      const [tx, tz] = [t.x / t.w, t.z / t.w];
      const ty = ground(tx, tz) + Math.min(t.top, 120) * 0.4;
      PRESETS[`lm-${d.id}`] = worldCam(tx + dx * dist, ty + Math.max(30, dist * 0.35), tz + dz * dist, tx, ty, tz);
    }
  }
  // Street level at the demo leg destinations (eye 1.7 m), facing the landmark of that step.
  const leg = JSON.parse(readFileSync(join(root, 'worker/legs/paris-demo.json'), 'utf8')) as { steps: { id: string; destination?: { lat: number; lon: number } }[] };
  const FACING: Record<string, [string, number]> = {
    L1: ['arc', 8], L2: ['eiffel', 6], L3: ['eiffel', 35], L4: ['invalides', 4], L5: ['orsay', 8], L6: ['pyramid', 6],
  };
  for (const s of leg.steps) {
    const f = FACING[s.id];
    const t = f && targets.get(f[0]);
    if (!s.destination || !f || !t) continue;
    const p = latLonToWorld(s.destination.lat, s.destination.lon);
    const yaw = (Math.atan2(p.x - t.x / t.w, p.z - t.z / t.w) * 180) / Math.PI;
    const y = Math.max(ground(p.x, p.z), roads.bridge.riverDeck) + 1.7; // L4 is on a Seine bridge: DEM there < deck
    PRESETS[`leg-${s.id}`] = `/?cam=${[p.x, y, p.z, yaw, f[1]].map((v) => +v.toFixed(2)).join(',')}`;
    if (s.id === 'L4') PRESETS['p3-bridge'] = playerAt(s.destination.lat, s.destination.lon, 0, '&wait=1.5'); // [B] on the deck
    if (s.id === 'L3') PRESETS['p3-eiffel'] = `/?player=${[p.x, p.z, yaw].map((v) => +v.toFixed(2)).join(',')}&camMode=far`; // under the tower
  }
}
const TIMEOUT_MS: Record<string, number> = { topdown: 90_000, 'p4-graph': 90_000, 'p4-swim-exit': 90_000 }; // big views, long simulated waits
const DEFAULT_TIMEOUT_MS = 30_000;
const VIEWPORT: Record<string, { width: number; height: number }> = { 'p7-book-small': { width: 1024, height: 640 }, 'p7-card-full-small': { width: 1024, height: 640 } };
// Phase 8 (docs/plans/phase8.md §7): p8-* presets, offline stand-ins only; each track adds its own block here (own line). Not in the default run.
// [C] challenge / Lựa chọn kép card states (RaceHud.demo: ?card=…, ?full, ?book=media, ?lock=<s left>); 1024 × 640 for -small
Object.assign(PRESETS, {
  ...Object.fromEntries(
    Object.entries({
      'p8-card-answer': 'card=answer&full', // typed answer box + history (Bị phạt 3 phút)
      'p8-card-answer-pending': 'card=answer-pending&full', // "Đang chờ Host duyệt · 01:12", no input
      'p8-card-answer-locked': 'card=answer-locked&lock=160', // centre countdown + the state line on the top-left card
      'p8-card-answer-locked-full': 'card=answer-locked&lock=160&full', // the same, card open
      'p8-card-detour-choose': 'card=detour-choose&full', // two "Chọn nhánh" buttons [1] [2]
      'p8-card-detour-chosen': 'card=detour-chosen&full', // "Đang làm nhánh Tính", "Đổi lựa chọn kép"
      'p8-card-detour-locked': 'card=detour-locked&lock=540&full', // switch countdown, no box until it ends
      'p8-card-branch-task': 'card=branch-task&full', // branch box opened: its task, answer box, "Đổi lựa chọn kép"
      'p8-card-proof': 'card=proof&full', // photo branch: submission code + Copy + contact + "Tôi đã gửi bài"
      'p8-card-teaser': 'card=teaser&full', // "Nhận thử thách"
      'p8-card-media': 'card=media&full', // R2 image (stand-in data: URI) + https links
      'p8-book-media': 'book=media', // Sổ mật thư: images / links, submission code, no answer history
      'p8-card-answer-small': 'card=answer&full', // 1024 × 640
    }).map(([k, q]) => [k, `/?player&npc=0&wait=1&${q}`]),
  ),
});
Object.assign(VIEWPORT, { 'p8-card-answer-small': { width: 1024, height: 640 } });
const PORT = Number(process.env.SCREENSHOT_PORT ?? 5174); // not Vite's default 5173, so it can run next to `npm run dev`

const { values: opt, positionals } = parseArgs({ allowPositionals: true, options: { path: { type: 'string' }, name: { type: 'string' } } });
const group = (p: string) => (p in PRESETS ? [p] : Object.keys(PRESETS).filter((k) => k.startsWith(`${p}-`)));
const unknown = positionals.filter((p) => !group(p).length);
if (!opt.path && unknown.length) {
  console.error(`Không có preset "${unknown.join('", "')}". Các preset: ${Object.keys(PRESETS).join(', ')}`);
  process.exit(2);
}
const custom = opt.name ?? 'custom';
if (opt.path) TIMEOUT_MS[custom] = 90_000; // preview pages may build many chunks in SwiftShader
const jobs: Record<string, string> = opt.path
  ? { [custom]: opt.path.startsWith('/') ? opt.path : `/${opt.path}` }
  : positionals.length
    ? Object.fromEntries(positionals.flatMap(group).map((p) => [p, PRESETS[p]!]))
    : Object.fromEntries(Object.entries(PRESETS).filter(([k]) => !/^(lm|leg|p3|p6|p7|p8)-/.test(k))); // landmark / player / online views by name

const outDir = join(root, 'screenshots');
const errors: string[] = [];

// Vite runs in-process so it always dies with this script (no orphaned dev server).
const server = await createServer({
  root: join(root, 'client'),
  logLevel: 'warn',
  server: { port: PORT, strictPort: true },
});
try {
  await server.listen();
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'], // software WebGL in headless
  });
  try {
    const page = await browser.newPage();
    page.on('console', (m) => void (m.type() === 'error' && errors.push(`console: ${m.text()}`)));
    page.on('pageerror', (e) => void errors.push(`pageerror: ${e.message}`));
    await mkdir(outDir, { recursive: true });
    for (const [name, path] of Object.entries(jobs)) {
      await page.setViewportSize(VIEWPORT[name] ?? { width: 1280, height: 720 }); // Playwright's default size otherwise
      await page.goto(`http://localhost:${PORT}${path}`);
      const timeout = TIMEOUT_MS[name] ?? (name.startsWith('p4b-') ? 90_000 : DEFAULT_TIMEOUT_MS); // p4b: NPCs make each frame heavier (review m7)
      await page
        .waitForFunction(() => (globalThis as { __READY__?: boolean }).__READY__ === true, null, { timeout })
        .catch(() => void errors.push(`[${name}] không thấy window.__READY__ sau ${timeout} ms (vẫn chụp để xem lỗi)`));
      const stats = await page.evaluate(() => (globalThis as { __STATS__?: unknown }).__STATS__);
      if (stats !== undefined) console.log(`[${name}] __STATS__ ${JSON.stringify(stats)}`);
      const file = join(outDir, `${name}.png`);
      await page.screenshot({ path: file, fullPage: path.startsWith('/host.html') }); // the Host page scrolls, game pages don't
      console.log(`Đã chụp ${file}`);
    }
  } finally {
    await browser.close();
  }
} finally {
  await server.close();
}

if (errors.length) {
  console.error(`Có ${errors.length} lỗi trong trang:\n${errors.join('\n')}`);
  process.exit(1);
}
