// CETIQLO real-world garment sizes (metres, a typical size M) — the ONE table every shape recipe (client items.ts),
// tailored fit (fitting.ts) and the brief ring read; no magic numbers elsewhere. Owner directive 2026-11-02: "kích cỡ sát
// với ngoài đời thực, có form".
export const GARMENT_SIZES = {
  tops: {
    tee: { chest: 0.52, length: 0.70, shoulder: 0.46, sleeveShort: 0.20, sleeveLong: 0.62, neck: 0.19 },
    crop: { chest: 0.50, length: 0.46, shoulder: 0.44, sleeveShort: 0.18 },
    oversized: { chest: 0.62, length: 0.78, shoulder: 0.58, sleeveShort: 0.26 }, // drop shoulder
    tank: { chest: 0.46, length: 0.66, shoulder: 0.30 },
    polo: { chest: 0.53, length: 0.70, shoulder: 0.46, sleeveShort: 0.21, sleeveLong: 0.62, collar: 0.08 },
    shirt: { chest: 0.55, length: 0.74, shoulder: 0.47, sleeveShort: 0.24, sleeveLong: 0.62, collar: 0.075, cuff: 0.06 },
    blouse: { chest: 0.54, length: 0.64, shoulder: 0.42, sleeveLong: 0.58 },
    hoodie: { chest: 0.60, length: 0.70, shoulder: 0.52, sleeveLong: 0.64, hood: 0.34, pocket: 0.32 },
    sweatshirt: { chest: 0.58, length: 0.68, shoulder: 0.50, sleeveLong: 0.63, rib: 0.06 },
    sweater: { chest: 0.55, length: 0.66, shoulder: 0.47, sleeveLong: 0.62, rib: 0.06, turtle: 0.14, mock: 0.07 },
    vest: { chest: 0.52, length: 0.62 },
  },
  outer: {
    blazer: { chest: 0.52, length: 0.76, shoulder: 0.46, sleeveLong: 0.63, lapel: 0.30 },
    trench: { chest: 0.58, length: 1.05, shoulder: 0.48, sleeveLong: 0.64, belt: 0.05, lapel: 0.34 },
    woolCoat: { chest: 0.58, length: 1.08, shoulder: 0.48, sleeveLong: 0.64, lapel: 0.32 },
    parka: { chest: 0.60, length: 0.90, shoulder: 0.50, sleeveLong: 0.65, hood: 0.36 },
    uvZip: { chest: 0.54, length: 0.72, shoulder: 0.46, sleeveLong: 0.64, hood: 0.32 },
    bomber: { chest: 0.60, length: 0.64, shoulder: 0.52, sleeveLong: 0.63, rib: 0.07 },
    fleece: { chest: 0.58, length: 0.70, shoulder: 0.50, sleeveLong: 0.64 },
    down: { chest: 0.58, length: 0.68, shoulder: 0.50, sleeveLong: 0.64, baffle: 0.11 },
    downLong: { chest: 0.62, length: 1.00, shoulder: 0.52, sleeveLong: 0.65, baffle: 0.13, hood: 0.36 },
    pufferVest: { chest: 0.56, length: 0.64, baffle: 0.11 },
    padded: { chest: 0.62, length: 0.95, shoulder: 0.52, sleeveLong: 0.65, hood: 0.36 },
    coach: { chest: 0.58, length: 0.68, shoulder: 0.50, sleeveLong: 0.63 },
    denimJacket: { chest: 0.54, length: 0.62, shoulder: 0.46, sleeveLong: 0.62 },
    cardigan: { chest: 0.54, length: 0.70, shoulder: 0.46, sleeveLong: 0.62, rib: 0.05 },
  },
  bottoms: {
    jeans: { waist: 0.40, inseam: 0.80, rise: 0.28, thigh: 0.30, hem: 0.19, hemWide: 0.28, hemBootcut: 0.24, hemTapered: 0.16, hemBaggy: 0.26 },
    trousers: { waist: 0.40, inseam: 0.80, rise: 0.27, thigh: 0.29, hem: 0.20, hemWide: 0.27, hemAnkle: 0.16, inseamAnkle: 0.70 },
    chinos: { waist: 0.40, inseam: 0.78, rise: 0.27, thigh: 0.29, hem: 0.18 },
    cargo: { waist: 0.42, inseam: 0.78, rise: 0.29, thigh: 0.32, hem: 0.21 },
    sweat: { waist: 0.40, inseam: 0.75, rise: 0.30, thigh: 0.32, hem: 0.15, hemJogger: 0.13, band: 0.08 },
    lounge: { waist: 0.40, inseam: 0.76, rise: 0.30, thigh: 0.32, hem: 0.26 },
    shorts: { waist: 0.40, inseamShort: 0.20, inseamChino: 0.25, inseamBermuda: 0.45, inseamCycling: 0.22, rise: 0.27, thigh: 0.31, thighCycling: 0.24 },
  },
  skirts: { waist: 0.38, mini: 0.40, knee: 0.55, pleated: 0.70, midi: 0.70, maxi: 0.95, tennis: 0.38, flare: 0.62 },
  dresses: { chest: 0.50, shirt: 1.00, aline: 0.95, maxi: 1.30, slip: 1.10 },
  shoes: {
    sneaker: { l: 0.29, w: 0.11, h: 0.11, sole: 0.03 },
    loafer: { l: 0.29, w: 0.10, h: 0.09, sole: 0.02 },
    sandal: { l: 0.28, w: 0.11, h: 0.05, sole: 0.02 },
    slipper: { l: 0.28, w: 0.11, h: 0.08, sole: 0.02 },
    boot: { l: 0.30, w: 0.12, h: 0.25, sole: 0.03 },
    socksAnkle: { l: 0.22, h: 0.10 }, socksCrew: { l: 0.22, h: 0.22 },
  },
  bags: { tote: { w: 0.40, h: 0.38, d: 0.12, handle: 0.22 }, backpack: { w: 0.30, h: 0.45, d: 0.15 }, mini: { w: 0.20, h: 0.14, d: 0.07 }, crossbody: { w: 0.24, h: 0.16, d: 0.07 } },
  hats: { cap: { crown: 0.19, brim: 0.07 }, beanie: { d: 0.19, h: 0.21 }, bucket: { d: 0.28, crown: 0.10 }, scarf: { w: 0.25, l: 1.7, rolled: 0.24 }, sunglasses: { w: 0.14, lens: 0.05, temple: 0.13 }, umbrella: { l: 0.30, d: 0.06 } },
  underwear: { bra: { w: 0.30, cup: 0.07 }, briefs: { w: 0.30, h: 0.22 }, bratop: { w: 0.32, h: 0.40 }, pyjamaTop: 0.68, pyjamaPants: 0.98 },
  /** Fixtures and the room at real scale. */
  store: { rail: 1.65, hanger: 0.42, tier: 0.4, table: 0.85, foldedW: 0.30, foldedD: 0.35, foldedH: 0.07, aisle: 1.2, door: { w: 1.5, h: 2.1 }, mannequin: 1.75 },
} as const;
export type GarmentSizes = typeof GARMENT_SIZES;
