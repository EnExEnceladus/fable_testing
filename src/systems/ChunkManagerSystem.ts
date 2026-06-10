import * as THREE from 'three/webgpu';
import * as RAPIER from '@dimforge/rapier3d-compat';
import { addComponent, addEntity, query, removeEntity, type World } from 'bitecs';
import { Chunk, Player, Position, RigidBody } from '../components';
import type { InstancePool } from '../chunks/InstancePool';
import { createHallPools } from '../chunks/pools';
import {
  biomeFor,
  CHUNK_SIZE,
  chunkSeed,
  generatorFor,
  HALL_HEIGHT,
  mulberry32,
  type ChunkBuilder,
} from '../chunks/worldgen';

const LOAD_RADIUS = 3; // chunks; 3 × 32 m = 96 m — past the fog wall, so pop-in is invisible
const UNLOAD_RADIUS = 4; // hysteresis ring: no load/unload thrash while straddling a seam
const MAX_LOADS_PER_TICK = 2; // amortise generation so a ring of new chunks never spikes a frame

/** Per-chunk bookkeeping that cannot live in SoA components: which pool
 *  slots the chunk owns. The Rapier body travels on the chunk entity's
 *  RigidBody component like every other physical entity. */
interface ChunkRecord {
  allocations: Array<[InstancePool, number]>;
}

/**
 * Streams the world around the player: keeps every chunk within LOAD_RADIUS
 * generated (instances + static colliders + ECS entity) and reclaims
 * everything beyond UNLOAD_RADIUS. Generation is deterministic per chunk
 * seed, so revisited ground is always identical.
 */
export function createChunkManagerSystem(physics: RAPIER.World, scene: THREE.Scene) {
  const pools = createHallPools(scene);

  const loadedByKey = new Map<string, number>(); // "cx,cz" -> chunk entity id
  const records = new Map<number, ChunkRecord>();

  // Scratch objects — the hot path allocates nothing per frame.
  const mat = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const rot = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  const tint = new THREE.Color();
  const stale: number[] = [];

  function loadChunk(world: World, cx: number, cz: number): void {
    const eid = addEntity(world);
    addComponent(world, eid, Chunk);
    addComponent(world, eid, RigidBody);
    Chunk.x[eid] = cx;
    Chunk.z[eid] = cz;
    Chunk.biome[eid] = biomeFor(cx, cz);

    const body = physics.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    RigidBody.handle[eid] = body.handle;

    const record: ChunkRecord = { allocations: [] };
    records.set(eid, record);
    loadedByKey.set(`${cx},${cz}`, eid);

    const ox = cx * CHUNK_SIZE;
    const oz = cz * CHUNK_SIZE;

    const place = (
      pool: InstancePool,
      x: number,
      z: number,
      girth: number,
      color?: THREE.Color,
    ): void => {
      mat.compose(pos.set(ox + x, 0, oz + z), rot, scl.set(girth, 1, girth));
      const slot = pool.alloc(mat, color);
      if (slot !== -1) record.allocations.push([pool, slot]);
    };

    const columnCollider = (x: number, z: number, girth: number): void => {
      physics.createCollider(
        RAPIER.ColliderDesc.cuboid(1.5 * girth, HALL_HEIGHT / 2, 1.5 * girth)
          .setTranslation(ox + x, HALL_HEIGHT / 2, oz + z),
        body,
      );
    };

    const builder: ChunkBuilder = {
      floorTile: (x, z, shade) =>
        place(pools.floor, x, z, 1, tint.setScalar(0.05 + shade * 0.05)),
      floorSlab: (x, z, w, d) => {
        physics.createCollider(
          RAPIER.ColliderDesc.cuboid(w / 2, 0.25, d / 2)
            .setTranslation(ox + x + w / 2, -0.25, oz + z + d / 2),
          body,
        );
      },
      runeTile: (x, z) => place(pools.rune, x, z, 1),
      boleColumn: (x, z, girth) => {
        place(pools.bole, x, z, girth, tint.setScalar(0.14 + girth * 0.06));
        columnCollider(x, z, girth);
      },
      obeliskColumn: (x, z, girth) => {
        place(pools.obelisk, x, z, girth, tint.setScalar(0.12 + girth * 0.06));
        columnCollider(x, z, girth);
      },
      lightShaft: (x, z) => {
        place(pools.beam, x, z, 1);
        place(pools.glow, x, z, 1);
      },
    };

    generatorFor(cx, cz)(builder, mulberry32(chunkSeed(cx, cz)), cx, cz);
  }

  function unloadChunk(world: World, eid: number): void {
    const record = records.get(eid);
    if (record) {
      for (const [pool, slot] of record.allocations) pool.release(slot);
      records.delete(eid);
    }
    loadedByKey.delete(`${Chunk.x[eid]},${Chunk.z[eid]}`);
    // Removing the body cascades to its attached colliders.
    physics.removeRigidBody(physics.getRigidBody(RigidBody.handle[eid]!));
    removeEntity(world, eid);
  }

  return (world: World): World => {
    const players = query(world, [Player, Position]);
    if (players.length === 0) return world;
    const peid = players[0]!;
    const pcx = Math.floor(Position.x[peid]! / CHUNK_SIZE);
    const pcz = Math.floor(Position.z[peid]! / CHUNK_SIZE);

    // Unload pass: collect first — removeEntity mid-iteration would mutate
    // the query's dense array under us.
    stale.length = 0;
    for (const eid of query(world, [Chunk, RigidBody])) {
      const d = Math.max(Math.abs(Chunk.x[eid]! - pcx), Math.abs(Chunk.z[eid]! - pcz));
      if (d > UNLOAD_RADIUS) stale.push(eid);
    }
    for (const eid of stale) unloadChunk(world, eid);

    // Load pass: nearest ring first, so the ground under the player always
    // exists before the horizon fills in.
    let budget = MAX_LOADS_PER_TICK;
    for (let r = 0; r <= LOAD_RADIUS && budget > 0; r++) {
      for (let dx = -r; dx <= r && budget > 0; dx++) {
        for (let dz = -r; dz <= r && budget > 0; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue; // shell only
          const cx = pcx + dx;
          const cz = pcz + dz;
          if (loadedByKey.has(`${cx},${cz}`)) continue;
          loadChunk(world, cx, cz);
          budget--;
        }
      }
    }
    return world;
  };
}
