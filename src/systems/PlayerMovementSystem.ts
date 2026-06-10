import type * as RAPIER from '@dimforge/rapier3d-compat';
import { query, type World } from 'bitecs';
import { Input, Player, RigidBody } from '../components';

const MOVE_SPEED = 5; // m/s — a heavy, grounded walk
const STOP_FACTOR = 0.75; // horizontal velocity retained per tick after keys release

/**
 * Turns movement intent into physics velocity: rotates the WASD axes by the
 * player's yaw so 'W' always walks where they look, then drives the rigid
 * body's linear velocity directly (preserving vertical velocity for gravity).
 * Stopping decays horizontal velocity manually instead of using Rapier's
 * linear damping — damping is all-axis and would cap fall speed, and the
 * Black Chasm demands a real, accelerating plunge.
 */
export function createPlayerMovementSystem(physics: RAPIER.World) {
  return (world: World): World => {
    for (const eid of query(world, [Player, Input, RigidBody])) {
      const x = Input.x[eid]!;
      const z = Input.z[eid]!;
      if (x === 0 && z === 0) {
        const body = physics.getRigidBody(RigidBody.handle[eid]!);
        const vel = body.linvel();
        if (vel.x * vel.x + vel.z * vel.z > 1e-4) {
          body.setLinvel({ x: vel.x * STOP_FACTOR, y: vel.y, z: vel.z * STOP_FACTOR }, true);
        }
        continue;
      }

      const yaw = Input.yaw[eid]!;
      const cos = Math.cos(yaw);
      const sin = Math.sin(yaw);
      const body = physics.getRigidBody(RigidBody.handle[eid]!);
      const vel = body.linvel();
      body.setLinvel(
        {
          x: (x * cos + z * sin) * MOVE_SPEED,
          y: vel.y,
          z: (-x * sin + z * cos) * MOVE_SPEED,
        },
        true,
      );
    }
    return world;
  };
}
