import type * as RAPIER from '@dimforge/rapier3d-compat';
import { query, type World } from 'bitecs';
import { meshes, Position, Renderable, RigidBody } from '../components';

/**
 * Steps the Rapier world, then syncs each rigid body's transform into its
 * Position component and onto its Three.js mesh.
 */
export function createPhysicsSystem(physics: RAPIER.World) {
  return (world: World): World => {
    physics.step();

    for (const eid of query(world, [RigidBody, Position, Renderable])) {
      const body = physics.getRigidBody(RigidBody.handle[eid]!);
      const t = body.translation();
      const r = body.rotation();

      Position.x[eid] = t.x;
      Position.y[eid] = t.y;
      Position.z[eid] = t.z;

      const mesh = meshes[Renderable.meshId[eid]!]!;
      mesh.position.set(t.x, t.y, t.z);
      mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }

    return world;
  };
}
