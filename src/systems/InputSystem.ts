import { query, type World } from 'bitecs';
import { Input, Player } from '../components';

const SENSITIVITY = 0.002; // radians per pixel of mouse movement
const PITCH_LIMIT = Math.PI / 2 - 0.05; // stop just short of straight up/down

/**
 * Translates raw browser input into Input component data: WASD becomes a
 * normalized movement-intent vector, pointer-locked mouse movement becomes
 * pitch/yaw. Clicking the canvas requests pointer lock; mouse deltas are
 * accumulated by the listeners and consumed once per tick.
 */
export function createInputSystem(canvas: HTMLCanvasElement) {
  const keys = new Set<string>();
  let mouseDX = 0;
  let mouseDY = 0;

  window.addEventListener('keydown', (e) => keys.add(e.code));
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  canvas.addEventListener('click', () => canvas.requestPointerLock());
  window.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement === canvas) {
      mouseDX += e.movementX;
      mouseDY += e.movementY;
    }
  });

  return (world: World): World => {
    for (const eid of query(world, [Player, Input])) {
      let x = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
      let z = (keys.has('KeyS') ? 1 : 0) - (keys.has('KeyW') ? 1 : 0);
      const len = Math.hypot(x, z);
      if (len > 1) {
        x /= len;
        z /= len;
      }
      Input.x[eid] = x;
      Input.z[eid] = z;

      Input.yaw[eid] = Input.yaw[eid]! - mouseDX * SENSITIVITY;
      const pitch = Input.pitch[eid]! - mouseDY * SENSITIVITY;
      Input.pitch[eid] = Math.min(PITCH_LIMIT, Math.max(-PITCH_LIMIT, pitch));
    }
    mouseDX = 0;
    mouseDY = 0;
    return world;
  };
}
