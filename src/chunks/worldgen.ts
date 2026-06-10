// Procedural worldgen: biome tagging, deterministic chunk seeds, landmark
// injection, and the chunk generators themselves. This module is pure data
// and math — no Three.js, no Rapier. Generators describe a chunk's contents
// through the ChunkBuilder interface; ChunkManagerSystem realises them.

export const CHUNK_SIZE = 32; // metres per chunk side
export const TILE_SIZE = 4; // floor tile pitch
export const HALL_HEIGHT = 30; // floor-to-ceiling of the great halls

const WORLD_SEED = 0x4d6f7269;

/**
 * The macro-geography tiers of the delving, west-gate to east-gate and
 * surface to abyss. (tsconfig forbids TS enums via erasableSyntaxOnly, so
 * this is the const-object equivalent.)
 */
export const Biome = {
  CitySpaces: 0,
  SevenLevels: 1,
  UpperMansions: 2,
  NorthEnd: 3,
  MineSectors: 4,
  SevenDeeps: 5,
  LowerDeeps: 6,
  Abyss: 7,
} as const;
export type Biome = (typeof Biome)[keyof typeof Biome];

/**
 * Macro-geography hook: the forty-mile west–east axis and the vertical tier
 * stack resolve to a biome here. The proof-of-concept generates the Upper
 * Mansions everywhere; later tiers become classification rules over chunk
 * coordinates without touching the streaming machinery.
 */
export function biomeFor(_cx: number, _cz: number): Biome {
  return Biome.UpperMansions;
}

/**
 * What a generator may carve. Coordinates are chunk-local metres; the
 * implementation translates them into world space, instanced meshes, and
 * static colliders.
 */
export interface ChunkBuilder {
  /** Visual floor tile centred at (x, z); shade in [0,1] varies the stone. */
  floorTile(x: number, z: number, shade: number): void;
  /** One static collider slab under the local rect [x, x+w) × [z, z+d). */
  floorSlab(x: number, z: number, w: number, d: number): void;
  /** Gold-inlaid rune accent laid over the floor at (x, z). */
  runeTile(x: number, z: number): void;
  /** Tree-bole pillar at (x, z); girth scales width only — all reach the ceiling. */
  boleColumn(x: number, z: number, girth: number): void;
  /** Severe four-sided obelisk pillar at (x, z). */
  obeliskColumn(x: number, z: number, girth: number): void;
  /** Vertical daylight shaft (volumetric beam + floor glow) at (x, z). */
  lightShaft(x: number, z: number): void;
}

export type ChunkGenerator = (
  builder: ChunkBuilder,
  rng: () => number,
  cx: number,
  cz: number,
) => void;

/** Classic spatial-hash mix: one stable 32-bit seed per chunk coordinate. */
export function chunkSeed(cx: number, cz: number): number {
  return (Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663) ^ WORLD_SEED) >>> 0;
}

/** Mulberry32: tiny deterministic PRNG so chunks regenerate identically. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Hard-coded landmark chunks (Doors of Durin, Mazarbul, Durin's Bridge…)
// override procedural generation at their coordinates.
const landmarks = new Map<string, ChunkGenerator>();

export function registerLandmark(cx: number, cz: number, generator: ChunkGenerator): void {
  landmarks.set(`${cx},${cz}`, generator);
}

export function generatorFor(cx: number, cz: number): ChunkGenerator {
  const landmark = landmarks.get(`${cx},${cz}`);
  if (landmark) return landmark;
  // Only the Upper Mansions exist yet; future biomes switch on biomeFor().
  return upperMansionsHall;
}

const TILES_PER_SIDE = CHUNK_SIZE / TILE_SIZE;
// Columns stand on a world-aligned 16 m lattice (offset 8 m), so the ranks
// run unbroken across chunk seams.
const COLUMN_SITES = [8, 24];

/**
 * The Upper Mansions / Twenty-first Hall: vast polished floors, ranks of
 * towering columns, and the rare vertical shaft of daylight. Generation is
 * subtractive in spirit — the floor and columns are the only carved
 * surfaces; everything else stays solid rock implied by darkness (no lit
 * ceiling geometry, walls beyond fog are never built).
 */
export const upperMansionsHall: ChunkGenerator = (builder, rng) => {
  builder.floorSlab(0, 0, CHUNK_SIZE, CHUNK_SIZE);
  for (let tx = 0; tx < TILES_PER_SIDE; tx++) {
    for (let tz = 0; tz < TILES_PER_SIDE; tz++) {
      const x = (tx + 0.5) * TILE_SIZE;
      const z = (tz + 0.5) * TILE_SIZE;
      builder.floorTile(x, z, rng());
      if (rng() < 0.035) builder.runeTile(x, z);
    }
  }

  for (const sx of COLUMN_SITES) {
    for (const sz of COLUMN_SITES) {
      if (rng() < 0.12) continue; // a missing column breaks the sightlines
      const girth = 0.9 + rng() * 0.3;
      if (rng() < 0.7) builder.boleColumn(sx, sz, girth);
      else builder.obeliskColumn(sx, sz, girth);
    }
  }

  if (rng() < 0.12) builder.lightShaft(CHUNK_SIZE / 2, CHUNK_SIZE / 2);
};

/**
 * Landmark proving the injection pool works: the spawn hall, with a
 * guaranteed daylight shaft over the world origin.
 */
export const spawnShaftHall: ChunkGenerator = (builder, rng, cx, cz) => {
  upperMansionsHall(builder, rng, cx, cz);
  builder.lightShaft(0, 0);
};
