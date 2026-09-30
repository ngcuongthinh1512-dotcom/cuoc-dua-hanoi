// Phase 4B track A (docs/plans/phase4b.md §2.3, §6): three's FBXLoader / GLTFLoader run in the system Chrome (they need the
// DOM for textures and images), so process-assets.ts gets plain arrays back without FBX2glTF or Blender. The page is served
// through page.route (three from node_modules + the asset files), no server or port. Results come back as JSON; the big
// float arrays as base64 (`unb64`).
// DOM lib: the functions passed to page.evaluate run in the page.
/// <reference lib="dom" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright-core';

const THREE = join(import.meta.dirname, '../node_modules/three');
const PAGE = `<!doctype html><script type="module">
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
window.T = { THREE, FBXLoader, GLTFLoader, MeshoptDecoder };
window.b64 = (a) => { // typed array → base64
  const u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};
window.__ready = true;
</script>`;
const IMPORT_MAP = { three: '/three/build/three.module.js', 'three/addons/': '/three/examples/jsm/' };

export const unb64 = <A extends Float32ArrayConstructor | Uint16ArrayConstructor>(s: string, type: A): InstanceType<A> => {
  const b = Buffer.from(s, 'base64');
  return new type(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)) as InstanceType<A>;
};

/** Runs `work` with a page that has `window.T` (THREE, FBXLoader, GLTFLoader, MeshoptDecoder) and `window.b64`. */
export async function inChrome<R>(work: (page: Page) => Promise<R>): Promise<R> {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage();
    page.on('console', (m) => void (['error', 'warning'].includes(m.type()) && console.log(`[chrome ${m.type()}] ${m.text()}`)));
    page.on('pageerror', (e) => console.log(`[chrome pageerror] ${e.message}`));
    await page.addInitScript('window.__name = (f) => f;'); // tsx / esbuild wraps inner functions in __name()
    await page.route('http://asset.test/**', (route) => {
      const u = new URL(route.request().url());
      if (u.pathname === '/') return route.fulfill({ contentType: 'text/html', body: PAGE.replace('<script', `<script type="importmap">${JSON.stringify({ imports: IMPORT_MAP })}</script><script`) });
      if (u.pathname.startsWith('/three/')) return route.fulfill({ contentType: 'text/javascript', body: readFileSync(join(THREE, u.pathname.slice(7))) });
      if (u.pathname === '/file') return route.fulfill({ contentType: 'application/octet-stream', body: readFileSync(u.searchParams.get('p')!) });
      return route.abort();
    });
    await page.goto('http://asset.test/');
    await page.waitForFunction('window.__ready === true');
    return await work(page);
  } finally {
    await browser.close();
  }
}

/** URL the page can fetch for a local file. */
export const fileUrl = (path: string) => `http://asset.test/file?p=${encodeURIComponent(path)}`;

/** Triangles of one material of one node, world space (cm for the rgsdev FBX), flat arrays. */
export interface RawSoup { node: string; material: string; colour: number[]; pos: number[]; nrm: number[] }

/** Static FBX (the rgsdev vehicles): every mesh split by material, node transforms applied, colours linear. */
export const readFbxSoup = (page: Page, path: string): Promise<RawSoup[]> =>
  page.evaluate(async (url) => {
    const { THREE, FBXLoader } = (window as any).T;
    const root = await new FBXLoader().loadAsync(url);
    root.updateMatrixWorld(true);
    const out: any[] = [];
    root.traverse((o: any) => {
      if (!o.isMesh) return;
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const groups = g.groups.length ? g.groups : [{ start: 0, count: g.getAttribute('position').count, materialIndex: 0 }];
      const nm = new THREE.Matrix3().getNormalMatrix(o.matrixWorld);
      const v = new THREE.Vector3();
      for (const gr of groups) {
        const m = mats[gr.materialIndex];
        const s = { node: o.name, material: m.name, colour: [m.color.r, m.color.g, m.color.b], pos: [] as number[], nrm: [] as number[] };
        for (let i = gr.start; i < gr.start + gr.count; i++) {
          v.fromBufferAttribute(g.getAttribute('position'), i).applyMatrix4(o.matrixWorld);
          s.pos.push(v.x, v.y, v.z);
          v.fromBufferAttribute(g.getAttribute('normal'), i).applyMatrix3(nm).normalize();
          s.nrm.push(v.x, v.y, v.z);
        }
        out.push(s);
      }
    });
    return out;
  }, fileUrl(path));

const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/** A skinned FBX avatar (Rocketbox): skeleton (ancestors first), inverse bind matrices, bind matrix, non-indexed triangle arrays. */
export interface RawAvatar {
  bones: { name: string; parent: string | null; p: number[]; q: number[] }[]; // ancestors of the skin, then skin.bones order
  skin: number; // index in `bones` where the skin's joints start
  inverses: string; // base64 Float32 × 16 per skin joint
  bind: number[]; // mesh bind matrix (column-major)
  groups: { start: number; count: number; material: string }[];
  pos: string; nrm: string; uv: string; skinIndex: string; skinWeight: string; // base64 (skinIndex Uint16)
}

export const readFbxAvatar = (page: Page, path: string): Promise<RawAvatar> =>
  page.evaluate(async ([url, pixel]) => {
    const { THREE, FBXLoader } = (window as any).T;
    const mgr = new THREE.LoadingManager();
    mgr.setURLModifier((u: string) => (/\.(tga|png|jpe?g)$/i.test(u) ? pixel : u)); // textures are handled in Node
    const root = await new FBXLoader(mgr).loadAsync(url);
    root.updateMatrixWorld(true);
    let mesh: any;
    root.traverse((o: any) => o.isSkinnedMesh && (mesh = o));
    const skin = mesh.skeleton.bones;
    const chain: any[] = [];
    for (let p = skin[0].parent; p && p !== root; p = p.parent) chain.unshift(p);
    const all = [...chain, ...skin];
    const g = mesh.geometry;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    return {
      bones: all.map((b: any) => ({ name: b.name, parent: b.parent === root ? null : b.parent.name, p: b.position.toArray(), q: b.quaternion.toArray() })),
      skin: chain.length,
      inverses: (window as any).b64(Float32Array.from(mesh.skeleton.boneInverses.flatMap((m: any) => m.elements))),
      bind: mesh.bindMatrix.elements.slice(),
      groups: g.groups.map((x: any) => ({ start: x.start, count: x.count, material: mats[x.materialIndex].name })),
      pos: (window as any).b64(g.attributes.position.array),
      nrm: (window as any).b64(g.attributes.normal.array),
      uv: (window as any).b64(g.attributes.uv.array),
      skinIndex: (window as any).b64(Uint16Array.from(g.attributes.skinIndex.array)),
      skinWeight: (window as any).b64(g.attributes.skinWeight.array),
    };
  }, [fileUrl(path), PIXEL] as const);

/** The one clip of a Rocketbox animation FBX: every Bip01* position / quaternion track (base64 Float32 times / values). */
export interface RawClip { duration: number; tracks: { name: string; times: string; values: string }[] }

export const readFbxClip = (page: Page, path: string): Promise<RawClip> =>
  page.evaluate(async (url) => {
    const { FBXLoader } = (window as any).T;
    const c = (await new FBXLoader().loadAsync(url)).animations[0];
    return {
      duration: c.duration,
      tracks: c.tracks
        .filter((t: any) => /^Bip01(_\w+)?\.(position|quaternion)$/.test(t.name))
        .map((t: any) => ({ name: t.name, times: (window as any).b64(Float32Array.from(t.times)), values: (window as any).b64(Float32Array.from(t.values)) })),
    };
  }, fileUrl(path));
