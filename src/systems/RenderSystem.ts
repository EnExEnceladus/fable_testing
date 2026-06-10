import * as THREE from 'three/webgpu';
import type { World } from 'bitecs';

/**
 * Base state of the deep halls: pitch black. Exponential-squared fog locked
 * to pure black is light *failing*, not a grey wall — luminance decays
 * organically into the void. Density 0.022 keeps the flashlight range
 * readable (~15 % loss at 20 m) while burying everything past ~90 m, just
 * inside the 96 m chunk ring so streaming pop-in is invisible. Ambient sits
 * near zero; the ceilings and far walls are never meant to resolve.
 */
export function setupAtmosphere(scene: THREE.Scene): void {
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.FogExp2(0x000000, 0.022);
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
