// Procedural worldgen: biome tagging, deterministic chunk seeds, landmark
// injection, and the chunk generators themselves. This module is pure data
// and math — no Three.js, no Rapier. Generators describe a chunk's contents
// through the ChunkBuilder interface; ChunkManagerSystem realises them.

export const CHUNK_SIZE = 32; // metres per chunk side
export const TILE_SIZE = 4; // floor tile pitch
export const HALL_HEIGHT = 30; // floor-to-ceiling of the great halls

const WORLD_SEED = 0x4d6f7269;

/** Chunk row (cz) carrying the Black Chasm across the Lower Deeps. */
export const CHASM_ROW = -4;

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
 * Macro-geography: walking north (-Z) from the Twenty-first Hall descends
 * into the Lower Deeps and the Second Hall. The remaining tiers become
 * further classification rules here without touching the streaming machinery.
 */
export function biomeFor(_cx: number, cz: number): Biome {
  return cz <= -3 ? Biome.LowerDeeps : Biome.UpperMansions;
}

/**
 * What a generator may carve. Coordinates are chunk-local metres; the
 * implementation translates them into world space, instanced meshes, and
 * static colliders. Only floors, walls, columns, tombs, doors and bridge
 * decks collide — décor never does.
 */
export interface ChunkBuilder {
  /** Floor tile centred at (x, z); shade varies the stone, jitter > 0 tilts
   *  and sinks it (fracture damage — visual only, the slab stays flat). */
  floorTile(x: number, z: number, shade: number, jitter?: number): void;
  /** One static collider slab under the local rect [x, x+w) × [z, z+d). */
  floorSlab(x: number, z: number, w: number, d: number): void;
  /** Gold-inlaid rune accent laid over the floor at (x, z). */
  runeTile(x: number, z: number): void;
  /** Brass geometric grate set flush into the floor. */
  grate(x: number, z: number): void;
  /** Mithril vein: a thin silver-white seam across the stone. */
  mithrilVein(x: number, z: number, yaw: number, length: number): void;
  /** Sheer polished wall slab from (x, z), `length` metres along `axis`. */
  wall(x: number, z: number, length: number, axis: 'x' | 'z', height?: number, y?: number): void;
  /** Tree-bole pillar; girth scales width only — all reach the ceiling. */
  boleColumn(x: number, z: number, girth: number): void;
  /** Severe four-sided obelisk pillar. */
  obeliskColumn(x: number, z: number, girth: number): void;
  /** Shattered pillar base, leaning `lean` radians about its yaw. */
  brokenColumn(x: number, z: number, girth: number, lean: number, yaw: number): void;
  /** Fallen rock (squash < 0.4 reads as dust drifts / burned debris). */
  rubble(x: number, z: number, size: number, squash: number, yaw: number, shade: number): void;
  /** Collapsed archway fragment toppled against the floor. */
  archFragment(x: number, z: number, yaw: number, lean: number): void;
  /** Daylight shaft (volumetric beam + floor glow); pitch tilts the beam. */
  lightShaft(x: number, z: number, pitch?: number, yaw?: number): void;
  /** Magma fissure: emissive crack, flickering glow column, red floor light. */
  magmaFissure(x: number, z: number, yaw: number, length: number): void;
  /** Stark rectangular tomb of single white stone. */
  tomb(x: number, z: number): void;
  /** Ruined iron-bound chest. */
  chest(x: number, z: number, yaw: number): void;
  /** Heavy stone door slab standing ajar. */
  stoneDoor(x: number, z: number, yaw: number): void;
  /** One deck segment of a stone bridge (collides, walkable). */
  bridgeSegment(x: number, y: number, z: number, pitch: number): void;
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

/**
 * Deterministic roll for a chunk edge. Edges are shared between neighbours,
 * so each chunk owns only its west (salt 0/2) and south (salt 1/3) edges —
 * both sides of a seam agree without communicating.
 */
function edgeRoll(cx: number, cz: number, salt: number): number {
  const h =
    (Math.imul(cx, 0x9e3779b1) ^
      Math.imul(cz, 0x85ebca77) ^
      Math.imul(salt + 1, 0xc2b2ae3d) ^
      WORLD_SEED) >>>
    0;
  return h / 4294967296;
}

// Hard-coded landmark chunks override procedural generation at their coords.
const landmarks = new Map<string, ChunkGenerator>();

export function registerLandmark(cx: number, cz: number, generator: ChunkGenerator): void {
  landmarks.set(`${cx},${cz}`, generator);
}

export function generatorFor(cx: number, cz: number): ChunkGenerator {
  const landmark = landmarks.get(`${cx},${cz}`);
  if (landmark) return landmark;
  if (biomeFor(cx, cz) === Biome.LowerDeeps) {
    return cz === CHASM_ROW ? chasmCavern : lowerDeepsCavern;
  }
  return upperMansionsHall;
}

const TILES_PER_SIDE = CHUNK_SIZE / TILE_SIZE;
// Columns stand on a world-aligned 16 m lattice (offset 8 m), so the ranks
// run unbroken across chunk seams.
const COLUMN_SITES = [8, 24];

/**
 * Colossal sheer walls along chunk edges carve the void into distinct
 * cavernous halls. Every wall keeps a deterministic 5 m doorway so the
 * delving stays traversable.
 */
function edgeWalls(builder: ChunkBuilder, cx: number, cz: number, chance: number): void {
  if (edgeRoll(cx, cz, 0) < chance) {
    const gap = 7 + edgeRoll(cx, cz, 2) * 18;
    builder.wall(0, 0, gap - 2.5, 'z');
    builder.wall(0, gap + 2.5, CHUNK_SIZE - gap - 2.5, 'z');
  }
  if (edgeRoll(cx, cz, 1) < chance) {
    const gap = 7 + edgeRoll(cx, cz, 3) * 18;
    builder.wall(0, 0, gap - 2.5, 'x');
    builder.wall(gap + 2.5, 0, CHUNK_SIZE - gap - 2.5, 'x');
  }
}

/** Floor with fracture damage, dust drifts and accent inlays. */
function ruinedFloor(builder: ChunkBuilder, rng: () => number, ruin: number): void {
  for (let tx = 0; tx < TILES_PER_SIDE; tx++) {
    for (let tz = 0; tz < TILES_PER_SIDE; tz++) {
      const x = (tx + 0.5) * TILE_SIZE;
      const z = (tz + 0.5) * TILE_SIZE;
      const fractured = rng() < ruin * 0.45;
      builder.floorTile(x, z, rng(), fractured ? rng() * ruin : 0);
      const accent = rng();
      if (accent < 0.03) builder.runeTile(x, z);
      else if (accent < 0.042) builder.grate(x, z);
    }
  }
  if (rng() < 0.3) {
    builder.mithrilVein(4 + rng() * 24, 4 + rng() * 24, rng() * Math.PI, 4 + rng() * 5);
  }
  const drifts = 2 + Math.floor(ruin * 6);
  for (let i = 0; i < drifts; i++) {
    builder.rubble(rng() * CHUNK_SIZE, rng() * CHUNK_SIZE, 1 + rng() * 1.6, 0.12 + rng() * 0.15, rng() * Math.PI, rng() * 0.5);
  }
}

/** A column site: intact, shattered to a stump amid rubble, or erased. */
function columnSite(builder: ChunkBuilder, rng: () => number, x: number, z: number, breakChance: number): void {
  const girth = 0.9 + rng() * 0.3;
  if (rng() >= breakChance) {
    if (rng() < 0.65) builder.boleColumn(x, z, girth);
    else builder.obeliskColumn(x, z, girth);
    return;
  }
  // Shattered: a leaning stump and the strewn wreck of its upper drum.
  if (rng() < 0.7) builder.brokenColumn(x, z, girth, rng() * 0.12, rng() * Math.PI * 2);
  const shards = 3 + Math.floor(rng() * 4);
  for (let i = 0; i < shards; i++) {
    const a = rng() * Math.PI * 2;
    const d = 1.5 + rng() * 4;
    builder.rubble(x + Math.cos(a) * d, z + Math.sin(a) * d, 0.5 + rng() * 1.3, 0.6 + rng() * 0.5, rng() * Math.PI, 0.4 + rng() * 0.5);
  }
  if (rng() < 0.35) builder.archFragment(x + (rng() - 0.5) * 6, z + (rng() - 0.5) * 6, rng() * Math.PI, 0.15 + rng() * 0.35);
}

/**
 * The Upper Mansions / Twenty-first Hall: vast polished floors, ranks of
 * towering columns, sheer hall walls, and the rare shaft of daylight.
 * Subtractive in spirit — only carved surfaces exist; ceilings and the rock
 * beyond the fog are implied by darkness and never built.
 */
export const upperMansionsHall: ChunkGenerator = (builder, rng, cx, cz) => {
  builder.floorSlab(0, 0, CHUNK_SIZE, CHUNK_SIZE);
  const ruin = rng() * 0.55;
  ruinedFloor(builder, rng, ruin);
  edgeWalls(builder, cx, cz, 0.16);
  for (const sx of COLUMN_SITES) {
    for (const sz of COLUMN_SITES) {
      columnSite(builder, rng, sx, sz, 0.15);
    }
  }
  if (rng() < 0.12) builder.lightShaft(CHUNK_SIZE / 2, CHUNK_SIZE / 2);
};

/**
 * The Lower Deeps: hostile and claustrophobic. Denser walls, wrecked
 * columns, heavy rubble, and natural fissures bleeding magma light. No
 * daylight ever reaches here.
 */
export const lowerDeepsCavern: ChunkGenerator = (builder, rng, cx, cz) => {
  builder.floorSlab(0, 0, CHUNK_SIZE, CHUNK_SIZE);
  const ruin = 0.45 + rng() * 0.55;
  ruinedFloor(builder, rng, ruin);
  edgeWalls(builder, cx, cz, 0.28);
  for (const sx of COLUMN_SITES) {
    for (const sz of COLUMN_SITES) {
      columnSite(builder, rng, sx, sz, 0.45);
    }
  }
  const fissures = rng() < 0.55 ? 1 + Math.floor(rng() * 2) : 0;
  for (let i = 0; i < fissures; i++) {
    builder.magmaFissure(5 + rng() * 22, 5 + rng() * 22, rng() * Math.PI, 5 + rng() * 6);
  }
};

const CHASM_NEAR = 8.5; // south rim of the Black Chasm (chunk-local z)
const CHASM_FAR = 23.5; // north rim — 15 m of nothing between them

/**
 * The Black Chasm: the floor simply stops. No collider spans the gap, so
 * whatever steps off the rim falls into the dark forever.
 */
export const chasmCavern: ChunkGenerator = (builder, rng) => {
  builder.floorSlab(0, 0, CHUNK_SIZE, CHASM_NEAR);
  builder.floorSlab(0, CHASM_FAR, CHUNK_SIZE, CHUNK_SIZE - CHASM_FAR);
  for (let tx = 0; tx < TILES_PER_SIDE; tx++) {
    for (const tz of [0, 1, 6, 7]) {
      builder.floorTile((tx + 0.5) * TILE_SIZE, (tz + 0.5) * TILE_SIZE, rng(), rng() < 0.3 ? rng() * 0.6 : 0);
    }
  }
  // Fissures vent along both rims, lighting the void's edge red.
  builder.magmaFissure(4 + rng() * 8, CHASM_NEAR - 2.2, 0, 6 + rng() * 4);
  builder.magmaFissure(20 + rng() * 8, CHASM_FAR + 2.2, 0, 6 + rng() * 4);
  for (const sx of COLUMN_SITES) {
    columnSite(builder, rng, sx, 4, 0.4);
    columnSite(builder, rng, sx, 28, 0.4);
  }
  for (let i = 0; i < 5; i++) {
    const south = rng() < 0.5;
    builder.rubble(rng() * CHUNK_SIZE, south ? rng() * 6 : 26 + rng() * 6, 0.6 + rng() * 1.4, 0.5 + rng() * 0.5, rng() * Math.PI, 0.3 + rng() * 0.4);
  }
};

/**
 * Landmark — the spawn hall: a guaranteed daylight shaft over world origin.
 */
export const spawnShaftHall: ChunkGenerator = (builder, rng, cx, cz) => {
  upperMansionsHall(builder, rng, cx, cz);
  builder.lightShaft(0, 0);
};

/**
 * Landmark — the Chamber of Mazarbul: a rectangular, defensible archive off
 * the Twenty-first Hall. One heavy stone door on the east; a single angled
 * shaft of light striking the white tomb; alcoves of ruined iron-bound
 * chests and the burned shreds of the archive on the floor.
 */
export const mazarbulChamber: ChunkGenerator = (builder, rng) => {
  builder.floorSlab(0, 0, CHUNK_SIZE, CHUNK_SIZE);
  for (let tx = 0; tx < TILES_PER_SIDE; tx++) {
    for (let tz = 0; tz < TILES_PER_SIDE; tz++) {
      builder.floorTile((tx + 0.5) * TILE_SIZE, (tz + 0.5) * TILE_SIZE, rng(), 0);
    }
  }

  // Room shell: x 4..28, z 7..25. Solid north/south/west; the east wall
  // breaks for the doorway, filled above by a lintel, barred by the door.
  builder.wall(4, 25, 24, 'x');
  builder.wall(4, 7, 24, 'x');
  builder.wall(4, 7, 18, 'z');
  builder.wall(28, 7, 6.5, 'z');
  builder.wall(28, 18.5, 6.5, 'z');
  builder.wall(28, 13.5, 5, 'z', 24, 6); // lintel above the door gap
  builder.stoneDoor(28, 15.4, -0.55);

  // Alcove piers comb the inner north and south walls; a ruined chest and
  // its spilled, burned books in most gaps.
  for (let px = 6; px <= 25.2; px += 3.2) {
    builder.wall(px, 23.2, 1.6, 'z');
    builder.wall(px, 7.2, 1.6, 'z');
    if (px > 25) continue; // last pier closes the comb — no alcove beyond it
    const ax = px + 1.6;
    if (rng() < 0.8) builder.chest(ax, 23.9, Math.PI + (rng() - 0.5) * 0.3);
    if (rng() < 0.8) builder.chest(ax, 8.1, (rng() - 0.5) * 0.3);
    for (let i = 0; i < 3; i++) {
      builder.rubble(ax + (rng() - 0.5) * 2, rng() < 0.5 ? 22 + rng() * 1.5 : 9 - rng() * 1.5, 0.25 + rng() * 0.4, 0.1 + rng() * 0.12, rng() * Math.PI, rng() * 0.25);
    }
  }

  // The tomb of single white stone under its angled shaft.
  builder.tomb(16, 16);
  builder.lightShaft(16, 16, 0.25, 0.8);
  for (let i = 0; i < 6; i++) {
    if (rng() < 0.5) builder.runeTile(6 + rng() * 20, 9 + rng() * 14);
  }
};

/**
 * Landmark — the Second Hall crossing: Durin's Bridge over the Black Chasm.
 * One slender arched spring of stone, fifty feet, no railings, single file.
 * Flanked by tree-bole pillars and venting magma fissures.
 */
export const durinsBridge: ChunkGenerator = (builder, rng, cx, cz) => {
  chasmCavern(builder, rng, cx, cz);

  const SPAN_START = 6;
  const SPAN = 20;
  const RISE = 2.4;
  const SEGMENTS = 9;
  for (let i = 0; i < SEGMENTS; i++) {
    const t = (i + 0.5) / SEGMENTS;
    const z = SPAN_START + t * SPAN;
    const y = Math.sin(t * Math.PI) * RISE;
    const slope = Math.atan(((RISE * Math.PI) / SPAN) * Math.cos(t * Math.PI));
    builder.bridgeSegment(16, y, z, slope);
  }

  builder.boleColumn(10.5, 4, 1.25);
  builder.boleColumn(21.5, 4, 1.25);
  builder.boleColumn(10.5, 28, 1.25);
  builder.boleColumn(21.5, 28, 1.25);
  builder.magmaFissure(12, CHASM_FAR + 3.5, 0.4, 7);
  builder.magmaFissure(20, CHASM_NEAR - 3.5, -0.4, 7);
};
