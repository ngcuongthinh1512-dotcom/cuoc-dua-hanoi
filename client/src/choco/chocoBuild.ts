// Pure layout / data for the "Xưởng sô-cô-la" dev room (client/choco.html, entry choco.ts). No DOM, no Three.
// 1 unit = 1 m. X across the workshop, Z along it (kettles + fountain at −Z, the door at +Z), Y up; y 0 = floor.
export type XZ = [number, number];
export interface Slot { x: number; y: number; z: number; yaw: number }

/** Room shell: a long segmental brick vault over tiled walls. */
export const R = {
  halfW: 6, zBack: -12, zFront: 12,
  tileY: 1.7, // top of the glazed tiles
  springY: 3.6, apexY: 5.5, // vault springs at springY, crown at apexY
  rail: { x: 3.6, y: 3.05 }, // iron rails over each row of tables (pans + lamp cords)
  aisle: { x: 3.4, pitch: 2.75 }, // rows of tables at ±aisle.x, pitch along z
};
/** Vault radius from the chord (2·halfW) and the rise (apexY − springY). */
export const vaultR = (): number => { const h = R.apexY - R.springY, c = R.halfW; return (c * c + h * h) / (2 * h); };
/** Half-angle of the vault arc. */
export const vaultA = (): number => Math.asin(R.halfW / vaultR());

export interface Team { slot: number; name: string; color: string }
export const TEAMS: Team[] = [
  ['Hai Long 🐉', '#b6e08a'], ['Chị 6', '#8eead8'], ['Pha hồn mông', '#d6249f'], ['V.Hy', '#1a1a1a'], ['🦖 Chú Hiệp 🦕', '#a31621'],
  ['Đạt 0️⃣9️⃣', '#e0a800'], ['Nhật Nhật', '#1e56d6'], ['🌽 Hiếu', '#f7a8c4'], ['Mạnh Ka', '#eadcb8'], ['Dừa L', '#6b4a37'], ['Như Chấn', '#6a2fb0'],
].map(([name, color], i) => ({ slot: i + 1, name, color }));
export const TYPES = 5; // chocolate types in the challenge (temper.html levels)

/** Name without emoji for the 3D placard (canvas fonts may lack them): keycaps keep their digit, pictographs go. */
export const plainName = (t: Team): string => {
  const s = t.name.replace(/[\p{Extended_Pictographic}️⃣]/gu, '').replace(/\s+/g, ' ').trim();
  return s || `Đội ${t.slot}`;
};
/** Dark text reads better on a light accent (perceived luminance). */
export const isLight = (hex: string): boolean => {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 > 0.6;
};

/** 11 tables in two rows facing the central aisle: 6 on the left (x < 0, facing +x), 5 on the right (facing −x);
 *  the right row is centred on the left one so nothing hides behind the fountain end. */
export function tableSlots(): Slot[] {
  const { x, pitch } = R.aisle, out: Slot[] = [];
  for (let i = 0; i < 6; i++) out.push({ x: -x, y: 0, z: (i - 2.5) * pitch, yaw: Math.PI / 2 }); // local +z = front = towards the aisle
  for (let i = 0; i < 5; i++) out.push({ x, y: 0, z: (i - 2) * pitch, yaw: -Math.PI / 2 });
  return out;
}
/** Slot → world: a point `fwd` m in front of the table (towards the aisle) and `side` m to its left. */
export const tableAt = (s: Slot, fwd: number, side = 0, y = 0) => ({ x: s.x + Math.sin(s.yaw) * fwd + Math.cos(s.yaw) * side, y: s.y + y, z: s.z + Math.cos(s.yaw) * fwd - Math.sin(s.yaw) * side });

/** Lamp per table (hung from the row's rail) + three over the kettle end. */
export const lampSlots = (): Slot[] => [...tableSlots().map((s) => ({ ...s, y: R.rail.y, x: Math.sign(s.x) * R.rail.x })), ...[-3, 0, 3].map((x) => ({ x, y: R.rail.y + 0.3, z: R.zBack + 2.2, yaw: 0 }))];
/** Transverse brick arches / tie beams along the vault. */
export const archZs = (): number[] => { const out: number[] = []; for (let z = R.zBack + 4.5; z < R.zFront - 2.5; z += 4.5) out.push(z); return out; };
