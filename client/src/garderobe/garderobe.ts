// DEV ROOM (client/garderobe.html): "Phòng trưng bày GardeRobe MannekenPis" standalone — its own scene / renderer / loop around
// garderobeRoom.ts `mountRoom` at the dev frame (room-local = world; the race mounts the same module into the game's scene
// under the box the team opened: main.ts). Params and controls: garderobeRoom.ts (`?hq=1` = shadows / bloom / every spot;
// view=overview|plan|street, n=1..4 close-up, window.__GARDEROBE__.{focus,reset}). Sets window.__READY__ after the photos
// loaded, 3 frames and any close-up glide, window.__STATS__ {calls, triangles, vitrines}.
import * as THREE from 'three';
import { mountRoom, DOOR_Z } from './garderobeRoom.ts';
import { devFrame } from '../rooms/roomFrame.ts';

const q = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.append(renderer.domElement);
const room = await mountRoom({ renderer, q, scene: new THREE.Scene(), frame: devFrame(DOOR_Z), hq: q.get('hq') === '1' });
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); room.resize!(); });
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  room.update(Math.min(clock.getDelta(), 0.1));
  room.render!();
  if (!room.settled() || (window as { __READY__?: boolean }).__READY__) return;
  Object.assign(window, { __STATS__: { ...room.stats(), vitrines: 4 }, __READY__: true });
});
