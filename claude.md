# 1. Think Before Coding
Don't assume. Don't hide confusion. Surface tradeoffs.

Before implementing:
* State your assumptions explicitly. If uncertain, ask.
* If multiple interpretations exist, present them - don't pick silently.
* If a simpler approach exists, say so. Push back when warranted.
* If something is unclear, stop. Name what's confusing. Ask.

# 2. Simplicity First
Minimum code that solves the problem. Nothing speculative.

* No features beyond what was asked.
* No abstractions for single-use code.
* No "flexibility" or "configurability" that wasn't requested.
* No error handling for impossible scenarios.
* If you write 200 lines and it could be 50, rewrite it.
* Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

# 3. Surgical Changes
Touch only what you must. Clean up only your own mess.

When editing existing code:
* Don't "improve" adjacent code, comments, or formatting.
* Don't refactor things that aren't broken.
* Match existing style, even if you'd do it differently.
* If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
* Remove imports/variables/functions that YOUR changes made unused.
* Don't remove pre-existing dead code unless asked.

**The test:** Every changed line should trace directly to the user's request.

# 4. Goal-Driven Execution
Define success criteria. Loop until verified.

Transform tasks into verifiable goals:
* "Add validation" → "Write tests for invalid inputs, then make them pass"
* "Fix the bug" → "Write a test that reproduces it, then make it pass"
* "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

# 5. Project Architecture (Dark Fantasy Web Engine)

**The Core Stack:**
* **Language & Build:** TypeScript, Vite.
* **Rendering:** Three.js strictly using `WebGPURenderer` (via `three/webgpu`).
* **Physics:** `@dimforge/rapier3d-compat` (Rigid body dynamic physics).
* **Architecture:** `bitecs` (Entity-Component-System).

**ECS & Engine Rules:**
* Everything is an Entity. Data goes in Components (pure data arrays/objects), logic goes in Systems. 
* Use Three.js only for visual representation. Do not store game state in Three.js `userData` or Object3Ds. 
* Sync the Three.js mesh transforms to the Rapier physics body transforms inside a dedicated `PhysicsSystem`.
* Do not use heavy class inheritance. Rely strictly on ECS composition.

**Memory & Autonomy:**
* Delegate independent game systems to parallel subagents and keep working while they run.
* Record core architecture decisions, corrections, and lessons in `lessons.md`. Use one lesson per entry with a one-line summary. Reference this file before building new systems.