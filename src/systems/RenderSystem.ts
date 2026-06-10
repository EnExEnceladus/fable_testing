import * as THREE from 'three/webgpu';
import type { World } from 'bitecs';

/**
 * Dark, creepy atmosphere: near-black fog swallowing the distance, a faint
 * cold ambient, and a single harsh spotlight carving shadows out of the dark.
 */
export function setupAtmosphere(scene: THREE.Scene): void {
  scene.background = new THREE.Color(0x050505);
  scene.fog = new THREE.Fog(0x050505, 8, 55);

  const ambient = new THREE.AmbientLight(0x16161e, 0.4);
  scene.add(ambient);

  const spotlight = new THREE.SpotLight(0xffe9c4, 900);
  spotlight.position.set(6, 14, 4);
  spotlight.angle = Math.PI / 5;
  spotlight.penumbra = 0.7;
  spotlight.decay = 1.6;
  spotlight.distance = 80;
  spotlight.castShadow = true;
  spotlight.shadow.mapSize.set(2048, 2048);
  spotlight.shadow.camera.near = 1;
  spotlight.shadow.camera.far = 80;
  spotlight.target.position.set(0, 0, 0);
  scene.add(spotlight, spotlight.target);
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
