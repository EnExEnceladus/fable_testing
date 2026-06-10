import * as THREE from 'three/webgpu';
import * as RAPIER from '@dimforge/rapier3d-compat';
import { addComponent, addEntity, createWorld } from 'bitecs';
import { Position, Renderable, registerMesh, RigidBody } from './components';
import { createPhysicsSystem } from './systems/PhysicsSystem';
import { createRenderSystem, setupAtmosphere } from './systems/RenderSystem';

async function main(): Promise<void> {
  // --- Rendering ---
  const renderer = new THREE.WebGPURenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);
  await renderer.init();

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    200,
  );
  camera.position.set(0, 4, 14);
  camera.lookAt(0, 2, 0);

  setupAtmosphere(scene);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // --- Physics ---
  await RAPIER.init();
  const physics = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

  // --- ECS ---
  const world = createWorld();

  function spawn(
    mesh: THREE.Mesh,
    bodyDesc: RAPIER.RigidBodyDesc,
    colliderDesc: RAPIER.ColliderDesc,
  ): number {
    const body = physics.createRigidBody(bodyDesc);
    physics.createCollider(colliderDesc, body);

    const eid = addEntity(world);
    addComponent(world, eid, Position);
    addComponent(world, eid, Renderable);
    addComponent(world, eid, RigidBody);

    const t = body.translation();
    Position.x[eid] = t.x;
    Position.y[eid] = t.y;
    Position.z[eid] = t.z;
    Renderable.meshId[eid] = registerMesh(mesh);
    RigidBody.handle[eid] = body.handle;

    mesh.position.set(t.x, t.y, t.z);
    scene.add(mesh);
    return eid;
  }

  // Massive flat stone ground: static physics body + dark-grey slab mesh.
  const ground = new THREE.Mesh(
    new THREE.BoxGeometry(400, 1, 400),
    new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.95 }),
  );
  ground.receiveShadow = true;
  spawn(
    ground,
    RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0),
    RAPIER.ColliderDesc.cuboid(200, 0.5, 200),
  );

  // A lone cube suspended in the dark — falls and lands under gravity.
  const cube = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x6b6b75, roughness: 0.6 }),
  );
  cube.castShadow = true;
  cube.receiveShadow = true;
  spawn(
    cube,
    RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 8, 0),
    RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5),
  );

  // --- Main loop ---
  const physicsSystem = createPhysicsSystem(physics);
  const renderSystem = createRenderSystem(renderer, scene, camera);

  function loop(): void {
    physicsSystem(world);
    renderSystem(world);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

main().catch(console.error);
