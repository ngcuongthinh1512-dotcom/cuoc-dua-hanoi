import { describe, expect, it } from 'vitest';
import { latLonToWorld } from '../projection.ts';
import { checkLeg, normalizeAnswer, parseLeg, placeOf, r2Names } from './check.ts';
import { legSchema } from './schema.ts';
import { branchZone, startSpot, stepZones } from './zones.ts';

const dest = (lat: number, lon: number, radius = 20) => ({ name: `P ${lat}`, lat, lon, radius });
/** A short valid leg around Concorde (fake content). */
const mini = () => ({
  id: 'mini',
  title: 'Mini',
  start: { name: 'Xuất phát', lat: 48.8655, lon: 2.3212 },
  steps: [
    { id: 'L1', type: 'route_info', label: 'Lộ trình 1', clue: 'Đi tới cột đèn', destination: dest(48.8662, 2.3195) },
    { id: 'T1', type: 'challenge', label: 'Thử thách 1', task: { title: 'Đếm', description: 'Đếm cột đèn', answers: ['bảy'] } },
    {
      id: 'D1', type: 'detour', label: 'Lựa chọn kép', clue: 'Chọn một',
      branches: [
        { id: 'A', name: 'Nhanh', summary: 'Nhanh', task: { title: 'A', description: 'a', answers: ['Xanh lá'] } },
        { id: 'B', name: 'Chậm', summary: 'Chậm', task: { title: 'B', description: 'b', verification: 'host_approval', kind: 'free', proofInstruction: 'Gửi ảnh', location: dest(48.8670, 2.3180, 30) } },
      ],
    },
    { id: 'L2', type: 'route_info', label: 'Lộ trình 2', clue: 'Về đích', transport: { mandatory: 'walk' }, destination: dest(48.8640, 2.3220) },
    { id: 'PS', type: 'pit_stop', label: 'Về đích', destination: dest(48.8640, 2.3220) },
  ],
  hostApproval: { contactUrl: 'https://m.me/example' },
});
type Mini = ReturnType<typeof mini> & Record<string, unknown>;
/** Phase 8 rule 6: branch A of the fixture has no place of its own (kept: the zone tests rely on it). */
const NO_PLACE_A = 'Bước 3 (D1) › nhánh A › nhiệm vụ › nơi làm nhiệm vụ: nhánh không có nơi riêng: hòm nhánh đứng cùng chỗ hòm lộ trình trước (chồng lên nhau); nên cho nhánh một nơi riêng';
const errors = (j: unknown) => {
  const r = parseLeg(j);
  return r.issues.filter((i) => i.level === 'error').map((i) => `${i.where}: ${i.message}`);
};

describe('leg schema', () => {
  it('parses a short leg, filling every block from the defaults (the demo values)', () => {
    const r = parseLeg(mini());
    expect(r.issues.map((i) => `${i.where}: ${i.message}`)).toEqual([NO_PLACE_A]);
    expect(r.ok && r.leg.movement).toEqual({ footSpeed: 4, bikeSpeedMultiplier: 1.3 });
    expect(r.ok && r.leg.boxReveal).toEqual({ radius: 150, hysteresis: 20 });
    expect(r.ok && r.leg.steps[0]).toMatchObject({ transport: { allowed: 'any' } });
    expect(r.ok && r.leg.steps[1]).toMatchObject({ teaser: '', task: { kind: 'answer', verification: 'auto', media: [], location: null, timeLimitMinutes: null } });
  });

  it('refuses a Roadblock step, in Vietnamese, naming the step (SPEC §17.12: no Vượt rào)', () => {
    const j = mini() as Mini;
    j.steps.splice(1, 0, { id: 'R1', type: 'roadblock', label: 'Vượt rào' } as never);
    expect(errors(j)).toEqual(['Bước 2 (R1) › loại bước: loại bước "roadblock" không có; chỉ dùng: route_info, detour, challenge, pit_stop (trò chơi này không có Vượt rào / roadblock)']);
  });

  it('names the field of typos, radius out of 15–40 m, missing fields, bad transport', () => {
    const j = mini() as Mini;
    Object.assign(j.steps[0]!, { destination: { ...dest(48.8662, 2.3195, 50), radious: 3 }, transport: { allowed: 'walk' } });
    delete (j.steps[3] as { clue?: string }).clue;
    expect(errors(j)).toEqual([
      'Bước 1 (L1) › phương tiện: phải là {"allowed": "any"} (tự chọn) hoặc {"mandatory": "walk"} (bắt buộc đi bộ)',
      'Bước 1 (L1) › điểm đến › bán kính: phải ≤ 40 m (bán kính 15–40 m)',
      'Bước 1 (L1) › điểm đến: có trường lạ: "radious" (gõ sai tên trường?)',
      'Bước 4 (L2) › mật thư: bị thiếu',
    ]);
  });

  it('checks the order: first a route, one Pit Stop at the end, a route right before it, unique ids', () => {
    const j = mini() as Mini;
    j.steps.reverse();
    expect(errors(j)).toEqual([
      'Bước 1 (PS) › loại bước: bước đầu tiên phải là lộ trình (route_info): đội nhận mật thư đầu tiên ở ngoài trò chơi',
      'các bước: phải có đúng một Chặng dừng (pit_stop) và nó là bước cuối cùng',
    ]);
    const m = mini() as Mini;
    m.steps.splice(3, 1); // D1 right before the Pit Stop
    expect(errors(m)).toEqual(['Bước 4 (PS): bước ngay trước Chặng dừng phải là lộ trình (route_info) dẫn tới Chặng dừng']);
    const k = mini() as Mini;
    k.steps[3]!.id = 'L1';
    expect(errors(k)).toEqual(['Bước 4 (L1) › mã: mã "L1" trùng với một bước khác']);
  });

  it('keeps every point on the race map', () => {
    const j = mini() as Mini;
    j.start = { name: 'Versailles', lat: 48.8049, lon: 2.1204 };
    expect(errors(j)).toEqual(['điểm xuất phát: (48.8049, 2.1204) nằm ngoài bản đồ đua (vĩ độ 48.845–48.878, kinh độ 2.285–2.36)']);
  });

  it('keeps the bike racks of task places / detour branches on the map too: the SERVER refuses a rack typo (verify3 m3)', () => {
    const j = JSON.parse(JSON.stringify(mini()));
    j.steps[1].task.location = { ...dest(48.8662, 2.3195), bikeParking: { lat: 47.8662, lon: 2.3195 } };
    j.steps[2].branches[1].task.location.bikeParking = { lat: 48.867, lon: 3.318 };
    const box = '(vĩ độ 48.845–48.878, kinh độ 2.285–2.36)';
    expect(errors(j)).toEqual([
      `Bước 2 (T1) › nhiệm vụ › nơi làm nhiệm vụ › bãi xe: (47.8662, 2.3195) nằm ngoài bản đồ đua ${box}`,
      `Bước 3 (D1) › nhánh B › nhiệm vụ › nơi làm nhiệm vụ › bãi xe: (48.867, 3.318) nằm ngoài bản đồ đua ${box}`,
    ]);
  });

  it('an answer in a task place name leaks too (teams read it on the card: "Địa điểm: …")', () => {
    const j = JSON.parse(JSON.stringify(mini()));
    j.steps[1].task.location = { ...dest(48.8662, 2.3195), name: 'Cột đèn số Bảy' };
    expect(parseLeg(j).issues.map((i) => `${i.level} ${i.where}: ${i.message}`)).toEqual([
      `warning ${NO_PLACE_A}`,
      'warning Bước 2 (T1) › nhiệm vụ › nơi làm nhiệm vụ › tên: chứa đáp án "bay" của bước 2 (T1): đội đọc được trước khi giải',
    ]);
  });

  it('refuses a time zone the Host page cannot format (review fix: Intl throws, the Host screen stopped drawing)', () => {
    for (const tz of ['Paris', 'UTC+7', 'Europe/Paris ']) expect(errors({ ...mini(), timezone: tz })).toEqual([`múi giờ: "${tz}" không phải múi giờ hợp lệ; dùng tên múi giờ chuẩn dạng Châu_lục/Thành_phố (tên IANA), ví dụ "Asia/Ho_Chi_Minh", "Europe/Paris"`]);
    expect(errors({ ...mini(), timezone: 'Europe/Paris' })).toEqual([]);
  });

  it('lists blanks the Host must still fill (a draft loads) and answers leaking into texts', () => {
    const j = mini() as Mini;
    Object.assign(j.steps[1]!, { task: { title: '', description: '', answers: [] } });
    j.hostApproval = { contactUrl: '' };
    (j.steps[0] as { clue: string }).clue = 'Đi tới cột đèn XANH  LÁ';
    const r = parseLeg(j);
    expect(r.ok).toBe(true);
    expect(r.issues.map((i) => `${i.level} ${i.where}: ${i.message}`)).toEqual([
      'blank Bước 2 (T1) › nhiệm vụ › tiêu đề: tiêu đề nhiệm vụ còn trống',
      'blank Bước 2 (T1) › nhiệm vụ › mô tả: mô tả nhiệm vụ còn trống',
      'blank Bước 2 (T1) › nhiệm vụ › đáp án: đáp án (cách xác nhận "auto") còn trống',
      `warning ${NO_PLACE_A}`,
      'blank Host duyệt › link Facebook của Host: link Facebook của Host còn trống (có nhiệm vụ Host duyệt)',
      'warning Bước 1 (L1) › mật thư: chứa đáp án "xanh la" của bước 3 (D1): đội đọc được trước khi giải',
    ]);
  });

  it('uses the map facts the CLI injects: buildings, walking routes', () => {
    const leg = legSchema.parse(mini());
    const l1 = latLonToWorld(48.8662, 2.3195);
    const geo = {
      building: (x: number, z: number) => (Math.hypot(x - l1.x, z - l1.z) < 1 ? 'yes' : null),
      walk: (_a: unknown, b: { x: number; z: number }) => (b.z > 0 ? null : { meters: 100, snapA: 1, snapB: 2 }),
    };
    expect(checkLeg(leg, geo).map((i) => `${i.where}: ${i.message}`)).toEqual([
      NO_PLACE_A,
      'Bước 1 (L1) › điểm đến: tâm vùng nằm trong một tòa nhà (yes); dời ra vỉa hè / quảng trường',
      'Bước 4 (L2) › điểm đến: không đi bộ tới được từ bước 3 (D1) nhánh A theo đồ thị đường',
      'Bước 4 (L2) › điểm đến: không đi bộ tới được từ bước 3 (D1) nhánh B theo đồ thị đường',
    ]);
  });

  it('checks a detour branch at its own place and the bike racks (critic: both were skipped)', () => {
    const j = mini() as Mini;
    (j.steps[0] as { destination: object }).destination = { ...dest(48.8662, 2.3195), bikeParking: { lat: 48.8662, lon: 2.3196 } };
    const leg = legSchema.parse(j);
    const b = latLonToWorld(48.867, 2.318);
    const geo = {
      building: (x: number, z: number) => (Math.hypot(x - b.x, z - b.z) < 1 ? 'apartments' : null),
      walk: (a: { x: number; z: number }, to: { x: number; z: number }) => (Math.hypot(a.x - b.x, a.z - b.z) < 1 && to.z > 0 ? null : { meters: 100, snapA: 1, snapB: 2 }),
    };
    expect(checkLeg(leg, geo).map((i) => `${i.level} ${i.where}: ${i.message}`)).toEqual([
      `warning ${NO_PLACE_A}`,
      'warning Bước 1 (L1) › điểm đến › bãi xe: bãi xe cách tâm 7 m, nằm trong vùng (bán kính 20 m); nên đặt ngoài vùng ≈ 20 m',
      'error Bước 3 (D1) › nhánh B › nhiệm vụ › nơi làm nhiệm vụ: tâm vùng nằm trong một tòa nhà (apartments); dời ra vỉa hè / quảng trường',
      'error Bước 4 (L2) › điểm đến: không đi bộ tới được từ bước 3 (D1) nhánh B theo đồ thị đường',
    ]);
  });

  it('normalizes answers: case, Vietnamese diacritics, đ, extra spaces', () => {
    expect(normalizeAnswer('  Tháp   ĐỒNG hồ ')).toBe('thap dong ho');
  });

  it('labels paths for people', () => {
    expect(placeOf(mini(), ['steps', 2, 'branches', 1, 'task', 'title'])).toBe('Bước 3 (D1) › nhánh B › nhiệm vụ › tiêu đề');
    expect(placeOf(mini(), [])).toBe('cả file');
  });
});

describe('zones', () => {
  const leg = legSchema.parse(mini());
  const zones = stepZones(leg);
  const at = (lat: number, lon: number) => latLonToWorld(lat, lon);

  it('route → its destination; task → where the team is; the route before the Pit Stop → the Pit Stop', () => {
    expect(zones[0]).toMatchObject({ x: at(48.8662, 2.3195).x, z: at(48.8662, 2.3195).z, r: 20 });
    expect(zones[1]).toBe(zones[0]); // T1 at L1
    expect(zones[2]).toBe(zones[0]); // D1 at L1
    expect(zones[3]).toEqual(zones[4]); // L2 is done entering the Pit Stop zone
    expect(branchZone(leg, zones, 2, 'A')).toBe(zones[0]);
    expect(branchZone(leg, zones, 2, 'B')).toMatchObject({ r: 30, x: at(48.867, 2.318).x });
    expect(branchZone(leg, zones, 1, 'A')).toBeNull();
  });

  it('keys bike racks by point, not by step (critic B1: L1 box + T1 + D1 at one point = one rack)', () => {
    expect(new Set(zones.slice(0, 3).map((z) => z.rack)).size).toBe(1);
    expect(zones[3]!.rack).toBe(zones[4]!.rack);
    expect(zones[0]!.rack).not.toBe(zones[3]!.rack);
    expect(zones[0]!.parking).toBeNull();
  });

  it('spreads teams arriving together around the start, inside spreadMeters', () => {
    const s = at(48.8655, 2.3212);
    const spots = Array.from({ length: 8 }, (_, i) => startSpot(leg, i + 1));
    for (const p of spots) expect(Math.hypot(p.x - s.x, p.z - s.z)).toBeLessThanOrEqual(leg.start.spreadMeters);
    for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) expect(Math.hypot(spots[i]!.x - spots[j]!.x, spots[i]!.z - spots[j]!.z)).toBeGreaterThan(1.2);
  });
});

describe('Phase 8 leg fields and rules (docs/plans/phase8.md D2)', () => {
  const lines = (j: unknown) => parseLeg(j).issues.map((i) => `${i.level} ${i.where}: ${i.message}`).filter((l) => !l.endsWith(NO_PLACE_A));
  type J = ReturnType<typeof mini> & { steps: any[]; [k: string]: unknown };
  const j = () => JSON.parse(JSON.stringify(mini())) as J;

  it('a Phase 7 file still parses; every new field has its default', () => {
    const r = parseLeg(mini());
    if (!r.ok) throw new Error('mini');
    expect(r.leg.penalties).toMatchObject({ retryLockMinutes: 3, branchSwitchLockMinutes: 10 });
    expect(r.leg.hostAlerts).toEqual({ stuckMinutes: 45 });
    expect(r.leg.steps[0]).toMatchObject({ media: [], destination: { yawDeg: 0 } });
    expect(r.leg.steps[1]).toMatchObject({ task: { referenceAnswers: [], retryLockMinutes: null, media: [] } });
    expect(r.leg.steps[2]).toMatchObject({ media: [] });
  });

  it('media: a string or {url, label}, always {url, label} parsed, and the stored leg parses again (DO wake)', () => {
    const k = j();
    k.steps[0].media = ['https://example.invalid/gia/a', { url: 'r2:gia-1.jpg', label: '(GIẢ) Hình' }];
    k.steps[1].task.media = ['r2:gia-2.webp'];
    const r = parseLeg(k);
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    expect(r.leg.steps[0]).toMatchObject({ media: [{ url: 'https://example.invalid/gia/a', label: '' }, { url: 'r2:gia-1.jpg', label: '(GIẢ) Hình' }] });
    const again = parseLeg(JSON.parse(JSON.stringify(r.leg)));
    expect(again.ok && again.leg).toEqual(r.leg);
    expect(r2Names(r.leg)).toEqual(['gia-1.jpg', 'gia-2.webp']);
    k.steps[0].media = [42];
    expect(errors(k)).toEqual(['Bước 1 (L1) › hình / liên kết › mục 1: phải là một chuỗi ("https://…" hoặc "r2:<tên hình>") hoặc {"url": "…", "label": "…"}']);
  });

  it('media rules: r2 name pattern (error), an image used twice (warning), a link that is not http(s) (error)', () => {
    const k = j();
    k.steps[0].media = ['r2:có dấu.jpg', 'r2:a.gif', 'r2:ok.png', 'www.example.com', { url: 'ftp://x.example/y', label: 'Video' }];
    k.steps[1].task.media = ['r2:ok.png'];
    expect(lines(k)).toEqual([
      'error Bước 1 (L1) › hình / liên kết › mục 1 › liên kết: tên hình "có dấu.jpg" không hợp lệ: chỉ chữ không dấu, số, dấu . _ -, tối đa 64 ký tự, đuôi .jpg / .jpeg / .png / .webp',
      'error Bước 1 (L1) › hình / liên kết › mục 2 › liên kết: tên hình "a.gif" không hợp lệ: chỉ chữ không dấu, số, dấu . _ -, tối đa 64 ký tự, đuôi .jpg / .jpeg / .png / .webp',
      'error Bước 1 (L1) › hình / liên kết › mục 4 › liên kết: "www.example.com" không phải liên kết hợp lệ: phải bắt đầu bằng https:// (hoặc "r2:<tên hình>" cho hình tải lên trang Host)',
      'error Bước 1 (L1) › hình / liên kết › mục 5 › liên kết: "ftp://x.example/y" không phải liên kết hợp lệ: phải bắt đầu bằng https:// (hoặc "r2:<tên hình>" cho hình tải lên trang Host)',
      'warning Bước 2 (T1) › nhiệm vụ › hình / liên kết › mục 1 › liên kết: hình "ok.png" đã dùng ở Bước 1 (L1) › hình / liên kết › mục 3: kiểm tra có nhầm hình không',
    ]);
  });

  it('host_approval + typed answer needs no proof instruction / Messenger link (gap 1); a photo task (free) does', () => {
    const k = j();
    k.hostApproval = { contactUrl: '' };
    k.steps[2].branches[1].task.proofInstruction = '';
    k.steps[1].task = { title: 'Đếm', description: 'Đếm cột đèn', verification: 'host_approval' }; // kind answer, no answers, no reference
    expect(lines(k)).toEqual([
      'blank Bước 3 (D1) › nhánh B › nhiệm vụ › hướng dẫn gửi bài: hướng dẫn gửi bài còn trống',
      'blank Host duyệt › link Facebook của Host: link Facebook của Host còn trống (có nhiệm vụ Host duyệt)',
    ]);
    k.steps[2].branches[1].task.verification = 'auto';
    k.steps[2].branches[1].task.kind = 'answer';
    k.steps[2].branches[1].task.answers = ['đỏ'];
    expect(lines(k)).toEqual([]);
  });

  it('answer leaks are judged in step order (gap 9): a later text may say it; reference answers count; another branch\'s task does not', () => {
    const k = j();
    k.steps[3].clue = 'Về đích, đáp án vừa rồi là BẢY'; // L2, after T1: fine
    expect(lines(k)).toEqual([]);
    k.steps[1].task.referenceAnswers = ['cột đèn xanh'];
    k.steps[0].clue = 'Đi tới cột đèn xanh';
    expect(lines(k)).toEqual(['warning Bước 1 (L1) › mật thư: chứa đáp án tham khảo "cot den xanh" của bước 2 (T1): đội đọc được trước khi giải']);
    const d = j();
    d.steps[2].branches[1].task.description = 'Nhánh kia trả lời Xanh lá'; // in B's box: a team on A never reads it
    expect(lines(d)).toEqual([]);
    d.steps[2].branches[1].summary = 'Không phải xanh lá'; // both summaries are on the card
    expect(lines(d)).toEqual(['warning Bước 3 (D1) › nhánh B › mô tả ngắn: chứa đáp án "xanh la" của bước 3 (D1): đội đọc được trước khi giải']);
  });

  it('"[CHƯA NHẬP …]" anywhere is a blank (gap 10, critic M4); duplicate labels, unplayed kinds, sub-minute penalties warn', () => {
    const k = j();
    k.start.name = '[CHƯA NHẬP tên điểm xuất phát]';
    k.steps[1].task.answers = ['[chưa nhập đáp án]'];
    k.steps[0].media = [{ url: 'https://example.invalid/v', label: '[CHƯA NHẬP nhãn]' }];
    expect(lines(k)).toEqual([
      'blank điểm xuất phát › tên: còn giữ chỗ "[CHƯA NHẬP tên điểm xuất phát]": nhập nội dung thật',
      'blank Bước 1 (L1) › hình / liên kết › mục 1 › nhãn liên kết: còn giữ chỗ "[CHƯA NHẬP nhãn]": nhập nội dung thật',
      'blank Bước 2 (T1) › nhiệm vụ › đáp án › mục 1: còn giữ chỗ "[chưa nhập đáp án]": nhập nội dung thật',
    ]);
    const w = j();
    w.steps[3].label = 'Lộ trình 1';
    w.steps[1].task.kind = 'cipher';
    w.penalties = { retryLockMinutes: 0.1, branchSwitchLockMinutes: 0.2 };
    expect(lines(w)).toEqual([
      'warning Bước 2 (T1) › nhiệm vụ › kiểu nhiệm vụ: kiểu "cipher" chưa có trong game (hoãn): máy chủ xử lý như "answer" (đội gõ đáp án)',
      'warning Bước 4 (L2) › tên bước: tên bước "Lộ trình 1" trùng với bước 1: đội và Host khó phân biệt',
      'warning phạt › phút khóa sau khi bị phạt: phạt dưới 1 phút (0.1): chỉ dùng cho chặng test',
      'warning phạt › phút khóa khi đổi nhánh: phạt dưới 1 phút (0.2): chỉ dùng cho chặng test',
    ]);
  });

  it('a box faces destination.yawDeg (zone yaw in rad, default north)', () => {
    const k = j();
    k.steps[0].destination.yawDeg = 90;
    const r = parseLeg(k);
    if (!r.ok) throw new Error('k');
    expect(stepZones(r.leg)[0]!.yaw).toBeCloseTo(Math.PI / 2);
    expect(stepZones(r.leg)[3]!.yaw).toBe(0);
  });
});
