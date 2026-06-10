import * as THREE from 'three/webgpu';
import type { World } from 'bitecs';

/**
 * Base state of the deep halls: pitch black. Ambient sits near zero so the
 * void swallows whatever the flashlight and the daylight shafts don't touch;
 * the fog wall lands short of the 96 m chunk ring, hiding streaming pop-in.
 */
export function setupAtmosphere(scene: THREE.Scene): void {
  scene.background = new THREE.Color(0x020204);
  scene.fog = new THREE.Fog(0x020204, 14, 85);
  scene.add(new THREE.AmbientLight(0x2a3448, 0.05));
}

/** Draws the current frame. */
export function createRenderSystem(
  renderer: THREE.WebGPURenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
) {
  return (world: World): World => {
    renderer.render(scene, camera);
    return world;
  };
}
