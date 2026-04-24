# Proposal: Phase 4a — Native Layout / Hit-Test / Focus / Pointer Cutover

## Intent

Close the remaining gap between Phase 3c's partially-implemented native layout/hit-test/focus/pointer capabilities and the ROADMAP Phase 7/8 readiness bar: ensure TypeScript no longer owns layout computation, hit-testing, focus traversal, or pointer interaction state in the retained scene's normal frame path, or that any residual TS ownership is explicitly catalogued as JS callback shell, compat fallback, or test-only path.

## Problem / Why Now

Phase 3c landed substantial Rust-side infrastructure (retained Taffy node mapping, native hit-test, press-chain, focus order, pointer capture, scroll clipping, min hit-area, damage bridging, layout parity fixtures). However:

1. **Layout**: TS still walks `boxNodes`/`textNodes` in `writeLayoutBack()` to write layout into `TGENode.layout`, and the compatibility path can still sync TS-computed rects into Rust via `nativeSceneSetLayout()`. The retained scene can compute layout independently (`vexart_scene_layout_compute` → direct SceneGraph→Taffy sync), and `nativeSceneLayout` defaults on with the retained SHM path, but the ownership boundary remains muddy because TS still carries compatibility layout/writeback machinery in the same frame-prep surface. This change makes the retained path explicitly native→TS only and catalogs any remaining TS layout code as fallback/test shell.

2. **Hit-test / interactive state**: `updateInteractiveStates()` (layout.ts) is a 220-line TS function that iterates all `rectNodes`, performs axis-aligned or transform-aware hit-testing, computes hover/active/focus bridges, dispatches `onPress` (native or compat), and handles scroll-viewport culling. When `useNativePressDispatch` is true, it delegates the press chain to Rust — but the entire hover/active/mouse-event and hit-test loop still runs in TS on every frame with pointer input.

3. **Focus traversal**: Native `focusNext()`/`focusPrev()` are wired behind `nativeEventDispatch` for Tab/Shift-Tab. But `focusedId()` and focus registration (`getNodeFocusId`) remain TS-owned signals. The native press chain sets focus via `setFocusedId()` — bridging back into TS. This is architecturally correct (JS callback shell owns focus state), but the two sources of truth (Rust focus order + TS focus ID) are not coherently documented as the intended split.

4. **Pointer events**: `nativePointerEvent()` and `nativePressChain()` exist but `updateInteractiveStates()` still runs the full TS hit-test loop alongside them. Native mouse events (down/up/move/over/out) are NOT routed through Rust — they are computed purely in TS.

The retained stack defaults ON for SHM terminals, but the layout/hit-test/interaction code path still runs TS-first. This is the gap between Phase 3c "infrastructure landed" and Phase 7 "default cutover" readiness.

**PRD trace**:
- `docs/PRD-RUST-RETAINED-ENGINE.md` §§10 (event model — Rust owns hit-testing + interaction state), §11 (rendering requirements — TS must not own layout), §12 (performance targets — FFI ≤6 dirty frame), §14 (compatibility strategy — dual path with feature flag), §15 (testing — interaction parity before default cutover), §19 (success criteria — JS no longer walks scene for layout or input).
- `docs/ROADMAP-RUST-RETAINED-ENGINE.md` Phase 4 exit criteria ("JS no longer needs to walk native-enabled scenes for layout or input"), Phase 7 (default cutover prerequisites), Phase 8 (cleanup — TS renderer internals become thin binding shell).
- `docs/PRD.md` §6.7 (Rust-retained engine migration target — TypeScript must not own layout tree state, render graph generation, or terminal presentation).
- `docs/ARCHITECTURE.md` §2.5 (retained ownership rule — TS forbidden from rebuilding layout tree per frame), §5.2.2 (walk tree is TS compat), §6 (input lifecycle — target model routes input through Rust hit-test).

## Scope

### In Scope

1. **Native layout cutover**: When `nativeSceneLayout` is enabled, Rust owns layout end-to-end. TS reads native layout maps instead of computing compat layout and syncing back. Remove the dual-write pattern (`writeLayoutBack` writing both `TGENode.layout` AND calling `nativeSceneSetLayout`).
2. **Native hit-test cutover**: When `nativeEventDispatch` is enabled, Rust performs ALL hit-testing. TS no longer runs its own hit-test loop in `updateInteractiveStates()` — instead it reads native event records and dispatches JS callbacks.
3. **Native interactive state cutover**: Hover/active/mouse events are computed by Rust and returned as event records. TS receives them and invokes JS callbacks from its registry.
4. **Focus ownership audit**: Document and formalize the intended split: Rust owns focus ORDER (traversal), TS owns focus ID (which node is focused). No changes to the JS callback shell model — explicit documentation that this is correct target architecture.
5. **Residual TS path catalog**: Explicitly annotate what remains in TS as "JS callback shell" (onPress dispatch, onMouse* dispatch, onKeyDown dispatch, focus ID state), "compat fallback" (full TS path when retained is off), or "test path" (testing utilities). This is documentation, not code deletion.
6. **Broader layout parity coverage**: Extend `native-scene-layout-parity.test.ts` with additional fixtures (nested scroll, absolute/floating positioning, multiline text wrapping, border/padding combinations) to reach sufficient parity confidence.

### Out of Scope

- Removing the TS compat path (Phase 8).
- Flipping default flags (Phase 7 gate — requires golden parity + API snapshot).
- Native render graph cutover (Phase 5 — separate change).
- Native frame orchestrator cutover (Phase 6 — already partially live).
- `onKeyDown` dispatch ownership change (correctly stays in TS as JS callback shell).
- Prop encoding overhaul (current FNV-1a hash scheme is adequate for cutover scope).

## Capabilities

### New Capabilities

- `native-interaction-cutover`: Native hit-test, hover/active state computation, and mouse-event record generation replacing the TS-side `updateInteractiveStates()` loop in the retained path.

### Modified Capabilities

- `native-scene-layout`: Layout cutover tightening — TS reads native maps as source-of-truth instead of dual-writing.

## Approach

**Phase 1 — Layout cutover tightening**: When `nativeSceneLayout` is enabled, skip the compat Taffy path entirely. Call `vexart_scene_layout_compute` directly, read the native layout map, and write positions into `TGENode.layout` from native output only. Remove the post-hoc `nativeSceneSetLayout()` calls from `writeLayoutBack()` — layout flows native→TS, never TS→native.

**Phase 2 — Interaction cutover**: Extend Rust `SceneGraph` with hover/active state tracking and mouse-event record emission (move/down/up/over/out). When `nativeEventDispatch` is enabled, `updateInteractiveStates()` becomes a thin dispatcher: call `vexart_input_pointer` to get native event records, invoke JS callbacks from registry, skip the entire TS hit-test loop.

**Phase 3 — Documentation and catalog**: Annotate remaining TS code with `// JS-CALLBACK-SHELL:`, `// COMPAT-FALLBACK:`, or `// TEST-PATH:` comments. Add a section to the change's design.md documenting the ownership split.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `packages/engine/src/loop/layout.ts` | Modified | `writeLayoutBack()` reads native layout only; `updateInteractiveStates()` becomes thin native dispatcher |
| `packages/engine/src/ffi/native-scene-events.ts` | Modified | New event record types for hover/active/mouse events |
| `packages/engine/src/ffi/native-scene.ts` | Modified | Possible new FFI wrappers if Rust adds hover/mouse-event exports |
| `native/libvexart/src/scene.rs` | Modified | Hover/active state tracking, mouse-event record emission |
| `packages/engine/src/loop/composite.ts` | Modified | `updateInteractiveStates()` call site adapts to thin dispatcher |
| `packages/engine/src/loop/walk-tree.ts` | Modified | Interactive node collection may simplify when native owns hit-test |
| `packages/engine/src/loop/loop.ts` | Modified | Flag wiring for cutover |
| `packages/engine/src/reconciler/focus.ts` | Unchanged | Confirmed correct as JS callback shell |
| `packages/engine/src/reconciler/hit-test.ts` | Unchanged | Retained for compat fallback; not called in retained path |
| `packages/engine/src/ffi/native-scene-layout-parity.test.ts` | Modified | Extended fixture coverage |
| `packages/engine/src/ffi/native-scene.test.ts` | Modified | New tests for native interaction records |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Interaction parity regression — hover/active/mouse edge cases differ between TS and native implementations | Med | Add exhaustive parity tests before any TS hit-test loop is skipped; automated offscreen smoke for all showcase tabs |
| Layout parity regression — native Taffy path produces different results for edge cases (scroll, floating, border-box) | Med | Extended fixture coverage in parity tests; golden image diff gate |
| Performance regression — FFI call overhead for per-frame interaction records exceeds in-memory TS loop | Low | Benchmark retained-vs-compat frame time; FFI batched records minimize round-trips |
| Focus state drift — two focus systems (Rust order + TS ID) diverge under complex focus-scope nesting | Low | Explicit documentation + tests for focus-scope interaction with native traversal |
| Blocking render graph or frame orchestrator work | Low | Change is scoped to layout/interaction only; render graph remains independent |

## Rollback Plan

Every cutover is behind existing feature flags (`nativeSceneLayout`, `nativeEventDispatch`). If parity fails:
1. Set `VEXART_NATIVE_SCENE_LAYOUT=0` or `VEXART_NATIVE_EVENT_DISPATCH=0` to revert to compat path.
2. No code deletion of compat path — it remains functional throughout.
3. If a specific Rust regression is found, fix in Rust and re-run parity tests.
4. Worst case: revert the specific commits that route layout/interaction through native, restoring the dual-write pattern from Phase 3c.

## Dependencies

- Phase 3c infrastructure must remain intact (do not modify existing `phase-3c-native-layout-hit-test/` change artifacts).
- Rust `libvexart` must build and pass `cargo test --lib scene` before TS cutover wiring begins.
- Existing flag infrastructure (`native-retained-flags.ts`, `native-scene-graph-flags.ts`, etc.) is reused — no new flag hierarchy.

## Success Criteria

- [ ] When `nativeSceneLayout` + `nativeSceneGraph` are enabled, TS never calls the compat Taffy path for layout; layout positions come exclusively from `vexart_scene_layout_compute`.
- [ ] When `nativeEventDispatch` + `nativeSceneGraph` are enabled, `updateInteractiveStates()` does not iterate `rectNodes` for hit-testing — it reads native event records and dispatches JS callbacks.
- [ ] Hover, active, focus, onPress, onMouseDown/Up/Move/Over/Out behavior is parity-verified between compat and retained paths.
- [ ] Scroll-viewport culling, pointer capture, pointer passthrough, and min hit-area expansion work identically on native path.
- [ ] Layout parity fixtures cover: row, column, gap, padding, percent/grow/min-max, alignment, scroll/nested, border-box, floating, and multiline text.
- [ ] All existing tests pass (TS + Rust).
- [ ] Remaining TS ownership is explicitly annotated as JS callback shell / compat fallback / test path.

## Apply Notes

- Retained native interaction dispatch now uses `vexart_input_interaction_frame` for batched hover/active/mouse/press records.
- Retained native layout no longer post-syncs native-computed layout back into Rust via `nativeSceneSetLayout()`.
- Transform-aware hit-testing still falls back to the TS compat interaction loop until Rust transform hit-testing lands.
- Multiline text wrapping and floating/absolute layout parity remain known gaps; see `verify-report.md`.

## Evidence from Existing Phase 3c

- **Layout**: `vexart_scene_layout_compute` performs direct SceneGraph→Taffy sync with node reuse/pruning. `writeLayoutBack()` currently dual-writes (compat Taffy → TGENode → `nativeSceneSetLayout`). The native path is ready to become source-of-truth; what's missing is skipping the compat path.
- **Hit-test**: `vexart_scene_hit_test` implements deepest-child targeting with scroll clipping, pointer passthrough, min hit-area, and pointer capture — all tested in `scene.rs`. But `updateInteractiveStates()` still runs its own loop.
- **Press chain**: `vexart_input_press_chain` returns ordered bubbling candidates. `dispatchNativePressChain()` consumes them behind `useNativePressDispatch`. This works — the pattern is proven and extends to hover/active/mouse events.
- **Focus**: `vexart_scene_focus_next`/`prev` work behind `nativeEventDispatch` for Tab/Shift-Tab. Focus ID state stays in TS — correct per target architecture.
- **Tests**: `native-scene.test.ts` validates hit-test, pointer capture, bubbling chain, focus order, scroll clipping, pointer passthrough, and min hit-area. `native-scene-layout-parity.test.ts` validates core layout scenarios. Both pass.
