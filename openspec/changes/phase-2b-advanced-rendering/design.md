# Design: Phase 2b — Advanced Rendering + Tier 1 Optimizations

## Technical Approach

Single-context native cutover: move target lifecycle, compositing, readback, Kitty encoding, MSDF text, self filters, compositor animations, and resource management entirely into `libvexart`. Delete the dual-context bridge. Each subsystem builds on the previous in a strict dependency chain. Maps to proposal's 6-step approach; all 9 spec capabilities are covered.

## Architecture Decisions

### Decision: Target registry lives inside SHARED_PAINT singleton

| Option | Tradeoff | Verdict |
|--------|----------|---------|
| Separate `SHARED_COMPOSITE` static | Independent locking but cross-module texture sharing becomes unsafe | Rejected |
| Embed `TargetRegistry` inside `PaintContext` | Same lock, same device/queue, simple handle-to-view lookup | **Chosen** |
| Per-context `Arc<Device>` sharing | Over-engineered for single-context Phase 2b | Rejected |

**Rationale**: `PaintContext` already owns `WgpuContext` (device/queue). Paint dispatch and composite both need the same device. Embedding the registry avoids cross-mutex texture sharing. Phase 3 per-context isolation can extract later.

### Decision: Readback uses blocking map_async + pollster

| Option | Tradeoff | Verdict |
|--------|----------|---------|
| Blocking `pollster::block_on(buffer.slice(..).map_async())` | Simple, matches existing pattern, blocks JS thread ~0.1ms | **Chosen** |
| Async callback via Bun event loop | Complex FFI async bridge; Bun's single thread means no parallelism gain | Rejected |

**Rationale**: ARCHITECTURE §9 says "FFI calls from JS to Rust are synchronous". Readback is called once per frame (final composite). 0.1ms blocking is within budget. Same pattern as adapter/device request in `context.rs`.

### Decision: Kitty encoding uses flate2 + base64 crates

| Option | Tradeoff | Verdict |
|--------|----------|---------|
| `flate2 1.1.9` (zlib) + `base64 0.22.1` | Mature, fast, already reserved in Cargo.toml comments | **Chosen** |
| `zstd` instead of zlib | Kitty protocol `o=z` flag expects zlib specifically | Rejected |
| Keep TS encoding, only readback in Rust | Still crosses FFI boundary with raw pixels (defeats purpose) | Rejected |

### Decision: MSDF atlas gen as offline CLI, not runtime

| Option | Tradeoff | Verdict |
|--------|----------|---------|
| Offline CLI tool (`@vexart/internal-atlas-gen`) | Pre-baked PNG+JSON, zero runtime cost, matches PRD | **Chosen** |
| Runtime MSDF generation from TTF | Heavy dependency (freetype), startup cost, overkill for terminal | Rejected |

### Decision: Self-filter reuses backdrop pipeline with source swap

| Option | Tradeoff | Verdict |
|--------|----------|---------|
| New `self_filter.wgsl` shader, same uniforms as `backdrop_filter.wgsl` | Code duplication but decoupled evolution | **Chosen** |
| Single shader with mode uniform | Shared shader risks coupling backdrop and self filter changes | Rejected |

**Rationale**: ARCHITECTURE §4.1 lists both `backdrop_filter.wgsl` and `self_filter.wgsl` as separate files. Same uniform layout (7 filter params) but different source binding.

### Decision: ResourceManager uses DashMap + BinaryHeap

| Option | Tradeoff | Verdict |
|--------|----------|---------|
| `DashMap<ResourceKey, Resource>` + `RwLock<BinaryHeap>` | ARCHITECTURE §8.1 exact spec; DashMap is concurrent-safe | **Chosen** |
| Plain `HashMap` behind `Mutex` | Sufficient for single-thread Phase 2b but blocks Phase 3 parallel | Rejected |

**Rationale**: ARCHITECTURE §8.1 explicitly specifies `DashMap`. Follow the spec. Add `dashmap = "6"` to Cargo.toml.

## Data Flow

### Target registry + paint dispatch

```
TS: vexart_composite_target_create(ctx, w, h, &out)
  → Rust: TargetRegistry.create() → wgpu Texture + View + readback Buffer
  → returns handle (u64)

TS: vexart_paint_dispatch(ctx, target_handle, graph, len, stats)
  → Rust: registry.get(target_handle) → TextureView
  → render pass attaches to that TextureView (not singleton)
  → cmd_kinds 0-17 dispatched as today
```

### Compositing + readback + Kitty output

```
TS: composeFinalFrame()
  → vexart_composite_target_begin_layer(ctx, T, layer, clear)
  → vexart_composite_render_image_layer(ctx, T, img, x,y,w,h, z, clear)
  → vexart_composite_target_end_layer(ctx, T)
  → vexart_kitty_emit_frame(ctx, T)
     → Rust: readback(T) → zlib compress → base64 → Kitty escape → BufWriter(stdout)
```

### MSDF text pipeline

```
Offline: internal-atlas-gen --input font.ttf --output atlas/
  → font.png (1024×1024 MSDF) + font.json (metrics)

Runtime:
  vexart_text_load_atlas(ctx, id, png_ptr, png_len, metrics_ptr, metrics_len)
    → GPU texture + GlyphMetrics table in text::AtlasRegistry

  Paint: cmd_kind=18 (MsdfGlyphInstance) in graph buffer
    → glyph.rs pipeline → msdf_text.wgsl samples atlas
```

### Compositor-thread animation fast path

```
TS: createSpring(node, 'transform', from, to)
  → Register AnimationDescriptor { nodeId, property, from, to, easing, startTime }
  → Node gets persistent GPU target via ResourceManager

Per frame (compositor path):
  → Skip: reconciler, walkTree, layout, assignLayers, paint
  → Only: interpolate descriptor → vexart_composite_update_uniform(target, nodeId, matrix)
         → composite + kitty output
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `native/libvexart/src/composite/target.rs` | Modify | `OffscreenTarget` → real `TargetRecord` with Texture/View/Buffer; `TargetRegistry` HashMap |
| `native/libvexart/src/composite/readback.rs` | Modify | Real `map_async` + `pollster::block_on` readback |
| `native/libvexart/src/composite/mod.rs` | Modify | Real `composite_merge`, `composite_image_layer`, `copy_region_to_image` |
| `native/libvexart/src/paint/mod.rs` | Modify | `dispatch()` resolves target handle from registry; add cmd_kind 18 (MSDF glyph), 19 (self-filter) |
| `native/libvexart/src/paint/context.rs` | Modify | `WgpuContext::new()` accepts `PipelineCache`; remove singleton target |
| `native/libvexart/src/paint/pipelines/mod.rs` | Modify | Add `glyph` and `filter` pipelines to registry; accept `PipelineCache` |
| `native/libvexart/src/paint/pipelines/glyph.rs` | Create | MSDF text pipeline (cmd_kind=18) |
| `native/libvexart/src/paint/pipelines/filter.rs` | Create | Self-filter pipeline (cmd_kind=19) |
| `native/libvexart/src/paint/shaders/msdf_text.wgsl` | Create | MSDF distance-field sampling shader |
| `native/libvexart/src/paint/shaders/self_filter.wgsl` | Create | Self-filter shader (same uniforms as backdrop_filter) |
| `native/libvexart/src/paint/pipeline_cache.rs` | Create | `PipelineCacheManager`: load/save `~/.cache/vexart/pipeline.{plat}-{ver}.bin` |
| `native/libvexart/src/paint/instances.rs` | Modify | Add `MsdfGlyphInstance` (cmd_kind=18), `SelfFilterInstance` (cmd_kind=19) |
| `native/libvexart/src/text/mod.rs` | Modify | Stub → real atlas registry + dispatch router |
| `native/libvexart/src/text/atlas.rs` | Create | MSDF atlas texture loading + metrics parsing |
| `native/libvexart/src/text/render.rs` | Create | Glyph instance batching → pipeline dispatch |
| `native/libvexart/src/text/glyph_info.rs` | Create | GlyphMetrics struct, kerning table |
| `native/libvexart/src/kitty/mod.rs` | Modify | Stub → real `kitty_emit_frame()` entry point |
| `native/libvexart/src/kitty/encoder.rs` | Create | base64 + flate2 zlib compress + Kitty escape assembly |
| `native/libvexart/src/kitty/transport.rs` | Modify | Add `direct` and `file` modes alongside existing SHM |
| `native/libvexart/src/kitty/writer.rs` | Create | `BufWriter<Stdout>` with chunked 4096-byte writes |
| `native/libvexart/src/resource/mod.rs` | Create | `ResourceManager` struct per ARCHITECTURE §8.1 |
| `native/libvexart/src/resource/priority.rs` | Create | `Priority` enum + promotion/demotion logic |
| `native/libvexart/src/resource/eviction.rs` | Create | LRU eviction walk: Cold → Recent, never Visible |
| `native/libvexart/src/resource/stats.rs` | Create | `ResourceStats` export for `getRendererResourceStats()` |
| `native/libvexart/src/lib.rs` | Modify | Add ~12 new FFI exports; bump `vexart_version()` to `0x00020B00` |
| `native/libvexart/Cargo.toml` | Modify | Uncomment `base64`, `flate2`; add `dashmap = "6"`, `serde_json = "1"` (metrics parsing) |
| `packages/engine/src/ffi/gpu-renderer-backend.ts` | Modify | Replace all 37 bridge call sites with `vexart_*` equivalents |
| `packages/engine/src/ffi/wgpu-canvas-bridge.ts` | Delete | All call sites migrated |
| `packages/engine/src/ffi/functions.ts` | Modify | Add 12 new `vexart_*` FFI stubs |
| `packages/engine/src/output/kitty.ts` | Modify | Replace TS encoding path with single `vexart_kitty_emit_frame` call |
| `packages/engine/src/types.ts` | Modify | Add `filter`, `willChange`, `contain` to TGEProps |
| `packages/engine/src/animation/compositor-path.ts` | Modify | Implement descriptor table + fast-path frame detection |
| `packages/engine/src/loop/assign-layers.ts` | Modify | Honor `willChange` for layer pre-promotion; `contain` for invalidation boundary |
| `packages/engine/src/resources/stats.ts` | Modify | Wire `getRendererResourceStats()` to `vexart_resource_get_stats` FFI |
| `packages/internal-atlas-gen/` | Create | CLI tool: TTF → MSDF PNG + metrics JSON |
| `native/wgpu-canvas-bridge/` | Delete | Entire crate removed |

## Interfaces / Contracts

### New FFI exports (Rust)

```rust
// ── Target registry ──
pub extern "C" fn vexart_composite_target_create(ctx: u64, w: u32, h: u32, out: *mut u64) -> i32;
pub extern "C" fn vexart_composite_target_destroy(ctx: u64, target: u64) -> i32;
pub extern "C" fn vexart_composite_target_begin_layer(ctx: u64, target: u64, layer: u32, clear: u32) -> i32;
pub extern "C" fn vexart_composite_target_end_layer(ctx: u64, target: u64) -> i32;

// ── Compositing ──
pub extern "C" fn vexart_composite_render_image_layer(ctx: u64, target: u64, image: u64,
    x: f32, y: f32, w: f32, h: f32, z: u32, clear: u32) -> i32;
pub extern "C" fn vexart_composite_copy_region_to_image(ctx: u64, target: u64,
    x: u32, y: u32, w: u32, h: u32, out_image: *mut u64) -> i32;
pub extern "C" fn vexart_composite_image_filter_backdrop(ctx: u64, image: u64,
    params_ptr: *const u8, params_len: u32, out_image: *mut u64) -> i32;
pub extern "C" fn vexart_composite_image_mask_rounded_rect(ctx: u64, image: u64,
    rect_ptr: *const u8, out_image: *mut u64) -> i32;

// ── Kitty output ──
pub extern "C" fn vexart_kitty_emit_frame(ctx: u64, target: u64) -> i32;
pub extern "C" fn vexart_kitty_set_transport(ctx: u64, mode: u32) -> i32;

// ── Resource manager ──
pub extern "C" fn vexart_resource_get_stats(ctx: u64, out_ptr: *mut u8, out_cap: u32, out_used: *mut u32) -> i32;
pub extern "C" fn vexart_resource_set_budget(ctx: u64, budget_mb: u32) -> i32;
```

Version bump: `vexart_version()` returns `0x00020B00` (Phase 2b). TS checks `EXPECTED_BRIDGE_VERSION >= 0x00020B00`.

### TargetRecord (Rust)

```rust
pub struct TargetRecord {
    pub texture: wgpu::Texture,
    pub view: wgpu::TextureView,
    pub readback_buffer: wgpu::Buffer,    // MAP_READ, same size as texture
    pub width: u32,
    pub height: u32,
    pub active_layer: Option<u32>,        // None = rested, Some(n) = layer n active
    pub resource_key: ResourceKey,        // for ResourceManager tracking
}

pub struct TargetRegistry {
    targets: HashMap<u64, TargetRecord>,
    next_handle: AtomicU64,
}
```

### MsdfGlyphInstance (cmd_kind=18)

```rust
#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
pub struct MsdfGlyphInstance {
    pub x: f32, pub y: f32, pub w: f32, pub h: f32,  // NDC quad
    pub uv_x: f32, pub uv_y: f32, pub uv_w: f32, pub uv_h: f32,  // atlas UV
    pub color_r: f32, pub color_g: f32, pub color_b: f32, pub color_a: f32,
    pub atlas_id: u32,
    pub _pad0: u32, pub _pad1: u32, pub _pad2: u32,
}
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | TargetRegistry create/destroy/lookup | `cargo test` (no GPU) with mock handles |
| Unit | Kitty encoder base64+zlib correctness | `cargo test` with known input→expected output |
| Unit | MSDF metrics JSON parsing | `cargo test` with fixture JSON |
| Unit | ResourceManager eviction order | `cargo test` with simulated allocations |
| Integration | Full paint dispatch into registry target | `cargo test --features gpu-tests` |
| Integration | Readback returns correct pixels | `cargo test --features gpu-tests` with known rect |
| Integration | Kitty emit produces valid escape sequence | `cargo test --features gpu-tests` capture stdout |
| Visual | MSDF text at 8/16/32/72px | Golden image comparison (Phase 4 harness) |
| Visual | Showcase renders identically post-bridge-delete | Before/after screenshot diff |
| Benchmark | Kitty encoding <0.5ms for 1920×1080 | `benches/bench_optimizations.rs` |
| Benchmark | Pipeline cache cold <120ms, warm <50ms | `benches/bench_optimizations.rs` |
| Benchmark | 200 fonts + 500 images within 128MB | `benches/bench_optimizations.rs` |

## Migration / Rollout

1. `git tag -a pre-phase-2b` before first task.
2. Each of the 6 dependency steps is independently revertable (atomic commits per FFI contract change).
3. Point of no return: deletion of `wgpu-canvas-bridge.ts` and `native/wgpu-canvas-bridge/`. Rollback: `git reset --hard pre-phase-2b`.
4. New FFI exports are additive — existing exports unchanged until bridge deletion.
5. Version gate: TS checks `vexart_version() >= 0x00020B00` before using new composite FFI.

## Dependency-Ordered Build Plan

```
Phase 2b Build Order (6 steps, ~5-6 weeks)
══════════════════════════════════════════

Step 1: Target Registry + Compositing (week 1)  ← BLOCKING FOUNDATION
├── 1.1 TargetRecord + TargetRegistry in composite/target.rs
├── 1.2 Real readback in composite/readback.rs (map_async + pollster)
├── 1.3 composite_merge, render_image_layer, copy_region_to_image
├── 1.4 begin_layer / end_layer with CommandEncoder management
├── 1.5 backdrop_filter + mask_rounded_rect wired to existing pipelines
├── 1.6 paint dispatch resolves target from registry (not singleton)
└── 1.7 New FFI exports in lib.rs + version bump

Step 2: Rewire gpu-renderer-backend.ts (week 2)  ← depends on Step 1
├── 2.1 Replace 37 bridge call sites with vexart_composite_* calls
├── 2.2 Replace composeFinalFrame bridge calls
├── 2.3 Update ffi/functions.ts stubs
├── 2.4 Delete wgpu-canvas-bridge.ts imports
├── 2.5 Delete native/wgpu-canvas-bridge/ crate
└── 2.6 Grep gate: zero bridge references remain

Step 3: Rust Kitty Encoding (week 3)  ← depends on Step 1 (real readback)
├── 3.1 Add base64 + flate2 to Cargo.toml
├── 3.2 kitty/encoder.rs: zlib compress → base64 → escape assembly
├── 3.3 kitty/writer.rs: BufWriter<Stdout> with 4096-byte chunks
├── 3.4 kitty/transport.rs: direct + file + SHM mode selection
├── 3.5 vexart_kitty_emit_frame FFI export
└── 3.6 Simplify packages/engine/src/output/kitty.ts to single FFI call

Step 4: MSDF Text Pipeline (weeks 3-4)  ← depends on Step 2 (stable paint)
├── 4.1 packages/internal-atlas-gen/ CLI tool (TTF → MSDF PNG + JSON)
├── 4.2 text/atlas.rs: load MSDF texture into GPU + parse metrics
├── 4.3 text/glyph_info.rs: GlyphMetrics struct
├── 4.4 text/render.rs: batch glyph instances
├── 4.5 paint/pipelines/glyph.rs + paint/shaders/msdf_text.wgsl
├── 4.6 cmd_kind=18 in paint/mod.rs dispatch + instances.rs
├── 4.7 vexart_text_load_atlas becomes real (replace stub)
└── 4.8 Delete bitmap font path references

Step 5: Self Filters + Hints + Compositor Animations (week 4-5)
├── 5.1 paint/pipelines/filter.rs + paint/shaders/self_filter.wgsl  ← parallel with 4
├── 5.2 cmd_kind=19 for self-filter in dispatch
├── 5.3 filter prop in TGEProps + reconciler prop parsing
├── 5.4 willChange prop → layer pre-promotion in assign-layers.ts
├── 5.5 contain prop → invalidation boundary in walk-tree.ts
├── 5.6 AnimationDescriptor table in compositor-path.ts
├── 5.7 Persistent GPU targets per animated node (via ResourceManager)
└── 5.8 Fast-path frame detection (skip reconciler→paint when only uniforms change)

Step 6: PipelineCache + ResourceManager (weeks 2-5, PARALLEL track)
├── 6.1 paint/pipeline_cache.rs: load/save to ~/.cache/vexart/  ← start week 2
├── 6.2 Wire PipelineCache into PipelineRegistry::new()
├── 6.3 resource/mod.rs: ResourceManager struct
├── 6.4 resource/priority.rs: Visible/Recent/Cold + promotion/demotion
├── 6.5 resource/eviction.rs: LRU walk
├── 6.6 resource/stats.rs: FFI export for getRendererResourceStats()
├── 6.7 Wire all GPU allocations through ResourceManager
└── 6.8 Remove legacy MAX_CACHE / MAX_FONT_ATLAS_CACHE constants

Parallelism: Steps 3 and 6 can run in parallel with Step 2.
             Steps 4 and 5.1-5.2 can overlap (different cmd_kinds).
             Step 5.3-5.8 depends on Steps 1+2 (persistent targets).
```

## Open Questions

- [x] cmd_kind allocation for MSDF and self-filter → 18 and 19 (within reserved 18-31 range)
- [ ] `fdsm` crate version for MSDF atlas gen — Cargo.toml reserves `0.8.0` but needs validation that it generates compatible multi-channel distance fields
- [ ] SHM transport for Kitty: keep existing `vexart_kitty_shm_prepare` or merge into `vexart_kitty_emit_frame` with mode parameter — leaning toward single `emit_frame` + `set_transport` per spec REQ-2B-102
