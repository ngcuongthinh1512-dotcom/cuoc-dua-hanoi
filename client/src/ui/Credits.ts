// "Ghi nguồn" panel (SPEC §17.7): opened from the attribution line, lists public/credits.json (written by
// scripts/process-assets.ts: map data + every downloaded asset).
interface Credit { title: string; text: string; licence: string; url: string }

export function initCredits() {
  const $ = (id: string) => document.getElementById(id)!;
  const [panel, list] = [$('credits-panel'), $('credits-list')];
  let loaded = false;
  $('credits-open').addEventListener('click', async () => {
    panel.hidden = false;
    if (loaded) return;
    loaded = true;
    try {
      const res = await fetch(new URL('credits.json', location.href));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      for (const c of (await res.json()) as Credit[]) {
        const li = document.createElement('li');
        const a = Object.assign(document.createElement('a'), { href: c.url, target: '_blank', rel: 'noopener', textContent: c.licence });
        li.append(`${c.text} · `, a);
        list.append(li);
      }
    } catch (err) {
      console.warn('credits.json missing or unreadable', err);
      list.textContent = 'Không tải được danh sách ghi nguồn.';
      loaded = false;
    }
  });
  $('credits-close').addEventListener('click', () => void (panel.hidden = true));
}
