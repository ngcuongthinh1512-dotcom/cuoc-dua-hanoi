// Track B (docs/plans/phase4.md §3.12): synthesised placeholder sounds (SPEC §6.6): bell (R), tyre noise (louder on
// cobbles), crash; Phase 8: the Host's approve / penalize chime. The AudioContext opens on the first click (browsers block audio before a user gesture); until then
// every call is a no-op.
// ponytail: WebAudio synthesis, no files; real recordings in Phase 12.
import { bike as B, bikeTopSpeed } from '../config.ts';
import type { RoadSurface } from '../vehicle/types.ts';

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;
let roll: { gain: GainNode; filter: BiquadFilterNode } | null = null;

/** Call from a user gesture (click / pointer lock). */
export function unlockAudio() {
  try {
    ctx ??= new AudioContext();
    void ctx.resume();
  } catch (err) {
    console.warn('AudioContext unavailable:', err);
  }
}

function noiseBuffer(c: AudioContext) {
  if (noise) return noise;
  noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noise;
}

/** Two-tone bicycle bell, bike.bellSeconds decay. */
export function bell() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.25, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + B.bellSeconds);
  g.connect(ctx.destination);
  for (const f of [2100, 3200]) {
    const o = ctx.createOscillator();
    o.frequency.value = f;
    o.connect(g);
    o.start(t);
    o.stop(t + B.bellSeconds);
  }
}

/** Phase 8 (SPEC §8.9 (6)): the Host's verdict on an answer: approved = rising three-note chime, penalized = two falling
 *  low buzzes. */
export function reviewSound(approved: boolean) {
  const c = ctx;
  if (!c) return;
  const notes = approved ? [880, 1109, 1319] : [330, 247];
  notes.forEach((f, i) => {
    const at = c.currentTime + i * 0.13;
    const g = c.createGain();
    g.gain.setValueAtTime(approved ? 0.2 : 0.15, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.35);
    g.connect(c.destination);
    const o = c.createOscillator();
    o.type = approved ? 'sine' : 'square';
    o.frequency.value = f;
    o.connect(g);
    o.start(at);
    o.stop(at + 0.35);
  });
}

/** Short low noise burst. */
export function crashSound() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  const f = ctx.createBiquadFilter();
  f.frequency.value = 700;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.6, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
  src.connect(f).connect(g).connect(ctx.destination);
  src.start(t);
  src.stop(t + 0.4);
}

/** Tyre noise every frame: gain ∝ speed (bike.rollVolume per surface), cobbles = low rumble, asphalt = soft hiss. */
export function rolling(speed: number, surface: RoadSurface | null) {
  if (!ctx) return;
  if (!roll) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx);
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start();
    roll = { gain, filter };
  }
  const v = surface ? B.rollVolume[surface] * Math.min(1, Math.abs(speed) / bikeTopSpeed()) : 0;
  roll.gain.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
  roll.filter.frequency.setTargetAtTime(surface === 'pave' ? 250 + 60 * Math.sin(ctx.currentTime * 40) : 1800, ctx.currentTime, 0.02);
}

/** Phase 8B: one short blip (tone Hz, s, peak gain). */
function blip(f: number, seconds: number, gain: number, type: OscillatorType = 'sine') {
  const c = ctx;
  if (!c) return;
  const t = c.currentTime;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + seconds);
  g.connect(c.destination);
  const o = c.createOscillator();
  o.type = type;
  o.frequency.value = f;
  o.connect(g);
  o.start(t);
  o.stop(t + seconds);
}

/** Phase 8B: a button in the Louvre room (on = high tick, off = low tick). */
export const clickSound = (on: boolean) => blip(on ? 1400 : 700, 0.06, 0.15, 'square');

/** Phase 8B: a new line of another team in the public feed (small pop). */
export const popSound = () => blip(520, 0.12, 0.12);
