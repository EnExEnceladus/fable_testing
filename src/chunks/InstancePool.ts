import * as THREE from 'three/webgpu';

const ZERO_SCALE = new THREE.Matrix4().makeScale(0, 0, 0);

export interface PoolOptions {
  castShadow?: boolean;
  receiveShadow?: boolean;
}

/**
 * A fixed-capacity InstancedMesh with a free-list allocator. One pool is one
 * draw call no matter how many chunks contribute instances to it, and its
 * GPU buffers are allocated once at the hard cap — chunk churn never grows
 * VRAM. Freed slots are collapsed to zero scale instead of compacting
 * `count`: degenerate instances cost a few vertex-shader invocations, which
 * is far cheaper than remapping every chunk's slot indices on each unload.
 */
export class InstancePool {
  readonly mesh: THREE.InstancedMesh;
  private readonly capacity: number;
  private readonly freeSlots: number[] = [];
  private warned = false;

  constructor(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    capacity: number,
    opts: PoolOptions = {},
  ) {
    this.capacity = capacity;
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.count = 0;
    // Instances always surround the player; whole-mesh frustum culling would
    // blink the entire pool out when the bounding sphere leaves the view.
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = opts.castShadow ?? false;
    this.mesh.receiveShadow = opts.receiveShadow ?? false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }

  /** Claims a slot and writes its transform. Returns -1 once the cap is hit. */
  alloc(matrix: THREE.Matrix4, color?: THREE.Color): number {
    let slot: number;
    if (this.freeSlots.length > 0) {
      slot = this.freeSlots.pop()!;
    } else if (this.mesh.count < this.capacity) {
      slot = this.mesh.count++;
    } else {
      if (!this.warned) {
        this.warned = true;
        console.warn('InstancePool: capacity exhausted, dropping instances');
      }
      return -1;
    }
    this.mesh.setMatrixAt(slot, matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
    if (color) {
      this.mesh.setColorAt(slot, color);
      this.mesh.instanceColor!.needsUpdate = true;
    }
    return slot;
  }

  release(slot: number): void {
    this.mesh.setMatrixAt(slot, ZERO_SCALE);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.freeSlots.push(slot);
  }
}
