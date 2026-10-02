// Phase 8B (docs/plans/phase8b.md §B, §I): the louvre task kind in the leg schema + checkLeg rules 1–8 (rule 9 = CLI scan,
// scripts/leg-check.test.ts). Fixture = the bundled test leg (FAKE content).
import { describe, expect, it } from 'vitest';
import louvre from '../../../worker/legs/test/louvre.json';
import { checkLeg, parseLeg } from './check.ts';
import { type ChallengeStep, type Leg, LOUVRE } from './schema.ts';

type J = typeof louvre & Record<string, any>;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T; // the shared lib is ES only (no structuredClone)
const fresh = () => clone(louvre) as J;
const step = (j: J) => j.steps[1] as any;
const task = (j: J) => step(j).task;
const lines = (j: unknown, level?: string) => parseLeg(j).issues.filter((i) => !level || i.level === level).map((i) => `${i.where}: ${i.message}`);
const has = (j: unknown, level: string, re: RegExp) => expect(lines(j, level).some((l) => re.test(l)), lines(j).join('\n')).toBe(true);

describe('louvre task (schema + checkLeg rules 1–8)', () => {
  it('the test leg loads: no error / warning but the test penalty; the artworks without a picture are blanks', () => {
    const r = parseLeg(louvre);
    expect(r.ok).toBe(true);
    expect(lines(louvre, 'error')).toEqual([]);
    expect(lines(louvre, 'warning')).toEqual(['phạt › phút khóa sau khi bị phạt: phạt dưới 1 phút (0.1): chỉ dùng cho chặng test']);
    expect(lines(louvre, 'blank')).toHaveLength(17);
    const t = ((r as { leg: Leg }).leg.steps[1] as ChallengeStep).task;
    expect(t.kind).toBe('louvre');
    expect(t.louvre!.artworks).toHaveLength(LOUVRE.artworks);
    expect(t.louvre!.artworks.filter((a) => a.type === 'sculpture')).toHaveLength(8);
    expect(t.louvre!.hints).toEqual({ countAtMinutes: 0.05, correctAtMinutes: 0.1 });
  });

  it('old legs: no louvre block, defaults unchanged; hints default to 40 / 70', () => {
    const j = fresh();
    delete task(j).louvre.hints;
    const r = parseLeg(j);
    expect(r.ok && r.leg.steps[1]!.type === 'challenge' && r.leg.steps[1].task.louvre!.hints).toEqual({ countAtMinutes: 40, correctAtMinutes: 70 });
    expect(r.ok && r.leg.steps[1]!.type === 'challenge' && r.leg.steps[1].task.louvre!.artworks[0]).toEqual({ id: 'art-01', type: 'painting', image: '', note: '(GIẢ) Tác phẩm 1' });
  });

  it('rule 1: kind louvre without the block = error; a block on another kind = warning; never in a detour branch', () => {
    const j = fresh();
    delete task(j).louvre;
    has(j, 'error', /kiểu louvre cần khối "louvre"/);
    const k = fresh();
    task(k).kind = 'answer';
    has(k, 'warning', /khối "louvre" bị bỏ qua/);
  });

  it('rule 2: 23 artworks, ids unique, exactly 5 answers that exist, not twice; all one type = warning', () => {
    const a = fresh();
    task(a).louvre.artworks.pop();
    has(a, 'error', /tác phẩm: phải có đúng 23 mục/);
    const b = fresh();
    task(b).louvre.artworks[1].id = 'art-01';
    has(b, 'error', /mã "art-01" trùng với tác phẩm 1/);
    const c = fresh();
    task(c).answers.pop();
    has(c, 'error', /phải có đúng 5 đáp án/);
    const d = fresh();
    task(d).answers[0] = 'art-99';
    has(d, 'error', /đáp án "art-99" không phải mã/);
    const e = fresh();
    task(e).answers[0] = 'art-03';
    has(e, 'error', /mã tác phẩm trùng nhau/);
    const f = fresh();
    for (const x of task(f).louvre.artworks) x.type = 'painting';
    has(f, 'warning', /toàn tranh: nên ≈ 15 tranh \+ 8 tượng/);
  });

  it('rule 3: picture names art-NN.webp|glb only, glb = sculpture, a file used twice, note words in the file name', () => {
    const a = fresh();
    task(a).louvre.artworks[0].image = 'monalisa.webp';
    has(a, 'error', /hình tác phẩm: tên hình tác phẩm phải dạng "art-NN.webp"/);
    const b = fresh();
    task(b).louvre.artworks[0].image = 'art-01.glb';
    has(b, 'error', /mô hình \.glb chỉ dùng cho tượng/);
    const c = fresh();
    task(c).louvre.artworks[3].image = 'art-02.webp';
    has(c, 'warning', /tệp "art-02.webp" đã dùng cho tác phẩm 2/);
    // the CLI's file sizes (LegGeo.artSize): missing = blank, too big = warning
    const leg = (parseLeg(louvre) as { leg: Leg }).leg;
    const geo = { building: () => null, walk: () => ({ meters: 1, snapA: 0, snapB: 0 }), artSize: (n: string) => (n === 'art-02.webp' ? 400 * 1024 : n === 'art-06.webp' ? 1000 : null) };
    const out = checkLeg(leg, geo).map((i) => `${i.level} ${i.message}`);
    expect(out).toContain('warning tệp art-02.webp nặng 400 KB, quá 300 KB');
    expect(out).toContain('blank chưa có tệp client/public/art/art-09.webp (trong phòng hiện ô đánh số)');
    expect(out.some((l) => l.includes('art-06.webp'))).toBe(false);
  });

  it('rule 4: a picture without credit = warning; ND / personal / empty licence = error; a right title / note in a text = warning', () => {
    const a = fresh();
    delete task(a).louvre.artworks[1].credit;
    has(a, 'warning', /thiếu ghi nguồn/);
    for (const license of ['CC-BY-ND', 'personal', '']) {
      const b = fresh();
      task(b).louvre.artworks[1].credit.license = license;
      has(b, 'error', /giấy phép không được phép \(SPEC §17.20/);
    }
    const c = fresh();
    task(c).description += ' (GIẢ) Tác phẩm 3';
    has(c, 'warning', /mô tả: chứa tên \/ ghi chú tác phẩm đúng "\(gia\) tac pham 3"/);
    const d = fresh();
    task(d).answers[0] = 'art-02'; // art-02 has a credit: its title leaks into the route clue before it
    (d.steps[0] as any).clue += ' (GIẢ) Tranh 2';
    has(d, 'warning', /mật thư: chứa tên \/ ghi chú tác phẩm đúng "\(gia\) tranh 2"/);
    const e = fresh(); // a wrong artwork's note in the text: no warning
    task(e).description += ' (GIẢ) Tác phẩm 4';
    expect(lines(e, 'warning').filter((l) => l.includes('tác phẩm đúng'))).toEqual([]);
  });

  it('rule 5: the 5 answers next to each other (also wrapping, the first 5, the last 5) = warning', () => {
    for (const ids of [[5, 6, 7, 8, 9], [1, 2, 3, 4, 5], [19, 20, 21, 22, 23], [22, 23, 1, 2, 3]]) {
      const j = fresh();
      task(j).answers = ids.map((n) => `art-${String(n).padStart(2, '0')}`);
      has(j, 'warning', /5 đáp án đứng liền nhau/);
    }
    expect(lines(louvre, 'warning').some((l) => l.includes('liền nhau'))).toBe(false);
  });

  it('rules 6–8: no location, a route before, teaser warns, verification auto, hints order, two rooms at one box', () => {
    const a = fresh();
    task(a).location = { name: 'x', lat: 48.8609, lon: 2.3349, radius: 20 };
    has(a, 'error', /phòng Louvre nằm ngay dưới hòm vừa mở; bỏ "location"/);
    const b = fresh();
    b.steps.splice(1, 0, { id: 'T2', type: 'challenge', label: 'Thử thách 2', task: { title: 'x', description: 'y', answers: ['z'] } } as any);
    has(b, 'error', /Bước 3 \(T3\) › loại bước: trước thử thách louvre phải là một Lộ trình/);
    const c = fresh();
    step(c).teaser = '(GIẢ) gợi ý';
    has(c, 'warning', /mốc gợi ý tính từ lúc mở hòm/);
    const d = fresh();
    task(d).verification = 'host_approval';
    has(d, 'error', /máy chủ tự chấm: dùng "verification": "auto"/);
    const e = fresh();
    task(e).louvre.hints = { countAtMinutes: 70, correctAtMinutes: 40 };
    has(e, 'error', /phút gợi ý số lượng \(70\) phải nhỏ hơn/);
    const f = fresh();
    f.steps.splice(2, 0, clone(f.steps[1]) as any);
    (f.steps[2] as any).id = 'T4';
    has(f, 'warning', /hai phòng chồng nhau/);
  });
});
