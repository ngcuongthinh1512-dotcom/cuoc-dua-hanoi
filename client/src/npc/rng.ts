// Deterministic randomness for the NPC sims (docs/plans/phase4b.md §3.2): never Math.random / Date.

/** Mulberry32: fast 32-bit seeded PRNG, uniform in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Index i with probability weights[i] / Σ weights (weights ≥ 0, Σ > 0). */
export function pickWeighted(rng: () => number, weights: readonly number[]): number {
  let r = rng() * weights.reduce((s, w) => s + w, 0);
  let last = 0;
  for (let i = 0; i < weights.length; i++) {
    if (weights[i]! > 0) last = i;
    if ((r -= weights[i]!) < 0) return i;
  }
  return last; // r landed on the float rounding edge of the sum
}
