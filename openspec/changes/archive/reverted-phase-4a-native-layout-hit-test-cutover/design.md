# Design: Phase 4a — Native Layout / Hit-Test / Focus / Pointer Cutover

## Technical Approach

Eliminate dual-ownership of layout and interaction state between TS and Rust in the retained frame path. Currently TS computes layout via compat Taffy, syncs results to Rust (`nativeSceneSetLayout`), and runs its own 220-line hit-test/hover/active loop (`updateInteractiveStates`). After cutover, Rust is the single source of truth for layout positions and all hit-test/hover/active/mouse-event computation. TS becomes a thin dispatcher: read native event records, invoke JS callbacks from the registry, manage focus ID state.

Three sequential sub-phases match the proposal: layout tightening, interaction cutover, documentation/catalog.

## Architecture Decisions

| Decision | Choice | Alternatives | Rationale |
|----------|--------|-------------|-----------|
| Layout read direction | Native→TS only (`vexart_scene_layout_compute` → `TGENode.layout`). Remove all `nativeSceneSetLayout` calls from `writeLayoutBack`. | Keep dual-write with native validation — rejected: two sources of truth cause drift and double FFI cost. | PRD §11 + ARCH §2.5: TS must not own layout. Dual-write was a Phase 3c migration bridge. |
| Interaction ownership | Rust computes hover/active state and emits batched event records via new `vexart_input_interaction_frame`. TS reads and dispatches. | Per-event FFI round-trip (pointer_event × N nodes) — rejected: O(N) FFI calls per frame. | Single FFI call returns all changed interaction records. Matches press-chain pattern proven in Phase 3c. |
| Hover/active state storage | Rust `SceneGraph` gains `hovered: HashSet<u64>` and `active_node: Option<u64>`. State lives alongside existing `captured_node`. | Keep state in TS `TGENode._hovered/_active` and sync to Rust — rejected: defeats the purpose of native ownership. | State must live where hit-test runs. TS fields become read-cache populated from native records. |
| Mouse event emission | Rust emits typed records: `MOUSE_OVER`, `MOUSE_OUT`, `MOUSE_DOWN`, `MOUSE_UP`, `MOUSE_MOVE` alongside `HOVER_CHANGED`, `ACTIVE_CHANGED`. Batched in one output buffer per frame. | Separate FFI per event type — rejected: more FFI calls, harder to order correctly. | Unified record buffer reuses the proven `NativeEventRecord` encoding (40 bytes/record). |
| Focus ownership split | Rust owns traversal ORDER (`focus_next`/`focus_prev`). TS owns focus ID signal (`focusedId()`/`setFocusedId()`). No change from Phase 3c. | Move focus ID to Rust — rejected: focus ID is a Solid signal consumed by JSX reactivity. Crossing that boundary adds latency for every focus-dependent render. | Correct per PRD §10: JS callback shell owns signals. Document this as intentional architecture. |
| `stopPropagation` in native chains | Rust emits full press chain. TS iterates records, invokes callbacks, checks `event.propagationStopped` before next record. No Rust callback needed. | Rust iterates one-by-one with JS ack — rejected: per-candidate FFI round-trip is slow. | Current `dispatchNativePressChain` already proves this pattern works. |
| Compat fallback | `updateInteractiveStates` full loop remains intact but only runs when `nativeEventDispatch` is OFF. No code deletion. | Delete compat path — rejected: Phase 8 scope, need fallback for non-SHM terminals. | Rollback = set `VEXART_NATIVE_EVENT_DISPATCH=0`. |

## Data Flow

### Layout (retained path)

```
Solid mutation → reconciler → nativeSceneSetProp (props only, no layout)
  → frame tick
    → vexart_scene_layout_compute (Rust: SceneGraph → Taffy sync → compute → serialize)
    → TS parseLayoutOutput → Map<bigint, PositionedCommand>
    → writeLayoutBack reads native map → writes TGENode.layout (native→TS, one direction)
    → [no nativeSceneSetLayout calls]
```

### Interaction (retained path)

```
Terminal stdin → TS input parser → feedPointer (pixel coords, button state)
  → frame tick
    → vexart_input_interaction_frame(scene, x, y, button_state, out_buf)
      Rust internally:
        hit_test(x, y) → target node
        diff hover set → emit MOUSE_OVER / MOUSE_OUT / HOVER_CHANGED records
        diff active state → emit MOUSE_DOWN / MOUSE_UP / ACTIVE_CHANGED records
        if hovered+moved → emit MOUSE_MOVE record
        if click detected → emit press_chain records (same as Phase 3c)
    → TS decodes records from buffer
    → for each record:
        HOVER_CHANGED → update TGENode._hovered cache (for style merging in walkTree)
        ACTIVE_CHANGED → update TGENode._active cache
        MOUSE_OVER/OUT/DOWN/UP/MOVE → invoke JS callback from node.props
        PRESS_CANDIDATE → invoke onPress + set focus (stopPropagation checked between records)
    → if any state changed → markDirty()
```

### Focus

```
Tab key → TS useKeyboard → nativeFocusNext(currentNativeId) → Rust focus order → new nativeId
  → TS maps nativeId → focusId via getNodeFocusId → setFocusedId(focusId)
  → Solid signal triggers reactive updates
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `native/libvexart/src/scene.rs` | Modify | Add `hovered: HashSet<u64>`, `active_node: Option<u64>`, `interaction_frame()` method that computes hover/active diffs and emits batched event records |
| `packages/engine/src/ffi/native-scene-events.ts` | Modify | Add `NATIVE_EVENT_KIND` entries for MOUSE_OVER/OUT/DOWN/UP/MOVE/HOVER_CHANGED/ACTIVE_CHANGED. Add `nativeInteractionFrame()` wrapper calling `vexart_input_interaction_frame`. Reuse existing `decodeEvent` |
| `packages/engine/src/loop/layout.ts` | Modify | `writeLayoutBack`: remove `nativeSceneSetLayout()` calls. `updateInteractiveStates`: gate entire body behind `!bag.useNativeInteraction`. Add `dispatchNativeInteractionFrame()` as thin dispatcher that reads native records and invokes JS callbacks |
| `packages/engine/src/loop/composite.ts` | Modify | `writeLayoutBack` helper: when `useNativeSceneLayout`, skip `mapNativeLayoutToNodeIds` remapping (native map keyed by nativeId, write directly). Interaction call site: call native dispatcher when flag is on |
| `packages/engine/src/ffi/native-scene.ts` | Modify | Remove or deprecate `nativeSceneSetLayout` export (keep function but make no-op when native layout is enabled, for compat) |
| `packages/engine/src/ffi/native-scene-layout-parity.test.ts` | Modify | Add fixtures: nested scroll, floating/absolute positioning, multiline text wrapping, border+padding combinations |
| `packages/engine/src/ffi/native-scene.test.ts` | Modify | Add tests for native interaction records: hover enter/leave, active toggle, mouse event dispatch, scroll-clipped hover prevention |
| `packages/engine/src/loop/layout.test.ts` | Modify | Add tests for native interaction dispatcher parity vs compat `updateInteractiveStates` |

## Avoiding Double Ownership

The core anti-pattern is **TS computes → syncs to Rust → Rust also computes**. Two rules prevent this:

1. **Layout**: When `nativeSceneLayout` ON, `writeLayoutBack` reads from `vexart_scene_layout_compute` output only. `nativeSceneSetLayout` becomes dead code in the retained path (kept for compat-only path). TS never calls compat Taffy `layoutAdapter.endLayout()`.

2. **Hit-test/interaction**: When `nativeEventDispatch` ON, `updateInteractiveStates` body is skipped entirely. `_hovered`/`_active` on `TGENode` become read-only caches populated from native records. TS does not iterate `rectNodes` for AABB testing.

## What Stays in TS by Design

| Category | What | Why |
|----------|------|-----|
| JS callback shell | `onPress`, `onMouseDown/Up/Move/Over/Out`, `onKeyDown` callback invocation | Callbacks are JS closures registered on `TGENode.props`. Rust cannot call them. TS reads event records and invokes the correct callback. |
| JS callback shell | `focusedId()` / `setFocusedId()` signals | Focus ID is a Solid signal consumed by reactive JSX. Moving it to Rust would require FFI per reactive read. |
| JS callback shell | `PressEvent` creation + `stopPropagation` checking | JS object created per press, checked between records. Rust emits the full chain; TS stops iterating. |
| Input parsing | Terminal stdin byte parsing (`useKeyboard`, `useMouse`, `feedPointer`) | Byte parsing is stateless and cheap. PRD Founder Decision: "Keep input parsing in JS initially." |
| Compat fallback | Full `updateInteractiveStates` loop, compat Taffy path, `nativeSceneSetLayout` | Required for non-SHM terminals until Phase 7 default cutover. Gated by flags. |
| Test path | `renderNodeToBuffer`, `buildNodeMouseEvent`, `isFullyOutsideScrollViewport` helpers | Used by unit tests that don't spin up a native scene. |

## stopPropagation with Native Chains

Rust emits the full ordered press chain (deepest target → root). TS iterates:

```
for record in chain:
  if event.propagationStopped: break
  node = nodeByNativeId[record.nodeId]
  if FOCUSABLE flag: setFocusedId(getNodeFocusId(node))
  if ON_PRESS flag: node.props.onPress(event)  // may call event.stopPropagation()
```

No Rust re-entry needed. Same pattern as Phase 3c `dispatchNativePressChain` — now also used for mouse events via the batched interaction frame.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Rust unit | `interaction_frame` hover/active diff correctness, scroll clipping, pointer capture, min hit-area | `cargo test --lib scene` — extend existing test module |
| TS unit | Native interaction dispatcher produces same `_hovered`/`_active` state as compat `updateInteractiveStates` for fixture trees | `bun test layout.test.ts` — parity assertions |
| Layout parity | Native layout matches compat for extended fixture set (nested scroll, floating, border-box, text wrap) | `bun test native-scene-layout-parity.test.ts` — golden position comparison |
| Integration | Full retained path: Solid mount → interaction → callback fired → state updated | `bun test native-scene.test.ts` — end-to-end with native scene |
| Smoke | Showcase tabs render identically on retained vs compat | `showcase-retained-smoke.test.tsx` — extend to all tabs |

## Rollback / Fallback

- **Flags**: `VEXART_NATIVE_SCENE_LAYOUT=0` and `VEXART_NATIVE_EVENT_DISPATCH=0` revert to compat path. No code deletion in this phase.
- **Granularity**: Layout and interaction flags are independent. Can roll back interaction without rolling back layout.
- **Worst case**: Revert commits. Compat path is untouched and always functional.
- **Detection**: If parity test fails for any fixture, block the flag from defaulting ON. Add the failing case as a regression fixture.

## Risks / Tradeoffs

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Hover/active parity regression for edge cases (transform-aware hit-test, nested scroll clipping) | Medium | User-visible interaction bugs | Exhaustive parity tests before skipping TS loop. Transform hit-test is TS-only today — defer to Phase 4b if Rust transform support isn't ready. |
| FFI overhead for `interaction_frame` exceeds TS in-memory loop on simple scenes | Low | Marginal perf regression on non-SHM terminals (irrelevant — they use compat) | Benchmark retained-vs-compat frame time. Batched buffer minimizes FFI round-trips. |
| `TGENode._hovered/_active` cache staleness if native record missed | Low | Stale hover state causes visual glitch | Cache is overwritten every frame from native records. No accumulation. |
| Transform-aware hit-testing not in Rust yet | Medium | Cannot cut over interaction for transformed nodes | Gate: if any `rectNode` has `_accTransformInverse`, fall back to TS interaction loop for that frame. Document as Phase 4b scope. |

## Open Questions

- [ ] Does Rust `hit_test_node` need transform support before interaction cutover, or can we fall back to TS for frames with transforms? (Recommendation: fall back per-frame, track as Phase 4b.)
- [ ] Should `syncNativeInteractiveState` calls be removed when native interaction is ON, or kept as redundant sync? (Recommendation: skip when native ON — the state flows native→TS, not TS→native.)
