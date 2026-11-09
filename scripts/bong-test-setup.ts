// Quick test of the "Bóng trên góc tường" card (Thử thách 1 Hà Nội): same flow as cq-test-setup.ts (a RUNNING `npm run dev:api` on :8787),
// but with worker/legs/test/bong-goc-tuong.json and a plain team URL (no autoCq). Prints the Host + team links.
//   npm run bong-test -- [--race bong] [--teams 2] [--port 8787] [--client http://localhost:5174] [--password test1234]
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { setupRace } from './cq-test-setup.ts';

const { values: v } = parseArgs({ options: { race: { type: 'string', default: 'bong' }, teams: { type: 'string', default: '2' }, port: { type: 'string', default: '8787' }, client: { type: 'string' }, password: { type: 'string', default: process.env.HOST_PASSWORD ?? 'test1234' } } });
const s = await setupRace({ url: `http://localhost:${v.port}`, race: v.race!, teams: Number(v.teams), password: v.password!, leg: join(import.meta.dirname, '../worker/legs/test/bong-goc-tuong.json'), client: v.client });
if (s.fresh) console.log(`Cuộc đua "${v.race}" đã chạy rồi → dùng mã mới: ${s.race}`);
console.log(`Cuộc đua ${s.race} đang chạy, ${s.teams.length} đội, chặng bong-goc-tuong (đứng sẵn gần hòm L1; mở hòm → thẻ Thử thách 1 → nút "Chơi trò Bóng trên góc tường"; đáp án gõ ở ô trên thẻ).`);
console.log(`Host:   ${s.hostUrl}`);
for (const u of s.urls) console.log(`${u.name.padEnd(9)} ${u.url.replace('&autoCq=1', '')}`);
