// DEV PAGE (client/cetiqlo.html): the CETIQLO store standalone (storeScene.ts `buildStore` at the dev frame: room-local =
// world, floor at 0) with an orbit camera, an item list, floor toggle and close-ups. The race room (cetiqloRoom.ts, the room
// agent) mounts the same store under the box. Params: view=overview|floor1|floor2|tops|shoes|checkout|mannequin|facade ·
// cam=x,y,z,tx,ty,tz · item=<catalog id> (1.5 m close-up at 1.7 m eye height) · floor=1|2 (show one floor) · set=id,id,…
// (dress the mannequin; default a sample set) · pip=1 (draw the PiP bottom-right) · walk=1 (the game's body + WASD instead
// of the orbit camera, spawn=x,z,yawDeg, autoMove=walk|sprint) · hq=1 (brighter environment). window.__CETIQLO__ = {store,
// focus(id)}; window.__READY__ after 3 frames, window.__STATS__ {calls, triangles, meshes, lights}.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { CATALOG, COLOURS, ITEM_BY_ID, SHAPE_H, STORE } from '@race/shared/cetiqlo';
import { createRoomPlayer, type RoomPlayer } from '../rooms/roomPlayer.ts';
import { buildStore, FLOOR2_Y } from './storeScene.ts';

const q = new URLSearchParams(location.search);
const HQ = q.get('hq') === '1';
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = HQ ? 1.05 : 1.0;
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#dfe3e8');
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = HQ ? 0.7 : 0.4;
const store = buildStore(scene, { hq: HQ });
const floor = Number(q.get('floor') ?? 0) as 0 | 1 | 2;
if (floor) store.showFloor(floor);
const SAMPLE = ['top.polo-dryex.red', 'outer.uld-jacket.navy', 'bottom.jeans-wide.lightdenim', 'shoes.sneaker.white', 'bag.round-mini-bag.beige', 'acc.cap.black'];
const SET = (q.get('set') ?? SAMPLE.join(',')).split(',').filter(Boolean);
store.mannequin.dress(SET);
store.brief.dress(SET);

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.05, 200);
const PD = STORE.pedestal, CK = STORE.checkout;
const VIEWS: Record<string, [number[], number[]]> = {
  overview: [[-30, 22, 40], [0, 2, -8]],
  floor1: [[0, 22, 20], [0, 0, -10]],
  floor2: [[0, 24, 10], [0, FLOOR2_Y, -12]],
  tops: [[-12.5, 1.7, 0.5], [-15.7, 1.25, -1.5]],
  shoes: [[-6, FLOOR2_Y + 1.7, -27], [-6, FLOOR2_Y + 1.1, -29.7]],
  checkout: [[-1.2, 1.9, 12.2], [CK.x, 0.9, CK.z - 1]],
  mannequin: [[0.3, 1.6, 8.6], [PD.x, 1.1, PD.z]],
  facade: [[3, 3.5, 31], [0, 4, STORE.doorZ]],
  patterns: [[0.5, 1.7, -1.6], [0, 1.2, -4.7]], // the shirts island: gingham / pinstripe / floral side by side
  pants: [[-12.6, FLOOR2_Y + 1.7, -2.5], [-15.7, FLOOR2_Y + 1.1, -5.5]], // floor 2 west wall: the pants rail
  outer: [[9.5, 1.7, -10.6], [9.5, 1.2, -13.7]], // fashion outerwear island
  'floor1-wide': [[0, 28, 30], [0, 0, -10]],
  'hang-wide': [[-4.5, 1.7, 2.5], [-4.5, 1.3, -12]], // a wide rail aisle at eye height (between the tees and shirts islands)
  'wall-shoes': [[-6, FLOOR2_Y + 1.7, -26.5], [-6, FLOOR2_Y + 1.0, -29.7]],
  'floor2-wide': [[0, 30, 16], [0, FLOOR2_Y, -12]],
  'wall-acc': [[-3, 1.7, -28.2], [-1, 1.45, -29.7]], // floor 1 back wall: hats / scarves on three tiers, from the back aisle
  'wall-bags': [[-10.5, 1.7, -28.2], [-9, 1.3, -29.7]],
  checkout2: [[-2.6, 1.7, 11.6], [-4.5, 1.3, 6.0]], // the checkout counter + slat wall from the lobby door
  fitting: [[-10, FLOOR2_Y + 1.7, -18.6], [-14.6, FLOOR2_Y + 1.3, -20.4]], // floor 2: the fitting cabins + bench
  'model-set': [[0, 1.5, 4.2], [0, 1.0, 0]], // ?models=1: three dressed figures side by side at the origin
  cards: [[1.4, 1.5, 9.4], [PD.x + 0.3, 1.0, PD.z]], // ?cards=1: the lookbook grid beside the pedestal model
  brief: [[0, 1.7, 9.8], [0, 1.1, PD.z]], // the entrance (+ ?brief=1: the HUD PiP); ?briefs=1: three grids at the origin (dev only)
  briefs: [[0, 1.8, 7.4], [0, 1.4, 0]],
  lineup: [[0, 1.85, 4.9], [0, 1.85, 1.3]],
  'lineup-tops': [[0, 2.2, 6.6], [0, 2.15, 1.3]],
  'lineup-outer': [[0, 2.2, 5.6], [0, 2.15, 1.3]],
  'lineup-shoes': [[0, 1.45, 6.2], [0, 1.35, 1.3]], // ?lineup=shoes: 9 shoes + 3 socks, white row over black row // ?lineup=1: 16 bottoms in two rows on a white wall across the atrium (grey / navy where possible)
};
const label = document.createElement('div');
label.id = 'cq-label';
document.body.append(label);
let controls: OrbitControls | null = null, walk: RoomPlayer | null = null;
const extras: { update(dt: number): void }[] = [];
// ?models=1: three extra turning figures side by side at the origin wearing three sets (the dressed-model check)
const MODEL_SETS = [
  ['top.shirt-gingham.white-blue', 'outer.bomber.olive', 'bottom.jeans-wide-wash.denim-lightdenim', 'shoes.sneaker.white', 'bag.crossbody.black', 'acc.bucket-hat.beige'],
  ['top.tee-breton.white-navy', 'outer.trench.beige', 'bottom.skirt-pleated-tartan.red-black', 'shoes.boot.black', 'bag.tote-stripe.cream-navy', 'acc.cap-stripe.navy-white'],
  ['top.turtleneck.wine', 'outer.down.red', 'bottom.cargo.olive', 'shoes.loafer.brown', 'bag.backpack-camo.khaki-olive', 'acc.scarf-houndstooth.black-white'],
];
if (q.get('lineup') || q.get('patternBoard') === '1') store.mannequin.object.visible = false; // the wall boards stand in front of the pedestal
/** `&colour=<COLOURS key>` recolours a lineup (tops / outer / bottoms): the dark-garment detail check (black, navy, charcoal…). */
const lineupColour = ((): { name: string; hex: string } | null => { const k = q.get('colour') as keyof typeof COLOURS | null; const c = k && COLOURS[k]; return c ? { name: c[0], hex: c[1] } : null; })();
if (q.get('patternBoard') === '1') { // every pattern on the same navy / white tee, two rows on a white wall: the pattern audit
  const { itemMesh } = await import('./items.ts');
  const { PATTERN_IDS } = await import('./patterns.ts');
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(14, 4.2), new THREE.MeshStandardMaterial({ color: '#f7f7f4' }));
  wall.position.set(0, 2.1, 1.0); scene.add(wall);
  const base = CATALOG.find((it) => it.id === 'top.tee-crew.navy')!;
  PATTERN_IDS.forEach((pattern, i) => {
    const m = itemMesh({ ...base, id: `audit.${pattern}`, pattern, colour2: { name: 'Trắng', hex: '#F2F2F0' } });
    m.position.set((i % 8 - 3.5) * 0.74, i < 8 ? 2.5 : 1.3, 1.3);
    scene.add(m);
  });
}
if (q.get('lineup') === 'tops' || q.get('lineup') === 'outer') { // every top / outer family once, one neutral colour, on a clean wall
  const { itemMesh } = await import('./items.ts');
  const tops = ['tee', 'tee-v', 'tee-long', 'tank', 'crop', 'tee-oversized', 'tee-raglan', 'tee-pocket', 'tee-henley', 'polo', 'polo-long', 'shirt', 'shirt-short', 'shirt-band', 'shirt-camp', 'blouse', 'hoodie', 'hoodie-zip', 'sweatshirt', 'quarter-zip', 'sweater', 'sweater-chunky', 'knit-v', 'turtleneck', 'mockneck', 'cardigan', 'knit-vest'] as const;
  const outer = ['parka', 'uv-zip', 'bomber', 'fleece', 'fleece-pullover', 'down', 'down-long', 'puffer-vest', 'blazer', 'trench', 'coach', 'denim-jacket', 'wool-coat', 'padded'] as const;
  const shapes: readonly string[] = q.get('lineup') === 'tops' ? tops : outer;
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(16, 4.4), new THREE.MeshStandardMaterial({ color: '#f7f7f4' }));
  wall.position.set(0, 2.2, 1.0); scene.add(wall);
  const cols = Math.ceil(shapes.length / 2);
  shapes.forEach((shape, i) => {
    const pick = CATALOG.filter((it) => it.shape === shape && !it.pattern);
    const it = pick.find((x) => x.colour.name === 'Xám') ?? pick.find((x) => x.colour.name === 'Be') ?? pick.find((x) => x.colour.name === 'Xanh navy') ?? pick[0];
    if (!it) return;
    const m = itemMesh({ ...it, colour: lineupColour ?? { name: 'Be', hex: '#D8C9A8' } });
    m.position.set((i % cols - (cols - 1) / 2) * (shapes.length > 16 ? 0.7 : 0.9), i < cols ? 3.0 : 1.35, 1.3);
    scene.add(m);
  });
}
if (q.get('lineup') === 'shoes') { // every shoe / sock shape in white AND black on two boards: same colour, the silhouette + details alone must tell them apart
  const { itemMesh, SHAPE_IDS } = await import('./items.ts');
  const shapes = SHAPE_IDS.filter((s) => s.startsWith('socks') || /^(sneaker|running-shoe|slip-on|sneaker-hi|loafer|boot-chelsea|boot|sandal|slipper)$/.test(s));
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(10, 3.2), new THREE.MeshStandardMaterial({ color: '#f7f7f4' }));
  wall.position.set(0, 1.6, 1.0); scene.add(wall);
  const base = CATALOG.find((it) => it.id === 'shoes.sneaker.white')!;
  [{ name: 'Trắng', hex: '#F4F2EE' }, { name: 'Đen', hex: '#2A2A2E' }].forEach((colour, row) => {
    const y = row ? 0.95 : 1.75;
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(9, 0.03, 0.6), new THREE.MeshStandardMaterial({ color: '#ffffff' })).translateY(y - 0.015).translateZ(1.3));
    shapes.forEach((shape, i) => {
      const m = itemMesh({ ...base, id: `lineup.${shape}.${row}`, shape, colour, pattern: undefined, finish: shape.startsWith('socks') ? 'knit' : shape === 'loafer' || shape.startsWith('boot') ? 'shiny' : 'cotton' });
      const sock = shape.startsWith('socks');
      m.scale.setScalar(1.6);
      m.position.set((i - (shapes.length - 1) / 2) * 0.72, y + SHAPE_H[shape] * 0.8 + 0.005, 1.3); // standing on the board (centre = SHAPE_H / 2 × scale)
      m.rotation.y = sock ? 0 : -0.5; // shoes three-quarter, toe toward the camera's right
      scene.add(m);
    });
  });
}
if (q.get('lineup') === '1') { // every bottom shape once, same colour where possible, hung on a clean wall: the silhouettes alone must differ
  const { itemMesh } = await import('./items.ts');
  const shapes = ['sweatpants', 'jogger', 'straight', 'pants', 'chinos', 'cargo', 'wide', 'jeans-straight', 'jeans-wide', 'bootcut', 'jeans-baggy', 'jeans-tapered', 'bermuda', 'shorts', 'shorts-chino', 'cycling'] as const;
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(14, 4.2), new THREE.MeshStandardMaterial({ color: '#f7f7f4' }));
  wall.position.set(0, 2.1, 1.0); scene.add(wall); // faces +z, under the floor-2 edge
  shapes.forEach((shape, i) => {
    const pick = CATALOG.filter((it) => it.shape === shape && !it.pattern);
    const it = pick.find((x) => x.colour.name === 'Xám') ?? pick.find((x) => x.colour.name === 'Xanh navy') ?? pick.find((x) => x.colour.name === 'Đen') ?? pick[0];
    if (!it) return;
    const m = itemMesh(lineupColour ? { ...it, colour: lineupColour } : it);
    m.position.set((i % 8 - 3.5) * 0.74, i < 8 ? 2.5 : 1.15, 1.3);
    scene.add(m);
  });
}
if (q.get('briefs') === '1') { // three sets as rings side by side at the origin
  const { createBrief } = await import('./brief.ts');
  MODEL_SETS.forEach((set, i) => {
    const b = createBrief({ turn: true, y: 1.45 });
    b.object.position.set((i - 1) * 4.0, 0, 0);
    b.object.traverse((ob) => ob.layers.enable(0)); // dev: show the grids in the room too
    b.phase = i * 0.7;
    b.dress(set);
    scene.add(b.object);
    extras.push(b);
  });
}
if (q.get('models') === '1') {
  const { createMannequin } = await import('./mannequin.ts');
  const { loadCharacterAsset } = await import('../player/CharacterModel.ts');
  const asset = await loadCharacterAsset();
  MODEL_SETS.forEach((set, i) => {
    const m = createMannequin({ turn: true, discR: 0.5, human: asset, avatar: (i % 2) as 0 | 1 });
    m.object.position.set((i - 1) * 1.6, 0.01, 0);
    m.dress(set);
    scene.add(m.object);
    extras.push(m);
  });
}
const look = (p: number[], t: number[]) => { camera.position.set(p[0]!, p[1]!, p[2]!); controls?.target.set(t[0]!, t[1]!, t[2]!); camera.lookAt(t[0]!, t[1]!, t[2]!); controls?.update(); };
/** Eye at 1.7 m over the item's floor, 1.5 m in front of it (its facing), looking at it. */
const focus = (id: string) => {
  const it = ITEM_BY_ID.get(id), a = store.itemAnchors.get(id);
  if (!it || !a) return;
  const fy = it.floor === 1 ? 0 : FLOOR2_Y;
  look([a.x + Math.sin(it.shelf.yaw) * 1.5, fy + 1.7, a.z + Math.cos(it.shelf.yaw) * 1.5], [a.x, a.y, a.z]);
  label.textContent = `${it.name} · ${it.colour.name} · ${it.material ?? ''} (${it.id})`;
};
if (q.get('walk') === '1') {
  const [x, z, yaw] = (q.get('spawn') ?? '').split(',').map(Number);
  const spot = STORE.startSpots[0];
  walk = await createRoomPlayer({ scene, camera, canvas: renderer.domElement, q, boxes: store.colliders, buttons: [], spawn: q.get('spawn') ? { x: x!, z: z!, yaw: THREE.MathUtils.degToRad(yaw || 0) } : { x: spot.x, z: spot.z, yaw: spot.yaw }, frozen: () => false, onPress: () => {} });
} else {
  controls = new OrbitControls(camera, renderer.domElement);
  const [p, t] = VIEWS[q.get('view') ?? 'overview'] ?? VIEWS.overview!;
  look(p, t);
  if (q.get('cam')) { const c = q.get('cam')!.split(',').map(Number); look(c.slice(0, 3), c.slice(3, 6)); }
  if (q.get('item')) focus(q.get('item')!);
  // item list
  const panel = document.createElement('div');
  panel.id = 'cq-panel';
  const sel = document.createElement('select');
  sel.innerHTML = `<option value="">— món (${CATALOG.length}) —</option>` + CATALOG.map((i) => `<option value="${i.id}">T${i.floor} · ${i.zone} · ${i.name} · ${i.colour.name}</option>`).join('');
  sel.onchange = () => focus(sel.value);
  panel.append(sel);
  for (const [name, v] of Object.entries(VIEWS)) { const b = document.createElement('button'); b.textContent = name; b.onclick = () => { label.textContent = ''; look(v[0], v[1]); }; panel.append(b); }
  const fb = document.createElement('button');
  let shown: 0 | 1 | 2 = floor;
  fb.textContent = 'tầng 1 / 2 / cả';
  fb.onclick = () => { shown = ((shown + 1) % 3) as 0 | 1 | 2; store.showFloor(shown); };
  panel.append(fb);
  document.body.append(panel);
}
Object.assign(window, { __CETIQLO__: { store, focus, CATALOG } });
if (q.get('atlas') === '1') { // the pattern atlas itself, top-left (original art check)
  const { patternAtlas } = await import('./patterns.ts');
  const img = (patternAtlas()!.image as HTMLCanvasElement);
  img.style.cssText = 'position:fixed;left:10px;top:60px;width:512px;height:512px;background:#888;z-index:9';
  document.body.append(img);
}
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
const clock = new THREE.Clock();
const PIP = q.get('pip') === '1' || q.get('view') === 'mannequin';
const { PIP_SIZE } = await import('./mannequin.ts');
let frames = 0;
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  store.update(dt, q.get('lod') === '0' ? undefined : camera.position); // the dev frame is room-local = world
  for (const e of extras) e.update(dt);
  walk?.update(dt);
  controls?.update();
  renderer.render(scene, camera);
  const { calls, triangles } = renderer.info.render;
  if (PIP) store.mannequin.renderPiP(renderer, { x: innerWidth - PIP_SIZE.w - 10, y: 10, w: PIP_SIZE.w, h: PIP_SIZE.h });
  if (q.get('brief') === '1') { const k = Number(q.get('briefScale') ?? 1), w = store.brief.size.w * k, h = store.brief.size.h * k; store.brief.renderPiP(renderer, { x: innerWidth - w - 10, y: 10, w, h }); }
  const human = store.group.getObjectByName('mannequin')?.getObjectByName('player_m') || store.group.getObjectByName('mannequin')?.getObjectByName('player_f');
  if ((human && ++frames === 3) || clock.elapsedTime > 8) {
    if (q.get('cards') === '1') { // the lookbook: the 6 product cards of the worn set beside the model (mannequin.thumbnails)
      const grid = document.createElement('div');
      grid.style.cssText = 'position:fixed;left:16px;top:70px;display:grid;grid-template-columns:repeat(2,170px);gap:8px;background:rgba(255,255,255,.9);padding:8px;border-radius:10px';
      for (const t of store.mannequin.thumbnails(SET, renderer, 160)) {
        const cell = document.createElement('div');
        cell.style.cssText = 'font:12px system-ui;text-align:center';
        if (t.canvas) { t.canvas.style.cssText = 'display:block;border-radius:8px'; cell.append(t.canvas); }
        cell.append(Object.assign(document.createElement('div'), { textContent: `${t.name} · ${t.colour}` }));
        grid.append(cell);
      }
      document.body.append(grid);
    }
    Object.assign(window, { __STATS__: { calls, triangles, meshes: store.budget().meshes, lights: store.budget().lights, human: !!human }, __READY__: true });
  }
});
