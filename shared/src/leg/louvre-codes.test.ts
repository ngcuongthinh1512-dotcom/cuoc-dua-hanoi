// Phase 8B track D: the verifier's extra leg:check rules (docs/reports/phase8b-verify-foundation.md): art-NN ids matching the
// file, answer codes in team-readable text, answer codes that are smallest / largest / consecutive, "thiếu giấy phép".
import { describe, expect, it } from 'vitest';
import louvre from '../../../worker/legs/test/louvre.json';
import { parseLeg } from './index.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;
const fresh = (): J => JSON.parse(JSON.stringify(louvre));
const task = (j: J) => j.steps[1].task;
const lines = (j: unknown, level: string) => parseLeg(j).issues.filter((i) => i.level === level).map((i) => `${i.where}: ${i.message}`);
const has = (j: unknown, level: string, re: RegExp) => expect(lines(j, level).some((l) => re.test(l)), lines(j, level).join('\n')).toBe(true);
const codes = (...n: number[]) => n.map((k) => `art-${String(k).padStart(2, '0')}`);

describe('louvre leg:check extra rules (track D)', () => {
  it('the test leg stays clean', () => {
    expect(lines(louvre, 'error')).toEqual([]);
  });

  it('id must be art-NN and the file must carry the id', () => {
    const a = fresh();
    task(a).louvre.artworks[0].id = 'monalisa';
    has(a, 'error', /mã "monalisa" phải đúng dạng art-NN/);
    const b = fresh();
    task(b).louvre.artworks[1].image = 'art-05.webp'; // artworks[1] is art-02
    has(b, 'error', /tên tệp "art-05.webp" phải trùng mã tác phẩm "art-02"/);
  });

  it('an answer code or file name in the text a team reads = warning; a wrong code = none', () => {
    const a = fresh();
    task(a).description += ' (xem art-17)';
    has(a, 'warning', /mô tả: chứa mã \/ tên tệp tác phẩm đúng "art-17"/);
    const b = fresh();
    task(b).description += ' (xem art-04)';
    expect(lines(b, 'warning').filter((l) => l.includes('mã / tên tệp'))).toEqual([]);
  });

  it('answers that are the smallest, the largest or consecutive by code = warning; spread = none', () => {
    for (const ids of [codes(1, 2, 3, 4, 5), codes(19, 20, 21, 22, 23), codes(8, 9, 10, 11, 12)]) {
      const j = fresh();
      task(j).answers = ids;
      has(j, 'warning', /5 mã đáp án liền nhau theo mã/);
    }
    expect(lines(louvre, 'warning').some((l) => l.includes('theo mã'))).toBe(false);
  });

  it('licence: missing / empty says "thiếu giấy phép", a forbidden one says "không được phép"', () => {
    const a = fresh();
    delete task(a).louvre.artworks[1].credit.license;
    has(a, 'error', /thiếu giấy phép/);
    const b = fresh();
    task(b).louvre.artworks[1].credit.license = '';
    has(b, 'error', /thiếu giấy phép/);
    const c = fresh();
    task(c).louvre.artworks[1].credit.license = 'CC-BY-ND';
    has(c, 'error', /giấy phép không được phép/);
  });
});
