// Leg 3 rooms: the exit portal on the floor at the far end of a room (opposite the entrance), lit once the step is done
// (rooms/roomState.ts exitReady): a glowing ring, a light beam up to the ceiling, a floating "Ra khỏi phòng" label, a
// point light; pulses. The body walking inside `r` m of its centre leaves the room (main.ts). Hidden until set(true).
import { AdditiveBlending, CanvasTexture, CylinderGeometry, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, type Object3D, PointLight, RingGeometry, Sprite, SpriteMaterial, SRGBColorSpace } from 'three';

export const EXIT_LABEL = 'Ra khỏi phòng';

export interface ExitRing {
  set(on: boolean): void;
  readonly on: boolean;
  /** Feet (px, pz) inside the ring while it is on. */
  hit(px: number, pz: number): boolean;
  /** Pulse (t = seconds). */
  update(t: number): void;
  readonly x: number;
  readonly z: number;
}

function labelTexture(text: string): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(10,20,30,0.72)';
  g.beginPath();
  g.roundRect(16, 16, 480, 96, 28);
  g.fill();
  g.fillStyle = '#ffffff';
  g.font = 'bold 54px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 66);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** `h` = beam height (under the ceiling), `colour` = the ring's (default a cool cyan: reads in both the warm workshop and the
 *  daylit gallery). */
export function makeExitRing(scene: Object3D, x: number, z: number, h = 4.5, r = 1.0, colour = '#5ee8ff'): ExitRing {
  const g = new Group();
  g.position.set(x, 0, z);
  g.visible = false;
  const ring = new Mesh(new RingGeometry(r - 0.22, r, 48).rotateX(-Math.PI / 2).translate(0, 0.03, 0), new MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.95, blending: AdditiveBlending, depthWrite: false }));
  const disc = new Mesh(new RingGeometry(0.05, r - 0.25, 48).rotateX(-Math.PI / 2).translate(0, 0.025, 0), new MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.45, blending: AdditiveBlending, depthWrite: false }));
  const beamG = new CylinderGeometry(r * 0.45, r * 0.95, h, 24, 1, true).translate(0, h / 2, 0);
  const pos = beamG.getAttribute('position');
  beamG.setAttribute('color', new Float32BufferAttribute(Array.from({ length: pos.count }, (_, i) => [1, 1, 1, 0.9 * (1 - pos.getY(i) / h)]).flat(), 4)); // bright at the floor, gone at the top
  const beam = new Mesh(beamG, new MeshBasicMaterial({ color: colour, vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false }));
  const label = new Sprite(new SpriteMaterial({ map: labelTexture(EXIT_LABEL), transparent: true, depthWrite: false }));
  label.scale.set(3.2, 0.8, 1);
  label.position.y = 2.1;
  const light = new PointLight(colour, 14, 9, 2);
  light.position.y = 1.2;
  g.add(ring, disc, beam, label, light);
  scene.add(g);
  let on = false;
  return {
    get on() { return on; },
    x, z,
    set(v) { on = g.visible = v; },
    hit: (px, pz) => on && Math.hypot(px - x, pz - z) <= r,
    update(t) {
      if (!on) return;
      const k = 1 + 0.06 * Math.sin(t * 3);
      ring.scale.set(k, 1, k);
      (ring.material as MeshBasicMaterial).opacity = 0.7 + 0.3 * Math.sin(t * 3);
      label.position.y = 2.1 + 0.08 * Math.sin(t * 1.7);
      light.intensity = 12 + 4 * Math.sin(t * 3);
    },
  };
}
