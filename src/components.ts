import type * as THREE from 'three/webgpu';

// bitECS 0.4 components: plain structure-of-arrays data keyed by entity id.
// Components hold data only — all logic lives in systems.

/** World-space translation. ECS source of truth for gameplay positions. */
export const Position = {
  x: [] as number[],
  y: [] as number[],
  z: [] as number[],
};

/** Visual representation: index into the `meshes` registry. */
export const Renderable = {
  meshId: [] as number[],
};

/** Physics representation: Rapier rigid-body handle (resolved via `physics.getRigidBody`). */
export const RigidBody = {
  handle: [] as number[],
};

// Three.js objects cannot live inside component arrays, so Renderable stores
// an index into this registry. The registry is data only — no game state is
// ever stored on the Object3Ds themselves.
export const meshes: THREE.Object3D[] = [];

export function registerMesh(mesh: THREE.Object3D): number {
  meshes.push(mesh);
  return meshes.length - 1;
}
