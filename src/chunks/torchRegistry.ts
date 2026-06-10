// World-space light points (torch flames, moonlight breaches…), registered
// by ChunkManagerSystem as chunks load and removed as they unload.
// TorchLightSystem assigns its fixed pool of real point lights to the
// nearest entries each frame — light points are unbounded, the budget not.

export interface LightPoint {
  x: number;
  y: number;
  z: number;
  color: number;
  intensity: number;
  range: number;
  /** 0 = steady (moonlight), 1 = full torch flicker. */
  flicker: number;
}

export const lightPoints = new Map<number, LightPoint>();

let nextId = 0;

export function registerLight(
  x: number,
  y: number,
  z: number,
  color: number,
  intensity: number,
  range: number,
  flicker: number,
): number {
  const id = nextId++;
  lightPoints.set(id, { x, y, z, color, intensity, range, flicker });
  return id;
}

export function unregisterLight(id: number): void {
  lightPoints.delete(id);
}
