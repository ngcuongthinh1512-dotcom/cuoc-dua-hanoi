// DEV ROOM (client/hall.html): Salle Henry Le Bœuf (BOZAR, Brussels) as a self-contained Three.js interior — no OSM, no chunks.
// Params: view=stalls|balcony|stage|ceiling|side|stage_close|plan (camera preset, default stalls) · cam=x,y,z,yawDeg,pitchDeg
// (free pose) · seat=J-14 = marker on that seat + camera behind it (seat numbers are data only: StallSeat.num / seatLabel;
// dev hook window.__HALL__.seat(row, num)) · stage=empty = bare stage (default: a symphony orchestra mid-performance)
// · tour=1 = slow cinematic dolly from the stalls to the stage and up to the dome (loops) · post=0 = no bloom / vignette.
// Look: ACES + bloom on the ribbons / lamps, warm vignette, additive light cones from the stage spots, one shadow-casting
// key light on the orchestra, baked AO (vertex / instance colours) under the balconies, procedural plaster / marble / wood /
// velvet / carpet textures, gilded panel strips + rosettes on the balcony fronts, dentils under the cornice.
// Controls: click = mouse look (pointer lock), WASD + Q/E (down/up), Shift = fast. Sets window.__READY__ after 3 frames.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  AISLE_X, H, RADII, ROW_LETTERS, STALLS_MAP, type Slot, type XZ, WC_CELL, balconySeats, bar, ellipsePts, faceYaw, flutedColumn,
  latticeRibs, organPipes, planPoints, plateGeometry, polyFill, resample, ribbonCurve, ring, rowY, floorYAt, seatGeometry,
  type Kind, ORCH, orchestraSlots, seatLabel, stageSteps, stallsLayout, stallsFloor, standSlots, strip, trussBars, v3,
} from './hallBuild.ts';

const q = new URLSearchParams(location.search);
const PLAN = q.get('view') === 'plan', MAPMODE = q.get('map') === '1', POST = q.get('post') !== '0', TOUR = q.get('tour') === '1';
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#1a120c');
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.3;

// ---- procedural textures -------------------------------------------------------------------------------------------
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
function canvasTex(px: number, draw: (c: CanvasRenderingContext2D, s: number) => void, rep = 1, srgb = true): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  draw(c.getContext('2d')!, px);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rep, rep);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
const speckle = (c: CanvasRenderingContext2D, s: number, n: number, size: number, alpha: number) => {
  for (let i = 0; i < n; i++) {
    const v = Math.floor(rnd() * 255);
    c.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    c.fillRect(rnd() * s, rnd() * s, size, size);
  }
};
/** Soft low-frequency blotches (plaster cloudiness, marble clouds). */
const blotches = (c: CanvasRenderingContext2D, s: number, n: number, rgb: string, alpha: number, rMax = s / 3) => {
  for (let i = 0; i < n; i++) {
    const x = rnd() * s, y = rnd() * s, r = rMax * (0.3 + 0.7 * rnd()), g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rgb},${alpha})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    c.fillStyle = g;
    c.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
};
const woodTex = (base: string, dark: string, planks = 6) =>
  canvasTex(512, (c, s) => {
    c.fillStyle = base;
    c.fillRect(0, 0, s, s);
    blotches(c, s, 10, '60,30,8', 0.18, s / 2);
    for (let i = 0; i < 320; i++) { // grain
      c.strokeStyle = `rgba(40,20,5,${0.05 + rnd() * 0.2})`;
      c.lineWidth = 0.6 + rnd() * 1.8;
      const x = rnd() * s;
      c.beginPath();
      c.moveTo(x, 0);
      c.bezierCurveTo(x + (rnd() - 0.5) * 14, s / 3, x + (rnd() - 0.5) * 14, (2 * s) / 3, x + (rnd() - 0.5) * 8, s);
      c.stroke();
    }
    c.fillStyle = dark;
    for (let i = 1; i < planks; i++) c.fillRect((i * s) / planks - 1, 0, 2, s);
    speckle(c, s, 1500, 2, 0.05);
  });
const plasterTex = (base: string, cloud = '120,95,60') => canvasTex(512, (c, s) => { c.fillStyle = base; c.fillRect(0, 0, s, s); blotches(c, s, 24, cloud, 0.08); speckle(c, s, 5000, 2, 0.05); });
const marbleTex = (base: string) => canvasTex(512, (c, s) => { // cream marble with faint veins
  c.fillStyle = base;
  c.fillRect(0, 0, s, s);
  blotches(c, s, 16, '150,130,100', 0.14);
  for (let i = 0; i < 22; i++) {
    c.strokeStyle = `rgba(140,120,95,${0.08 + rnd() * 0.16})`;
    c.lineWidth = 0.5 + rnd() * 1.5;
    const x = rnd() * s, y = rnd() * s;
    c.beginPath();
    c.moveTo(x, y);
    c.bezierCurveTo(x + (rnd() - 0.5) * s, y + (rnd() - 0.5) * s, x + (rnd() - 0.5) * s, y + (rnd() - 0.5) * s, x + (rnd() - 0.5) * s * 0.8, y + (rnd() - 0.5) * s * 0.8);
    c.stroke();
  }
  speckle(c, s, 3000, 1, 0.05);
});
const bumpTex = canvasTex(256, (c, s) => { c.fillStyle = '#808080'; c.fillRect(0, 0, s, s); blotches(c, s, 30, '255,255,255', 0.12); blotches(c, s, 30, '0,0,0', 0.12); speckle(c, s, 6000, 1, 0.25); }, 1, false);
const velvetTex = canvasTex(128, (c, s) => { // deep red velvet, lighter crown, darker in the folds
  const g = c.createLinearGradient(0, 0, 0, s);
  g.addColorStop(0, '#c23a2c');
  g.addColorStop(0.5, '#a8281e');
  g.addColorStop(1, '#7e1a14');
  c.fillStyle = g;
  c.fillRect(0, 0, s, s);
  speckle(c, s, 5000, 1, 0.14);
});
const carpetTex = canvasTex(256, (c, s) => {
  c.fillStyle = '#5e1a17';
  c.fillRect(0, 0, s, s);
  blotches(c, s, 8, '140,40,30', 0.2);
  speckle(c, s, 3000, 2, 0.08);
  c.strokeStyle = 'rgba(220,170,80,0.18)';
  c.lineWidth = 2;
  for (let i = -s; i < 2 * s; i += 32) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i + s, s); c.moveTo(i, s); c.lineTo(i + s, 0); c.stroke(); }
  c.fillStyle = 'rgba(230,180,90,0.22)';
  for (let i = 16; i < s; i += 32) for (let j = 16; j < s; j += 32) c.fillRect(i - 2, j - 2, 4, 4); // knots at the crossings
});
const panelTex = canvasTex(256, (c, s) => { // pale panelled wall (organ wall)
  c.fillStyle = '#e4d6bd';
  c.fillRect(0, 0, s, s);
  blotches(c, s, 10, '120,95,60', 0.1);
  speckle(c, s, 1500, 2, 0.04);
  c.strokeStyle = 'rgba(110,85,50,0.6)';
  c.lineWidth = 5;
  c.strokeRect(24, 24, s - 48, s - 48);
  c.strokeStyle = 'rgba(255,250,235,0.7)';
  c.lineWidth = 2;
  c.strokeRect(33, 33, s - 66, s - 66);
});

// ---- materials -----------------------------------------------------------------------------------------------------
const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ roughness: 0.85, ...o });
const M = {
  plaster: std({ map: plasterTex('#ece0cb'), bumpMap: bumpTex, bumpScale: 0.6, side: THREE.DoubleSide }),
  cream: std({ map: marbleTex('#f1e8d6'), bumpMap: bumpTex, bumpScale: 0.3, roughness: 0.55, side: THREE.DoubleSide }),
  red: std({ map: plasterTex('#9e3327', '60,10,5'), roughness: 0.9, side: THREE.DoubleSide }),
  ceiling: std({ map: plasterTex('#d8c2a0', '110,80,40'), bumpMap: bumpTex, bumpScale: 0.4, side: THREE.DoubleSide }),
  domeGold: std({ color: '#e0b56a', emissive: '#8a5a1a', emissiveIntensity: 0.55, roughness: 0.6, side: THREE.DoubleSide }),
  gold: std({ color: '#d9a94a', metalness: 0.9, roughness: 0.28 }),
  brass: std({ color: '#b98a3a', metalness: 0.85, roughness: 0.35 }),
  darkWood: std({ map: woodTex('#4a2a14', '#2a160a', 1), roughness: 0.5 }),
  honeyWood: std({ map: woodTex('#b57733', '#6a3f16', 4), roughness: 0.38 }),
  stageWood: std({ map: woodTex('#a9743c', '#5a3818', 8), roughness: 0.42 }),
  doorWood: std({ map: woodTex('#6e3f1c', '#3d230e', 2), roughness: 0.5 }),
  panel: std({ map: panelTex, roughness: 0.8 }),
  fabric: std({ map: velvetTex, roughness: 0.95 }),
  seatWood: std({ color: '#b9873f', roughness: 0.45 }),
  carpet: std({ map: carpetTex, roughness: 1 }),
  carpetAO: std({ map: carpetTex, roughness: 1, vertexColors: true }),
  ribbon: std({ color: '#fff0c8', emissive: '#ffcf68', emissiveIntensity: 2.1, roughness: 1 }),
  lamp: std({ color: '#fff8e8', emissive: '#ffe9b0', emissiveIntensity: 2.4, roughness: 1 }),
  blueGlow: std({ color: '#3a6cff', emissive: '#2b55ff', emissiveIntensity: 1.1 }),
  silver: std({ color: '#d8dce2', metalness: 0.9, roughness: 0.26 }),
  truss: std({ color: '#b9bec6', metalness: 0.7, roughness: 0.45 }),
  black: std({ color: '#151515', roughness: 0.7 }),
  suit: std({ color: '#1b1b20', roughness: 0.9 }),
  musician: std({ color: '#9a6e4e', roughness: 1 }), // darker skin: the stage spots would blow the audience tone out
  hair: std({ color: '#2a1d14', roughness: 0.95 }),
  shirt: std({ color: '#f2eee6', roughness: 0.8 }),
  varnish: std({ color: '#7a3a14', roughness: 0.3, metalness: 0.1 }),
  copper: std({ color: '#b06a32', metalness: 0.8, roughness: 0.35 }),
  drumHead: std({ color: '#e6dcc4', roughness: 0.9 }),
  skin: std({ color: '#ffffff', roughness: 0.8 }), // tinted per instance
  crowd: std({ color: '#ffffff', roughness: 0.92 }), // tinted per instance
  crystal: std({ color: '#ffffff', emissive: '#fff1cc', emissiveIntensity: 1.2, transparent: true, opacity: 0.7, roughness: 0.1 }),
  flower: std({ color: '#f6f3ee', emissive: '#f0e6d0', emissiveIntensity: 0.15, roughness: 0.9 }),
  leaf: std({ color: '#3d6b31', roughness: 0.9 }),
  cone: new THREE.MeshBasicMaterial({ color: '#ffd9a0', transparent: true, opacity: 0.012, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
};
const add = (g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D = scene) => {
  const mesh = new THREE.Mesh(g, m);
  parent.add(mesh);
  return mesh;
};
const merged = (parts: THREE.BufferGeometry[], m: THREE.Material) => add(mergeGeometries(parts, false)!, m);
const toV3 = (pts: XZ[], y: number) => pts.map(([x, z]) => v3(x, y, z));
const tube = (pts: XZ[], y: number, r: number, m: THREE.Material, closed = false) =>
  add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(toV3(pts, y), closed, 'catmullrom', 0.3), closed ? 150 : 100, r, 4, closed), m);
function instanced(g: THREE.BufferGeometry, m: THREE.Material, slots: Slot[], scale = 1, tint?: (i: number) => THREE.Color) {
  const im = new THREE.InstancedMesh(g, m, slots.length), o = new THREE.Object3D();
  slots.forEach((s, i) => {
    o.position.set(s.x, s.y, s.z);
    o.rotation.set(0, s.yaw, 0);
    o.scale.setScalar(scale);
    o.updateMatrix();
    im.setMatrixAt(i, o.matrix);
    if (tint) im.setColorAt(i, tint(i));
  });
  scene.add(im);
  return im;
}
/** Points every `step` m along the plan at `inset`, facing the hall (for pilaster strips, dentils, rosettes). */
const alongPlan = (inset: number, step: number, y: number, zMin = H.zFront + 0.5): Slot[] =>
  resample(planPoints(inset, 96, 24), step).filter(([, z]) => z > zMin).map(([x, z]) => ({ x, y, z, yaw: faceYaw(x, z, 0, H.zArc) }));
/** Baked ambient occlusion at a stalls point: darker under the balcony overhang (near the walls) and towards the rear. */
function ao(x: number, z: number): number {
  const rx = H.halfW, rz = H.rear;
  const dWall = z <= H.zArc ? rx - Math.abs(x) : (1 - Math.hypot(x / rx, (z - H.zArc) / rz)) * 14;
  const under = THREE.MathUtils.smoothstep(dWall, 2.6, H.tiers[0].inset + 1.4); // 0 deep under the soffit → 1 in the open
  const rear = 1 - 0.18 * THREE.MathUtils.smoothstep(z, 6, 26);
  return (0.5 + 0.5 * under) * rear * (z < H.zFront + 0.5 ? 1 : 1);
}
const hash = (i: number) => (((i * 2654435761) >>> 0) % 1000) / 1000;

// ---- walls, floor, stalls ------------------------------------------------------------------------------------------
const wall = planPoints(0, 64, 16);
add(strip(wall, -1, H.ceilY), M.plaster);
{
  const floor = stallsFloor(0.35), pos = floor.attributes.position as THREE.BufferAttribute, col: number[] = [];
  for (let i = 0; i < pos.count; i++) { const a = ao(pos.getX(i), pos.getZ(i)); col.push(a, a, a); }
  floor.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  add(floor, M.carpetAO).receiveShadow = true;
}
// stage house: side walls + organ back wall (pale panels) + ceiling
const sx = H.halfW, sb = H.stage.back;
merged([strip([[-sx, sb], [-sx, H.zFront]], -1, H.ceilY), strip([[sx, H.zFront], [sx, sb]], -1, H.ceilY)], M.plaster);
M.panel.map!.repeat.set(10, 6);
add(new THREE.PlaneGeometry(2 * sx, H.ceilY - H.stage.y).translate(0, (H.ceilY + H.stage.y) / 2, sb + 0.02), M.panel);
add(new THREE.PlaneGeometry(2 * sx, 2.2).translate(0, 0, sb + 0.01).rotateX(-Math.PI / 2).translate(0, H.ceilY, (sb + H.zFront) / 2), M.ceiling);
add(polyFill([[-sx, sb], [sx, sb], [sx, H.zFront], [-sx, H.zFront]], H.ceilY), M.ceiling);
// stalls-level wall dressing: dado rail, pilaster strips between the doors
tube(planPoints(0.08, 64, 16), 1.05, 0.05, M.gold);
instanced(new THREE.BoxGeometry(0.34, H.tiers[0].y - 1.6, 0.14).translate(0, (H.tiers[0].y - 1.6) / 2 + 1.1, 0), M.cream, alongPlan(0.12, 3.75, 0, H.zFront + 3).filter((_, i) => i % 2 === 1)); // between the doors
// seats (two instanced meshes per fabric / wood); stalls from the seat map, balconies as before; tinted by AO + a little variation
const seatG = seatGeometry(), stalls = stallsLayout();
const seats = PLAN ? stalls.seats : [...stalls.seats, ...H.tiers.flatMap(balconySeats)];
const seatAO = (i: number) => (i < stalls.seats.length ? ao(seats[i].x, seats[i].z) : 0.7 + 0.3 * hash(i));
const CAT: Record<string, string> = { g: '#1faa55', y: '#f2d600', b: '#1430d0', r: '#d41616', '.': '#9b9b9b' };
instanced(seatG.fabric, MAPMODE ? std({ color: '#ffffff', roughness: 0.95 }) : M.fabric, seats, 1, (i) =>
  MAPMODE ? new THREE.Color(i < stalls.seats.length ? CAT[stalls.seats[i].cat] : '#c64f28') : new THREE.Color().setScalar(seatAO(i) * (0.9 + 0.16 * hash(i + 7))));
instanced(seatG.wood, M.seatWood, seats, 1, (i) => new THREE.Color().setScalar(seatAO(i)));
// brass row-letter plates at the row ends + wheelchair-space squares (one canvas atlas: A…Q + the symbol)
{
  const cells = WC_CELL + 1, c = document.createElement('canvas');
  c.width = 64 * cells;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#b98a3a';
  g.fillRect(0, 0, c.width, 64);
  g.fillStyle = '#2a1a08';
  g.font = 'bold 44px serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let i = 0; i < ROW_LETTERS.length; i++) g.fillText(ROW_LETTERS[i], 64 * i + 32, 34);
  g.fillStyle = '#1a4fd6'; // wheelchair cell: blue square, white symbol
  g.fillRect(64 * WC_CELL, 0, 64, 64);
  g.strokeStyle = g.fillStyle = '#ffffff';
  g.lineWidth = 5;
  g.lineCap = 'round';
  const o = 64 * WC_CELL;
  g.beginPath(); g.arc(o + 26, 44, 11, 0, Math.PI * 2); g.stroke(); // wheel
  g.beginPath(); g.arc(o + 32, 13, 5, 0, Math.PI * 2); g.fill(); // head
  g.beginPath(); g.moveTo(o + 32, 20); g.lineTo(o + 32, 36); g.lineTo(o + 48, 36); g.lineTo(o + 54, 50); g.stroke(); // body + legs
  const atlas = new THREE.CanvasTexture(c);
  atlas.colorSpace = THREE.SRGBColorSpace;
  const plateM = std({ map: atlas, metalness: 0.5, roughness: 0.45, side: THREE.DoubleSide });
  add(plateGeometry(stalls.plates, cells), plateM);
  if (stalls.wc.length) add(plateGeometry(stalls.wc, cells, true), plateM);
}
// brass rails along the two diagonal aisles of the front section (a post per row, rail at 0.9 m, ball finials)
{
  const rails: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const pts: THREE.Vector3[] = [];
    STALLS_MAP.forEach((row, i) => {
      if (row.rear) return;
      const x = s * AISLE_X[i], z = H.stalls.cz + Math.sqrt(Math.max(0, RADII[i] ** 2 - x * x));
      pts.push(v3(x, rowY(i) + 0.9, z));
    });
    for (let i = 1; i < pts.length; i++) rails.push(bar(pts[i - 1], pts[i], 0.04));
    for (const p of pts) rails.push(bar(p, v3(p.x, p.y - 0.9, p.z), 0.03), new THREE.SphereGeometry(0.05, 8, 6).translate(p.x, p.y, p.z));
  }
  merged(rails, M.brass);
}

// ---- balcony tiers -------------------------------------------------------------------------------------------------
for (const t of H.tiers) {
  const front = planPoints(t.inset, 64, 16);
  add(strip(front, t.y - 0.5, t.y + 1.05), M.cream); // balustrade + soffit edge
  add(ring(front, wall, t.y - 0.5), M.cream); // soffit
  for (let k = 0; k < t.rows; k++) { // stepped rows
    const a = planPoints(t.inset - (k ? 0 : 0.05) + k * 0.95, 64, 16), b = k + 1 < t.rows ? planPoints(t.inset + (k + 1) * 0.95, 64, 16) : wall;
    add(ring(a, b, t.y + k * 0.38), M.carpet);
    if (k) add(strip(a, t.y + (k - 1) * 0.38, t.y + k * 0.38), M.carpet);
  }
  add(strip(planPoints(0.03, 64, 16), t.y + 1.05, t.y + 4.1), M.red); // painted band behind the seats
  tube(planPoints(t.inset - 0.07, 64, 16), t.y + 1.05, 0.08, M.gold); // gilded top moulding
  tube(planPoints(t.inset - 0.07, 64, 16), t.y + 0.95, 0.04, M.gold);
  tube(planPoints(t.inset - 0.05, 64, 16), t.y + 0.1, 0.06, M.gold);
  tube(planPoints(t.inset - 0.04, 64, 16), t.y - 0.45, 0.07, M.gold); // soffit edge moulding
  add(strip(planPoints(t.inset - 0.03, 64, 16), t.y + 0.45, t.y + 0.62), M.gold); // mid band
  // panel strips + gilded rosettes dividing the front into bays
  instanced(new THREE.BoxGeometry(0.16, 1.3, 0.08).translate(0, 0, 0.0), M.cream, alongPlan(t.inset - 0.06, 2.4, t.y + 0.25));
  instanced(new THREE.TorusGeometry(0.14, 0.045, 6, 14).rotateX(0), M.gold, alongPlan(t.inset - 0.07, 2.4, t.y + 0.8).map((s) => ({ ...s, x: s.x - Math.cos(s.yaw) * 1.2, z: s.z + Math.sin(s.yaw) * 1.2 })));
  instanced(new THREE.BoxGeometry(0.1, 0.16, 0.16), M.cream, alongPlan(t.inset - 0.06, 0.45, t.y - 0.38)); // dentils under the soffit edge
  doors(() => t.y + 2 * 0.38 + 0.05);
}
doors(floorYAt, 6);
function doors(foot: (x: number, z: number) => number, every = 7.5) { // wooden doors with cream architraves + pediments in the red bands
  const leaf: THREE.BufferGeometry[] = [], frames: THREE.BufferGeometry[] = [], gilt: THREE.BufferGeometry[] = [];
  for (const [x, z] of resample(planPoints(0.12, 64, 16), every)) {
    if (z < H.zFront + 3) continue;
    const yaw = faceYaw(x, z, 0, H.zArc), m = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, foot(x, z) + 1.1, z);
    leaf.push(new THREE.BoxGeometry(1.2, 2.2, 0.1).translate(0, 0, -0.06).applyMatrix4(m));
    leaf.push(new THREE.BoxGeometry(0.4, 0.8, 0.03).translate(-0.3, 0.4, -0.12).applyMatrix4(m), new THREE.BoxGeometry(0.4, 0.8, 0.03).translate(0.3, 0.4, -0.12).applyMatrix4(m)); // raised panels
    leaf.push(new THREE.BoxGeometry(0.4, 0.7, 0.03).translate(-0.3, -0.55, -0.12).applyMatrix4(m), new THREE.BoxGeometry(0.4, 0.7, 0.03).translate(0.3, -0.55, -0.12).applyMatrix4(m));
    frames.push(new THREE.BoxGeometry(1.55, 2.5, 0.1).translate(0, 0.05, 0.02).applyMatrix4(m));
    frames.push(new THREE.BoxGeometry(1.9, 0.3, 0.2).translate(0, 1.4, -0.04).applyMatrix4(m)); // entablature
    frames.push(new THREE.BoxGeometry(0.18, 2.5, 0.16).translate(-0.78, 0.05, -0.03).applyMatrix4(m), new THREE.BoxGeometry(0.18, 2.5, 0.16).translate(0.78, 0.05, -0.03).applyMatrix4(m)); // pilasters
    gilt.push(new THREE.BoxGeometry(1.9, 0.05, 0.22).translate(0, 1.57, -0.05).applyMatrix4(m), new THREE.SphereGeometry(0.035, 6, 4).translate(0.45, -0.05, -0.14).applyMatrix4(m));
  }
  merged(leaf, M.doorWood);
  merged(frames, M.cream);
  merged(gilt, M.gold);
}
// rear central loge (tier 2): lit window + small red panels
{
  const t = H.tiers[1], zr = H.zArc + H.rear - 0.25;
  add(new THREE.BoxGeometry(4.2, 1.6, 0.1).translate(0, t.y + 2.6, zr), M.lamp);
  add(new THREE.BoxGeometry(4.8, 2.2, 0.08).translate(0, t.y + 2.6, zr + 0.02), M.darkWood);
}
// ---- columns, cornice ----------------------------------------------------------------------------------------------
{
  const t = H.tiers[1], y0 = t.y + 0.8, colH = H.cornice - 0.35 - y0, col = flutedColumn(0.42, colH);
  const slots: Slot[] = [];
  for (const [x, z] of resample(planPoints(0.65, 64, 16), 4.3)) if (z > H.zFront + 0.6) slots.push({ x, y: y0, z, yaw: 0 });
  instanced(col, M.cream, slots);
  instanced(new THREE.TorusGeometry(0.5, 0.06, 6, 20).rotateX(Math.PI / 2), M.gold, slots.map((s) => ({ ...s, y: y0 + colH - 0.62 }))); // gilded necking
  // two tall columns each side at the stage end with Ionic-ish capitals (volutes) and gilded necking
  const bigH = H.cornice - 0.3 - 0.4, big = flutedColumn(0.75, bigH), bigSlots = [-1, 1].map((s) => ({ x: s * (H.halfW - 1.1), y: 0.4, z: H.zFront + 1.0, yaw: 0 }));
  instanced(big, M.cream, bigSlots);
  const vol: THREE.BufferGeometry[] = [];
  for (const b of bigSlots) {
    for (const [dx, dz] of [[-0.95, -0.95], [0.95, -0.95], [-0.95, 0.95], [0.95, 0.95]]) vol.push(new THREE.TorusGeometry(0.2, 0.08, 8, 16).rotateY(Math.PI / 2).translate(b.x + dx, 0.4 + bigH - 0.55, b.z + dz));
    vol.push(new THREE.TorusGeometry(0.85, 0.08, 8, 24).rotateX(Math.PI / 2).translate(b.x, 0.4 + bigH - 1.05, b.z));
  }
  merged(vol, M.gold);
  const pil = [-1, 1].map((s) => new THREE.BoxGeometry(0.5, H.cornice - H.stage.y - 0.4, 1.3).translate(s * (H.halfW - 0.3), (H.cornice - 0.4 + H.stage.y) / 2, H.zFront - 2.2));
  merged(pil, M.cream);
}
const corn = planPoints(0.02, 64, 16);
add(strip(planPoints(0.55, 64, 16), H.cornice - 0.7, H.cornice), M.cream);
add(ring(planPoints(0.55, 64, 16), corn, H.cornice - 0.7), M.cream);
add(ring(planPoints(0.55, 64, 16), corn, H.cornice), M.cream);
tube(planPoints(0.6, 64, 16), H.cornice - 0.7, 0.1, M.gold);
tube(planPoints(0.6, 64, 16), H.cornice - 0.05, 0.07, M.gold);
tube(planPoints(0.6, 64, 16), H.cornice - 0.38, 0.04, M.gold);
instanced(new THREE.BoxGeometry(0.14, 0.2, 0.22), M.cream, alongPlan(0.5, 0.36, H.cornice - 0.82)); // dentil course
merged([-1, 1].map((s) => new THREE.BoxGeometry(2 * sx, 0.7, 0.6).translate(0, H.cornice - 0.35, s > 0 ? H.zFront - 0.3 : sb + 0.3)), M.cream);

// ---- oval ceiling: coves, ribbons, lattice dome, chandelier -------------------------------------------------------
{
  const { rings, lift } = H.oval, E = rings.map(([a, b]) => ellipsePts(a, b, 128));
  add(polyFill(wall, H.ceilY, [E[0]]), M.ceiling);
  for (let i = 0; i < 3; i++) {
    const yb = i ? H.ceilY + lift[i - 1] : H.ceilY, yt = H.ceilY + lift[i];
    add(strip(E[i], yb, yt, true), M.ceiling); // cove wall
    const inner = i + 1 < 3 ? E[i + 1] : null;
    if (inner) add(polyFill(E[i], yt, [inner]), M.ceiling); // flat band
    else add(polyFill(E[i], yt + 0.5), M.domeGold); // dome panel
    const [a, b] = rings[i];
    add(new THREE.TubeGeometry(ribbonCurve(a - 0.3, b - 0.3, (yb + yt) / 2, i === 1 ? 0.1 : H.oval.wave), 180, 0.15, 5, true), M.ribbon);
    tube(ellipsePts(a + 0.08, b + 0.08, 96), yb - 0.02, 0.07, M.cream, true); // stepped moulding at the cove foot
    tube(ellipsePts(a - 0.05, b - 0.05, 96), yt - 0.02, 0.05, M.gold, true); // gilded lip at the cove top
  }
  add(latticeRibs(rings[2][0], rings[2][1], H.ceilY + lift[2] + 0.05), M.darkWood);
  // spot lamps on the first flat band + grilles on the flat ceiling
  const lamps: THREE.BufferGeometry[] = [], grilles: THREE.BufferGeometry[] = [];
  for (const [x, z] of ellipsePts((rings[0][0] + rings[1][0]) / 2, (rings[0][1] + rings[1][1]) / 2, 14)) lamps.push(new THREE.CylinderGeometry(0.16, 0.2, 0.08, 10).translate(x, H.ceilY + lift[0] - 0.02, z));
  for (const [x, z] of [[-13.5, 2], [13.5, 2], [-10, 24], [10, 24], [-15, 10], [15, 10]]) grilles.push(new THREE.BoxGeometry(0.9, 0.05, 0.5).translate(x, H.ceilY - 0.02, z));
  merged(lamps, M.lamp);
  merged(grilles, M.black);
  // round recess + chandelier near the proscenium: brass drum, gilded rings, five rings of crystal strands
  const ch = H.chandelier, rec = ellipsePts(ch.r, ch.r, 40, ch.z);
  add(strip(rec, H.ceilY, H.ceilY + 0.9, true), M.ceiling);
  add(polyFill(rec, H.ceilY + 0.9), M.domeGold);
  tube(ellipsePts(ch.r + 0.1, ch.r + 0.1, 40, ch.z), H.ceilY - 0.02, 0.07, M.gold, true);
  add(new THREE.CylinderGeometry(0.05, 0.05, 2.3, 8).translate(ch.x, H.ceilY - 1.15, ch.z), M.brass);
  add(new THREE.CylinderGeometry(1.25, 1.25, 0.55, 32, 1, true).translate(ch.x, H.ceilY - 2.4, ch.z), new THREE.MeshStandardMaterial({ ...M.gold, side: THREE.DoubleSide }));
  add(new THREE.TorusGeometry(1.25, 0.06, 8, 32).rotateX(Math.PI / 2).translate(ch.x, H.ceilY - 2.12, ch.z), M.gold);
  add(new THREE.TorusGeometry(1.25, 0.06, 8, 32).rotateX(Math.PI / 2).translate(ch.x, H.ceilY - 2.68, ch.z), M.gold);
  const drops: Slot[] = [];
  for (let k = 0; k < 5; k++) for (let i = 0; i < 44 - k * 7; i++) {
    const n = 44 - k * 7, t = (i / n) * Math.PI * 2 + k * 0.1, r = 1.2 - k * 0.22;
    drops.push({ x: ch.x + r * Math.cos(t), y: H.ceilY - 3.0 - k * 0.22, z: ch.z + r * Math.sin(t), yaw: 0 });
    if (k < 3) drops.push({ x: ch.x + r * Math.cos(t), y: H.ceilY - 3.9 - k * 0.22, z: ch.z + r * Math.sin(t), yaw: 0 });
  }
  instanced(new THREE.CylinderGeometry(0.035, 0.015, 0.85, 5), M.crystal, drops);
  add(new THREE.SphereGeometry(0.45, 16, 12).translate(ch.x, H.ceilY - 2.95, ch.z), M.lamp);
}

// ---- stage: floor, steps, organ -----------------------------------------------------------------------------------
{
  const { y, halfW, back } = H.stage, depth = H.zFront - back;
  add(new THREE.BoxGeometry(2 * halfW, y, depth).translate(0, y / 2, (H.zFront + back) / 2), M.stageWood).receiveShadow = true;
  add(new THREE.BoxGeometry(2 * halfW + 0.2, 0.08, 0.2).translate(0, y, H.zFront + 0.05), M.darkWood); // nosing
  const steps: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) for (let k = 0; k < 4; k++) steps.push(new THREE.BoxGeometry(1.3, y * (k + 1) / 4, 0.32).translate(s * (halfW + 0.65), (y * (k + 1)) / 8, H.zFront - 0.16 - k * 0.32));
  merged(steps, M.stageWood);
  // organ case: honey wood towers with carved mouldings, dark panel frames, silver / gold pipes with mouths
  const caseZ = back + 1.3, cases: THREE.BufferGeometry[] = [], gilt: THREE.BufferGeometry[] = [], frames: THREE.BufferGeometry[] = [];
  cases.push(new THREE.BoxGeometry(2 * halfW - 1, 9, 0.6).translate(0, y + 9, caseZ - 0.3)); // continuous case back
  for (const [x, w, h] of [[0, 4.6, 17.5], [-8.3, 3.6, 15], [8.3, 3.6, 15], [-4.3, 3.6, 12.6], [4.3, 3.6, 12.6]]) {
    cases.push(new THREE.BoxGeometry(w, h - y, 1.3).translate(x, (h + y) / 2, caseZ - 0.65));
    cases.push(new THREE.BoxGeometry(w + 0.4, 0.5, 1.7).translate(x, h + 0.25, caseZ - 0.65)); // crown
    cases.push(new THREE.BoxGeometry(w + 0.7, 0.25, 1.9).translate(x, h + 0.62, caseZ - 0.65)); // cornice step
    gilt.push(new THREE.BoxGeometry(w + 0.5, 0.08, 0.1).translate(x, h + 0.02, caseZ + 0.25), new THREE.BoxGeometry(w + 0.5, 0.08, 0.1).translate(x, h + 0.5, caseZ + 0.3)); // gilded fillets
    gilt.push(new THREE.BoxGeometry(w + 0.2, 0.1, 0.12).translate(x, y + 4.7, caseZ + 0.2)); // impost moulding over the plinth
    frames.push(new THREE.BoxGeometry(w - 0.4, 0.14, 0.08).translate(x, y + 5.3, caseZ + 0.06)); // dark sill under the pipes
  }
  cases.push(new THREE.BoxGeometry(2 * halfW + 2, 4.6, 0.9).translate(0, y + 2.3, caseZ - 0.45)); // plinth with doors
  gilt.push(new THREE.BoxGeometry(2 * halfW + 2.2, 0.1, 0.14).translate(0, y + 4.62, caseZ + 0.02));
  merged(cases, M.honeyWood);
  merged(gilt, M.gold);
  merged(frames, M.darkWood);
  const doorsG: THREE.BufferGeometry[] = [];
  for (const x of [-9.5, -5.6, -1.9, 1.9, 5.6, 9.5]) doorsG.push(new THREE.BoxGeometry(1.4, 2.6, 0.12).translate(x, y + 1.3, caseZ + 0.06), new THREE.BoxGeometry(1.0, 1.0, 0.04).translate(x, y + 1.9, caseZ + 0.14), new THREE.BoxGeometry(1.0, 0.9, 0.04).translate(x, y + 0.7, caseZ + 0.14));
  merged(doorsG, M.doorWood);
  const pipes = organPipes(), pz = caseZ + 0.26, o = new THREE.Object3D();
  for (const gold of [false, true]) {
    const sel = pipes.filter((p) => p.gold === gold);
    const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.82, 1, 1, 14), gold ? M.gold : M.silver, sel.length);
    const mouths = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), M.black, sel.length);
    sel.forEach((p, i) => {
      o.position.set(p.x, p.y + p.h / 2, pz);
      o.scale.set(p.r, p.h, p.r);
      o.updateMatrix();
      im.setMatrixAt(i, o.matrix);
      o.position.set(p.x, p.y + p.h * 0.22, pz + p.r * 0.92);
      o.scale.set(p.r * 1.1, p.r * 0.9, 0.04);
      o.updateMatrix();
      mouths.setMatrixAt(i, o.matrix);
    });
    scene.add(im, mouths);
  }
  merged([-1, 1].map((s) => new THREE.BoxGeometry(0.2, 9, 1.2).translate(s * (halfW + 0.3), y + 6, back + 4)), M.blueGlow); // blue accent panels
}

// ---- audience: low-poly seated figures with hair, arms and clothing / skin / hair variation per instance ---------------
{
  const torso = new THREE.CapsuleGeometry(0.19, 0.4, 1, 6).translate(0, 0.93, -0.02);
  const shoulders = new THREE.BoxGeometry(0.46, 0.1, 0.24).translate(0, 1.12, -0.02);
  const thighs = new THREE.BoxGeometry(0.36, 0.13, 0.42).translate(0, 0.52, -0.2);
  const arm = (s: number) => [bar(v3(s * 0.22, 1.1, -0.02), v3(s * 0.24, 0.84, -0.1), 0.07), bar(v3(s * 0.24, 0.84, -0.1), v3(s * 0.15, 0.7, -0.34), 0.06)];
  const body = mergeGeometries([torso, shoulders, thighs, ...arm(-1), ...arm(1)], false)!; // ponytail: ~170 tris / figure, 988 of them
  const headG = new THREE.SphereGeometry(0.115, 5, 4).translate(0, 1.38, 0);
  const skin = mergeGeometries([headG, new THREE.CylinderGeometry(0.05, 0.055, 0.12, 4, 1, true).translate(0, 1.23, 0)], false)!; // ponytail: no hands (hidden behind the seat backs)
  const hair = new THREE.SphereGeometry(0.122, 5, 3, 0, Math.PI * 2, 0, 1.45).translate(0, 1.385, -0.015);
  const nStalls = stalls.seats.length; // ground floor: every seat taken (full figures); balconies keep a sparse, cheaper crowd
  const pose = (s: Slot, i: number) => ({ ...s, y: s.y + 0.08, yaw: s.yaw + (hash(i + 3) - 0.5) * 0.36 });
  const floor = PLAN ? [] : seats.slice(0, nStalls).map(pose), upper = PLAN ? [] : seats.slice(nStalls).filter((_, i) => (i * 7919) % 100 < 45).map((s, i) => pose(s, i + nStalls));
  const SUITS = ['#1a1a22', '#262b40', '#3a3a3c', '#5a2730', '#9c8f7a', '#1f2e2a', '#463a58', '#55555c', '#2b2118', '#1c2a44', '#3b2a28'].map((c) => new THREE.Color(c));
  const SKINS = ['#e3bd98', '#d4a67e', '#c4916a', '#a06c4c', '#7a5035'].map((c) => new THREE.Color(c));
  const HAIRS = ['#1b1510', '#3a2a1a', '#6b4a2a', '#8a6a3e', '#a39b8e', '#2c2c2e', '#6e2e1c', '#1b1510', '#3a2a1a'].map((c) => new THREE.Color(c));
  const pick = <T,>(arr: T[], i: number, salt: number) => arr[Math.floor(hash(i * 13 + salt) * arr.length)];
  const tint = (list: Slot[], arr: THREE.Color[], salt: number) => (i: number) => pick(arr, i + salt * 977, salt).clone().multiplyScalar(list[i].y < 4 ? ao(list[i].x, list[i].z) : 0.75);
  instanced(body, M.crowd, floor, 1, tint(floor, SUITS, 1));
  instanced(skin, M.skin, floor, 1, tint(floor, SKINS, 2));
  instanced(hair, M.crowd, floor, 1, tint(floor, HAIRS, 3));
  instanced(mergeGeometries([torso, shoulders], false)!, M.crowd, upper, 1, tint(upper, SUITS, 4));
  instanced(headG, M.skin, upper, 1, tint(upper, SKINS, 5));
  instanced(hair, M.crowd, upper, 1, tint(upper, HAIRS, 6));
}

// ---- symphony orchestra (?stage=empty removes it) ------------------------------------------------------------------
// Every musician is a posed figure built from boxes / capsules / bars in LOCAL space (feet at y 0, facing −z, right hand
// at +x); all figures are merged per material (suit, skin, hair, shirt, varnish, gold …) → ≈ 11 draw calls, shadow casting.
function orchestra() {
  const { y, halfW } = H.stage, slots = orchestraSlots(), steps = stageSteps();
  add(steps.tops, M.stageWood).receiveShadow = true;
  add(steps.skirt, std({ color: '#151515', roughness: 0.7, side: THREE.DoubleSide }));
  type Parts = Partial<Record<'suit' | 'skin' | 'hair' | 'shirt' | 'varnish' | 'gold' | 'bow' | 'black' | 'silver' | 'copper' | 'drumHead', THREE.BufferGeometry[]>>;
  const box = (w: number, h: number, d: number, x: number, yy: number, z: number, rx = 0) => new THREE.BoxGeometry(w, h, d).rotateX(rx).translate(x, yy, z);
  const B = (p: number[], q: number[], r: number) => bar(v3(p[0], p[1], p[2]), v3(q[0], q[1], q[2]), r);
  const head = (yy: number, z: number) => ({ skin: [new THREE.SphereGeometry(0.11, 8, 6).translate(0, yy, z), new THREE.CylinderGeometry(0.045, 0.05, 0.1, 6).translate(0, yy - 0.14, z)], hair: [new THREE.SphereGeometry(0.117, 8, 4, 0, Math.PI * 2, 0, 1.4).translate(0, yy + 0.005, z - 0.01)] });
  const seatedBody = (): Parts => ({
    suit: [box(0.34, 0.14, 0.44, 0, 0.5, -0.18), box(0.1, 0.42, 0.1, -0.1, 0.21, -0.38), box(0.1, 0.42, 0.1, 0.1, 0.21, -0.38), new THREE.CapsuleGeometry(0.16, 0.42, 1, 7).rotateX(-0.12).translate(0, 0.95, -0.04), box(0.42, 0.09, 0.22, 0, 1.15, -0.06)],
    shirt: [box(0.13, 0.3, 0.03, 0, 1.02, -0.2, -0.12)],
    ...head(1.37, -0.08),
  });
  const standingBody = (): Parts => ({
    suit: [box(0.3, 0.88, 0.2, 0, 0.44, 0), new THREE.CapsuleGeometry(0.17, 0.44, 1, 7).translate(0, 1.22, 0), box(0.44, 0.09, 0.22, 0, 1.44, 0)],
    shirt: [box(0.13, 0.3, 0.03, 0, 1.28, -0.17)],
    ...head(1.67, -0.02),
  });
  const arms = (p: Parts, ...segs: [number[], number[]][]) => { p.suit!.push(...segs.map(([a, b]) => B(a, b, 0.07))); p.skin!.push(...segs.map(([, b]) => new THREE.SphereGeometry(0.045, 6, 4).translate(b[0], b[1], b[2]))); return p; };
  /** Violin-family body: two flattened ellipsoids (upper / lower bout) + neck + scroll, length L, facing −z. */
  const fiddleBody = (L: number, W: number, T: number) => mergeGeometries([
    new THREE.SphereGeometry(1, 10, 6).scale(W * 0.5, T, L * 0.24).translate(0, 0, L * 0.24),
    new THREE.SphereGeometry(1, 10, 6).scale(W * 0.4, T, L * 0.2).translate(0, 0, -L * 0.2),
    box(W * 0.5, T * 1.6, L * 0.16, 0, 0, L * 0.02), // waist
    box(W * 0.1, T * 0.8, L * 0.62, 0, T * 0.3, -L * 0.62), new THREE.SphereGeometry(W * 0.09, 6, 5).translate(0, T * 0.6, -L * 0.95),
    box(W * 0.15, T * 0.2, L * 0.06, 0, T + 0.004, L * 0.05), // tailpiece / bridge hint
  ], false)!;
  const fiddle = (scale: number): Parts => { // violin / viola under the chin, bow arm up
    const p = arms(seatedBody(), [[-0.17, 1.2, -0.05], [-0.36, 1.18, -0.46]], [[0.17, 1.2, -0.05], [0.3, 1.02, -0.22]], [[0.3, 1.02, -0.22], [0.1, 1.24, -0.44]]);
    p.varnish = [fiddleBody(0.4, 0.2, 0.025).scale(scale, scale, scale).rotateX(-0.2).rotateY(0.75).translate(-0.2, 1.28, -0.24)];
    p.bow = [B([0.2, 1.17, -0.46], [-0.33, 1.44, -0.34], 0.008)];
    return p;
  };
  const kinds: Record<Kind, () => Parts> = {
    vln1: () => fiddle(1), vln2: () => fiddle(1), vla: () => fiddle(1.12),
    vc: () => { // cello between the knees, bow horizontal
      const p = arms(seatedBody(), [[-0.17, 1.2, -0.05], [-0.12, 1.34, -0.32]], [[0.17, 1.2, -0.05], [0.36, 0.92, -0.5]]);
      p.varnish = [fiddleBody(1.15, 0.4, 0.07).rotateX(0.28 + Math.PI / 2).rotateX(Math.PI).translate(0.04, 0.8, -0.44), box(0.03, 0.02, 0.4, 0.04, 0.02, -0.5)];
      p.bow = [B([0.4, 0.9, -0.62], [-0.25, 0.98, -0.62], 0.008)];
      return p;
    },
    db: () => { // double bass, player standing at a stool
      const p = arms(standingBody(), [[-0.17, 1.48, 0], [-0.2, 1.75, -0.33]], [[0.17, 1.48, 0], [0.42, 1.12, -0.52]]);
      p.black = [box(0.3, 0.64, 0.3, 0, 0.32, 0.22)];
      p.varnish = [fiddleBody(1.85, 0.58, 0.1).rotateX(0.12 + Math.PI / 2).rotateX(Math.PI).translate(-0.12, 1.05, -0.46)];
      p.bow = [B([0.45, 1.1, -0.62], [-0.2, 1.18, -0.64], 0.009)];
      return p;
    },
    fl: () => { const p = arms(seatedBody(), [[-0.17, 1.2, -0.05], [0.12, 1.28, -0.22]], [[0.17, 1.2, -0.05], [0.42, 1.22, -0.2]]); p.silver = [B([-0.03, 1.33, -0.16], [0.6, 1.24, -0.22], 0.016)]; return p; },
    ww: () => { const p = arms(seatedBody(), [[-0.17, 1.2, -0.05], [-0.02, 1.12, -0.28]], [[0.17, 1.2, -0.05], [0.06, 0.98, -0.34]]); p.black = [B([0, 1.32, -0.16], [0.06, 0.78, -0.44], 0.022), new THREE.CylinderGeometry(0.05, 0.025, 0.1, 8).rotateX(-2.0).translate(0.07, 0.74, -0.47)]; p.silver = [B([0.01, 1.2, -0.22], [0.05, 0.9, -0.38], 0.026)]; return p; },
    brass: () => { // trumpet / trombone / horn: gold tube to the mouth with a bell pointing forward-down
      const p = arms(seatedBody(), [[-0.17, 1.2, -0.05], [-0.05, 1.18, -0.3]], [[0.17, 1.2, -0.05], [0.08, 1.2, -0.3]]);
      p.gold = [B([0, 1.32, -0.16], [0, 1.18, -0.42], 0.022), box(0.1, 0.13, 0.12, 0, 1.2, -0.3), new THREE.CylinderGeometry(0.17, 0.03, 0.32, 12).rotateX(-2.0).translate(0, 1.07, -0.62), new THREE.TorusGeometry(0.07, 0.015, 5, 10).rotateY(Math.PI / 2).translate(0.0, 1.22, -0.42)];
      return p;
    },
    perc: () => arms(standingBody(), [[-0.17, 1.48, 0], [-0.28, 1.2, -0.4]], [[0.17, 1.48, 0], [0.3, 1.3, -0.4]]), // mallets in both hands
    timp: () => ({ copper: [new THREE.SphereGeometry(0.42, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).translate(0, 0.9, 0)], drumHead: [new THREE.CylinderGeometry(0.43, 0.43, 0.03, 14).translate(0, 0.9, 0)], black: [0, 2.1, 4.2].map((t) => B([0.3 * Math.cos(t), 0.05, 0.3 * Math.sin(t)], [0.3 * Math.cos(t), 0.86, 0.3 * Math.sin(t)], 0.025)) } as Parts),
    bdrum: () => ({ varnish: [new THREE.CylinderGeometry(0.46, 0.46, 0.42, 16, 1, true).rotateX(Math.PI / 2).translate(0, 1.0, 0)], drumHead: [new THREE.CylinderGeometry(0.46, 0.46, 0.44, 16).rotateX(Math.PI / 2).translate(0, 1.0, 0)], black: [box(0.08, 0.55, 0.08, -0.35, 0.28, 0), box(0.08, 0.55, 0.08, 0.35, 0.28, 0), box(0.9, 0.05, 0.3, 0, 0.03, 0)] } as Parts),
    harp: () => { // gilded frame: pillar, curved neck, sound box; player seated behind it
      const p = arms(seatedBody(), [[-0.17, 1.2, -0.05], [-0.2, 1.15, -0.42]], [[0.17, 1.2, -0.05], [0.18, 1.25, -0.4]]);
      const neck: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 6; i++) { const t0 = (i / 6) * 1.3, t1 = ((i + 1) / 6) * 1.3; neck.push(B([0, 0.5 + 1.3 * Math.sin(t0), -0.45 - 1.05 * Math.cos(t0)], [0, 0.5 + 1.3 * Math.sin(t1), -0.45 - 1.05 * Math.cos(t1)], 0.04)); }
      p.gold = [B([0, 0.1, -1.5], [0, 1.85, -1.45], 0.05), ...neck, box(0.22, 0.3, 1.3, 0, 0.36, -0.8, -0.45)]; // pillar, neck, sound box (tilted into the lap)
      p.silver = Array.from({ length: 16 }, (_, i) => { const t = (i / 16) * 1.3; return B([0, 0.5 + 1.3 * Math.sin(t), -0.45 - 1.05 * Math.cos(t)], [0, 0.55 + 0.45 * (i / 16), -0.55 - 0.9 * (i / 16)], 0.004); });
      return p;
    },
    piano: () => { // grand piano, lid up, pianist on the bench
      const p = arms(seatedBody(), [[-0.17, 1.2, -0.05], [-0.22, 0.98, -0.42]], [[0.17, 1.2, -0.05], [0.22, 0.98, -0.42]]);
      p.black = [box(1.55, 0.32, 2.3, 0, 1.11, -1.75), box(1.55, 0.04, 2.0, 0, 0, -1.0, 0).rotateX(0.95).translate(0, 1.29, -0.6), box(0.04, 0.9, 0.04, 0.35, 1.74, -1.4), box(1.55, 0.12, 0.3, 0, 1.05, -0.52), box(0.9, 0.08, 0.35, 0, 0.5, 0.05), ...([[-0.65, -0.75], [0.65, -0.75], [0, -2.7]] as XZ[]).map(([x, z]) => box(0.09, 0.95, 0.09, x, 0.48, z))];
      p.shirt!.push(box(1.35, 0.05, 0.22, 0, 1.05, -0.55)); // keys
      return p;
    },
  };
  const materials = { suit: M.suit, skin: M.musician, hair: M.hair, shirt: M.shirt, varnish: M.varnish, gold: M.gold, bow: M.cream, black: M.black, silver: M.silver, copper: M.copper, drumHead: M.drumHead } as const;
  const buckets: Record<string, THREE.BufferGeometry[]> = {}; // one merged mesh per material for all musicians + the conductor
  const place = (parts: Parts, slot: Slot) => {
    const m = new THREE.Matrix4().makeRotationY(slot.yaw).setPosition(slot.x, slot.y, slot.z);
    for (const [part, geos] of Object.entries(parts) as [keyof typeof materials, THREE.BufferGeometry[]][]) (buckets[part] ??= []).push(...geos.map((g) => g.applyMatrix4(m)));
  };
  for (const slot of slots) place(kinds[slot.kind](), slot);
  // black chairs under every seated player, music stands with open folders + a white sheet
  const chair = mergeGeometries([box(0.44, 0.04, 0.44, 0, 0.45, 0), box(0.44, 0.4, 0.04, 0, 0.67, 0.2), ...([[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]] as XZ[]).map(([x, z]) => box(0.03, 0.45, 0.03, x, 0.22, z))], false)!;
  instanced(chair, M.black, slots.filter((s) => s.seated && s.kind !== 'piano'));
  const stands = standSlots(slots);
  instanced(mergeGeometries([box(0.025, 1.0, 0.025, 0, 0.5, 0), box(0.36, 0.02, 0.36, 0, 0.01, 0), box(0.44, 0.34, 0.02, 0, 1.12, -0.02, -0.35)], false)!, M.black, stands);
  instanced(box(0.38, 0.27, 0.012, 0, 1.13, -0.045, -0.35), M.darkWood, stands); // open folder
  instanced(box(0.3, 0.22, 0.004, 0, 1.14, -0.055, -0.35), M.shirt, stands); // sheet
  // conductor on the podium: low rail, baton raised, left arm spread
  const cx = 0, cz = ORCH.c.z, cy = y + 0.2;
  add(new THREE.BoxGeometry(1.5, 0.2, 1.5).translate(cx, y + 0.1, cz), M.darkWood);
  merged([[-0.7, 0.7], [0.7, 0.7], [0, 0.7]].map(([x, z]) => new THREE.BoxGeometry(0.03, 0.55, 0.03).translate(cx + x, y + 0.47, cz + z)).concat(new THREE.BoxGeometry(1.46, 0.03, 0.03).translate(cx, y + 0.74, cz + 0.7)), M.brass);
  place({
    suit: [box(0.3, 0.9, 0.2, 0, 0.45, 0), new THREE.CapsuleGeometry(0.18, 0.46, 1, 8).translate(0, 1.24, 0), box(0.46, 0.09, 0.24, 0, 1.46, 0), B([0.18, 1.5, 0], [0.6, 1.95, -0.3], 0.07), B([-0.18, 1.5, 0], [-0.75, 1.55, -0.35], 0.07)], // right arm up with the baton, left arm spread
    shirt: [box(0.13, 0.3, 0.03, 0, 1.3, -0.17)],
    ...head(1.7, -0.02),
    bow: [B([0.6, 1.95, -0.3], [0.78, 2.3, -0.55], 0.012)],
  }, { x: cx, y: cy, z: cz, yaw: 0 });
  (buckets.skin ??= []).push(new THREE.SphereGeometry(0.045, 6, 4).translate(0.6, cy + 1.95, cz - 0.3), new THREE.SphereGeometry(0.045, 6, 4).translate(-0.75, cy + 1.55, cz - 0.35));
  for (const [part, geos] of Object.entries(buckets) as [keyof typeof materials, THREE.BufferGeometry[]][]) merged(geos, materials[part]).castShadow = true;
  // silver truss on cables with 12 lamps (the spot lights are placed there already)
  const truss = trussBars();
  add(truss.bars, M.truss);
  instanced(mergeGeometries([new THREE.CylinderGeometry(0.11, 0.19, 0.36, 10).translate(0, -0.18, 0), new THREE.CylinderGeometry(0.04, 0.04, 0.12, 6)], false)!, M.black, truss.lamps);
  instanced(new THREE.CylinderGeometry(0.16, 0.16, 0.03, 10).translate(0, -0.37, 0), M.lamp, truss.lamps); // lenses
  // flower arrangements on pedestals at the stage corners
  const blooms: Slot[] = [], leaves: Slot[] = [], peds: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const x = s * (halfW - 1.3), z = H.zFront - 1.2;
    peds.push(new THREE.CylinderGeometry(0.22, 0.28, 1.0, 12).translate(x, y + 0.5, z), new THREE.CylinderGeometry(0.16, 0.1, 0.4, 10).translate(x, y + 1.2, z));
    for (let i = 0; i < 36; i++) {
      const t = i * 2.4, r = 0.12 + 0.3 * Math.sqrt((i % 12) / 12), h = y + 1.45 + 0.55 * ((i * 7) % 5) / 5;
      (i % 4 ? blooms : leaves).push({ x: x + r * Math.cos(t), y: h, z: z + r * Math.sin(t), yaw: t });
    }
  }
  merged(peds, M.cream);
  instanced(new THREE.SphereGeometry(0.09, 7, 5), M.flower, blooms);
  instanced(new THREE.BoxGeometry(0.16, 0.02, 0.08), M.leaf, leaves);
  // red / orange uplight wash on the organ wall + a warm key on the orchestra
  for (const x of [-9.5, -3.5, 3.5, 9.5]) pt(x, y + 1.2, H.stage.back + 2.2, '#ff2e0e', 90, 11);
  pt(0, y + 7, ORCH.c.z - 4, '#ffd9a8', 120, 14);
}

// ---- lights --------------------------------------------------------------------------------------------------------
scene.add(new THREE.HemisphereLight('#ffdfb8', '#4a3020', 0.38));
const pt = (x: number, y: number, z: number, color: string, cd: number, dist = 0) => {
  const l = new THREE.PointLight(color, cd, dist, 2);
  l.position.set(x, y, z);
  scene.add(l);
  return l;
};
for (const [x, z] of ellipsePts(H.oval.rings[0][0] - 1.2, H.oval.rings[0][1] - 1.2, 8)) pt(x, H.ceilY - 2.2, z, '#ffcf8a', 38, 16); // cove glow, hung below the cove so the band has no hot spot
for (const [x, z] of ellipsePts(H.oval.rings[2][0] - 0.8, H.oval.rings[2][1] - 0.8, 4)) pt(x, H.ceilY + H.oval.lift[1] - 0.3, z, '#ffd89a', 22, 10);
pt(H.chandelier.x, H.ceilY - 3.2, H.chandelier.z, '#ffe2b0', 110);
for (const t of H.tiers) for (const s of [-1, 1]) pt(s * (H.halfW - 2), t.y + 3, 6, '#ffc98a', 60, 14); // balcony wall wash
for (const s of [-1, 1]) pt(s * (H.stage.halfW - 0.5), H.stage.y + 6, H.stage.back + 4, '#3d6cff', 90, 12); // blue accents
/** Additive light cone from the truss to the stage (volumetric look); two nested shells. */
function lightCone(p: THREE.Vector3, t: THREE.Vector3, r1: number) {
  const len = p.distanceTo(t), m = new THREE.Matrix4().lookAt(p, t, new THREE.Vector3(0, 1, 0)).setPosition(p.clone().add(t).multiplyScalar(0.5));
  for (const k of [1, 0.6]) add(new THREE.CylinderGeometry(0.2 * k, r1 * k, len, 18, 1, true).rotateX(Math.PI / 2).rotateX(Math.PI).applyMatrix4(m), M.cone);
}
const spot = (x: number, tx: number, tz: number, cd: number, shadow = false) => {
  const s = new THREE.SpotLight('#fff0d0', cd, 0, 0.6, 0.6, 1.6);
  s.position.set(x, H.stage.truss.y - 0.6, H.stage.truss.z);
  s.target.position.set(tx, H.stage.y, tz);
  if (shadow) {
    s.castShadow = true;
    s.shadow.mapSize.set(1024, 1024);
    s.shadow.camera.near = 4;
    s.shadow.camera.far = 20;
    s.shadow.bias = -0.0005;
  }
  scene.add(s, s.target);
  if (POST) lightCone(s.position.clone(), s.target.position.clone(), 4.5);
};
spot(-6, -4, -14, 330);
spot(0, 0, -13, 380, true);
spot(6, 4, -14, 330);
spot(-3, -2, -18, 200);
spot(3, 2, -18, 200);

if (q.get('stage') !== 'empty') orchestra();

// ---- camera + free-fly + post --------------------------------------------------------------------------------------
// dev hook + ?seat=<label>: floating marker over the seat and a camera 2.5 m behind it
Object.assign(window, { __HALL__: { seat: (row: string, num: number) => stalls.seats.find((s) => s.row === row && s.num === num && !s.rear), label: seatLabel } });
const picked = q.get('seat') ? stalls.seats.find((s) => seatLabel(s) === q.get('seat')!.toUpperCase()) : undefined;
if (picked) add(new THREE.SphereGeometry(0.18, 12, 8).translate(picked.x, picked.y + 1.6, picked.z), std({ color: '#ffe36b', emissive: '#ffb400', emissiveIntensity: 3 }));
const VIEWS: Record<string, [THREE.Vector3, THREE.Vector3]> = {
  stalls: [v3(0, 4.3, 15), v3(0, 12.5, -14)],
  balcony: [v3(0, 14.6, 25.5), v3(0, 8.5, -14)],
  stage: [v3(-1, 2.9, -6.5), v3(0.5, 10.5, 20)],
  ceiling: [v3(0, 4.5, 9), v3(0, 22, 10.5)],
  side: [v3(-9, 9.5, 9), v3(10, 9, -8)],
  stage_close: [v3(-1.6, 1.7, -6.3), v3(0.3, 2.4, -13)], // eye height just in front of row A
  plan: [v3(0, 19.5, 10), v3(0, 0, 10)],
};
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 120);
const [from, to] = picked ? [v3(picked.x, picked.y + 2.2, picked.z + 2.8), v3(picked.x, picked.y + 0.9, picked.z)] : VIEWS[q.get('view') ?? 'stalls'] ?? VIEWS.stalls;
camera.position.copy(from);
camera.lookAt(to);
const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
if (PLAN) { // straight down, +z (the rear) up the screen so the stage is at the bottom like the seat map; upper storeys hidden
  euler.set(-Math.PI / 2, Math.PI, 0);
  camera.fov = 100;
  camera.updateProjectionMatrix();
  scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.geometry.computeBoundingBox();
    if (o.geometry.boundingBox!.min.y > 4.5) o.visible = false;
  });
}
if (q.get('cam')) {
  const [x, y, z, yaw, pitch] = q.get('cam')!.split(',').map(Number);
  camera.position.set(x, y, z);
  euler.set(THREE.MathUtils.degToRad(pitch), THREE.MathUtils.degToRad(yaw), 0);
}
// ?tour=1: slow dolly on a spline through the stalls to the stage, then rising to the dome (60 s loop)
const tourPath = new THREE.CatmullRomCurve3([v3(0, 5.2, 24), v3(-3, 4.4, 10), v3(-2, 3.4, -2), v3(4, 3.6, -6), v3(2, 7.5, 2), v3(0, 11, 8), v3(-4, 13, 16), v3(0, 8.5, 26)], true, 'catmullrom', 0.4);
const tourLook = new THREE.CatmullRomCurve3([v3(0, 6, -14), v3(0, 4, -14), v3(0, 3, -14), v3(-2, 9, -12), v3(0, 17, 0), v3(0, 21, 10), v3(0, 14, -6), v3(0, 9, -10)], true, 'catmullrom', 0.4);
const keys = new Set<string>();
addEventListener('keydown', (e) => keys.add(e.code));
addEventListener('keyup', (e) => keys.delete(e.code));
renderer.domElement.addEventListener('click', () => renderer.domElement.requestPointerLock());
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== renderer.domElement) return;
  euler.y -= e.movementX * 0.0022;
  euler.x = THREE.MathUtils.clamp(euler.x - e.movementY * 0.0022, -1.5, 1.5);
});
// post: ACES + sRGB output, bloom on the display image (near-white only), then a warm vignette
const composer = POST ? new EffectComposer(renderer) : null;
if (composer) {
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new OutputPass()); // ACES + sRGB first: the bloom then only picks near-white pixels (ribbons, lamps, hot spots)
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.38, 0.45, 0.9));
  composer.addPass(new ShaderPass({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); float d = distance(vUv, vec2(0.5)); c.rgb *= 1.0 - 0.42 * smoothstep(0.3, 0.95, d); c.rgb = mix(c.rgb, c.rgb * vec3(1.05, 0.97, 0.88), 0.45); gl_FragColor = c; }',
  }));
}
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer?.setSize(innerWidth, innerHeight);
});
const clock = new THREE.Clock();
let frames = 0, tourT = 0;
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1), v = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 14 : 4) * dt;
  if (TOUR) {
    tourT = (tourT + dt / 60) % 1;
    camera.position.copy(tourPath.getPointAt(tourT));
    camera.lookAt(tourLook.getPointAt(tourT));
    euler.setFromQuaternion(camera.quaternion, 'YXZ');
  }
  camera.quaternion.setFromEuler(euler);
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion), right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  if (keys.has('KeyW')) camera.position.addScaledVector(fwd, v);
  if (keys.has('KeyS')) camera.position.addScaledVector(fwd, -v);
  if (keys.has('KeyD')) camera.position.addScaledVector(right, v);
  if (keys.has('KeyA')) camera.position.addScaledVector(right, -v);
  if (keys.has('KeyE')) camera.position.y += v;
  if (keys.has('KeyQ')) camera.position.y -= v;
  if (composer) { renderer.info.autoReset = false; renderer.info.reset(); composer.render(); } else renderer.render(scene, camera);
  if (++frames !== 3) return;
  const { calls, triangles } = renderer.info.render;
  Object.assign(window, { __STATS__: { calls, triangles, seats: seats.length }, __READY__: true });
});
