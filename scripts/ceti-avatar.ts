// Dev one-off: adds a Higgsfield / Meshy mesh (Ceti, avatar 2 "player_c" / clips "c_*") to client/public/models/player.glb and
// player-anims.glb WITHOUT the Rocketbox originals (they are not in .cache): the clips are retargeted from the male avatar's
// own clips (m_*, UE bone names) onto the Meshy skeleton with rig.ts `retargeter`. Idempotent (strips an old player_c / c_*).
// Usage: npx tsx scripts/ceti-avatar.ts <meshy.glb> [heightMeters=1.71] [backupDir|-] [riggedHeight=1.78]
// Other avatars: AVATAR_NODE=player_h AVATAR_PREFIX=h_ AVATAR_NAME=hailong RECOLOR=0 (RECOLOR=0 skips ceti-recolor.ts, whose colour targets are Ceti's outfit).
import { copyFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Scene } from '@gltf-transform/core';
import { dedup, mergeDocuments, meshopt, prune } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { recolor } from './assets/ceti-recolor.ts';
import { glbIO } from './assets/pipeline.ts';
import { type RigBone, retargeter, sampleTrack } from './assets/rig.ts';

const [glbPath, heightArg, backup] = process.argv.slice(2);
if (!glbPath) throw new Error('usage: ceti-avatar.ts <meshy.glb> [heightMeters] [backupDir]');
const HEIGHT = Number(heightArg ?? 1.71);
const [NODE, PREFIX, NAME] = [process.env.AVATAR_NODE ?? 'player_c', process.env.AVATAR_PREFIX ?? 'c_', process.env.AVATAR_NAME ?? 'ceti'];
const MODELS = 'client/public/models';
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = glbIO();
if (backup && backup !== '-') for (const f of ['player.glb', 'player-anims.glb']) copyFileSync(join(MODELS, f), join(backup, f));

// Meshy (Mixamo-like, but the spine is named bottom-up: Hips → Spine02 → Spine01 → Spine → neck) → the client's UE names
const UE: Record<string, string> = { Hips: 'pelvis', Spine02: 'spine_01', Spine01: 'spine_02', Spine: 'spine_03', neck: 'neck_01', Head: 'Head' };
for (const S of ['Left', 'Right']) {
  const s = S[0]!.toLowerCase();
  Object.assign(UE, { [`${S}Shoulder`]: `clavicle_${s}`, [`${S}Arm`]: `upperarm_${s}`, [`${S}ForeArm`]: `lowerarm_${s}`, [`${S}Hand`]: `hand_${s}`, [`${S}UpLeg`]: `thigh_${s}`, [`${S}Leg`]: `calf_${s}`, [`${S}Foot`]: `foot_${s}`, [`${S}ToeBase`]: `ball_${s}` });
}

// ── the Meshy doc: UE names, metres, HEIGHT tall, opaque WebP texture, no own animation ──
const cdoc = await io.read(glbPath);
const croot = cdoc.getRoot();
croot.listAnimations().forEach((a) => a.dispose());
const skin = croot.listSkins()[0]!;
for (const j of skin.listJoints()) UE[j.getName()] && j.setName(UE[j.getName()]!);
const armature = croot.listScenes()[0]!.listChildren()[0]!; // scale 0.01 (cm → m); mesh + Hips under it
const meshH = Number(process.argv[5] ?? 1.78); // the height the mesh was rigged at (rigging_height_meters): it renders that tall under the 0.01 armature
const ks = armature.getScale()[0]! * (HEIGHT / meshH); // bone translations stay in cm; the armature scales them to the real height
armature.setScale([ks, ks, ks]).setName(NODE);
// Meshy fuses the legs where they touch (inner ankles / laces): vertices there are skinned to BOTH feet and triangles bridge the two shoes, so a
// jog stretches a dark strip between them. Below 40 % of the height every vertex follows only the bones of its own side (the plane between
// the feet), and the triangles that cross that plane are dropped. SPLIT_LEGS=0 skips it.
if (process.env.SPLIT_LEGS !== '0') {
  const p0 = croot.listMeshes()[0]!.listPrimitives()[0]!;
  const [Pa, Ja, Wa, ia] = [p0.getAttribute('POSITION')!, p0.getAttribute('JOINTS_0')!, p0.getAttribute('WEIGHTS_0')!, p0.getIndices()!];
  const jn = skin.listJoints().map((j) => j.getName());
  const sideOf = (n: string) => (n.endsWith('_l') ? 1 : n.endsWith('_r') ? -1 : 0);
  const N = Pa.getCount();
  const [X, Y] = [new Float32Array(N), new Float32Array(N)];
  let [lo, hi] = [Infinity, -Infinity];
  for (let i = 0; i < N; i++) { const t = [0, 0, 0]; Pa.getElement(i, t); [X[i], Y[i]] = [t[0]!, t[1]!]; [lo, hi] = [Math.min(lo, t[1]!), Math.max(hi, t[1]!)]; }
  const [H, cut] = [hi - lo, lo + 0.4 * (hi - lo)];
  let [cx, cn] = [0, 0];
  for (let i = 0; i < N; i++) if (Y[i]! < lo + 0.09 * H) { cx += X[i]!; cn++; }
  cx /= cn || 1; // the plane midway between the two shoes
  const side = (i: number) => (X[i]! > cx ? 1 : -1);
  let fixed = 0;
  for (let i = 0; i < N; i++) {
    if (Y[i]! >= cut) continue;
    const [j, w] = [[0, 0, 0, 0], [0, 0, 0, 0]];
    Ja.getElement(i, j); Wa.getElement(i, w);
    let [sum, changed] = [0, false];
    for (let k = 0; k < 4; k++) { const sd = sideOf(jn[j[k]!]!); if (sd && sd !== side(i) && w[k]!) { w[k] = 0; changed = true; } sum += w[k]!; }
    if (!changed || sum <= 0) continue;
    Wa.setElement(i, w.map((x) => x / sum));
    fixed++;
  }
  const idx = ia.getArray()!;
  const keep: number[] = [];
  let dropped = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const v = [idx[t]!, idx[t + 1]!, idx[t + 2]!];
    if (v.every((i) => Y[i]! < cut) && !v.every((i) => side(i) === side(v[0]!))) { dropped++; continue; }
    keep.push(...v);
  }
  ia.setArray(Uint32Array.from(keep));
  console.log(`${NAME}: chân tách trọng số: ${fixed} đỉnh sửa, ${dropped} tam giác nối hai chân bị bỏ (mặt phẳng x = ${cx.toFixed(3)})`);
}
const tex = croot.listTextures()[0]!;
const prim = croot.listMeshes()[0]!.listPrimitives()[0]!;
let png = Buffer.from(tex.getImage()!);
if (process.env.RECOLOR !== '0') {
  const fixed = await recolor(png, prim.getAttribute('POSITION')!.getArray()!, prim.getAttribute('TEXCOORD_0')!.getArray()!, prim.getIndices()!.getArray()!);
  console.log(`${NAME}: texture`, JSON.stringify(fixed.counts));
  if (process.env.CETI_TEX_DEBUG) writeFileSync(process.env.CETI_TEX_DEBUG, fixed.png);
  png = fixed.png;
}
tex.setImage(new Uint8Array(await sharp(png).webp({ quality: 82 }).toBuffer())).setMimeType('image/webp');
croot.listMaterials()[0]!.setAlphaMode('OPAQUE').setDoubleSided(true).setRoughnessFactor(0.85).setMetallicFactor(0);

// ── the clips: retarget the male avatar's m_* clips ──
const adoc = await io.read(join(MODELS, 'player-anims.glb'));
const aroot = adoc.getRoot();
aroot.listAnimations().filter((a) => a.getName().startsWith(PREFIX)).forEach((a) => a.dispose());
const rig = new Map(aroot.listNodes().map((n) => [n.getName(), n]));
const src: RigBone[] = aroot.listNodes().map((n) => ({ name: n.getName(), parent: n.getParentNode()?.getName() ?? null, t: n.getTranslation(), q: n.getRotation() }));
const jointNames = new Set(skin.listJoints().map((j) => j.getName()));
const dst: RigBone[] = skin.listJoints().map((j) => ({ name: j.getName(), parent: jointNames.has(j.getParentNode()?.getName() ?? '') ? j.getParentNode()!.getName() : null, t: j.getTranslation(), q: j.getRotation() }));
const pairs = new Map(dst.filter((b) => rig.has(b.name) && !b.name.startsWith('clavicle_')).map((b) => [b.name, b.name])); // clavicles stay at rest: Meshy's shoulder skin weights pinch when they follow Rocketbox's
const { frame, k } = retargeter(src, dst, pairs, 'pelvis', ['thigh_l', 'thigh_l'], ['Head']);
const buffer = aroot.listBuffers()[0]!;
const acc = (type: 'SCALAR' | 'VEC3' | 'VEC4', a: Float32Array) => adoc.createAccessor().setType(type).setArray(a as never).setBuffer(buffer);
let toeY = 0;
for (const m of aroot.listAnimations().filter((a) => a.getName().startsWith('m_'))) {
  const tracks = m.listChannels();
  const times = [...new Set(tracks.flatMap((ch) => [...ch.getSampler()!.getInput()!.getArray()!].map((t) => +t.toFixed(5))))].sort((x, y) => x - y);
  const out = new Map<string, number[]>();
  for (const t of times) {
    const pose = new Map<string, { t?: number[]; q?: number[] }>();
    for (const ch of tracks) {
      const s = ch.getSampler()!;
      const rot = ch.getTargetPath() === 'rotation';
      const n = ch.getTargetNode()!.getName();
      pose.set(n, { ...pose.get(n), [rot ? 'q' : 't']: sampleTrack(s.getInput()!.getArray()!, s.getOutput()!.getArray()!, rot ? 4 : 3, t) });
    }
    const { local, world } = frame(pose);
    for (const [b, l] of local) {
      const r = out.get(`${b}.rotation`) ?? [];
      const q = l.q.toArray();
      if (r.length && r.slice(-4).reduce((s, x, c) => s + x * q[c]!, 0) < 0) q.forEach((x, c) => (q[c] = -x)); // one hemisphere
      out.set(`${b}.rotation`, [...r, ...q]);
      if (l.t) out.set(`${b}.translation`, [...(out.get(`${b}.translation`) ?? []), ...l.t.toArray()]);
    }
    if (m.getName() === 'm_Idle_Loop' && t === times[0]) toeY = Math.min(world.get('ball_l')!.elements[13]!, world.get('ball_r')!.elements[13]!) * ks;
  }
  const anim = adoc.createAnimation(`${PREFIX}${m.getName().slice(2)}`);
  const input = acc('SCALAR', Float32Array.from(times));
  for (const [key, values] of out) {
    const [b, path] = key.split('.') as [string, 'rotation' | 'translation'];
    const s = adoc.createAnimationSampler().setInput(input).setOutput(acc(path === 'rotation' ? 'VEC4' : 'VEC3', Float32Array.from(values))).setInterpolation('LINEAR');
    anim.addSampler(s).addChannel(adoc.createAnimationChannel().setTargetNode(rig.get(b)!).setTargetPath(path).setSampler(s));
  }
}
const stride = +(k * ks).toFixed(3);
armature.setExtras({ avatar: NAME, gender: 'm', height: HEIGHT, stride, selfShadow: false, fill: 0.16 });
console.log(`${NAME}: cao ${HEIGHT} m (mesh ${meshH.toFixed(3)} m), stride ${stride}, ngón chân Idle y ${toeY.toFixed(3)} m, ${aroot.listAnimations().filter((a) => a.getName().startsWith(PREFIX)).length} clip`);

// ── write both files ──
const pdoc = await io.read(join(MODELS, 'player.glb'));
const scene = pdoc.getRoot().listScenes()[0]!;
scene.listChildren().filter((n) => n.getName() === NODE).forEach((n) => n.dispose());
const merged = mergeDocuments(pdoc, cdoc);
const from = merged.get(croot.listScenes()[0]!) as Scene;
for (const n of from.listChildren()) scene.addChild(n);
from.dispose();
const [b0, ...extra] = pdoc.getRoot().listBuffers(); // mergeDocuments brings a second buffer; a GLB takes one
pdoc.getRoot().listAccessors().forEach((a) => a.setBuffer(b0!));
extra.forEach((b) => b.dispose());
const T = [prune(), dedup(), meshopt({ encoder: MeshoptEncoder, level: 'medium' })] as const;
await pdoc.transform(...T);
await adoc.transform(...T);
await io.write(join(MODELS, 'player.glb'), pdoc);
await io.write(join(MODELS, 'player-anims.glb'), adoc);
console.log(`${NAME}: player.glb + player-anims.glb written`);
