// World-space torch flame positions, registered by ChunkManagerSystem as
// chunks load and removed as they unload. TorchLightSystem assigns its
// fixed pool of real point lights to the nearest entries each frame —
// torches are unbounded, the light budget is not.

export interface TorchPoint {
  x: number;
  y: number;
  z: number;
}

export const torches = new Map<number, TorchPoint>();

let nextId = 0;

export function registerTorch(x: number, y: number, z: number): number {
  const id = nextId++;
  torches.set(id, { x, y, z });
  return id;
}

export function unregisterTorch(id: number): void {
  torches.delete(id);
}
