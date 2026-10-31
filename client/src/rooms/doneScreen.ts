// Leg 3 Lựa chọn kép: the big "Hoàn thành" screen when a branch room is finished (n/n), then the way out. Not modal: it never takes the
// mouse or the keys (pointer-events none), fades by itself; the toast + the lit ring stay for whoever missed it.
const CSS = `
#room-done { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; pointer-events: none; opacity: 0; transition: opacity .45s;
  background: radial-gradient(ellipse at center, rgba(10, 14, 23, .55), rgba(10, 14, 23, .8)); }
#room-done.on { opacity: 1; }
#room-done .box { text-align: center; color: #fff; padding: 0 24px; max-width: 760px; }
#room-done h1 { margin: 0; font: 800 clamp(40px, 6.5vw, 88px)/1 system-ui, -apple-system, 'Segoe UI', sans-serif; letter-spacing: .04em; text-transform: uppercase;
  background: linear-gradient(180deg, #fff, #ffd98a 60%, #ffb54a); -webkit-background-clip: text; background-clip: text; color: transparent;
  filter: drop-shadow(0 6px 24px rgba(255, 181, 74, .45)); transform: scale(.7); transition: transform .6s cubic-bezier(.2, 1.4, .4, 1); }
#room-done.on h1 { transform: scale(1); }
#room-done .sub { margin: 18px 0 0; font: 600 clamp(15px, 2.2vw, 22px)/1.45 system-ui, sans-serif; color: #d6dcf0; opacity: 0; transform: translateY(8px); transition: opacity .5s .5s, transform .5s .5s; }
#room-done.on .sub { opacity: 1; transform: none; }
#room-done .way { margin: 22px auto 0; display: inline-flex; align-items: center; gap: 10px; padding: 10px 20px; border-radius: 999px; background: rgba(94, 232, 255, .14); border: 1px solid rgba(94, 232, 255, .55);
  color: #bff4ff; font: 700 clamp(14px, 2vw, 19px) system-ui, sans-serif; opacity: 0; transition: opacity .5s 1.3s; }
#room-done.on .way { opacity: 1; }
#room-done .way::before { content: ''; width: 14px; height: 14px; border-radius: 50%; border: 3px solid #5ee8ff; box-shadow: 0 0 12px #5ee8ff; }
`;
export const DONE_SHOW_MS = 6500;
/** Shows the screen for DONE_SHOW_MS (a second call restarts it). `way` = where the exit is. */
export function showRoomDone(room: string, way: string): void {
  let el = document.getElementById('room-done');
  if (!el) {
    document.head.append(Object.assign(document.createElement('style'), { textContent: CSS }));
    el = Object.assign(document.createElement('div'), { id: 'room-done' });
    document.body.append(el);
  }
  el.innerHTML = '';
  const box = Object.assign(document.createElement('div'), { className: 'box' });
  box.append(
    Object.assign(document.createElement('h1'), { textContent: 'Hoàn thành' }),
    Object.assign(document.createElement('p'), { className: 'sub', textContent: `Đội đã hoàn thành ${room}. Mật thư tiếp theo đang chờ ngoài phòng.` }),
    Object.assign(document.createElement('div'), { className: 'way', textContent: way }),
  );
  el.append(box);
  el.classList.remove('on');
  void el.offsetWidth;
  el.classList.add('on');
  clearTimeout((el as unknown as { _t?: number })._t);
  (el as unknown as { _t?: number })._t = window.setTimeout(() => el!.classList.remove('on'), DONE_SHOW_MS);
}
/** Hides it at once (the team walked out / the Host undid it). */
export const hideRoomDone = (): void => void document.getElementById('room-done')?.classList.remove('on');
