// Quick test of the real Hà Nội leg draft (../chang-that/hanoi-that.NHAP.json: café hmm… → Vincom Phạm Ngọc Thạch → CETIQLO), same flow as
// bong-test-setup.ts (a RUNNING `npm run dev:api` on :8787). The draft's "[CHƯA NHẬP …]" blanks are filled with "(GIẢ) …" in a temp copy and
// the start is moved next to a box so a test needs no walking. Prints the Host + team links.
//   npm run hanoi-test -- [--start-at L1|L2|L3] [--leg file] [--race hanoi] [--teams 2] [--port 8787] [--client http://localhost:5174] [--password test1234]
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { latLonToWorld, worldToLatLon } from '@race/shared';
import { setupRace } from './cq-test-setup.ts';

const { values: v } = parseArgs({ options: { 'start-at': { type: 'string', default: 'L1' }, leg: { type: 'string', default: join(import.meta.dirname, '../../chang-that/hanoi-that.NHAP.json') }, race: { type: 'string', default: 'hanoi' }, teams: { type: 'string', default: '2' }, port: { type: 'string', default: '8787' }, client: { type: 'string' }, password: { type: 'string', default: process.env.HOST_PASSWORD ?? 'test1234' } } });
if (!['L1', 'L2', 'L3'].includes(v['start-at']!)) throw new Error('--start-at phải là L1, L2 hoặc L3');
const leg = JSON.parse(readFileSync(v.leg!, 'utf8').replace(/\[CHƯA NHẬP ([^\]]*)\]/g, '(GIẢ) $1'));
const spot = (x: number, z: number) => { const p = worldToLatLon(x, z); return { lat: +p.lat.toFixed(6), lon: +p.lon.toFixed(6) }; };
const box = (id: string) => leg.steps.find((s: { id: string }) => s.id === id).destination;
if (v['start-at'] === 'L1') { // 5 m from the café box, on the lane, looking at it
  const b = latLonToWorld(box('L1').lat, box('L1').lon);
  leg.start = { ...leg.start, name: 'Trước quán hmm… (thử)', ...spot(b.x - 4.5, b.z - 2.2), yawDeg: -116, spreadMeters: 2 };
} else if (v['start-at'] === 'L3') { // 8 m west of the statue box; the L1 / L2 boxes next to it, CQ is skipped in the Host page ("Cho qua") or played in the room
  const b = latLonToWorld(box('L3').lat, box('L3').lon), p = spot(b.x - 8, b.z);
  leg.start = { ...leg.start, name: 'Cạnh tượng đài (thử)', ...p, yawDeg: -90, spreadMeters: 2 };
  Object.assign(box('L1'), p);
  Object.assign(box('L2'), p);
} else { // L1 box next to the start, 8 m from the Vincom box: open L1, walk a few steps
  const b = latLonToWorld(box('L2').lat, box('L2').lon), p = spot(b.x - 7, b.z + 5);
  leg.start = { ...leg.start, name: 'Cạnh Vincom (thử)', ...p, yawDeg: -52, spreadMeters: 2 };
  Object.assign(box('L1'), p);
}
const file = join(tmpdir(), 'hanoi-test-leg.json');
writeFileSync(file, JSON.stringify(leg, null, 2));
const s = await setupRace({ url: `http://localhost:${v.port}`, race: v.race!, teams: Number(v.teams), password: v.password!, leg: file, client: v.client });
if (s.fresh) console.log(`Cuộc đua "${v.race}" đã chạy rồi → dùng mã mới: ${s.race}`);
console.log(`Cuộc đua ${s.race} đang chạy, ${s.teams.length} đội, chặng hanoi (nội dung trống điền "(GIẢ)", xuất phát gần ${v['start-at'] === 'L1' ? 'hòm L1 ở quán hmm…' : 'hòm L2 ở Vincom'}; mở hòm L2 → thẻ + phòng chờ CETIQLO).`);
console.log(`Host:   ${s.hostUrl}`);
for (const u of s.urls) console.log(`${u.name.padEnd(9)} ${u.url.replace('&autoCq=1', '')}`);
console.log('Liên kết video của L3 là https://chua-nhap-ten-mien.invalid/… (schema chỉ nhận https): mở thử trang ở', `${(v.client ?? `http://localhost:${v.port}`)}/clues/l3-video.html`);
console.log('Hộp L3 (tượng đài): offline thử bằng /?player=-1013.6,2323,-90&boxes=L3,-1008.6,2323,,90&npc=0');
