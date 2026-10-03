// Phase 8 track C: npm run → npx tsx scripts/hud-check.ts. Drives client/hudtest.html (a bare RaceHud with recording actions, dev
// server only) in headless Chrome with real keys, clicks and confirm dialogs: answer box focus / IME / Esc, countdown flip,
// Chọn / Đổi nhánh, proof card, media zoom, read-only Sổ; then the game page (main.ts) for the pointer lock when a card closes
// over the map / menu (Phase 8 fix F2). Exits 1 on a failed check or a console error. HUD_CHECK_PORT picks the Vite port.
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const root = join(import.meta.dirname, '..');
const server = await createServer({ root: join(root, 'client'), logLevel: 'warn', server: { port: Number(process.env.HUD_CHECK_PORT ?? 5199), strictPort: true } });
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }); // the game page needs WebGL
const page = await browser.newPage();
const errors: string[] = [];
page.on('console', (m) => void (m.type() === 'error' && errors.push(m.text())));
page.on('pageerror', (e) => void errors.push(e.message));
let fails = 0;
const ok = (c: boolean, msg: string) => (c ? console.log(`  ok   ${msg}`) : (fails++, console.log(`  FAIL ${msg}`)));
const ev = <T>(f: string) => page.evaluate(f) as Promise<T>;
const setup = async (card: string, o = '{}') => {
  await page.goto(`http://localhost:${process.env.HUD_CHECK_PORT ?? 5199}/hudtest.html`);
  await page.waitForFunction('window.ready === true');
  await ev(`(() => { const now = Date.now(); const base = { step: 'T1', type: 'challenge', label: 'Thử thách 1', text: 'Gợi ý', media: [], status: 'active', lockedUntil: null, lockKind: null, answers: [], receivedAt: now - 5000, completedAt: null, retryPenaltyMinutes: 3 };
    const task = { title: 'Câu đố', description: 'Mô tả', media: [], kind: 'answer', verification: 'host_approval', input: 'text', proofInstruction: '', timeLimitMinutes: null };
    const proof = { ...task, input: 'proof', kind: 'free', proofInstruction: 'Gửi ảnh' };
    const br = (a, b) => [{ id: 'A', name: 'Tính', summary: 'tóm tắt A', ...(a ? { task: a } : {}) }, { id: 'B', name: 'Ảnh', summary: 'tóm tắt B', ...(b ? { task: b } : {}) }];
    const det = { ...base, step: 'D1', type: 'detour', label: 'Lựa chọn kép', text: 'Chọn', branch: null, branches: br(), switchPenaltyMinutes: 10, switches: 0 };
    const cards = { ${card} };
    window.c = cards; window.now = now; hud.setView(view(Object.assign({}, cards.main, ${o}))); hud.update({ simTime: 0, serverNow: now, inZone: false }); })()`);
};
const overlayShown = () => ev<boolean>(`!document.querySelector('.rc-overlay').hidden`);
const inputValue = () => ev<string>(`document.querySelector('.rc-input').value`);
const active = () => ev<string>(`document.activeElement?.className ?? ''`);

console.log('answer box: a popup never takes the keys (R-10); Enter focuses, typing, Space / digits do not close, Esc blur then close');
await setup(`main: { ...base, task }`);
ok(await overlayShown(), 'full card popped up');
ok((await active()) !== 'rc-input', 'popup: answer box NOT focused by itself');
await page.keyboard.type('www');
ok((await inputValue()) === '' && (await overlayShown()), 'popup: a held W types nothing into the box');
await page.keyboard.press('Enter');
ok((await active()) === 'rc-input', 'Enter focuses the answer box');
await page.keyboard.type('xin chao 12');
await page.keyboard.press('Space');
await page.keyboard.press('Digit1');
ok(await overlayShown(), 'Space / digit typed, card still open');
ok((await ev<string>(`document.querySelector('.rc-input').value`)) === 'xin chao 12 1', 'value typed incl. space and digit');
await page.keyboard.press('Escape');
ok((await active()) !== 'rc-input' && (await overlayShown()), 'first Esc leaves the box, card stays');
await page.keyboard.press('Space');
ok(!(await overlayShown()), 'Space outside the box closes the card');
ok(JSON.stringify(await ev('opens')) === '[true,false]', 'onOpenChange true then false');

await ev(`hud.openCurrent()`);
ok((await active()) === 'rc-input', 'openCurrent (Enter in the game) focuses the box');

console.log('Tab closes from anywhere, inside the key handler (R-1)');
await setup(`main: { ...base, task }`);
await page.keyboard.press('Enter');
await page.keyboard.press('Tab');
ok(!(await overlayShown()), 'Tab inside the answer box closes the card');
await setup(`main: { ...base, task }`);
await page.keyboard.press('Tab');
ok(!(await overlayShown()), 'Tab (focus on the page) closes the card in RaceHud itself');
await ev(`hud.update({ simTime: 1, serverNow: now, inZone: true })`);
ok(await ev<boolean>(`(() => { const p = document.querySelector('.rc-prompt'); return !p.hidden && p.textContent === 'Bấm F để mở hòm mật thư'; })()`), 'F prompt: "hòm mật thư" (SPEC §17.15)');

console.log('submit: Enter sends trimmed text, clears; IME composing Enter does not');
await setup(`main: { ...base, task }`);
await page.keyboard.press('Enter');
await page.keyboard.type('  đáp án  ');
await ev(`document.querySelector('.rc-input').dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', key: 'Enter', keyCode: 229, isComposing: true, bubbles: true }))`);
ok((await ev<unknown[]>('calls')).length === 0, 'Enter while composing sends nothing');
await page.keyboard.press('Enter');
ok(JSON.stringify(await ev('calls')) === '[["answer","T1","đáp án"]]', 'Enter sends the trimmed answer for the step');
ok((await ev<string>(`document.querySelector('.rc-input').value`)) === '', 'box cleared');
await page.keyboard.press('Enter'); // empty: nothing
ok((await ev<unknown[]>('calls')).length === 1, 'empty Enter sends nothing');
ok(await ev<boolean>(`document.querySelector('.rc-input').maxLength === 200`), 'maxlength = NET.answerMax');
await page.keyboard.type('một');
await page.click('text=Gửi câu trả lời');
ok((await ev<unknown[]>('calls')).length === 2, 'the button sends too');

console.log('draft survives a redraw (card update while typing)');
await setup(`main: { ...base, task }`);
await page.keyboard.press('Enter');
await page.keyboard.type('dang go');
await ev(`hud.setView(view({ ...c.main, answers: [{ id: 1, text: 'cũ', at: now - 1000, status: 'wrong' }] }))`);
ok((await ev<string>(`document.querySelector('.rc-input').value`)) === 'dang go', 'draft kept after redraw');
ok((await active()) === 'rc-input', 'focus kept after redraw');
ok((await ev<string>(`document.querySelector('.rc-history').textContent`)).includes('Chưa đúng'), 'history shows the new answer');

console.log('pending: no box, stopwatch ticks');
await setup(`main: { ...base, status: 'pending', task, answers: [{ id: 1, text: 'x', at: now - 72000, status: 'pending' }] }`);
ok(!(await ev<boolean>(`!!document.querySelector('.rc-input')`)), 'no answer box while pending');
const t0 = await ev<string>(`document.querySelector('.rc-timer').textContent`);
await ev(`hud.update({ simTime: 1, serverNow: now + 5000, inZone: false })`);
const t1 = await ev<string>(`document.querySelector('.rc-timer').textContent`);
ok(t0 === 'Đang chờ Host duyệt · 01:12' && t1 === 'Đang chờ Host duyệt · 01:17', `stopwatch ${t0} → ${t1}`);

console.log('locked: countdown, then the card flips to the answer box by itself (with the slack)');
await setup(`main: { ...base, status: 'locked', task, lockedUntil: now + 10000, lockKind: 'retry' }`);
ok(!(await ev<boolean>(`!!document.querySelector('.rc-input')`)), 'no box while locked');
ok((await ev<string>(`document.querySelector('.rc-timer').textContent`)).startsWith('Phạt: còn 00:10'), 'countdown on the card');
ok((await ev<string>(`document.querySelector('.rc-penalty').textContent`)).startsWith('Phạt: còn 00:10'), 'countdown in the centre');
ok(await ev<boolean>(`document.querySelector('.rc-penalty').hidden`), 'centre chip hidden while the open card shows the same countdown (visual#7)');
ok((await ev<string>(`document.querySelector('.rc-timer b.rc-num')?.textContent`)) === '00:10', 'card countdown digits in the big <b class="rc-num">');
await ev(`hud.update({ simTime: 1, serverNow: now + 10500, inZone: false })`);
ok(!(await ev<boolean>(`!!document.querySelector('.rc-input')`)), 'still locked inside the slack');
await ev(`hud.update({ simTime: 2, serverNow: now + 11000, inZone: false })`);
ok(await ev<boolean>(`!!document.querySelector('.rc-input')`), 'box back after lockedUntil + slack');
ok(await ev<boolean>(`document.querySelector('.rc-penalty').hidden`), 'centre countdown gone');
await setup(`main: { ...base, status: 'locked', task, lockedUntil: now + 10000, lockKind: 'retry' }`);
await page.keyboard.press('Escape');
await ev(`hud.update({ simTime: 1, serverNow: now, inZone: false })`);
ok(await ev<boolean>(`(() => { const p = document.querySelector('.rc-penalty'); return !p.hidden && p.querySelector('b.rc-num')?.textContent === '00:10'; })()`), 'card closed: centre chip back, big digits');

console.log('louvre (fix F2): the compact card says "Chọn k/5 · Đúng x/5", beside the wrong-lock countdown until it runs out');
await setup(`main: { ...base, step: 'T3', status: 'locked', lockedUntil: now + 10000, lockKind: 'retry', task: { ...task, kind: 'louvre', verification: 'auto', input: 'room', louvre: { artworks: [], room: { x: 0, z: 0, r: 25, yaw: 0 }, picks: ['art-01', 'art-02'], attempts: 1, hintAt: [0, 0], hintCount: 5, hintCorrect: 1, maxPicks: 5 } } }`);
await page.keyboard.press('Escape');
await ev(`hud.update({ simTime: 1, serverNow: now, inZone: false })`);
ok((await ev<string>(`document.querySelector('.rc-state').textContent`)) === 'Phạt: còn 00:10 · Chọn 2/5 · Đúng 1/5', 'compact card: countdown + "Chọn 2/5 · Đúng 1/5"');
await ev(`hud.update({ simTime: 2, serverNow: now + 11000, inZone: false })`);
ok((await ev<string>(`document.querySelector('.rc-state').textContent`)) === 'Chọn 2/5 · Đúng 1/5', 'countdown over, no new card: the line drops "Phạt"');

console.log('detour choose: 1 / 2 keys, buttons lock for taskLockSeconds');
await setup(`main: { ...det, status: 'choose' }`);
ok(!(await ev<boolean>(`[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Đổi'))`)), 'no "Đổi" button in choose');
await page.keyboard.press('Digit2');
ok(JSON.stringify(await ev('calls')) === '[["branch","D1","B"]]', 'Digit2 chooses branch B');
await page.keyboard.press('Digit1');
ok((await ev<unknown[]>('calls')).length === 1, 'second press inside the lock is ignored');

console.log('detour goToBranch: "Đổi lựa chọn kép" asks first; Space after a declined confirm closes the card (R-1)');
await setup(`main: { ...det, status: 'goToBranch', branch: 'A', branches: br() }`);
ok((await ev<string>(`document.querySelector('.rc-timer.info')?.textContent ?? ''`)).startsWith('Đang làm nhánh Tính'), 'goToBranch note framed like the countdown (rc-timer info, visual#5)');
const msgs: string[] = [];
const decline = (d: import('playwright-core').Dialog) => void (msgs.push(d.message()), d.dismiss());
page.on('dialog', decline);
await page.click('text=Đổi lựa chọn kép');
ok(msgs.length === 1 && msgs[0]!.includes('10 phút') && msgs[0]!.includes('Ảnh'), `confirm text: ${msgs[0]}`);
ok((await ev<unknown[]>('calls')).length === 0, 'declined: nothing sent');
await page.keyboard.press('Space');
ok(msgs.length === 1 && !(await overlayShown()), 'Space after "Hủy": no second confirm, the card closes');
page.off('dialog', decline);
await setup(`main: { ...det, status: 'goToBranch', branch: 'A', branches: br() }`);
page.once('dialog', (d) => void d.accept());
await page.click('text=Đổi lựa chọn kép');
ok(JSON.stringify(await ev('calls')) === '[["branch","D1","B"]]', 'accepted: branch B sent');

console.log('detour pending: no Đổi; locked: Đổi present');
await setup(`main: { ...det, status: 'pending', branch: 'A', branchOpened: true, branches: br(task), answers: [{ id: 1, text: 'x', at: now - 1000, status: 'pending' }] }`);
ok(!(await ev<boolean>(`[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Đổi'))`)), 'pending: no Đổi');
await setup(`main: { ...det, status: 'locked', branch: 'A', branchOpened: true, branches: br(task), lockedUntil: now + 9000, lockKind: 'retry' }`);
ok(await ev<boolean>(`[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Đổi'))`), 'locked: Đổi present');

console.log('teaser: Enter accepts');
await setup(`main: { ...base, status: 'teaser', task: undefined }, task: { ...base, task }`);
ok((await active()) !== 'rc-input', 'teaser popup: nothing focused');
await page.keyboard.press('Enter');
ok(JSON.stringify(await ev('calls')) === '[["accept","T1"]]', 'Enter sends accept');
await ev(`hud.setView(view(c.task))`);
ok((await active()) === 'rc-input', 'after "Nhận thử thách" the task\'s answer box takes the keys (asked for, not a popup)');

console.log('proof: code, copy, no Messenger link (SPEC §17.17), "Tôi đã gửi bài" sends empty answer');
const noContact = `!document.querySelector('a.rc-btn, .rc-proof a') && ![...document.querySelectorAll('.rc-proof button')].some((b) => /Facebook|Messenger/i.test(b.textContent))`;
await setup(`main: { ...det, status: 'active', branch: 'B', branchOpened: true, branches: br(undefined, proof) }`);
ok((await ev<string>(`document.querySelector('.rc-code').textContent`)) === 'Đội Xanh-D1-B', 'submission code');
ok(await ev<boolean>(`${noContact} && [...document.querySelectorAll('.rc-proof button')].map((b) => b.textContent).join('|') === 'Copy|Tôi đã gửi bài – chờ Host duyệt'`), 'active: only Copy + "Tôi đã gửi bài", no Facebook / Messenger button');
await page.click('text=Copy');
ok(await ev<boolean>(`document.activeElement === document.body`), 'a clicked button gives the focus back');
await page.keyboard.press('Tab');
ok(!(await overlayShown()), 'Tab after clicking Copy closes the card (R-1)');
await setup(`main: { ...det, status: 'active', branch: 'B', branchOpened: true, branches: br(undefined, proof) }`);
await page.click('text=Copy');
await page.keyboard.press('Space');
ok(!(await overlayShown()), 'Space after clicking Copy closes the card (R-1)');
await setup(`main: { ...det, status: 'active', branch: 'B', branchOpened: true, branches: br(undefined, proof) }`);
await page.click('text=Tôi đã gửi bài');
ok(JSON.stringify(await ev('calls')) === '[["answer","D1",""]]', 'photo submit = answer ""');
const sendBtn = `[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Tôi đã gửi bài'))`;
await setup(`main: { ...det, status: 'pending', branch: 'B', branchOpened: true, branches: br(undefined, proof), answers: [{ id: 1, text: '', at: now - 1000, status: 'pending' }] }`);
ok(await ev<boolean>(`!!document.querySelector('.rc-code') && ${noContact} && !${sendBtn}`), 'pending: code kept, no Messenger link, no "Tôi đã gửi bài"');
await setup(`main: { ...det, status: 'locked', branch: 'B', branchOpened: true, branches: br(undefined, proof), lockedUntil: now + 9000, lockKind: 'retry' }`);
ok(await ev<boolean>(`!!document.querySelector('.rc-code') && ${noContact} && !${sendBtn}`), 'locked (Host "Phạt"): code kept, no Messenger link, no "Tôi đã gửi bài"');
await ev(`hud.toggleBook(); hud.toggleBook(); hud.showBook([{ ...c.main, status: 'active', lockedUntil: null, lockKind: null }])`);
ok(await ev<boolean>(`!!document.querySelector('.rc-book .rc-code') && ${noContact} && !${sendBtn}`), 'Sổ: code on the photo task, no Messenger link, no send button (SPEC §17.17)');

console.log('F at the branch box: the card pops up with the branch task (e2e#0)');
await setup(`main: { ...det, status: 'goToBranch', branch: 'A', branches: br() }, opened: { ...det, status: 'active', branch: 'A', branchOpened: true, branches: br(task) }`);
await page.keyboard.press('Escape');
ok(!(await overlayShown()), 'goToBranch card closed');
await ev(`hud.setView(view(c.opened))`);
ok((await overlayShown()) && (await ev<string>(`document.querySelector('.rc-overlay').textContent`)).includes('Mô tả'), 'branchOpened false → true: full card with the task');
await ev(`hud.setView(view({ ...c.opened, status: 'pending' }))`);
await page.keyboard.press('Escape');
await ev(`hud.setView(view(c.opened))`);
ok(!(await overlayShown()), 'no popup again while it stays opened');

console.log('media: image resolved, zoom, Esc closes the zoom only; links open a new tab');
await setup(`main: { ...base, type: 'route_info', label: 'Lộ trình 1', task: undefined, media: [{ url: 'r2:a.jpg', label: 'Ảnh', kind: 'image' }, { url: 'r2:none.jpg', label: '', kind: 'image' }, { url: 'https://example.org/x', label: 'Trang', kind: 'link' }] }`);
await page.waitForSelector('.rc-fig img:not([hidden])');
await page.waitForFunction(`document.querySelector('.rc-ph')?.textContent !== 'Đang tải hình…'`);
ok(await ev<boolean>(`document.querySelectorAll('.rc-fig img:not([hidden])').length === 1 && document.querySelectorAll('.rc-ph').length === 1 && document.querySelector('.rc-ph').textContent === 'Hình chưa có – báo Host'`), 'one image shown, in a race a missing one says "Hình chưa có – báo Host" (e2e#1)');
await ev(`(() => { const r = hud.actions.resolveMedia; window.asked = []; hud.actions.resolveMedia = (n) => (asked.push(n), r(n)); })()`);
await ev(`hud.setView(view({ ...c.main, text: 'Gợi ý 2' })); hud.setView(view({ ...c.main, text: 'Gợi ý 3' }))`);
ok((await ev<string[]>('asked')).length === 0, 'redraws do not fetch the missing image again');
ok(await ev<boolean>(`(() => { const ph = [...document.querySelectorAll('.rc-ph')]; return ph.length === 1 && ph[0].textContent === 'Hình chưa có – báo Host' && document.querySelectorAll('.rc-fig img:not([hidden])').length === 1; })()`), 'redrawn: the cached image without its "Đang tải hình…" box, the missing one still says so');
ok(await ev<boolean>(`getComputedStyle(document.querySelector('.rc-fig img[hidden]')).display === 'none'`), 'the image that did not load is not drawn (no broken-image icon)');
await page.keyboard.press('Escape');
await ev(`hud.openCurrent()`);
await page.waitForFunction(`document.querySelector('.rc-ph')?.textContent === 'Hình chưa có – báo Host'`);
ok(JSON.stringify(await ev('asked')) === '["none.jpg"]', 'reopening the card (Enter) asks once more (the Host may have uploaded it)');
await page.keyboard.press('Escape');
await ev(`delete hud.actions.resolveMedia; hud.openCurrent()`);
await page.waitForFunction(`document.querySelector('.rc-ph')?.textContent !== 'Đang tải hình…'`);
ok((await ev<string>(`document.querySelector('.rc-ph').textContent`)) === 'Hình chỉ tải được trong cuộc đua', 'offline (no resolveMedia): "Hình chỉ tải được trong cuộc đua"');
ok(await ev<boolean>(`(() => { const a = document.querySelector('a.rc-link'); return a.target === '_blank' && a.rel.includes('noopener') && a.textContent.startsWith('Trang'); })()`), 'link new tab');
await page.click('.rc-fig img');
ok(!(await ev<boolean>(`document.querySelector('.rc-zoom').hidden`)), 'zoom open');
await page.keyboard.press('Escape');
ok((await ev<boolean>(`document.querySelector('.rc-zoom').hidden`)) && (await overlayShown()), 'Esc closes the zoom, the card stays');

console.log('Sổ mật thư: read-only, no history, no buttons');
await setup(`main: { ...base, task }`);
await ev(`hud.toggleBook(); hud.toggleBook(); hud.showBook([{ ...c.main, answers: [{ id: 1, text: 'BÍ-MẬT', at: now - 1000, status: 'wrong' }] }])`);
await page.waitForSelector('.rc-book');
ok(await ev<boolean>(`document.querySelector('.rc-book') != null && !document.querySelector('.rc-book').textContent.includes('BÍ-MẬT') && document.querySelector('.rc-book .rc-input') == null`), 'no history / input in the Sổ');

// main.ts on the real (offline DEV) game page: requestPointerLock is counted and never granted (like Firefox refusing a lock
// asked from Esc), the card is the demo popup (?card=answer&full) over the map (?map) / the menu (?menu).
console.log('game page: a card closed over the map / menu keeps the pointer free (R-2); a refused lock shows the help again (R-3)');
const game = await browser.newPage();
game.on('console', (m) => void (m.type() === 'error' && errors.push(`game: ${m.text()}`)));
game.on('pageerror', (e) => void errors.push(`game: ${e.message}`));
await game.addInitScript(() => {
  const w = window as unknown as { locks: number };
  w.locks = 0;
  HTMLCanvasElement.prototype.requestPointerLock = function () {
    w.locks++;
  } as never;
});
const gev = <T>(f: string) => game.evaluate(f) as Promise<T>;
const boot = async (q: string) => {
  await game.goto(`http://localhost:${process.env.HUD_CHECK_PORT ?? 5199}/?player&npc=0&wait=1&card=answer&full&${q}`);
  await game.waitForFunction('window.__READY__ === true', null, { timeout: 90_000 });
};
const G = `window.__GAME__`;
const cardOpen = () => gev<boolean>(`${G}.raceHud.open`);
await boot('map');
ok((await cardOpen()) && (await gev<boolean>(`${G}.fullMap().isOpen`)), 'card popped up over the open map');
await game.keyboard.press('Escape');
ok(!(await cardOpen()) && (await gev<boolean>(`${G}.fullMap().isOpen`)) && (await gev<number>('locks')) === 0, 'Esc: card closed, map still open, no pointer lock');
await gev(`${G}.raceHud.openCurrent()`);
await game.keyboard.press('Tab');
ok(!(await cardOpen()) && (await gev<boolean>(`${G}.fullMap().isOpen`)) && (await gev<number>('locks')) === 0, 'Tab from the answer box: card closed, map still open, no pointer lock');
await gev(`${G}.raceHud.openCurrent()`);
await game.keyboard.press('Escape'); // leaves the answer box
await game.keyboard.press('KeyM');
await game.waitForFunction(`!${G}.fullMap().isOpen`);
ok((await cardOpen()) && (await gev<number>('locks')) === 0, 'M under the card: map closed, the card keeps the pointer');
await game.keyboard.press('Escape');
ok(!(await cardOpen()) && (await gev<number>('locks')) === 1, 'Esc with nothing else open: the pointer is asked for');
ok(await gev<boolean>(`!document.getElementById('help').hidden`), 'lock refused: "Nhấp chuột để chơi" shown again');
await boot('menu');
ok((await cardOpen()) && (await gev<boolean>(`${G}.menu.isOpen`)), 'card popped up over the menu');
await game.keyboard.press('Escape');
ok(!(await cardOpen()) && (await gev<boolean>(`${G}.menu.isOpen`)) && (await gev<number>('locks')) === 0, 'Esc: card closed, menu still open, no pointer lock');
await game.close();

console.log(errors.length ? `console errors:\n${errors.join('\n')}` : 'no console errors');
await browser.close();
await server.close();
process.exit(fails || errors.length ? 1 : 0);
