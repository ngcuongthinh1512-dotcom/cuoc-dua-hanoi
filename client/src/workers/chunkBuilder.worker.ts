// Chunk builder worker: init keeps the (carved) height grid; build fetches data/chunks/<key>.json, runs every builder
// (world/chunkBuild.ts) and posts the typed arrays back with zero-copy transfer. dataUrl '' = no map data
// (index.json missing): every chunk is built empty, i.e. terrain only.
import type { ChunkData } from '../geo/chunkData.ts';
import type { HeightGrid } from '../geo/heightGrid.ts';
import type { FromWorker, ToWorker } from '../world/buildTypes.ts';
import { buildChunk, emptyChunk, transferables } from '../world/chunkBuild.ts';

let grid: HeightGrid | undefined;
let dataUrl = '';
const reply = (msg: FromWorker, transfer: Transferable[] = []) => postMessage(msg, { transfer });

onmessage = async (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  if (msg.type === 'init') return void ((grid = msg.grid), (dataUrl = msg.dataUrl));
  const { key } = msg;
  try {
    if (!grid) throw new Error('build before init');
    const t0 = performance.now();
    let chunk = emptyChunk(key);
    if (dataUrl) {
      const res = await fetch(`${dataUrl}chunks/${key}.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      chunk = (await res.json()) as ChunkData;
      if (chunk.v !== 2) throw new Error(`unsupported chunk version ${String(chunk.v)}`);
    }
    const out = buildChunk(chunk, grid);
    reply({ type: 'built', key, out, ms: performance.now() - t0 }, transferables(out));
  } catch (err) {
    reply({ type: 'failed', key, error: String(err) });
  }
};
