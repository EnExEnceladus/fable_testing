import * as THREE from 'three/webgpu';
import type { World } from 'bitecs';
import {
  color,
  float,
  hash,
  mx_noise_float,
  oneMinus,
  positionGeometry,
  sin,
  smoothstep,
  time,
  vec2,
} from 'three/tsl';

// TSL node generics degrade across chained vec ops; graph heads stay
// permissive — node graphs are validated at runtime by the node builder.
type N = any;

/**
 * The night above the mountain, seen only through fallen vaults: a star
 * field with drifting mist and a crescent moon, hung high over the halls as
 * real geometry. Ceilings occlude it everywhere except the breaches, and
 * the group follows the player in XZ so the sky never parallaxes — it reads
 * as infinitely far. Sky materials ignore fog (fog is the halls' darkness,
 * not the sky's).
 */
export function createNightSky(scene: THREE.Scene): THREE.Group {
  const sky = new THREE.Group();

  // Star dome: a vast disc far above the vault line.
  const skyGeo = new THREE.CircleGeometry(550, 48);
  skyGeo.rotateX(Math.PI / 2); // face downward
  const skyMat = new THREE.MeshBasicNodeMaterial({ fog: false });
  const grid: N = positionGeometry.xz.mul(0.16);
  const cell: N = grid.floor();
  const local: N = grid.fract().sub(0.5);
  const h: N = hash(cell.x.mul(127.1).add(cell.y.mul(311.7)));
  const isStar: N = smoothstep(float(0.96), float(0.99), h);
  const falloff: N = smoothstep(float(0.16), float(0.0), local.length());
  const twinkle: N = sin(time.mul(1.3).add(h.mul(80))).mul(0.35).add(0.75);
  const drift: N = positionGeometry.xz.mul(0.004).add(vec2(time.mul(0.006), time.mul(0.0023)));
  const mist: N = smoothstep(
    float(0.1),
    float(0.9),
    mx_noise_float(drift).add(mx_noise_float(drift.mul(2.3)).mul(0.5)),
  );
  const stars: N = isStar.mul(falloff).mul(twinkle).mul(oneMinus(mist.mul(0.85)));
  const skyBase: N = color(0x05070e);
  skyMat.colorNode = skyBase
    .add(color(0xcdd8f0).mul(stars.mul(1.5)))
    .add(color(0x2a3550).mul(mist.mul(0.5)));
  const dome = new THREE.Mesh(skyGeo, skyMat);
  dome.position.y = 130;
  sky.add(dome);

  // Crescent moon near zenith, so it is found through the breaches. The
  // crescent is one disc bitten by an offset shadow circle.
  const moonMat = new THREE.MeshBasicNodeMaterial({
    fog: false,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const n: N = positionGeometry.xy.div(9);
  const disc: N = smoothstep(float(1.0), float(0.96), n.length());
  const bite: N = smoothstep(float(0.74), float(0.82), n.sub(vec2(0.4, 0.16)).length());
  const lum: N = disc.mul(bite);
  moonMat.colorNode = color(0xe9eef6).mul(lum.mul(1.7));
  const moon = new THREE.Mesh(new THREE.CircleGeometry(9, 40), moonMat);
  moon.position.set(5, 118, -6);
  moon.lookAt(0, 0, 0);
  sky.add(moon);

  // Soft halo behind the moon.
  const haloMat = new THREE.MeshBasicNodeMaterial({
    fog: false,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const hn: N = positionGeometry.xy.div(22);
  haloMat.colorNode = color(0x9fb4dd).mul(smoothstep(float(1.0), float(0.1), hn.length()).mul(0.14));
  const halo = new THREE.Mesh(new THREE.CircleGeometry(22, 32), haloMat);
  halo.position.set(5, 117.5, -6);
  halo.lookAt(0, 0, 0);
  sky.add(halo);

  scene.add(sky);
  return sky;
}

/**
 * Night-of-the-mountain atmosphere: exponential black fog still swallows
 * the distance, but a cool moonlit ambient and a faint sky-down hemisphere
 * lift the halls enough to read the vaults, piers and buttresses. Density
 * 0.016 keeps the 44 m ceilings visible overhead while burying everything
 * past ~95 m, inside the 96 m chunk ring.
 */
export function setupAtmosphere(scene: THREE.Scene): void {
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.FogExp2(0x000000, 0.016);
  scene.add(new THREE.AmbientLight(0x3a4660, 0.18));
  scene.add(new THREE.HemisphereLight(0x8093b8, 0x14161c, 0.35));
}

/** Draws the current frame; the sky rides the camera in XZ. */
export function createRenderSystem(
  renderer: THREE.WebGPURenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  sky: THREE.Group,
) {
  return (world: World): World => {
    sky.position.set(camera.position.x, 0, camera.position.z);
    renderer.render(scene, camera);
    return world;
  };
}
