import * as THREE from 'three/webgpu';
import { query, type World } from 'bitecs';
import { Player, Position } from '../components';
import { lightPoints, type LightPoint } from '../chunks/torchRegistry';

const LIGHT_POOL = 12; // real lights; everything beyond is emissive flame only
const MAX_ASSIGN_DIST_SQ = 70 * 70; // beyond this a real light wouldn't be seen

/**
 * Keeps the fixed pool of real point lights parked on the registered light
 * points nearest the player — warm flickering torches, steady moonlight
 * breaches. Any number can exist in the world; only the closest LIGHT_POOL
 * of them cost lighting.
 */
export function createTorchLightSystem(scene: THREE.Scene) {
  const lights: THREE.PointLight[] = [];
  for (let i = 0; i < LIGHT_POOL; i++) {
    const light = new THREE.PointLight(0xffffff, 0, 20, 2);
    scene.add(light);
    lights.push(light);
  }
  const nearest: Array<{ d: number; p: LightPoint }> = [];

  return (world: World): World => {
    const players = query(world, [Player, Position]);
    if (players.length === 0) return world;
    const peid = players[0]!;
    const px = Position.x[peid]!;
    const py = Position.y[peid]!;
    const pz = Position.z[peid]!;

    nearest.length = 0;
    for (const p of lightPoints.values()) {
      const dx = p.x - px;
      const dy = p.y - py;
      const dz = p.z - pz;
      nearest.push({ d: dx * dx + dy * dy + dz * dz, p });
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
      const p = candidate.p;
      const flicker =
        1 + p.flicker * (0.11 * Math.sin(t * 9 + i * 2.1) + 0.05 * Math.sin(t * 23 + i) - 0.16);
      light.position.set(p.x, p.y, p.z);
      light.color.setHex(p.color);
      light.distance = p.range;
      light.intensity = p.intensity * flicker;
    }
    return world;
  };
}
