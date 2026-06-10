import * as THREE from 'three/webgpu';
import { query, type World } from 'bitecs';
import { Player, Position } from '../components';
import { torches } from '../chunks/torchRegistry';

const LIGHT_POOL = 10; // real lights; everything beyond is emissive flame only
const BASE_INTENSITY = 60; // candela — a warm pool ~6 m across
const MAX_ASSIGN_DIST_SQ = 55 * 55; // beyond this a real light wouldn't be seen

/**
 * Keeps the fixed pool of real point lights parked on the torches nearest
 * the player, with a per-light flicker. Any number of torches can burn in a
 * hall; only the closest LIGHT_POOL of them cost lighting.
 */
export function createTorchLightSystem(scene: THREE.Scene) {
  const lights: THREE.PointLight[] = [];
  for (let i = 0; i < LIGHT_POOL; i++) {
    const light = new THREE.PointLight(0xff8636, 0, 17, 2);
    scene.add(light);
    lights.push(light);
  }
  const nearest: Array<{ d: number; x: number; y: number; z: number }> = [];

  return (world: World): World => {
    const players = query(world, [Player, Position]);
    if (players.length === 0) return world;
    const peid = players[0]!;
    const px = Position.x[peid]!;
    const py = Position.y[peid]!;
    const pz = Position.z[peid]!;

    nearest.length = 0;
    for (const t of torches.values()) {
      const dx = t.x - px;
      const dy = t.y - py;
      const dz = t.z - pz;
      nearest.push({ d: dx * dx + dy * dy + dz * dz, x: t.x, y: t.y, z: t.z });
    }
    nearest.sort((a, b) => a.d - b.d);

    const t = performance.now() * 0.001;
    for (let i = 0; i < LIGHT_POOL; i++) {
      const light = lights[i]!;
      const candidate = nearest[i];
      if (!candidate || candidate.d > MAX_ASSIGN_DIST_SQ) {
        light.intensity = 0;
        continue;
      }
      light.position.set(candidate.x, candidate.y, candidate.z);
      light.intensity =
        BASE_INTENSITY * (0.84 + 0.11 * Math.sin(t * 9 + i * 2.1) + 0.05 * Math.sin(t * 23 + i));
    }
    return world;
  };
}
