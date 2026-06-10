import * as THREE from 'three/webgpu';
import {
  abs,
  bumpMap,
  color,
  float,
  fract,
  hash,
  instanceIndex,
  mix,
  mx_noise_float,
  oneMinus,
  positionLocal,
  positionWorld,
  pow,
  sin,
  smoothstep,
  time,
  vec3,
} from 'three/tsl';

// All surface detail is generated on the GPU in world space: no textures,
// no UV dependence, and every instance differs automatically because its
// world position differs. Per-instance tint colours still multiply on top.

// TSL node generics differ per operand (float vs vec3); the helper stays
// permissive — node graphs are validated at runtime by the node builder.
type N = any;

/** Three-octave value noise (manual fbm — stable across mx_* signatures). */
function fbm(p: N): N {
  return mx_noise_float(p)
    .add(mx_noise_float(p.mul(2.17)).mul(0.5))
    .add(mx_noise_float(p.mul(4.71)).mul(0.25));
}

/**
 * Polished marbled stone: dark body, large tonal patches, and thin bright
 * veins that run diagonally so they read on floors and uprights alike.
 * Veined areas go glossier — light catches the polish first.
 */
export function marbleMaterial(
  base: number,
  vein: number,
  roughness: number,
  scale = 0.45,
): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ roughness, metalness: 0.04 });
  const p = positionWorld.mul(scale);
  const turb = fbm(p);
  const veinAxis = p.x.mul(1.1).add(p.z.mul(0.7)).add(p.y.mul(2.0));
  const veinLine = pow(oneMinus(abs(sin(veinAxis.add(turb.mul(4.0))))), float(7));
  const tone = mx_noise_float(p.mul(0.22)).mul(0.5).add(0.5);
  const body = mix(color(base).mul(0.7), color(base).mul(1.25), tone);
  m.colorNode = mix(body, color(vein), veinLine.mul(0.8));
  m.roughnessNode = mix(float(roughness), float(roughness * 0.5), veinLine);
  m.normalNode = bumpMap(turb.mul(0.18));
  return m;
}

/**
 * Carved granite: vertically-stretched tool marks (the mason worked top to
 * bottom) over granular tonal variation. The bump is strong enough that
 * raking torchlight breaks across the strokes.
 */
export function carvedGraniteMaterial(
  base: number,
  roughness = 0.8,
  scale = 0.5,
): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ roughness, metalness: 0.02 });
  const p = positionWorld.mul(scale);
  const strokes = fbm(p.mul(vec3(5.0, 0.8, 5.0)));
  const tone = mx_noise_float(p.mul(0.3)).mul(0.5).add(0.5);
  m.colorNode = mix(color(base).mul(0.72), color(base).mul(1.18), tone);
  m.normalNode = bumpMap(strokes.mul(0.35));
  return m;
}

/**
 * Coursed masonry for the great walls: a dark mortar line every 2.5 m and
 * chiselled surface noise between, so sheer faces read as built, not
 * extruded.
 */
export function masonryMaterial(base: number, roughness = 0.55): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ roughness, metalness: 0.05 });
  const courseDist = abs(fract(positionWorld.y.mul(0.4)).sub(0.5)); // 0.5 at course boundaries
  const mortar = smoothstep(float(0.42), float(0.49), courseDist);
  const p = positionWorld.mul(0.4);
  const turb = fbm(p);
  const tone = mx_noise_float(p.mul(0.25)).mul(0.5).add(0.5);
  m.colorNode = mix(color(base).mul(0.8), color(base).mul(1.15), tone).mul(
    oneMinus(mortar.mul(0.45)),
  );
  m.normalNode = bumpMap(turb.mul(0.16).sub(mortar.mul(0.3)));
  return m;
}

/**
 * Torch flame: additive teardrop graded ember-orange to near-white, with a
 * two-sine flicker phase-shifted per instance (hash of instanceIndex) so no
 * two torches in a hall pulse together.
 */
export function flameMaterial(): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const phase = hash(instanceIndex);
  const flick = sin(time.mul(11).add(phase.mul(40)))
    .mul(0.18)
    .add(sin(time.mul(27).add(phase.mul(13))).mul(0.1))
    .add(0.82);
  const yN = positionLocal.y.div(0.62).clamp(0, 1);
  m.colorNode = mix(color(0xff3c00), color(0xffd98a), pow(yN, float(1.6)));
  m.opacityNode = flick.mul(oneMinus(pow(yN, float(3))).mul(0.85).add(0.15));
  return m;
}
