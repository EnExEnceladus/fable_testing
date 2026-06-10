import * as THREE from 'three/webgpu';
import { float, mix, positionGeometry } from 'three/tsl';
import { InstancePool } from './InstancePool';
import { HALL_HEIGHT, TILE_SIZE } from './worldgen';

export interface HallPools {
  floor: InstancePool;
  rune: InstancePool;
  bole: InstancePool;
  obelisk: InstancePool;
  beam: InstancePool;
  glow: InstancePool;
}

/**
 * One instanced pool per architectural material class — six draw calls for
 * the entire streamed world. Materials use white albedo where instances
 * carry per-stone colour variation. Caps are the VRAM governor: at 64 B
 * matrix + 16 B colour per instance, all six pools together stay near 1 MB.
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
  const rune = new InstancePool(
    runeGeo,
    new THREE.MeshBasicMaterial({ color: 0x55400e }),
    600,
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
  beamMat.opacityNode = mix(
    float(0.03),
    float(0.2),
    positionGeometry.y.div(HALL_HEIGHT),
  );
  const beam = new InstancePool(beamGeo, beamMat, 160);

  // Pool of daylight where the shaft strikes the floor.
  const glowGeo = new THREE.CircleGeometry(3.4, 24);
  glowGeo.rotateX(-Math.PI / 2);
  glowGeo.translate(0, 0.03, 0);
  const glow = new InstancePool(
    glowGeo,
    new THREE.MeshBasicMaterial({
      color: 0x4a6fa8,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
    160,
  );

  const pools: HallPools = { floor, rune, bole, obelisk, beam, glow };
  for (const pool of Object.values(pools)) scene.add(pool.mesh);
  return pools;
}
