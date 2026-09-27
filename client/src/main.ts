import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { flyCamera, render as R, ui } from './config.ts';
import { GameLoop } from './core/GameLoop.ts';
import { Input } from './core/Input.ts';
import { FreeFlyCamera } from './player/FreeFlyCamera.ts';
import { createDebugOverlay } from './ui/DebugOverlay.ts';
import { createDevScene } from './world/DevScene.ts';

const $ = (id: string) => document.getElementById(id)!;

function fail(message: string, cause?: unknown) {
  if (cause !== undefined) console.error(cause);
  const box = $('error');
  box.textContent = message + (cause === undefined ? '' : `\n\nChi tiết: ${String(cause)}`);
  box.hidden = false;
}

async function start() {
  // Probe on a throwaway canvas: a second getContext() on three's canvas would ignore its attributes.
  if (!document.createElement('canvas').getContext('webgl2')) {
    return fail(
      'Trình duyệt hoặc card đồ họa của bạn không hỗ trợ WebGL2 nên không chạy được game. ' +
        'Hãy cập nhật Chrome, Edge, Firefox hoặc Safari và bật "tăng tốc phần cứng" trong cài đặt trình duyệt.',
    );
  }
  await RAPIER.init();

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = R.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // r186 removed PCFSoftShadowMap; PCF is soft via light.shadow.radius
  document.body.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(R.background);
  scene.fog = new THREE.Fog(R.background, R.fogNear, R.fogFar);
  const camera = new THREE.PerspectiveCamera(R.fov, 1, R.near, R.far);
  const resize = () => {
    renderer.setPixelRatio(Math.min(devicePixelRatio, R.maxPixelRatio));
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  };
  resize();
  addEventListener('resize', resize);

  const world = createDevScene(scene);
  const input = new Input(renderer.domElement);
  const fly = new FreeFlyCamera(camera);

  // Deterministic views for screenshots: ?cam=x,y,z,yawDeg,pitchDeg and ?debug=1
  const query = new URLSearchParams(location.search);
  const cam = query.get('cam')?.split(',').filter(Boolean).map(Number); // empty fields → not 5 numbers → spawn
  const s = flyCamera.spawn;
  const [x, y, z, yawDeg, pitchDeg] = cam?.length === 5 && cam.every(Number.isFinite) ? cam : [s.x, s.y, s.z, s.yawDeg, s.pitchDeg];
  fly.setPose(x, y, z, yawDeg, pitchDeg);
  const debug = createDebugOverlay(query.get('debug') === '1');

  // Esc releases the pointer (the browser eats the key), so "unlocked" = help/menu is showing.
  const help = $('help');
  help.hidden = false;
  input.onPointerLockChange = (locked) => void (help.hidden = locked);
  input.onImeSuspected = () => {
    const notice = $('ime');
    notice.hidden = false;
    setTimeout(() => void (notice.hidden = true), ui.imeNoticeMs);
  };

  let ready = false;
  const loop = new GameLoop({
    fixedUpdate: () => world.step(),
    update: (dt) => {
      input.poll();
      if (input.wasPressed('debug')) debug.toggle();
      fly.update(dt, input);
      input.endFrame();
    },
    render: () => {
      renderer.render(scene, camera);
      debug.update({
        fps: loop.fps,
        workMs: loop.workMs,
        renderer,
        position: camera.position,
        speed: fly.speed,
        bodies: world.bodyCount,
      });
      // Signal for scripts/screenshot.ts: a few frames drawn and the dropped boxes at rest.
      if (!ready && loop.frames >= 3 && world.settled) {
        ready = true;
        Object.assign(window, { __READY__: true });
      }
    },
  });
  loop.start();
}

addEventListener('error', (e) => fail('Game gặp lỗi. Hãy tải lại trang.', e.error));
start().catch((err: unknown) =>
  fail('Không khởi động được game. Hãy tải lại trang; nếu vẫn lỗi, hãy thử trình duyệt khác (Chrome, Edge, Firefox, Safari).', err),
);
