// DEV ROOM (client/choco.html): "Xưởng sô-cô-la" standalone — its own scene / renderer / loop around chocoRoom.ts `mountRoom`
// at the dev frame (room-local = world; the race mounts the same module into the game's scene under the branch box: main.ts).
// Params and controls: chocoRoom.ts (`?hq=1` = shadows / bloom / steam / every lamp). Sets window.__READY__ after 3 frames
// (+ the iframe load with open=1), window.__STATS__ {calls, triangles, tables}.
import * as THREE from 'three';
import { R } from './chocoBuild.ts';
import { mountRoom } from './chocoRoom.ts';
import { devFrame } from '../rooms/roomFrame.ts';

const q = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);
const room = await mountRoom({ renderer, q, scene: new THREE.Scene(), frame: devFrame(R.zFront), hq: q.get('hq') === '1' });
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); room.resize!(); });
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  room.update(Math.min(clock.getDelta(), 0.1));
  room.render!();
  if (!room.settled() || (window as { __READY__?: boolean }).__READY__) return;
  Object.assign(window, { __STATS__: { ...room.stats(), tables: 11 }, __READY__: true });
});
