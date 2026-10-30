// DEV ROOM (client/hallroom.html; this file is hallRoomDev.ts, not hallroom.ts: that name collides with hallRoom.ts on a
// case-insensitive disk): the Henry Le Bœuf race room standalone — its own scene / renderer / loop around hallRoom.ts `mountRoom` at the dev frame (room-local = world; the race mounts the same module into the game's scene under
// the BOZAR box: main.ts). Params and controls: hallRoom.ts (`?hq=1` = the full hall.html look; walk mode by default,
// view=stalls|stage|exit|plan / cam= = free camera; window.__HALLROOM__.{room, exit}). Sets window.__READY__ once the walker
// stands and 3 frames rendered, window.__STATS__ {calls, triangles}.
import * as THREE from 'three';
import { mountRoom, DOOR_Z, EXIT } from './hallRoom.ts';
import { devFrame } from '../rooms/roomFrame.ts';

const q = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.append(renderer.domElement);
const room = await mountRoom({ renderer, q, scene: new THREE.Scene(), frame: devFrame(DOOR_Z), hq: q.get('hq') === '1' });
Object.assign(window, { __HALLROOM__: { room, exit: EXIT } });
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); room.resize!(); });
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  room.update(Math.min(clock.getDelta(), 0.1));
  room.render!();
  if (!room.settled() || (window as { __READY__?: boolean }).__READY__) return;
  Object.assign(window, { __STATS__: { ...room.stats(), exitHit: room.exitHit(), seat: document.querySelector<HTMLElement>('#hr-prompt')?.textContent || null }, __READY__: true });
});
