import { worldToLatLon } from '@race/shared';
import type { Vector3, WebGLRenderer } from 'three';
import { debugOverlay } from '../config.ts';

type DebugStats = {
  fps: number;
  workMs: number;
  renderer: WebGLRenderer;
  position: Vector3;
  speed: number;
  chunks: { loaded: number; pending: number };
  colliders: number;
  /** One line about the player (Phase 3), absent in fly-only mode. */
  player?: string;
  /** Phase 4: bike speed / lean / surface, or on foot. */
  bike?: string;
  /** Phase 4B: NPC cars / pedestrians / density / sim time. */
  npc?: string;
};

/** F3 / ` panel (SPEC §14). Ping and visible players: TODO.md (Phase 6). */
export function createDebugOverlay(visible: boolean) {
  const el = document.createElement('pre');
  el.style.cssText =
    'position:fixed;bottom:8px;left:8px;margin:0;padding:6px 10px;font:12px/1.5 ui-monospace,Menlo,Consolas,monospace;' +
    'color:#e8f1ff;background:rgba(10,14,22,.7);border-radius:6px;pointer-events:none';
  el.hidden = !visible;
  document.body.append(el);
  let next = 0;

  return {
    get visible() {
      return !el.hidden;
    },
    toggle() {
      el.hidden = !el.hidden;
      next = 0;
    },
    /** Call after rendering (renderer.info holds that frame); rewrites the DOM only every refreshMs. */
    update(s: DebugStats) {
      const now = performance.now();
      if (el.hidden || now < next) return;
      next = now + debugOverlay.refreshMs;
      const { calls, triangles } = s.renderer.info.render;
      const p = s.position;
      const g = worldToLatLon(p.x, p.z);
      el.textContent = [
        `FPS: ${s.fps.toFixed(0)} · khung hình ${s.fps ? (1000 / s.fps).toFixed(1) : '–'} ms (xử lý ${s.workMs.toFixed(1)} ms)`,
        `Lệnh vẽ: ${calls} · Tam giác: ${triangles.toLocaleString('vi-VN')}`,
        `Camera X / Y / Z: ${p.x.toFixed(1)} / ${p.y.toFixed(1)} / ${p.z.toFixed(1)} m`,
        `Vĩ độ, kinh độ: ${g.lat.toFixed(6)}, ${g.lon.toFixed(6)}`,
        `Tốc độ bay: ${s.speed.toFixed(1)} m/s`,
        `Chunk: ${s.chunks.loaded} đã tải · ${s.chunks.pending} đang chờ`,
        `Collider vật lý: ${s.colliders}`,
        ...(s.player ? [s.player] : []),
        ...(s.bike ? [s.bike] : []),
        ...(s.npc ? [s.npc] : []),
      ].join('\n');
    },
  };
}
