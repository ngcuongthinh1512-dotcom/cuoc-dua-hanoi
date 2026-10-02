// Phase 8 track C: npm run → npx tsx scripts/hud-check.ts. Drives client/hudtest.html (a bare RaceHud with recording actions, dev
// server only) in headless Chrome with real keys, clicks and confirm dialogs: answer box focus / IME / Esc, countdown flip,
// Chọn / Đổi nhánh, proof card, media zoom, read-only Sổ. Exits 1 on a failed check or a console error. HUD_CHECK_PORT picks the Vite port.
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const root = join(import.meta.dirname, '..');
const server = await createServer({ root: join(root, 'client'), logLevel: 'warn', server: { port: Number(process.env.HUD_CHECK_PORT ?? 5199), strictPort: true } });
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
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
    const proof = { ...task, input: 'proof', kind: 'free', proofInstruction: 'Gửi ảnh', contactUrl: 'https://m.me/gia', contactLabel: 'Nhắn Host' };
    const br = (a, b) => [{ id: 'A', name: 'Tính', summary: 'tóm tắt A', ...(a ? { task: a } : {}) }, { id: 'B', name: 'Ảnh', summary: 'tóm tắt B', ...(b ? { task: b } : {}) }];
    const det = { ...base, step: 'D1', type: 'detour', label: 'Lựa chọn kép', text: 'Chọn', branch: null, branches: br(), switchPenaltyMinutes: 10, switches: 0 };
    const cards = { ${card} };
    window.c = cards; window.now = now; hud.setView(view(Object.assign({}, cards.main, ${o}))); hud.update({ simTime: 0, serverNow: now, inZone: false }); })()`);
};
const overlayShown = () => ev<boolean>(`!document.querySelector('.rc-overlay').hidden`);
const active = () => ev<string>(`document.activeElement?.className ?? ''`);

console.log('answer box: focus, typing, Space / digits do not close, Esc blur then close');
await setup(`main: { ...base, task }`);
ok(await overlayShown(), 'full card popped up');
ok((await active()) === 'rc-input', 'answer box focused by itself');
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

await setup(`main: { ...base, task }`);
await page.keyboard.press('Tab');
ok(!(await overlayShown()), 'Tab inside the answer box closes the card (main.ts never sees keys typed in a field)');

console.log('submit: Enter sends trimmed text, clears; IME composing Enter does not');
await setup(`main: { ...base, task }`);
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
await ev(`hud.update({ simTime: 1, serverNow: now + 10500, inZone: false })`);
ok(!(await ev<boolean>(`!!document.querySelector('.rc-input')`)), 'still locked inside the slack');
await ev(`hud.update({ simTime: 2, serverNow: now + 11000, inZone: false })`);
ok(await ev<boolean>(`!!document.querySelector('.rc-input')`), 'box back after lockedUntil + slack');
ok(await ev<boolean>(`document.querySelector('.rc-penalty').hidden`), 'centre countdown gone');

console.log('detour choose: 1 / 2 keys, buttons lock for taskLockSeconds');
await setup(`main: { ...det, status: 'choose' }`);
ok(!(await ev<boolean>(`[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Đổi'))`)), 'no "Đổi" button in choose');
await page.keyboard.press('Digit2');
ok(JSON.stringify(await ev('calls')) === '[["branch","D1","B"]]', 'Digit2 chooses branch B');
await page.keyboard.press('Digit1');
ok((await ev<unknown[]>('calls')).length === 1, 'second press inside the lock is ignored');

console.log('detour goToBranch: "Đổi lựa chọn kép" asks first');
await setup(`main: { ...det, status: 'goToBranch', branch: 'A', branches: br() }`);
const msgs: string[] = [];
page.once('dialog', (d) => void (msgs.push(d.message()), d.dismiss()));
await page.click('text=Đổi lựa chọn kép');
ok(msgs.length === 1 && msgs[0]!.includes('10 phút') && msgs[0]!.includes('Ảnh'), `confirm text: ${msgs[0]}`);
ok((await ev<unknown[]>('calls')).length === 0, 'declined: nothing sent');
page.once('dialog', (d) => void d.accept());
await page.click('text=Đổi lựa chọn kép');
ok(JSON.stringify(await ev('calls')) === '[["branch","D1","B"]]', 'accepted: branch B sent');

console.log('detour pending: no Đổi; locked: Đổi present');
await setup(`main: { ...det, status: 'pending', branch: 'A', branchOpened: true, branches: br(task), answers: [{ id: 1, text: 'x', at: now - 1000, status: 'pending' }] }`);
ok(!(await ev<boolean>(`[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Đổi'))`)), 'pending: no Đổi');
await setup(`main: { ...det, status: 'locked', branch: 'A', branchOpened: true, branches: br(task), lockedUntil: now + 9000, lockKind: 'retry' }`);
ok(await ev<boolean>(`[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Đổi'))`), 'locked: Đổi present');

console.log('teaser: Enter accepts');
await setup(`main: { ...base, status: 'teaser', task: undefined }`);
await page.keyboard.press('Enter');
ok(JSON.stringify(await ev('calls')) === '[["accept","T1"]]', 'Enter sends accept');

console.log('proof: code, copy, contact link, "Tôi đã gửi bài" sends empty answer');
await setup(`main: { ...det, status: 'active', branch: 'B', branchOpened: true, branches: br(undefined, proof) }`);
ok((await ev<string>(`document.querySelector('.rc-code').textContent`)) === 'Đội Xanh-D1-B', 'submission code');
ok(await ev<boolean>(`(() => { const a = document.querySelector('a.rc-contact'); return a.target === '_blank' && a.rel.includes('noopener') && a.href === 'https://m.me/gia'; })()`), 'contact link new tab');
await page.click('text=Copy');
await page.keyboard.press('Space');
ok(await overlayShown(), 'Space on a focused button presses it, it does not close the card');
await page.click('text=Tôi đã gửi bài');
ok(JSON.stringify(await ev('calls')) === '[["answer","D1",""]]', 'photo submit = answer ""');

console.log('media: image resolved, zoom, Esc closes the zoom only; links open a new tab');
await setup(`main: { ...base, type: 'route_info', label: 'Lộ trình 1', task: undefined, media: [{ url: 'r2:a.jpg', label: 'Ảnh', kind: 'image' }, { url: 'r2:none.jpg', label: '', kind: 'image' }, { url: 'https://example.org/x', label: 'Trang', kind: 'link' }] }`);
await page.waitForSelector('.rc-fig img:not([hidden])');
ok(await ev<boolean>(`document.querySelectorAll('.rc-fig img:not([hidden])').length === 1 && document.querySelector('.rc-ph').textContent.includes('cuộc đua')`), 'one image shown, one offline placeholder');
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

console.log(errors.length ? `console errors:\n${errors.join('\n')}` : 'no console errors');
await browser.close();
await server.close();
process.exit(fails || errors.length ? 1 : 0);
