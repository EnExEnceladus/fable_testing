# Lessons

## bitecs 0.4 uses a functional API, not the 0.3 docs API
Installed bitecs is 0.4.0: there is no `defineComponent`/`Types`. Components are plain
structure-of-arrays objects you define yourself (e.g. `{ x: [] as number[] }`), added with
`addComponent(world, eid, Component)` (entity id comes second) and queried with
`query(world, [A, B])`.

## Bridge ECS to Three.js/Rapier with numeric references, not object references
Component arrays hold numbers only: `Renderable.meshId` indexes a module-level `meshes`
registry in `components.ts`, and `RigidBody.handle` stores the Rapier body handle resolved
via `physics.getRigidBody(handle)`. No game state ever lives on Object3Ds or in `userData`.

## PhysicsSystem owns the transform sync direction: Rapier → Position → mesh
Rapier is the source of truth for simulated bodies; each step writes body translation into
the `Position` component (ECS gameplay state) and body translation+rotation onto the mesh.

## Both engines need async init before the loop starts; avoid top-level await
`WebGPURenderer` requires `await renderer.init()` and rapier3d-compat requires
`await RAPIER.init()` (it decodes inlined WASM). Everything runs inside `async main()`
instead of top-level await so the bundle stays safe for stricter build targets.

## Three r155+ uses physical light units
Spotlights need high candela intensities (hundreds, not ~1-2) to be visible at scene
distances; tune `decay`/`distance` alongside intensity for the dark atmosphere.

## Player pipeline separates intent, simulation, and presentation
InputSystem turns raw browser events into Input intent data (normalized WASD axes,
clamped pitch/yaw); PlayerMovementSystem turns intent into Rapier velocities before the
step; CameraSystem reads post-step state for eye placement, head bob, and the flashlight.
Loop order is load-bearing: input → movement → physics → camera → render.

## Not every physics entity is renderable
The first-person player has RigidBody + Position but no mesh, so PhysicsSystem syncs
Position for [RigidBody, Position] and meshes for [RigidBody, Renderable] as two separate
queries — a single combined query silently skips mesh-less bodies.

## Direct-velocity character control pairs with high linear damping
The player capsule is dynamic with `lockRotations(true, true)` so collisions can't tip it,
`setLinvel` (preserving vertical velocity for gravity) only while keys are held, and
linear damping ≈ 10 so releasing the keys stops the walk without ice-skating. Damping
applies to all axes, so very high values would also slow falling.
