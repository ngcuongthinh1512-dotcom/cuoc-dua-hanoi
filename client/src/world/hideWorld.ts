// Fix B (review 3 F3): inside the Louvre room (underground, closed) the city above is not drawn. Per frame while inside,
// every top-level scene object that is not kept (the room, the players, the lights) is hidden, including objects added
// meanwhile (streamed chunks, NPCs); on leaving, exactly the objects hidden here come back (each module's own visibility
// toggles take over again on their next update).
import type { Object3D } from 'three';

/** Hides the visible, not-kept children; remembers them in `hidden`. */
export function hideWorld(children: readonly Object3D[], keep: (o: Object3D) => boolean, hidden: Set<Object3D>): void {
  for (const o of children) {
    if (!o.visible || keep(o)) continue;
    o.visible = false;
    hidden.add(o);
  }
}

/** Shows what hideWorld hid (still in the scene) and forgets it. */
export function showWorld(hidden: Set<Object3D>): void {
  for (const o of hidden) if (o.parent) o.visible = true;
  hidden.clear();
}
