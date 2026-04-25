# Verify Report: Phase 3c — Native Layout, Damage, And Hit-Testing

## Status

Implemented and verified for the v0.9 retained layout/damage/hit-test readiness gate.

## Verified

- Added native layout rect storage to scene nodes in `native/libvexart/src/scene.rs`.
- Added `vexart_node_set_layout` so the compatibility layout pass can sync computed rects into the retained scene while the native layout engine is still in progress.
- Added `vexart_scene_hit_test` with deepest-child hit testing over retained scene layout rectangles.
- Added base native pointer event records through `vexart_input_pointer` and TS wrapper `nativePointerEvent()`.
- Added native pointer capture control through `vexart_input_set_pointer_capture` / `vexart_input_release_pointer_capture`.
- Added native press bubbling candidate chain records through `vexart_input_press_chain`.
- Added native focus order helpers through `vexart_scene_focus_next` / `vexart_scene_focus_prev`.
- Added native offscreen scroll-child hit prevention by stopping descent outside scroll container viewports.
- Added native pointer passthrough support at hit-test time.
- Added native minimum hit-area expansion driven by terminal cell metrics synchronized into the retained scene.
- Added `SceneGraph::build_layout_commands()` so the retained scene can serialize core layout props into the existing native Taffy command format.
- Added `vexart_scene_layout_compute` and TS wrapper `nativeSceneComputeLayout()` as the first bridge from retained scene mutations into native layout computation.
- Replaced the `vexart_scene_layout_compute` internals with direct `SceneGraph -> TaffyTree` synchronization, including retained Taffy node reuse and stale-node pruning.
- Added `nativeSceneLayout` flag wiring so the frame loop can prefer retained-scene layout maps and realign render commands to those native positions.
- Added command realignment support for native layout maps, including `SCISSOR_START` commands carrying `nodeId`.
- Added layout-transition damage rect computation and threaded pending node damage into layer invalidation.
- Added bounded visual-prop/text damage bridging from reconciler prop updates into layer invalidation.
- Added initial compat-vs-native layout parity coverage through `native-scene-layout-parity.test.ts`.
- Added low-level native scene mirroring support to `renderNodeToBuffer()` when `nativeSceneGraph` is enabled.
- Added automated retained-vs-compat offscreen smoke coverage for `showcase-tab2`.
- Added retained layout parity coverage for text containers, nested scroll containers, border/padding combinations, multiline text wrapping, and floating absolute positioning.
- Added bounded damage coverage for interactive style updates and text visual prop updates.
- Added TS parity coverage for native pointer passthrough hit testing without skipping children.
- User manually confirmed `showcase-tab2` and the main showcase looked correct and interactive in a capable real terminal with `VEXART_NATIVE_SCENE_GRAPH=1`, `VEXART_NATIVE_EVENT_DISPATCH=1`, `VEXART_NATIVE_SCENE_LAYOUT=1`, and `VEXART_NATIVE_RENDER_GRAPH=1`.
- Added JS `onPress` dispatch from `nativePressChain()` behind the `nativeEventDispatch` experimental flag.
- Added native-chain JS dispatch support for `PressEvent.stopPropagation()`.
- Added native Tab / Shift+Tab focus traversal cutover through `nativeFocusNext()` / `nativeFocusPrev()` behind `nativeEventDispatch`.
- Added shared `native-event-dispatch` flag wiring from mount so pointer-chain and focus traversal cutovers use the same retained-interaction gate.
- Added TS wrappers: `nativeSceneSetLayout()`, `nativeSceneSetCellSize()`, `nativeSceneComputeLayout()`, `nativeSceneHitTest()`, `nativePointerEvent()`, `nativePressChain()`, `nativeSetPointerCapture()`, `nativeReleasePointerCapture()`, `nativeFocusNext()`, and `nativeFocusPrev()`.
- `cargo test --lib scene` passed, including the new hit-test behavior.
- `tsc --noEmit` passed after TS bridge changes.
- `cargo build && bun test packages/engine/src/ffi/native-scene.test.ts packages/engine/src/ffi/bridge.test.ts` passed.
- Extended `packages/engine/src/ffi/native-scene.test.ts` to validate snapshot parity, hit testing, pointer capture, bubbling chain records, and focus order helpers.
- `cargo build && cargo test --lib scene && bun test packages/engine/src/ffi/native-scene.test.ts packages/engine/src/ffi/bridge.test.ts && cargo build && bun test && bun run typecheck` passed after scroll clipping/pointer passthrough additions.
- `cargo build && cargo test --lib scene && bun test packages/engine/src/ffi/native-scene.test.ts packages/engine/src/ffi/bridge.test.ts && cargo build && bun test && bun run typecheck` passed after native-chain JS dispatch additions.
- `cargo build && cargo test --lib scene && bun test packages/engine/src/ffi/native-scene.test.ts packages/engine/src/ffi/bridge.test.ts && cargo build && bun test && bun run typecheck` passed after native minimum hit-area additions.
- `cargo build && bun test packages/engine/src/reconciler/focus.test.ts packages/engine/src/ffi/native-scene.test.ts packages/engine/src/ffi/bridge.test.ts && cargo build && bun test && bun run typecheck` passed after native focus traversal cutover additions.
- `cargo build && cargo test --lib scene && bun test packages/engine/src/reconciler/focus.test.ts packages/engine/src/ffi/native-scene.test.ts packages/engine/src/ffi/bridge.test.ts && cargo build && bun test && bun run typecheck` passed after the scene→layout bridge additions.
- `cargo build && cargo test --lib scene && bun test packages/engine/src/loop/layout.test.ts packages/engine/src/reconciler/focus.test.ts packages/engine/src/ffi/native-scene.test.ts packages/engine/src/ffi/bridge.test.ts && cargo build && bun test && bun run typecheck` passed after the native layout cutover flag additions.
- `cargo build && cargo test --lib scene && bun test packages/engine/src/loop/layout.test.ts packages/engine/src/reconciler/focus.test.ts packages/engine/src/ffi/native-scene.test.ts packages/engine/src/ffi/bridge.test.ts && cargo build && bun test && bun run typecheck` passed after layout-transition damage bridge additions.
- `cargo build && cargo test --lib scene && bun test packages/engine/src/ffi/native-scene-layout-parity.test.ts packages/engine/src/loop/layout.test.ts packages/engine/src/reconciler/focus.test.ts packages/engine/src/ffi/native-scene.test.ts packages/engine/src/ffi/bridge.test.ts && cargo build && bun test && bun run typecheck` passed after the initial layout parity fixture additions.
- `cargo build && cargo test --lib && bun test packages/engine/src/ffi/native-scene-layout-parity.test.ts packages/engine/src/ffi/native-scene.test.ts && bun run typecheck` passed after switching `vexart_scene_layout_compute` to direct SceneGraph→Taffy synchronization.
- `cargo build && cargo test --lib && bun test packages/engine/src/reconciler/reconciler-damage.test.ts packages/engine/src/ffi/native-scene-layout-parity.test.ts packages/engine/src/ffi/native-scene.test.ts packages/engine/src/loop/paint.test.ts packages/engine/src/ffi/native-render-graph.test.ts packages/engine/src/testing/showcase-retained-smoke.test.tsx packages/engine/src/ffi/bridge.test.ts && cargo build && bun test && bun run typecheck` passed after bounded visual damage bridging.
- `cargo build && cargo test --lib scene && bun test packages/engine/src/testing/showcase-retained-smoke.test.tsx packages/engine/src/ffi/native-scene-layout-parity.test.ts packages/engine/src/loop/layout.test.ts packages/engine/src/reconciler/focus.test.ts packages/engine/src/ffi/native-scene.test.ts packages/engine/src/ffi/bridge.test.ts && cargo build && bun test && bun run typecheck` passed after the automated showcase smoke additions.

## Required Verification

- Native-owned layout computation from scene props now synchronizes `SceneGraph` directly into retained Taffy nodes, and the render loop can consume those maps behind `nativeSceneLayout`.
- Layout parity fixture coverage includes core row/column + gap + padding, percent/grow/min-max constraints, alignment semantics, text containers, nested scroll containers, border/padding combinations, multiline text wrapping, floating positioning, and scroll/nested layout scenes.
- Offscreen scroll-child hit prevention is implemented and tested.
- Native pointer capture is implemented and tested.
- Native bubbling candidate chains are implemented and tested; JS `onPress` dispatch and `stopPropagation()` consumption are implemented behind `nativeEventDispatch`.
- Native focus next/prev ordering helpers are implemented and consumed by Tab / Shift+Tab dispatch behind `nativeEventDispatch`.
- Pointer passthrough is implemented and tested.
- Minimum hit-area expansion is implemented and tested on the native path.
- Focused-node `onKeyDown` remains JS-owned; only focus traversal ownership was cut over in this step.
- Scene-derived native layout computation is tested for core row/gap sizing, command realignment, and multiple compat-vs-native parity fixtures including percent/grow/min-max constraints, alignment semantics, and scroll/nested layout; broad layout parity coverage is still pending.
- Layout-transition node damage is computed and fed into layer invalidation; bounded visual prop, text visual prop, and interactive style damage are bridged into the same system.
- Automated offscreen retained-vs-compat smoke exists for `showcase-tab2`, and the user manually confirmed core showcase visual/interactivity parity in a capable terminal; broader long-tail manual regression coverage is still useful but the original parity gate is no longer unverified.
