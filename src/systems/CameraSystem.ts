import * as THREE from 'three/webgpu';
import type * as RAPIER from '@dimforge/rapier3d-compat';
import { query, type World } from 'bitecs';
import {
  Flashlight,
  HeadBob,
  Input,
  Player,
  Position,
  RigidBody,
  spotLights,
} from '../components';

const DT = 1 / 60; // matches Rapier's fixed timestep
const EYE_HEIGHT = 1.0; // metres above the capsule centre
const BOB_FREQUENCY = 8; // rad/s — slow, heavy footsteps
const MOVING_SPEED_SQ = 0.25; // planar speed² below this counts as standing still
// Settle threshold must exceed the per-tick sine change (BOB_FREQUENCY * DT)
// or the bob can step over a zero crossing and never come to rest.
const SETTLE_THRESHOLD = 0.15;

/**
 * Post-physics presentation: places the camera at the player's eye, applies
 * mouse-look pitch/yaw, bobs the eye height while walking, and keeps the
 * flashlight riding the camera like a headlamp.
 */
export function createCameraSystem(
  camera: THREE.PerspectiveCamera,
  physics: RAPIER.World,
) {
  camera.rotation.order = 'YXZ'; // yaw, then pitch — no roll
  const forward = new THREE.Vector3();

  return (world: World): World => {
    const players = query(world, [
      Player,
      Position,
      Input,
      HeadBob,
      Flashlight,
      RigidBody,
    ]);
    for (const eid of players) {
      const body = physics.getRigidBody(RigidBody.handle[eid]!);
      const vel = body.linvel();
      const moving = vel.x * vel.x + vel.z * vel.z > MOVING_SPEED_SQ;

      // Head bob: advance the phase while walking; once stopped, keep
      // advancing only until the sine settles near a zero crossing so the
      // camera eases back to eye level instead of snapping.
      const sine = Math.sin(HeadBob.timer[eid]! * BOB_FREQUENCY);
      if (moving || Math.abs(sine) > SETTLE_THRESHOLD) {
        HeadBob.timer[eid] = HeadBob.timer[eid]! + DT;
      }
      const bob =
        Math.sin(HeadBob.timer[eid]! * BOB_FREQUENCY) * HeadBob.intensity[eid]!;

      camera.position.set(
        Position.x[eid]!,
        Position.y[eid]! + EYE_HEIGHT + bob,
        Position.z[eid]!,
      );
      camera.rotation.y = Input.yaw[eid]!;
      camera.rotation.x = Input.pitch[eid]!;

      // Headlamp: the spotlight (and its target) track the camera exactly.
      const light = spotLights[Flashlight.lightId[eid]!]!;
      camera.getWorldDirection(forward);
      light.position.copy(camera.position);
      light.target.position.copy(camera.position).add(forward);
    }
    return world;
  };
}
