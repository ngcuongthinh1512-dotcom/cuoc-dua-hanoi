/** Gốc tọa độ thế giới (0,0,0): quảng trường Đông Kinh Nghĩa Thục, bờ bắc hồ Hoàn Kiếm, Hà Nội (Leg 3). */
export const ORIGIN = { lat: 21.03218, lon: 105.85213 } as const;

/** SPEC §17.29: holding Shift (pad LB) runs at this × the current top speed, on foot AND on a bike. The client's
 *  movement.sprintMultiplier reads it; the server multiplies its speed-flag / trusted-point limits by it. */
export const SPRINT_MULTIPLIER = 2;

/** Vùng bản đồ đua (SPEC §4.1). */
/** Leg 3: khung bao 3 quận cũ Hoàn Kiếm + Hai Bà Trưng + Đống Đa (ranh giới trước 1/7/2025, OSM boundary=historic),
 *  ≈ 8,9 × 6,1 km ≈ 54 km² (Láng → sông Hồng, Đồng Xuân → Minh Khai / Trương Định). */
export const RACE_BBOX = { south: 20.989, west: 105.796, north: 21.044, east: 105.884 } as const;

/** SPEC §17.38: the Pit Stop mat, m — the client draws it (raceClient.mat), the server counts a team as "at the Pit Stop"
 *  only ON it (`slack` m beyond its edges: network latency). Centre = the pit_stop zone centre, long axis along its yaw. */
export const PIT_MAT = { width: 3.2, length: 6.4, slack: 0.5 } as const;

/** Is (x, z) on the Pit Stop mat centred at `at` (zone / BoxInfo: yaw rad, 0 = north, + = west; the mat's long axis)? */
export function onPitMat(x: number, z: number, at: { x: number; z: number; yaw?: number }, slack: number = PIT_MAT.slack): boolean {
  const [dx, dz, c, s] = [x - at.x, z - at.z, Math.cos(at.yaw ?? 0), Math.sin(at.yaw ?? 0)];
  // into the mat's own frame (Three.js rotation.y = yaw: local x → (c, −s), local z → (s, c) in world x, z)
  return Math.abs(c * dx - s * dz) <= PIT_MAT.width / 2 + slack && Math.abs(s * dx + c * dz) <= PIT_MAT.length / 2 + slack;
}

