import * as THREE from 'three/webgpu';
import * as RAPIER from '@dimforge/rapier3d-compat';
import { addComponent, addEntity, createWorld } from 'bitecs';
import {
  Flashlight,
  HeadBob,
  Input,
  Player,
  Position,
  Renderable,
  registerMesh,
  registerSpotLight,
  RigidBody,
} from './components';
import { createCameraSystem } from './systems/CameraSystem';
import { createInputSystem } from './systems/InputSystem';
import { createPhysicsSystem } from './systems/PhysicsSystem';
import { createPlayerMovementSystem } from './systems/PlayerMovementSystem';
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

  // --- Player ---
  // Dynamic capsule with rotations locked so physics can't tip it over, and
  // high linear damping so releasing the keys stops the walk dead.
  const playerBody = physics.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 1.4, 8).setLinearDamping(10),
  );
  playerBody.lockRotations(true, true);
  physics.createCollider(RAPIER.ColliderDesc.capsule(0.75, 0.5), playerBody);

  // The player's torch: a tight warm cone that the CameraSystem keeps glued
  // to the camera every frame.
  const flashlight = new THREE.SpotLight(0xffe2b0, 600);
  flashlight.angle = Math.PI / 6;
  flashlight.penumbra = 0.5;
  flashlight.decay = 1.8;
  flashlight.distance = 45;
  flashlight.castShadow = true;
  flashlight.shadow.mapSize.set(1024, 1024);
  scene.add(flashlight, flashlight.target);

  const player = addEntity(world);
  addComponent(world, player, Player);
  addComponent(world, player, Input);
  addComponent(world, player, HeadBob);
  addComponent(world, player, Flashlight);
  addComponent(world, player, Position);
  addComponent(world, player, RigidBody);

  const pt = playerBody.translation();
  Position.x[player] = pt.x;
  Position.y[player] = pt.y;
  Position.z[player] = pt.z;
  Input.x[player] = 0;
  Input.z[player] = 0;
  Input.pitch[player] = 0;
  Input.yaw[player] = 0; // facing -Z, toward the falling cube
  HeadBob.timer[player] = 0;
  HeadBob.intensity[player] = 0.05;
  Flashlight.lightId[player] = registerSpotLight(flashlight);
  RigidBody.handle[player] = playerBody.handle;

  // --- Main loop ---
  const inputSystem = createInputSystem(renderer.domElement);
  const playerMovementSystem = createPlayerMovementSystem(physics);
  const physicsSystem = createPhysicsSystem(physics);
  const cameraSystem = createCameraSystem(camera, physics);
  const renderSystem = createRenderSystem(renderer, scene, camera);

  function loop(): void {
    inputSystem(world);
    playerMovementSystem(world);
    physicsSystem(world);
    cameraSystem(world);
    renderSystem(world);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

main().catch(console.error);
