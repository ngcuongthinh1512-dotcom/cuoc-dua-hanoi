// "Ghi nguồn" panel (SPEC §17.7): opened from the attribution line, lists public/credits.json (written by
// scripts/process-assets.ts: map data + every downloaded asset). Leg 2: the Louvre room's gate / artwork section is gone.
export interface Credit { title: string; text: string; licence: string; url: string }

/** credits.json lines to draw: a licence already said by the text is not repeated (link kept on the text). Pure. */
export const baseLines = (all: readonly Credit[]): { text: string; licence: string; url: string }[] =>
  all.map((c) => (c.text.endsWith(c.licence) ? { text: c.text.slice(0, -c.licence.length).replace(/[:·\s]+$/, ''), licence: c.licence, url: c.url } : c));

export function initCredits() {
  const $ = (id: string) => document.getElementById(id)!;
  const [panel, list] = [$('credits-panel'), $('credits-list')];
  let base: Credit[] | null = null; // credits.json, once loaded
  let loading = false;
  const draw = () => {
    if (panel.hidden) return;
    if (!base && loading) return void (list.textContent = 'Đang tải…');
    const lines = base
      ? baseLines(base).map((c) => {
          const li = document.createElement('li');
          li.append(`${c.text} · `, Object.assign(document.createElement('a'), { href: c.url, target: '_blank', rel: 'noopener', textContent: c.licence }));
          return li;
        })
      : [Object.assign(document.createElement('li'), { textContent: 'Không tải được danh sách ghi nguồn.' })];
    list.replaceChildren(...lines);
  };
  const load = async () => {
    if (base || loading) return;
    loading = true;
    try {
      const res = await fetch(new URL('credits.json', location.href));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      base = (await res.json()) as Credit[];
    } catch (err) {
      console.warn('credits.json missing or unreadable', err);
    }
    loading = false;
    draw();
  };
  $('credits-open').addEventListener('click', () => {
    panel.hidden = false;
    void load(); // sets `loading` first: the panel says "Đang tải…"
    draw();
  });
  $('credits-close').addEventListener('click', () => void (panel.hidden = true));
  addEventListener('keydown', (e) => void (e.code === 'Escape' && (panel.hidden = true)));
}
