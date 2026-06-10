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

/** Tag marking the player entity. */
export const Player = {};

/** Player intent: normalized WASD axes and mouse-look angles (radians). */
export const Input = {
  x: [] as number[],
  z: [] as number[],
  pitch: [] as number[],
  yaw: [] as number[],
};

/** Camera bob state simulating heavy footsteps. */
export const HeadBob = {
  timer: [] as number[],
  intensity: [] as number[],
};

/** Torch carried by the entity: index into the `spotLights` registry. */
export const Flashlight = {
  lightId: [] as number[],
};

/**
 * A streamed world cell: chunk-grid coords (not metres) plus its biome tag.
 * Lifecycle — instances, colliders, entity — is owned by ChunkManagerSystem.
 */
export const Chunk = {
  x: [] as number[],
  z: [] as number[],
  biome: [] as number[],
};

// Three.js objects cannot live inside component arrays, so components store
// indices into these registries. The registries are data only — no game state
// is ever stored on the Object3Ds themselves.
export const meshes: THREE.Object3D[] = [];

export function registerMesh(mesh: THREE.Object3D): number {
  meshes.push(mesh);
  return meshes.length - 1;
}

export const spotLights: THREE.SpotLight[] = [];

export function registerSpotLight(light: THREE.SpotLight): number {
  spotLights.push(light);
  return spotLights.length - 1;
}
