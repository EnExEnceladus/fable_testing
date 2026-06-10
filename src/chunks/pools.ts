import * as THREE from 'three/webgpu';
import { float, mix, positionGeometry, sin, time } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { InstancePool } from './InstancePool';
import { HALL_HEIGHT, TILE_SIZE } from './worldgen';

export interface HallPools {
  floor: InstancePool;
  rune: InstancePool;
  grate: InstancePool;
  mithril: InstancePool;
  slab: InstancePool;
  bole: InstancePool;
  obelisk: InstancePool;
  stump: InstancePool;
  rubble: InstancePool;
  arch: InstancePool;
  tomb: InstancePool;
  chest: InstancePool;
  beam: InstancePool;
  glow: InstancePool;
  fissure: InstancePool;
  magmaGlow: InstancePool;
}

const MAGMA_GLOW_HEIGHT = 7;

/**
 * One instanced pool per architectural material class — every loaded chunk
 * feeds these sixteen draw calls and nothing else. Materials use white
 * albedo where instances carry per-stone colour; caps are the VRAM governor
 * (≈ 80 B per instance, all pools together a couple of MB).
 */
export function createHallPools(scene: THREE.Scene): HallPools {
  // Polished black stone floor; low roughness so the flashlight drags a
  // specular streak across it. Tiles sit 0.08 m apart — carved precision.
  const floorGeo = new THREE.BoxGeometry(TILE_SIZE - 0.08, 0.4, TILE_SIZE - 0.08);
  floorGeo.translate(0, -0.2, 0); // top face at y = 0
  const floor = new InstancePool(
    floorGeo,
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.15 }),
    10_000,
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
  // full metalness, near-mirror roughness, so it only ignites under the beam.
  const mithrilGeo = new THREE.BoxGeometry(0.18, 0.05, 1);
  mithrilGeo.translate(0, 0.025, 0);
  const mithril = new InstancePool(
    mithrilGeo,
    new THREE.MeshStandardMaterial({ color: 0xdfe6ee, roughness: 0.12, metalness: 1.0 }),
    500,
  );

  // Generic masonry slab (unit cube, base at y = 0): scaled per instance
  // into colossal sheer walls, alcove piers, lintels, doors and bridge
  // decks. Polished black stone — glassy under the flashlight.
  const slabGeo = new THREE.BoxGeometry(1, 1, 1);
  slabGeo.translate(0, 0.5, 0);
  const slab = new InstancePool(
    slabGeo,
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.18, metalness: 0.1 }),
    2500,
    { castShadow: true, receiveShadow: true },
  );

  // Tree-bole column: lathe profile flaring at root and capital, ~150 tris.
  const bolePoints = [
    new THREE.Vector2(2.7, 0),
    new THREE.Vector2(1.9, 1.2),
    new THREE.Vector2(1.45, 4),
    new THREE.Vector2(1.3, 14),
    new THREE.Vector2(1.45, 25),
    new THREE.Vector2(2.0, 28.4),
    new THREE.Vector2(3.0, HALL_HEIGHT),
  ];
  const bole = new InstancePool(
    new THREE.LatheGeometry(bolePoints, 12),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }),
    1500,
    { castShadow: true, receiveShadow: true },
  );

  // Severe geometric obelisk: a tapered four-sided frustum.
  const obeliskGeo = new THREE.CylinderGeometry(1.05, 1.9, HALL_HEIGHT, 4, 1);
  obeliskGeo.rotateY(Math.PI / 4); // flats face the cardinal aisles
  obeliskGeo.translate(0, HALL_HEIGHT / 2, 0);
  const obelisk = new InstancePool(
    obeliskGeo,
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }),
    800,
    { castShadow: true, receiveShadow: true },
  );

  // Shattered column stump, broken off a few metres up.
  const stumpPoints = [
    new THREE.Vector2(2.7, 0),
    new THREE.Vector2(1.9, 1.2),
    new THREE.Vector2(1.5, 2.8),
    new THREE.Vector2(1.05, 3.6),
  ];
  const stump = new InstancePool(
    new THREE.LatheGeometry(stumpPoints, 12),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }),
    500,
    { castShadow: true, receiveShadow: true },
  );

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
  const arch = new InstancePool(
    archGeo,
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }),
    300,
    { castShadow: true },
  );

  // Tomb of single white stone — the one pale thing in the dark.
  const tombGeo = new THREE.BoxGeometry(2.6, 1.5, 1.3);
  tombGeo.translate(0, 0.75, 0);
  const tomb = new InstancePool(
    tombGeo,
    new THREE.MeshStandardMaterial({ color: 0xd8d4cc, roughness: 0.35 }),
    16,
    { castShadow: true, receiveShadow: true },
  );

  // Ruined iron-bound chest.
  const chestGeo = new THREE.BoxGeometry(1.15, 0.75, 0.7);
  chestGeo.translate(0, 0.375, 0);
  const chest = new InstancePool(
    chestGeo,
    new THREE.MeshStandardMaterial({ color: 0x2c2118, roughness: 0.7 }),
    128,
    { castShadow: true },
  );

  // Daylight shaft beam: fake volumetrics — an additive open cylinder whose
  // opacity fades down its length via a TSL gradient. Costs zero real
  // lights, so shaft count never touches the lighting budget.
  const beamGeo = new THREE.CylinderGeometry(2.0, 2.7, HALL_HEIGHT, 16, 1, true);
  beamGeo.translate(0, HALL_HEIGHT / 2, 0);
  const beamMat = new THREE.MeshBasicNodeMaterial({
    color: 0x8fb8ff,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  beamMat.opacityNode = mix(float(0.03), float(0.2), positionGeometry.y.div(HALL_HEIGHT));
  const beam = new InstancePool(beamGeo, beamMat, 160);

  // Pool of light where a shaft strikes the floor; white material so each
  // instance tints it — blue daylight, red magma.
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
    rune,
    grate,
    mithril,
    slab,
    bole,
    obelisk,
    stump,
    rubble,
    arch,
    tomb,
    chest,
    beam,
    glow,
    fissure,
    magmaGlow,
  };
  for (const pool of Object.values(pools)) scene.add(pool.mesh);
  return pools;
}
