import * as THREE from 'three/webgpu';
import { float, mix, positionGeometry, sin, time } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { InstancePool } from './InstancePool';
import { carvedGraniteMaterial, flameMaterial, marbleMaterial, masonryMaterial } from './materials';
// Pier/obelisk/buttress profiles below are hand-tuned to HALL_HEIGHT (44 m);
// retune them if the vault line moves.
import { TILE_SIZE } from './worldgen';

export interface HallPools {
  floor: InstancePool;
  ceiling: InstancePool;
  rune: InstancePool;
  grate: InstancePool;
  mithril: InstancePool;
  slab: InstancePool;
  buttress: InstancePool;
  bole: InstancePool;
  obelisk: InstancePool;
  stump: InstancePool;
  rubble: InstancePool;
  arch: InstancePool;
  tomb: InstancePool;
  chest: InstancePool;
  bracket: InstancePool;
  flame: InstancePool;
  glow: InstancePool;
  fissure: InstancePool;
  magmaGlow: InstancePool;
}

const MAGMA_GLOW_HEIGHT = 7;

/**
 * Radial fluting: displaces lathe vertices by cos(ribs·θ), faded in/out
 * across [y0, y1] so the carving dies into plinth and capital like real
 * stonework. Recomputes normals — the ribs must catch raking light.
 */
function flute(
  geo: THREE.BufferGeometry,
  ribs: number,
  depth: number,
  y0: number,
  y1: number,
): THREE.BufferGeometry {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const fade =
      THREE.MathUtils.smoothstep(y, y0, y0 + 1.5) *
      (1 - THREE.MathUtils.smoothstep(y, y1 - 1.5, y1));
    if (fade <= 0) continue;
    const theta = Math.atan2(z, x);
    const f = 1 + depth * fade * Math.cos(ribs * theta);
    pos.setX(i, x * f);
    pos.setZ(i, z * f);
  }
  geo.computeVertexNormals();
  return geo;
}

function translated(geo: THREE.BufferGeometry, x: number, y: number, z: number): THREE.BufferGeometry {
  geo.translate(x, y, z);
  return geo;
}

/** The grand pier, gothic-clustered: stepped octagonal plinths, a fluted
 *  core with four attached colonnettes, shaft rings binding the cluster,
 *  and a flared capital under a square abacus at the 44 m vault line. One
 *  merged geometry (~2 k tris) — still one instanced draw call. */
function grandBoleGeometry(): THREE.BufferGeometry {
  const core = new THREE.LatheGeometry(
    [
      new THREE.Vector2(2.6, 1.5),
      new THREE.Vector2(2.0, 3.5),
      new THREE.Vector2(1.85, 12),
      new THREE.Vector2(1.8, 24),
      new THREE.Vector2(1.9, 34),
      new THREE.Vector2(2.2, 38.5),
      new THREE.Vector2(3.0, 40.4),
    ],
    24,
  );
  flute(core, 12, 0.07, 4, 38);

  const parts: THREE.BufferGeometry[] = [
    translated(new THREE.CylinderGeometry(3.8, 4.2, 0.7, 8), 0, 0.35, 0),
    translated(new THREE.CylinderGeometry(3.0, 3.4, 0.8, 8), 0, 1.1, 0),
    core,
    translated(new THREE.CylinderGeometry(4.6, 3.0, 2.2, 8), 0, 41.5, 0),
    translated(new THREE.BoxGeometry(7.0, 1.0, 7.0), 0, 43.5, 0),
  ];
  // Four engaged colonnettes on the diagonals — the clustered-pier read.
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    parts.push(
      translated(
        new THREE.CylinderGeometry(0.52, 0.6, 37, 10),
        Math.cos(a) * 2.05,
        20,
        Math.sin(a) * 2.05,
      ),
    );
  }
  // Rings bind core and colonnettes into one shaft.
  for (const ry of [12, 24, 34]) {
    parts.push(
      translated(new THREE.TorusGeometry(2.45, 0.18, 6, 20).rotateX(Math.PI / 2), 0, ry, 0),
    );
  }
  return mergeGeometries(parts)!;
}

/** The severe obelisk: two interpenetrating four-sided frustums (an
 *  eight-point bevelled cross-section), stepped base, collar and tip. */
function grandObeliskGeometry(): THREE.BufferGeometry {
  return mergeGeometries([
    translated(new THREE.BoxGeometry(5.0, 0.9, 5.0), 0, 0.45, 0),
    translated(new THREE.BoxGeometry(4.2, 0.9, 4.2), 0, 1.3, 0),
    translated(new THREE.CylinderGeometry(1.4, 2.5, 38, 4).rotateY(Math.PI / 4), 0, 20.7, 0),
    translated(new THREE.CylinderGeometry(1.25, 2.3, 38, 4), 0, 20.7, 0),
    translated(new THREE.BoxGeometry(3.4, 0.6, 3.4), 0, 40.0, 0),
    translated(new THREE.CylinderGeometry(0.9, 1.7, 3.4, 4).rotateY(Math.PI / 4), 0, 42.0, 0),
  ])!;
}

/** Shattered pier stump: the plinths survive, the fluted core breaks off a
 *  few metres up; the colonnettes are gone with the fall. */
function stumpGeometry(): THREE.BufferGeometry {
  const broken = new THREE.LatheGeometry(
    [
      new THREE.Vector2(2.6, 1.5),
      new THREE.Vector2(2.0, 3.0),
      new THREE.Vector2(1.7, 4.0),
      new THREE.Vector2(1.2, 4.6),
    ],
    20,
  );
  flute(broken, 12, 0.07, 1.6, 4.6);
  return mergeGeometries([
    translated(new THREE.CylinderGeometry(3.8, 4.2, 0.7, 8), 0, 0.35, 0),
    translated(new THREE.CylinderGeometry(3.0, 3.4, 0.8, 8), 0, 1.1, 0),
    broken,
  ])!;
}

/** Vault-bay ceiling tile (8 × 8 m, hung at the vault line): a deep frame
 *  and chunky cross-ribs around recessed panels — carved, not poured. */
function cofferGeometry(): THREE.BufferGeometry {
  return mergeGeometries([
    translated(new THREE.BoxGeometry(8, 1.2, 1.4), 0, -0.6, 3.3),
    translated(new THREE.BoxGeometry(8, 1.2, 1.4), 0, -0.6, -3.3),
    translated(new THREE.BoxGeometry(1.4, 1.2, 5.2), 3.3, -0.6, 0),
    translated(new THREE.BoxGeometry(1.4, 1.2, 5.2), -3.3, -0.6, 0),
    translated(new THREE.BoxGeometry(8, 0.8, 0.9), 0, -0.4, 0),
    translated(new THREE.BoxGeometry(0.9, 0.8, 8), 0, -0.4, 0),
    translated(new THREE.BoxGeometry(7.6, 0.3, 7.6), 0, -0.15, 0),
  ])!;
}

/** Gothic buttress: stepped masses with sloped caps and a strut flying up
 *  toward the wall head. Local -z faces the wall it serves. */
function buttressGeometry(): THREE.BufferGeometry {
  return mergeGeometries([
    translated(new THREE.BoxGeometry(1.7, 12, 1.5), 0, 6, 0.95),
    translated(new THREE.BoxGeometry(1.7, 1.6, 1.7).rotateX(-0.5), 0, 12.4, 0.9),
    translated(new THREE.BoxGeometry(1.4, 11, 1.1), 0, 17.5, 0.75),
    translated(new THREE.BoxGeometry(1.4, 1.4, 1.4).rotateX(-0.5), 0, 23.4, 0.7),
    translated(new THREE.BoxGeometry(1.1, 11, 0.8), 0, 28.5, 0.55),
    translated(new THREE.BoxGeometry(0.7, 9, 0.6).rotateX(0.42), 0, 37.5, 0.35),
  ])!;
}

/** Wall-mounted torch: back plate, arm, and iron cup. The flame and the
 *  real light are separate concerns (flame pool / TorchLightSystem). */
function bracketGeometry(): THREE.BufferGeometry {
  return mergeGeometries([
    translated(new THREE.BoxGeometry(0.3, 0.5, 0.06), 0, -0.1, -0.52),
    translated(new THREE.BoxGeometry(0.07, 0.07, 0.6), 0, 0, -0.25),
    translated(new THREE.CylinderGeometry(0.14, 0.06, 0.32, 6), 0, 0.12, 0),
  ])!;
}

/**
 * One instanced pool per architectural material class — every loaded chunk
 * feeds these nineteen draw calls and nothing else. Surface detail lives in
 * world-space TSL materials (marble, carved granite, coursed masonry), so
 * instances never repeat visibly. Caps are the VRAM governor (≈ 80 B per
 * instance; all pools together a couple of MB).
 */
export function createHallPools(scene: THREE.Scene): HallPools {
  // Marbled near-black floor, polished — the flashlight drags a specular
  // streak and the veins ignite first. Tiles sit 0.08 m apart.
  const floorGeo = new THREE.BoxGeometry(TILE_SIZE - 0.08, 0.4, TILE_SIZE - 0.08);
  floorGeo.translate(0, -0.2, 0); // top face at y = 0
  const floor = new InstancePool(
    floorGeo,
    marbleMaterial(0x16181d, 0x7e8696, 0.25, 0.5),
    10_000,
    { receiveShadow: true },
  );

  const ceiling = new InstancePool(
    cofferGeometry(),
    carvedGraniteMaterial(0x24262c, 0.9, 0.35),
    1200,
    { receiveShadow: true },
  );

  // Gold-inlaid floor runes: dim unlit gold, faintly readable in the dark.
  const runeGeo = new THREE.PlaneGeometry(2.6, 2.6);
  runeGeo.rotateX(-Math.PI / 2);
  runeGeo.translate(0, 0.015, 0);
  const rune = new InstancePool(runeGeo, new THREE.MeshBasicMaterial({ color: 0x55400e }), 600);

  // Brass geometric grate: a merged lattice of bars, still one geometry.
  const bars: THREE.BoxGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const bar = new THREE.BoxGeometry(2.2, 0.07, 0.16);
    bar.translate(0, 0.035, -0.88 + i * 0.44);
    bars.push(bar);
  }
  const rimA = new THREE.BoxGeometry(0.2, 0.07, 2.2);
  rimA.translate(-1.0, 0.035, 0);
  const rimB = new THREE.BoxGeometry(0.2, 0.07, 2.2);
  rimB.translate(1.0, 0.035, 0);
  const grateGeo = mergeGeometries([...bars, rimA, rimB])!;
  const grate = new InstancePool(
    grateGeo,
    new THREE.MeshStandardMaterial({ color: 0x8a6a2f, roughness: 0.45, metalness: 0.85 }),
    500,
  );

  // Mithril vein: a thin seam with a pure silver-white specular spike —
  // full metalness, near-mirror roughness, so it only ignites under light.
  const mithrilGeo = new THREE.BoxGeometry(0.18, 0.05, 1);
  mithrilGeo.translate(0, 0.025, 0);
  const mithril = new InstancePool(
    mithrilGeo,
    new THREE.MeshStandardMaterial({ color: 0xdfe6ee, roughness: 0.12, metalness: 1.0 }),
    500,
  );

  // Generic masonry slab (unit cube, base at y = 0): scaled per instance
  // into colossal coursed walls, alcove piers, lintels, doors and bridge
  // decks.
  const slabGeo = new THREE.BoxGeometry(1, 1, 1);
  slabGeo.translate(0, 0.5, 0);
  const slab = new InstancePool(slabGeo, masonryMaterial(0x1d2026, 0.5), 2500, {
    castShadow: true,
    receiveShadow: true,
  });

  const buttress = new InstancePool(
    buttressGeometry(),
    masonryMaterial(0x202329, 0.55),
    1200,
    { castShadow: true, receiveShadow: true },
  );

  const bole = new InstancePool(
    grandBoleGeometry(),
    carvedGraniteMaterial(0x3a3d44, 0.78),
    1500,
    { castShadow: true, receiveShadow: true },
  );

  const obelisk = new InstancePool(
    grandObeliskGeometry(),
    carvedGraniteMaterial(0x2c2f36, 0.85),
    800,
    { castShadow: true, receiveShadow: true },
  );

  const stump = new InstancePool(stumpGeometry(), carvedGraniteMaterial(0x383b41, 0.88), 500, {
    castShadow: true,
    receiveShadow: true,
  });

  // Fallen rock: a low-poly boulder; squashed flat it reads as dust drifts
  // or the burned shreds of books. Sits half-sunk in the floor.
  const rubble = new InstancePool(
    new THREE.IcosahedronGeometry(0.9, 0),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }),
    4000,
    { castShadow: true },
  );

  // Collapsed archway fragment: a broken torus arc toppled into the hall.
  const archGeo = new THREE.TorusGeometry(4, 0.9, 6, 10, Math.PI * 0.7);
  archGeo.rotateZ(Math.PI * 0.15); // centre the apex upward
  const arch = new InstancePool(archGeo, carvedGraniteMaterial(0x33363c, 0.9), 300, {
    castShadow: true,
  });

  // Tomb of single white stone — the one pale thing in the dark.
  const tombGeo = new THREE.BoxGeometry(2.6, 1.5, 1.3);
  tombGeo.translate(0, 0.75, 0);
  const tomb = new InstancePool(tombGeo, marbleMaterial(0xb6b2a9, 0xe8e4da, 0.32, 0.8), 16, {
    castShadow: true,
    receiveShadow: true,
  });

  // Ruined iron-bound chest.
  const chestGeo = new THREE.BoxGeometry(1.15, 0.75, 0.7);
  chestGeo.translate(0, 0.375, 0);
  const chest = new InstancePool(
    chestGeo,
    new THREE.MeshStandardMaterial({ color: 0x2c2118, roughness: 0.7 }),
    128,
    { castShadow: true },
  );

  const bracket = new InstancePool(
    bracketGeometry(),
    new THREE.MeshStandardMaterial({ color: 0x1a1714, roughness: 0.6, metalness: 0.8 }),
    700,
  );

  const flameGeo = new THREE.SphereGeometry(0.17, 8, 8);
  flameGeo.scale(1, 1.9, 1);
  flameGeo.translate(0, 0.3, 0);
  const flame = new InstancePool(flameGeo, flameMaterial(), 700);

  // Pool of light where light strikes the floor; white material so each
  // instance tints it — pale moonlight under breaches, red magma.
  const glowGeo = new THREE.CircleGeometry(3.4, 24);
  glowGeo.rotateX(-Math.PI / 2);
  glowGeo.translate(0, 0.03, 0);
  const glow = new InstancePool(
    glowGeo,
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
    400,
  );

  // Magma fissure crack: unlit molten orange, scaled along its run.
  const fissureGeo = new THREE.BoxGeometry(1.1, 0.14, 1);
  fissureGeo.translate(0, 0.07, 0);
  const fissure = new InstancePool(fissureGeo, new THREE.MeshBasicMaterial({ color: 0xff4a14 }), 400);

  // Rising magma glow: same fake-volumetric trick inverted (bright at the
  // floor) and multiplied by a two-sine TSL time flicker — the light dances
  // with zero CPU work per frame.
  const magmaGeo = new THREE.CylinderGeometry(1.6, 2.6, MAGMA_GLOW_HEIGHT, 12, 1, true);
  magmaGeo.translate(0, MAGMA_GLOW_HEIGHT / 2, 0);
  const magmaMat = new THREE.MeshBasicNodeMaterial({
    color: 0xff5a18,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const flicker = sin(time.mul(7.3)).mul(0.14).add(sin(time.mul(13.1)).mul(0.08)).add(1);
  magmaMat.opacityNode = mix(float(0.3), float(0.0), positionGeometry.y.div(MAGMA_GLOW_HEIGHT)).mul(flicker);
  const magmaGlow = new InstancePool(magmaGeo, magmaMat, 400);

  const pools: HallPools = {
    floor,
    ceiling,
    rune,
    grate,
    mithril,
    slab,
    buttress,
    bole,
    obelisk,
    stump,
    rubble,
    arch,
    tomb,
    chest,
    bracket,
    flame,
    glow,
    fissure,
    magmaGlow,
  };
  for (const pool of Object.values(pools)) scene.add(pool.mesh);
  return pools;
}
