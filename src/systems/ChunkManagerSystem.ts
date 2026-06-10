import * as THREE from 'three/webgpu';
import * as RAPIER from '@dimforge/rapier3d-compat';
import { addComponent, addEntity, query, removeEntity, type World } from 'bitecs';
import { Chunk, Player, Position, RigidBody } from '../components';
import type { InstancePool } from '../chunks/InstancePool';
import { createHallPools } from '../chunks/pools';
import { registerLight, unregisterLight } from '../chunks/torchRegistry';
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
const WALL_THICKNESS = 1.6; // cathedral walls
const BUTTRESS_SPACING = 8.5;

/** Per-chunk bookkeeping that cannot live in SoA components: which pool
 *  slots and light registrations the chunk owns. The Rapier body travels on
 *  the chunk entity's RigidBody component like every other physical entity. */
interface ChunkRecord {
  allocations: Array<[InstancePool, number]>;
  lightIds: number[];
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
  const eul = new THREE.Euler();
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

    const record: ChunkRecord = { allocations: [], lightIds: [] };
    records.set(eid, record);
    loadedByKey.set(`${cx},${cz}`, eid);

    const ox = cx * CHUNK_SIZE;
    const oz = cz * CHUNK_SIZE;

    /** Instance an element; rotation is yaw-then-pitch, scale per axis. */
    const place = (
      pool: InstancePool,
      x: number,
      y: number,
      z: number,
      sx: number,
      sy: number,
      sz: number,
      yaw = 0,
      pitch = 0,
      color?: THREE.Color,
    ): void => {
      rot.setFromEuler(eul.set(pitch, yaw, 0, 'YXZ'));
      mat.compose(pos.set(ox + x, y, oz + z), rot, scl.set(sx, sy, sz));
      const slot = pool.alloc(mat, color);
      if (slot !== -1) record.allocations.push([pool, slot]);
    };

    /** Static cuboid collider (half-extents), optionally rotated. */
    const collide = (
      x: number,
      y: number,
      z: number,
      hx: number,
      hy: number,
      hz: number,
      yaw = 0,
      pitch = 0,
    ): void => {
      const desc = RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(ox + x, y, oz + z);
      if (yaw !== 0 || pitch !== 0) {
        rot.setFromEuler(eul.set(pitch, yaw, 0, 'YXZ'));
        desc.setRotation({ x: rot.x, y: rot.y, z: rot.z, w: rot.w });
      }
      physics.createCollider(desc, body);
    };

    const builder: ChunkBuilder = {
      floorTile: (x, z, shade, jitter = 0) => {
        // Fracture damage is visual only — the collider slab stays flat.
        // Tints are near-white multipliers; the marble colorNode carries
        // the real colour.
        place(
          pools.floor,
          x,
          -jitter * 0.1,
          z,
          1,
          1,
          1,
          0,
          jitter * 0.035,
          tint.setScalar(0.78 + shade * 0.22),
        );
      },
      floorSlab: (x, z, w, d) => collide(x + w / 2, -0.25, z + d / 2, w / 2, 0.25, d / 2),
      runeTile: (x, z) => place(pools.rune, x, 0, z, 1, 1, 1),
      grate: (x, z) => place(pools.grate, x, 0, z, 1, 1, 1),
      mithrilVein: (x, z, yaw, length) => place(pools.mithril, x, 0, z, 1, 1, length, yaw),
      wall: (x, z, length, axis, height = HALL_HEIGHT, y = 0, buttress = true) => {
        if (length <= 0) return;
        const alongX = axis === 'x';
        const cxm = x + (alongX ? length / 2 : 0);
        const czm = z + (alongX ? 0 : length / 2);
        place(
          pools.slab,
          cxm,
          y,
          czm,
          alongX ? length : WALL_THICKNESS,
          height,
          alongX ? WALL_THICKNESS : length,
        );
        collide(
          cxm,
          y + height / 2,
          czm,
          (alongX ? length : WALL_THICKNESS) / 2,
          height / 2,
          (alongX ? WALL_THICKNESS : length) / 2,
        );
        // Gothic buttressing on both faces of long full-height walls. The
        // buttress geometry's -z points at the wall it serves.
        if (!buttress || height < HALL_HEIGHT || length < 10) return;
        const face = WALL_THICKNESS / 2;
        for (let t = 4.5; t < length - 2.5; t += BUTTRESS_SPACING) {
          for (const side of [1, -1]) {
            const bx = alongX ? x + t : x + face * side;
            const bz = alongX ? z + face * side : z + t;
            const yaw = alongX ? (side > 0 ? 0 : Math.PI) : (side > 0 ? Math.PI / 2 : -Math.PI / 2);
            place(pools.buttress, bx, 0, bz, 1, 1, 1, yaw);
            collide(
              bx + Math.sin(yaw) * 0.95,
              8,
              bz + Math.cos(yaw) * 0.95,
              0.85,
              8,
              0.85,
            );
          }
        }
      },
      boleColumn: (x, z, girth) => {
        place(pools.bole, x, 0, z, girth, 1, girth, 0, 0, tint.setScalar(0.85 + girth * 0.15));
        // Wide enough to keep the capsule off the plinth steps and the
        // engaged colonnettes.
        collide(x, HALL_HEIGHT / 2, z, 2.8 * girth, HALL_HEIGHT / 2, 2.8 * girth);
      },
      obeliskColumn: (x, z, girth) => {
        place(pools.obelisk, x, 0, z, girth, 1, girth, 0, 0, tint.setScalar(0.85 + girth * 0.15));
        collide(x, HALL_HEIGHT / 2, z, 2.5 * girth, HALL_HEIGHT / 2, 2.5 * girth);
      },
      brokenColumn: (x, z, girth, lean, yaw) => {
        place(pools.stump, x, 0, z, girth, 1, girth, yaw, lean, tint.setScalar(0.9));
        collide(x, 2.3, z, 2.8 * girth, 2.3, 2.8 * girth);
      },
      rubble: (x, z, size, squash, yaw, shade) =>
        place(pools.rubble, x, 0, z, size, size * squash, size * 0.85, yaw, 0, tint.setScalar(0.03 + shade * 0.08)),
      archFragment: (x, z, yaw, lean) => place(pools.arch, x, 0.4, z, 1, 1, 1, yaw, lean),
      ceilingTile: (x, z) => place(pools.ceiling, x, HALL_HEIGHT, z, 1, 1, 1),
      torch: (x, z, yaw) => {
        place(pools.bracket, x, 3.9, z, 1, 1, 1, yaw);
        place(pools.flame, x, 4.12, z, 1, 1, 1);
        record.lightIds.push(registerLight(ox + x, 4.55, oz + z, 0xff8636, 85, 22, 1));
      },
      ceilingBreach: (x, z) => {
        // Jagged rim hanging at the wound's edge (deterministic golden-angle
        // ring — no rng needed for organic spread).
        for (let i = 0; i < 9; i++) {
          const a = i * 2.4;
          const r = 4.1 + (i % 3) * 0.5;
          place(
            pools.rubble,
            x + Math.cos(a) * r,
            HALL_HEIGHT - 0.7,
            z + Math.sin(a) * r,
            1.1 + (i % 4) * 0.35,
            0.9,
            1.3,
            a,
            0.3,
            tint.setScalar(0.07 + (i % 3) * 0.03),
          );
        }
        // The fallen vault, heaped on the floor below.
        for (let i = 0; i < 7; i++) {
          const a = i * 2.4 + 1.2;
          const r = (i % 4) * 1.1;
          place(
            pools.rubble,
            x + Math.cos(a) * r,
            0,
            z + Math.sin(a) * r,
            0.8 + (i % 3) * 0.55,
            0.55 + (i % 2) * 0.35,
            1,
            a,
            0,
            tint.setScalar(0.08 + (i % 3) * 0.04),
          );
        }
        // Faint moonlight: a pale pool on the floor and a steady cool light
        // hung in the opening's throw.
        place(pools.glow, x, 0, z, 1.6, 1, 1.6, 0, 0, tint.setHex(0x8aa3cf));
        record.lightIds.push(registerLight(ox + x, 14, oz + z, 0x9db4dd, 55, 38, 0));
      },
      stoneDoor: (x, z, yaw) => {
        place(pools.slab, x, 0, z, 4.6, 6, 0.5, yaw);
        collide(x, 3, z, 2.3, 3, 0.25, yaw);
      },
      bridgeSegment: (x, y, z, pitch) => {
        place(pools.slab, x, y - 0.5, z, 2.6, 0.5, 2.8, 0, pitch);
        collide(x, y - 0.25, z, 1.3, 0.25, 1.4, 0, pitch);
      },
      magmaFissure: (x, z, yaw, length) => {
        place(pools.fissure, x, 0, z, 1, 1, length, yaw);
        place(pools.magmaGlow, x, 0, z, 1, 1, Math.max(1, length / 4), yaw);
        place(pools.glow, x, 0, z, 1.4, 1, Math.max(1, length / 3), yaw, 0, tint.setHex(0xb33a10));
      },
      tomb: (x, z) => {
        place(pools.tomb, x, 0, z, 1, 1, 1);
        collide(x, 0.75, z, 1.3, 0.75, 0.65);
      },
      chest: (x, z, yaw) => place(pools.chest, x, 0, z, 1, 1, 1, yaw),
    };

    generatorFor(cx, cz)(builder, mulberry32(chunkSeed(cx, cz)), cx, cz);
  }

  function unloadChunk(world: World, eid: number): void {
    const record = records.get(eid);
    if (record) {
      for (const [pool, slot] of record.allocations) pool.release(slot);
      for (const id of record.lightIds) unregisterLight(id);
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
