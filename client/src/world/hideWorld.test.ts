import { DirectionalLight, Group, Mesh, type Object3D, Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { hideWorld, showWorld } from './hideWorld.ts';

describe('hideWorld / showWorld (Louvre room)', () => {
  it('hides the city, keeps the room / players / lights, restores exactly what it hid', () => {
    const scene = new Scene();
    const [room, player, chunk, npc, overlay] = [new Group(), new Group(), new Mesh(), new Group(), new Group()];
    const sun = new DirectionalLight();
    overlay.visible = false; // e.g. the road graph overlay, off before entering
    scene.add(room, player, chunk, npc, overlay, sun);
    const keep = (o: Object3D) => o === room || o === player || (o as DirectionalLight).isLight === true;
    const hidden = new Set<Object3D>();
    hideWorld(scene.children, keep, hidden);
    expect([room.visible, player.visible, sun.visible]).toEqual([true, true, true]);
    expect([chunk.visible, npc.visible, overlay.visible]).toEqual([false, false, false]);
    const later = new Mesh(); // a chunk streamed in while inside
    scene.add(later);
    hideWorld(scene.children, keep, hidden);
    expect(later.visible).toBe(false);
    scene.remove(npc); // unloaded while inside: not resurrected
    showWorld(hidden);
    expect([chunk.visible, later.visible, overlay.visible, npc.visible]).toEqual([true, true, false, false]);
    expect(hidden.size).toBe(0);
  });
});
