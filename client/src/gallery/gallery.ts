// DEV ROOM (client/gallery.html): "Phòng tranh truyện tranh" standalone — its own scene / renderer / loop around galleryRoom.ts
// `mountRoom` at the dev frame (room-local = world; the race mounts the same module into the game's scene under the branch
// box: main.ts). Params and controls: galleryRoom.ts (`?hq=1` = shadows / bloom / every light). Sets window.__READY__ after 3
// frames (and the game iframe's load), window.__STATS__ {calls, triangles, desks}.
import * as THREE from 'three';
import { G } from './galleryBuild.ts';
import { mountRoom } from './galleryRoom.ts';
import { devFrame } from '../rooms/roomFrame.ts';

const q = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.append(renderer.domElement);
const room = await mountRoom({ renderer, q, scene: new THREE.Scene(), frame: devFrame(G.halfL), hq: q.get('hq') === '1' });
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); room.resize!(); });
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  room.update(Math.min(clock.getDelta(), 0.1));
  room.render!();
  if (!room.settled() || (window as { __READY__?: boolean }).__READY__) return;
  Object.assign(window, { __STATS__: { ...room.stats(), desks: 11 }, __READY__: true });
});
