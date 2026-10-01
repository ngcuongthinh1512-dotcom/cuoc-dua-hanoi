// `npm run leg:check <file.json>` (docs/plans/phase7.md D12, docs/LEG_FORMAT.md): checks a leg file before the Host loads
// it — zod shape + order / Pit Stop / map bbox / blanks / answers in texts (shared/src/leg/check.ts, the same rules the
// server applies), printed in Vietnamese. Exit 1 on any error.
// FOUNDATION: shape + rules only. Track D adds the map facts (LegGeo from client/public/data/chunks + the road graph:
// building footprints, walking routes), the static-asset leak scan and the suggested bike racks.
import { readFileSync } from 'node:fs';
import { parseLeg } from '../shared/src/leg/index.ts';

const file = process.argv[2];
if (!file) {
  console.error('Cách dùng: npm run leg:check -- <đường-dẫn-file-chặng.json>');
  process.exit(2);
}
let json: unknown;
try {
  json = JSON.parse(readFileSync(file, 'utf8'));
} catch (e) {
  console.error(`Không đọc được ${file} như JSON: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
const r = parseLeg(json);
const LABEL = { error: 'LỖI', warning: 'CẢNH BÁO', blank: 'CÒN TRỐNG' } as const;
for (const i of r.issues) console.log(`${LABEL[i.level]}  ${i.where}: ${i.message}`);
const n = (l: keyof typeof LABEL) => r.issues.filter((i) => i.level === l).length;
console.log(r.ok ? `\nHợp lệ: ${n('warning')} cảnh báo, ${n('blank')} ô còn trống.` : `\nKHÔNG hợp lệ: ${n('error')} lỗi (máy chủ sẽ từ chối file này).`);
process.exit(r.ok ? 0 : 1);
