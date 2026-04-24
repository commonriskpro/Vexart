# Vexart — Rust-Retained Engine PRD

**Version**: 0.1  
**Status**: Adopted companion PRD — execution source for retained-engine migration
**Owner**: Founder  
**Last updated**: April 2026

---

## 1. Executive Summary

Vexart currently exposes a JS/JSX developer experience backed by `libvexart` for native layout, WGPU paint, compositing, text, resource management, and partial Kitty output. The next architecture step is to move retained scene ownership and the frame pipeline into Rust while preserving the existing public JS API.

The target model is:

```txt
JS/Solid public API
  -> thin Bun FFI binding
  -> Rust-retained scene graph
  -> Rust layout + damage + layer assignment
  -> Rust render graph + WGPU paint
  -> Rust composite + dirty-region readback
  -> Rust Kitty encoding + stdout
```

This keeps JSX, Solid reactivity, hooks, typed components, and public package ergonomics intact, while removing large RGBA buffers, render graph orchestration, layer bookkeeping, and terminal presentation from the JS hot path.

---

## 2. Problem

The current hybrid backend works, but too much frame-critical ownership remains in TypeScript:

- TS owns `TGENode` tree objects.
- TS walks the tree and builds render commands.
- TS builds and routes render graph operations.
- TS still owns too much frame orchestration, even though Rust already chooses frame strategy and native retained/compositor paths now handle part of the present lifecycle.
- TS receives raw RGBA buffers from Rust for terminal presentation in key paths.
- Feature wiring can drift: a Rust shader can exist but remain unreachable if TS does not pack or dispatch it.

This creates performance and maintenance costs:

- Large GPU readbacks can cross Rust -> JS as `Uint8Array` buffers.
- JS allocations and GC pressure enter the render hot path.
- FFI calls are spread across many granular operations.
- State is duplicated between TS caches and Rust resource management.
- Native features require parallel TS and Rust plumbing, increasing drift risk.

---

## 3. Goals

1. Preserve the public JS/JSX API.
2. Move retained scene graph ownership to Rust.
3. Move frame orchestration to Rust: layout, damage, layer assignment, render graph, paint, composite, and output.
4. Eliminate raw RGBA transfer from Rust to JS in normal terminal presentation.
5. Reduce FFI calls per frame to a small, predictable set.
6. Make Rust `ResourceManager` the source of truth for GPU resources.
7. Keep compatibility during migration with a feature-flagged dual path.
8. Improve debuggability with native frame stats and structured event output.

---

## 4. Non-Goals

- Do not remove the JS package. Users still consume `@vexart/*` packages, JSX types, hooks, and components.
- Do not replace SolidJS during this migration.
- Do not rewrite styled/headless components in Rust.
- Do not add a third runtime artifact. The runtime remains JS/.d.ts plus `libvexart`.
- Do not require users to change app code.
- Do not attempt direct terminal GPU interop beyond Kitty-compatible protocols.
- Do not eliminate all readback. Kitty output still requires CPU-visible encoded bytes; the goal is to keep that readback native and minimal.

---

## 5. User-Facing Contract

Existing user code must continue to work:

```tsx
mount(() => (
  <box width="100%" height="100%" backgroundColor={0x111827ff}>
    <text color={0xffffffff}>Hello</text>
  </box>
), terminal)
```

The following remain stable:

- `mount`, `createTerminal`, `createRenderLoop` public behavior.
- JSX intrinsic elements: `box`, `text`, `img`, `canvas`.
- `TGEProps` public prop names and semantics.
- Headless components and `ctx.*Props` contracts.
- Styled components and theme tokens.
- Event callbacks such as `onPress`, `onKeyDown`, mouse handlers.
- Handles such as `createHandle` and scroll/focus APIs.

Internal implementation may change as long as public behavior and types remain compatible.

---

## 6. Target Architecture

### 6.1 Runtime Split

| Layer | Responsibility |
|---|---|
| JS public packages | JSX/Solid integration, types, hooks, components, callback registry, thin FFI binding |
| `libvexart` Rust | Scene graph, layout, hit-testing, damage, layer assignment, render graph, paint, composite, resources, Kitty output |
| WGSL | Paint/material/text/filter pipelines |

### 6.2 Data Flow

```txt
Solid reconciler operation
  -> JS encodes node mutation
  -> vexart_node_* FFI call
  -> Rust updates retained scene

Frame requested
  -> vexart_frame_render(scene, viewport)
  -> Rust computes layout/damage/layers
  -> Rust paints dirty layers
  -> Rust emits dirty Kitty updates
  -> JS receives frame stats only
```

### 6.3 JS Shell Responsibilities

JS keeps only control-plane responsibilities:

- Solid custom renderer adapter.
- Conversion of JS values into compact FFI payloads.
- Callback registry mapping `nodeId -> JS handlers`.
- Terminal lifecycle setup and teardown.
- Optional input parsing until native input parsing is promoted.
- Public types and package exports.

JS must not own:

- Layout tree state.
- Render graph generation.
- GPU resource lifetime.
- Layer target handles.
- RGBA frame payloads.
- Kitty image placement encoding in normal mode.

---

## 7. Native Scene Graph

Rust owns a retained scene graph keyed by stable node IDs.

Required node data:

- `node_id: u64`
- `kind: box | text | image | canvas | root`
- parent/children order
- layout props
- visual props
- interaction flags
- text content
- image/canvas resource references
- dirty flags
- computed layout
- hit-test metadata
- layer membership

JS node handles become lightweight wrappers:

```ts
type NativeNodeHandle = {
  id: bigint
}
```

Solid still sees opaque node objects, but those objects no longer contain full render state.

---

## 8. FFI Surface

All FFI exports follow the existing rules: `vexart_*`, return `i32`, panic-safe, <=8 params, packed buffers for complex payloads.

### 8.1 Scene Lifecycle

```rust
vexart_scene_create(ctx, out_scene) -> i32
vexart_scene_destroy(ctx, scene) -> i32
vexart_scene_clear(ctx, scene) -> i32
```

### 8.2 Node Mutations

```rust
vexart_node_create(ctx, scene, kind, out_node) -> i32
vexart_node_destroy(ctx, scene, node) -> i32
vexart_node_insert(ctx, scene, parent, child, anchor) -> i32
vexart_node_remove(ctx, scene, parent, child) -> i32
vexart_node_set_props(ctx, scene, node, props_ptr, props_len) -> i32
vexart_text_set_content(ctx, scene, node, text_ptr, text_len) -> i32
```

### 8.3 Frame Pipeline

```rust
vexart_frame_request(ctx, scene, reason) -> i32
vexart_frame_render(ctx, scene, frame_ptr, frame_len, stats_out) -> i32
vexart_frame_present(ctx, scene, present_ptr, present_len, stats_out) -> i32
```

`vexart_frame_render` may also present when configured for immediate terminal output. Separate render/present calls remain useful for tests and offscreen rendering.

### 8.4 Input And Events

```rust
vexart_input_pointer(ctx, scene, pointer_ptr, pointer_len, out_events, out_cap, out_used) -> i32
vexart_input_key(ctx, scene, key_ptr, key_len, out_events, out_cap, out_used) -> i32
vexart_events_read(ctx, scene, out_events, out_cap, out_used) -> i32
```

Rust performs hit-testing and returns event records. JS invokes callbacks from its registry.

### 8.5 Output

```rust
vexart_kitty_emit_frame(ctx, target, image_id) -> i32
vexart_kitty_emit_layer(ctx, scene, layer_id, image_id, x, y, z, opts_ptr) -> i32
vexart_kitty_emit_region(ctx, scene, layer_id, region_ptr, region_len) -> i32
vexart_kitty_delete_layer(ctx, scene, image_id) -> i32
```

Normal terminal presentation must not return raw RGBA to JS.

---

## 9. Prop Encoding

JS encodes prop updates into a compact binary format.

Requirements:

- Stable prop IDs generated from `TGEProps`.
- Typed value tags: bool, i32, u32 color, f32, string, object payload, callback marker.
- Batched prop updates per node.
- No JSON in hot paths.
- Unknown prop IDs are ignored with debug warning in development.
- Callback props are stored in JS and sent to Rust as capability flags only.

Example payload shape:

```txt
u16 prop_count
repeat prop_count:
  u16 prop_id
  u8 value_kind
  u8 flags
  u32 byte_len
  bytes...
```

---

## 10. Event Model

Rust owns hit-testing and interaction state. JS owns callback execution.

Event output record:

```txt
u64 node_id
u16 event_kind
u16 flags
f32 x
f32 y
f32 node_x
f32 node_y
f32 width
f32 height
u32 payload_offset
u32 payload_len
```

Required behaviors:

- `onPress` bubbles through Rust parent chain.
- `stopPropagation()` must be supported.
- Keyboard focus order remains compatible.
- Pointer capture remains compatible.
- Scroll containers clip hit-testing.
- Offscreen scroll children do not receive pointer events.

Implementation note: if `stopPropagation()` must affect Rust bubbling, Rust can emit one event at a time and JS acknowledges whether propagation stopped. For performance, press bubbling can also be represented as an ordered event chain with JS stopping locally.

---

## 11. Rendering Requirements

### 11.1 Readback

Normal presentation must avoid Rust -> JS RGBA transfer.

Allowed readback modes:

- Native full-frame readback inside Rust for Kitty encoding.
- Native dirty-layer readback inside Rust.
- Native dirty-region readback inside Rust.
- JS RGBA readback only for tests, screenshots, debugging, or explicit offscreen APIs.

### 11.2 Layer Retention

Rust owns terminal image IDs and layer targets.

Requirements:

- Reuse unchanged terminal images.
- Repaint only dirty layers when possible.
- Emit region updates when damage is smaller than full layer and terminal path supports it.
- Delete terminal images for removed layers.
- Track terminal image ownership in `ResourceManager`.

### 11.3 Frame Strategy

Rust chooses frame strategy using native access to damage, resources, and terminal transport:

- `layered-dirty`
- `layered-region`
- `final-frame`
- `skip-present`

TS may pass hints, but Rust makes the final choice.

Current implementation note:

- Rust frame planning is live behind the retained path.
- Compositor-only retained frames skip walk/layout/assign/paint and use retained composition plus `vexart_composite_update_uniform` for transform/opacity-only updates.
- Phase 6 FFI-count targets are now verified in the benchmark harness (`0` no-op calls, `6` dirty-frame calls).
- JS remains the control-plane shell for Solid reactivity, callbacks, and mutation handoff by design; the remaining PRD work is now default cutover and cleanup.

---

## 12. Performance Targets

Reference viewport: 1920x1080 RGBA equivalent.

| Metric | Target |
|---|---:|
| Raw RGBA bytes crossing Rust -> JS during normal presentation | 0 |
| FFI calls per no-op frame | <= 2 |
| FFI calls per dirty frame | <= 6 before callbacks |
| JS allocations per presented frame from renderer internals | < 64 KB |
| Native Kitty encode for full frame | < 0.5 ms target, < 1.0 ms acceptable |
| Dirty layer present path | no full-frame readback |
| Idle CPU | comparable or lower than current loop |
| Interaction latency regression | none above current baseline |

---

## 13. Migration Plan

### Phase A — Native Presentation

Goal: remove RGBA buffers from JS presentation without changing scene ownership.

Tasks:

- Wire `vexart_kitty_emit_frame` into the default backend path.
- Add native layer/region emit exports.
- Add `native-presented` backend result mode.
- Keep old readback path behind debug/test flags.
- Measure JS allocation and frame latency.

Exit criteria:

- Normal terminal presentation transfers no raw RGBA to JS.
- Existing visual tests continue passing.
- Fallback/debug readback still works for test utilities.

### Phase B — Native Layer Registry

Goal: move layer targets, terminal image IDs, and target lifetime into Rust.

Tasks:

- Add Rust layer registry keyed by stable layer IDs.
- Move target create/destroy/reuse decisions to Rust.
- Move terminal image placement/deletion to Rust.
- Expose native layer stats.

Exit criteria:

- TS no longer owns GPU target handles for layers.
- Rust `ResourceManager` tracks layer memory.

### Phase C — Native Scene Graph Behind Flag

Goal: let Solid mutations update a Rust-retained tree.

Tasks:

- Add `vexart_scene_*` and `vexart_node_*` exports.
- Replace TS-heavy `TGENode` internals with native node handles behind `nativeSceneGraph` flag.
- Implement prop encoding.
- Keep TS tree path as default until parity is proven.

Exit criteria:

- Showcase renders through native scene graph behind flag.
- Public JSX API unchanged.

### Phase D — Native Layout, Damage, Layers, Hit-Test

Goal: Rust owns frame prep.

Tasks:

- Move walk-tree behavior to Rust scene traversal.
- Move dirty/damage computation to Rust.
- Move layer assignment to Rust.
- Move hit-testing and pointer capture to Rust.
- Return event records to JS callback registry.

Exit criteria:

- TS no longer walks scene for rendering or hit-testing.
- Input behavior remains compatible.

### Phase E — Native Render Graph

Goal: Rust generates and batches render operations.

Current implementation note:

- Native render graph snapshot, mixed native/TS translation, and Rust-owned frame strategy selection are already in progress.
- Frame orchestration is no longer purely a future concern: `skip-present`, `layered-dirty`, `layered-region`, and `final-frame` already exist in production behind the retained path.
- Compositor-only retained frames already have a real fast path, but the runtime is not yet a fully reconciler-free shell.

Tasks:

- Convert scene nodes directly into native render ops.
- Remove TS render graph generation from hot path.
- Batch pipelines natively.
- Connect all shader/material features through native prop handling.

Exit criteria:

- TS no longer packs `cmd_kind` batches for ordinary JSX nodes.
- Shader drift between TS and Rust is eliminated for native scene path.

### Phase F — Default Cutover And Cleanup

Goal: native scene graph becomes default.

Current implementation note:

- SHM-capable terminals now default the retained scene/event/layout/render/presentation stack on.
- Non-SHM terminals fall back automatically to the compatibility path instead of entering a partial retained mode by default.
- `VEXART_RETAINED=0` is the emergency override for the whole retained stack during the compatibility window.
- Remaining cutover gates are visual parity and API-snapshot infrastructure; cleanup/deletion remains a later phase.

Tasks:

- Flip default feature flag.
- Keep old path for one compatibility window.
- Remove deprecated TS render graph/backend orchestration after parity and performance sign-off.
- Update `docs/PRD.md`, `docs/ARCHITECTURE.md`, and OpenSpec main specs.

Exit criteria:

- No public API break.
- Performance targets met.
- Old path removed or isolated as test-only.

---

## 14. Compatibility Strategy

The migration must be invisible to users.

Required safeguards:

- Default runtime: retained-on when native presentation is available.
- Environment override for emergency fallback: `VEXART_RETAINED=0`.
- Per-feature overrides remain available for debugging and targeted rollback.
- Golden image comparison between old and native paths.
- Event behavior tests for keyboard, mouse, focus, scroll, bubbling, pointer capture.
- API extractor diff must show no unapproved public API break.
- Existing examples must run unchanged.

---

## 15. Testing Strategy

Required tests:

- Rust unit tests for scene graph mutation invariants.
- Rust unit tests for prop decoding.
- Rust integration tests for frame render/present.
- TS tests for reconciler compatibility.
- Golden image tests for showcase scenes.
- Input behavior tests for event equivalence.
- Stress tests for layer churn, resize, scroll, and animation.
- Memory tests for ResourceManager ownership and eviction.
- Benchmarks for JS allocation, FFI calls, readback bytes, encode time, and frame latency.

No phase may cut over by default without golden parity and interaction parity.

---

## 16. Observability

Rust must expose frame stats:

- frame strategy
- dirty rect count and area
- painted layer count
- reused layer count
- emitted Kitty byte count
- readback byte count
- encode time
- paint time
- composite time
- resource memory usage
- eviction count
- event count

JS debug overlay reads these stats through FFI and displays them without owning frame data.

---

## 17. Risks And Mitigations

| Risk | Mitigation |
|---|---|
| Rewriting too much at once | Use phased dual path with feature flag |
| Event behavior drift | Add parity tests before default cutover |
| Harder debugging in Rust | Structured native stats and last-error API |
| FFI prop encoding bugs | Generated prop ID table and decoder tests |
| Public API accidental break | API extractor gate remains mandatory |
| Native scene lifetime leaks | Rust ownership tests and ResourceManager accounting |
| Terminal output regressions | Keep old readback path for tests/fallback during migration |

---

## 18. Decisions Resolved

The founder-approved roadmap is recorded in [`ROADMAP-RUST-RETAINED-ENGINE.md`](./ROADMAP-RUST-RETAINED-ENGINE.md) and promoted by DEC-012 in [`PRD.md`](./PRD.md).

Resolved decisions:

1. This roadmap extends the current v0.9 roadmap and supersedes the older long-term TS-owned frame-pipeline target.
2. `nativeSceneGraph` is implemented after Native Layer Registry as a retained-engine migration phase, behind a feature flag.
3. Native Presentation is mandatory before major new shader/material ownership work.
4. The old TS render graph path is retained for one compatibility window, then removed or isolated as test/emergency fallback after native cutover.
5. Input byte parsing remains in JS initially; hit-testing, interaction state, focus traversal data, and event record generation move to Rust during the native layout/damage/hit-test phase.

---

## 19. Success Criteria

The architecture is successful when:

- Existing user apps run unchanged.
- Normal terminal presentation sends no raw RGBA buffers to JS.
- Rust owns scene, layout, render graph, layers, resources, paint, composite, and output.
- JS renderer internals allocate minimal memory per frame.
- Shader/material features are exposed by Rust prop handling without TS dispatch drift.
- Debug stats clearly explain frame cost and output strategy.
- Golden and interaction tests pass on the native path.

---

## 20. Recommended First Change

Start with **Phase A: Native Presentation**.

Reason:

- Highest immediate ROI.
- Lowest API risk.
- Directly attacks the readback-to-JS problem.
- Does not require replacing the reconciler or scene graph yet.
- Produces measurable before/after data for the larger migration.

Only after Phase A metrics confirm the bottleneck should Vexart proceed to native scene graph ownership.
