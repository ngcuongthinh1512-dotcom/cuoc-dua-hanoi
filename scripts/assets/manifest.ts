// Phase 8C foundation (docs/plans/phase8c-graphics.md §4–5): the downloaded graphics assets in <assets>/8c (never
// committed): manifest.json (the download step: file, title, pageUrl, licence, author, sha256 | md5) + sketchfab/*.glb
// (downloaded by hand; licence / author / title / source read from the GLB's asset.extras, which Sketchfab writes).
// Licence rule SPEC §17.20: PD / CC0 / CC-BY / CC-BY-SA / CC-BY-NC / CC-BY-NC-SA / MIT; never ND, personal-use or unknown.
// Credits (SPEC §17.20): the 8C graphics lines go into the static client/public/credits.json, grouped per kind for the
// CC0 / PD / MIT sets, one line per work for CC-BY* (the Louvre works never: their lines come from the server).
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

export interface Asset8c { file: string; title: string; pageUrl: string; licence: string; author: string; sha256?: string; md5?: string }
export interface Credit { title: string; text: string; licence: string; url: string; author?: string; set?: '8c' }

const ALLOWED = /^(CC0\b|Public domain\b|PD\b|MIT\b|CC[- ]BY(?:[- ](?:SA|NC|NC[- ]SA))?[- ]\d)/i;
/** SPEC §17.20. */
export const licenceOk = (l: string) => !/\bND\b|no[- ]?deriv|personal|editorial/i.test(l) && ALLOWED.test(l.trim());
/** 'CC-BY-4.0 (http://…)' → 'CC BY 4.0', 'CC-BY-SA-4.0' → 'CC BY-SA 4.0'; others unchanged. */
export const shortLicence = (l: string) => l.replace(/\s*\(.*\)\s*$/, '').replace(/^CC-BY/, 'CC BY').replace(/-(\d)/, ' $1');
const stem = (file: string) => basename(file).replace(/\.[^.]+$/, '').replace(/^poster\d+__/, '');

/** A GLB's JSON chunk. */
export function glbJson(buf: Buffer): { asset?: { extras?: Record<string, string> } } {
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB');
  return JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8'));
}

/** Every asset of <dir> (= <assets>/8c); throws on a licence outside SPEC §17.20 or a sketchfab GLB without extras. */
export function readManifest8c(dir: string): Asset8c[] {
  const raw = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as (Partial<Asset8c> & { file: string })[];
  const list: Asset8c[] = raw.map((a) => ({ ...a, title: a.title ?? stem(a.file), pageUrl: a.pageUrl ?? '', licence: a.licence ?? '', author: a.author ?? '' }));
  const sk = join(dir, 'sketchfab');
  for (const f of existsSync(sk) ? readdirSync(sk).filter((f) => f.endsWith('.glb')).sort() : []) {
    const x = glbJson(readFileSync(join(sk, f))).asset?.extras;
    if (!x?.license || !x.source) throw new Error(`8c: sketchfab/${f} has no licence / source in asset.extras`);
    list.push({ file: `sketchfab/${f}`, title: x.title ?? stem(f), pageUrl: x.source, licence: x.license, author: x.author ?? '' }); // as Sketchfab writes it: display name + profile URL (CC BY attribution)
  }
  const bad = list.filter((a) => !licenceOk(a.licence));
  if (bad.length) throw new Error(`8c: licence outside SPEC §17.20: ${bad.map((a) => `${a.file} (${a.licence || 'không rõ'})`).join(', ')}`);
  return list;
}

/** Downloaded but not used (SPEC §17.20 2026-10-03: T3 only roof slates + asphalt; no Wallace fountain; no new pedestrians /
 *  vehicles, T5 dropped; no pigeons (T2); spare HDRI qwantani): never processed, never credited. */
export const UNUSED =
  /^(polyhaven\/textures\/(large_sandstone_blocks|box_profile_metal_sheet|concrete_pavers|cobblestone_floor_08|patterned_cobblestone|bicolour_gravel)\/|ambientcg\/(Metal028|Ground108|Grass004)_|polyhaven\/hdri\/qwantani_|rocketbox\/|sketchfab\/(animated_bird_pigeon|fontaine_wallace|french_delivery_van|garbage_truck|isuzu_erga_mio_bus|low-poly_sedan_car|low_poly_small_car))/;

const verified = new Set<string>();
/** Path of `file` in <dir> after checking its sha256 / md5 against the manifest (once per run). */
export function assetPath(dir: string, assets: readonly Asset8c[], file: string): string {
  const a = assets.find((x) => x.file === file);
  if (!a) throw new Error(`8c: ${file} is not in the manifest (approved list, SPEC §17.20)`);
  if (UNUSED.test(file)) throw new Error(`8c: ${file} is not used (SPEC §17.20: T3 only roof slates + asphalt; manifest.ts UNUSED)`);
  const path = join(dir, file);
  if (!verified.has(path)) {
    const [algo, want] = a.sha256 ? ['sha256', a.sha256] : a.md5 ? ['md5', a.md5] : [];
    if (algo && createHash(algo).update(readFileSync(path)).digest('hex') !== want) throw new Error(`8c: ${file}: ${algo} differs from the manifest`);
    verified.add(path);
  }
  return path;
}

/** Vietnamese usage label per file (credits); a file without one is an error (every shipped asset gets a line). */
const LABELS: [RegExp, string][] = [
  [/^polyhaven\/textures\//, 'Texture'],
  [/^ambientcg\//, 'Texture'],
  [/^polyhaven\/hdri\//, 'Bầu trời'],
  [/^three\//, 'Mặt nước'],
  [/^polyhaven\/street_lamp_01\//, 'Cột đèn'],
  [/^polyhaven\/outdoor_table_chair_set_01\//, 'Bàn ghế quán'],
  [/^commons\/posters\//, 'Áp phích cột Morris'],
  [/^sketchfab\/abribus/, 'Nhà chờ xe buýt'],
  [/^sketchfab\/animated_bird_pigeon/, 'Bồ câu'],
  [/^sketchfab\/bouquinistes/, 'Hộp sách bờ kè'],
  [/^sketchfab\/day_135_flame_of_liberty/, 'Ngọn lửa Tự do'],
  [/^sketchfab\/french_colonne_morris/, 'Cột Morris'],
  [/^sketchfab\/mini_paris_bench/, 'Ghế công viên'],
];
const site = (url: string) => ({ 'polyhaven.com': 'Poly Haven', 'ambientcg.com': 'ambientCG', 'commons.wikimedia.org': 'Wikimedia Commons', 'sketchfab.com': 'Sketchfab', 'github.com': 'GitHub' })[new URL(url).hostname] ?? new URL(url).hostname;
const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))];

/** credits.json lines (marked set: '8c'): CC0 / PD / MIT grouped by label + licence + site, CC-BY* one per work ("đã chỉnh sửa": every 8C file is processed); UNUSED files left out. */
export function credits8c(assets: readonly Asset8c[]): Credit[] {
  const groups = new Map<string, Asset8c[]>();
  const out: Credit[] = [];
  for (const a of assets) {
    if (UNUSED.test(a.file)) continue;
    const hit = LABELS.find(([re]) => re.test(a.file));
    if (!hit) throw new Error(`8c: no credits label for ${a.file} (scripts/assets/manifest.ts LABELS)`);
    const label = hit[1];
    const licence = shortLicence(a.licence);
    if (/^CC BY/i.test(licence)) {
      out.push({ title: `${label}: ${a.title}`, text: `${label}: "${a.title}" – ${a.author}, ${licence}, qua ${site(a.pageUrl)} (đã chỉnh sửa)`, licence, url: a.pageUrl, author: a.author, set: '8c' });
      continue;
    }
    const key = `${label}|${licence}|${site(a.pageUrl)}`;
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }
  for (const [key, as] of groups) {
    const [label, licence, from] = key.split('|') as [string, string, string];
    const titles = uniq(as.map((a) => a.title));
    const url = uniq(as.map((a) => a.pageUrl)).length === 1 ? as[0]!.pageUrl : `https://${new URL(as[0]!.pageUrl).hostname}/`;
    out.push({ title: `${label} (${from})`, text: `${label}: ${titles.join(', ')} – ${uniq(as.flatMap((a) => a.author.split(/,\s*/))).join(', ')}, ${licence}, qua ${from}`, licence, url, set: '8c' });
  }
  return out;
}

/** credits.json with its old 8C lines replaced by `lines`, put before the last ("Phòng Louvre") line. Idempotent. */
export function mergeCredits(existing: Credit[], lines: Credit[]): Credit[] {
  const kept = existing.filter((c) => c.set !== '8c');
  const louvre = kept.findIndex((c) => c.title === 'Phòng Louvre');
  const at = louvre < 0 ? kept.length : louvre;
  return [...kept.slice(0, at), ...lines, ...kept.slice(at)];
}
