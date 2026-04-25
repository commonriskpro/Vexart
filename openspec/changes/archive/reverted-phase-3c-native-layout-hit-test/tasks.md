# Tasks: Phase 3c — Native Layout, Damage, And Hit-Testing

## 1. Native Layout

- [x] 1.1 Map scene nodes to retained Taffy nodes (SceneGraph→Taffy direct path landed with retained node reuse/pruning).
- [x] 1.2 Add native layout rect storage and sync layout from the compatibility path as an intermediate step.
- [x] 1.3 Compute visual damage regions (layout-transition damage plus bounded visual prop/text/interactive-style damage landed and is covered by tests).
- [x] 1.4 Add layout parity tests against existing fixtures (compat-vs-native fixtures cover core layout, constraints, alignment, text containers, nested scroll, borders/padding, multiline text, and floating positioning).

## 2. Native Hit-Testing And Events

- [x] 2.1 Implement base retained-scene hit-testing using synced layout rectangles (deepest-child targeting, no transforms/clipping yet).
- [x] 2.2 Implement pointer passthrough and minimum hit-area expansion on the native path.
- [x] 2.3 Implement pointer capture metadata.
- [x] 2.4 Emit base pointer event records.
- [x] 2.5 Add JS event decoder/wrapper for base pointer event records.
- [x] 2.6 Add native press bubbling candidate chain records.
- [x] 2.7 Add native focus next/prev ordering helpers.
- [x] 2.8 Add JS `onPress` dispatch from native press chains behind `nativeEventDispatch`.
- [x] 2.9 Add native Tab / Shift+Tab focus traversal dispatch behind `nativeEventDispatch`.

## 3. Parity Verification

- [x] 3.1 Add base hit-test/event tests for retained-scene geometry targeting.
- [x] 3.2 Add tests for press bubbling candidate chain order.
- [x] 3.3 Add tests for keyboard focus order helpers.
- [x] 3.5 Add tests for offscreen scroll-child hit prevention and pointer passthrough.
- [x] 3.6 Add tests for native-chain JS handler dispatch and `stopPropagation()`.
- [x] 3.7 Add tests for native minimum hit-area expansion.
- [x] 3.8 Add tests for native focus traversal cutover on Tab / Shift+Tab.
- [x] 3.9 Add tests for scene-derived native layout computation.
- [x] 3.10 Add tests for command realignment to native layout maps.
- [x] 3.11 Add tests for layout-transition damage rect computation.
- [x] 3.12 Add initial compat-vs-native layout parity fixture test.
- [x] 3.4 Run interaction parity smoke in showcase (automated offscreen smoke for showcase-tab2 landed; user manually confirmed showcase/tab2 visual + interaction parity in a capable real terminal with retained flags enabled).
- [x] 3.13 Add automated retained-vs-compat offscreen smoke for showcase-tab2.
