# Phase 1 — Native Boundary Cleanup Plan

**Source**: `docs/ARCHITECTURE-AUDIT.md` Section 2 + deep-dive analysis  
**Date**: 2026-09-17  
**Status**: Implementation ready — all decisions resolved  
**Prerequisite**: DEC-014 (TS owns scene graph, Rust owns GPU paint/composite/transport)

---

## Decisions Made

| Item | Decision | Rationale |
| :--- | :--- | :--- |
| `LayerRegistry` | **Delete** | Tested in prod, caused Kitty ghosting. Disconnected in `07f3b8d`. Single-authority GPU compositing replaced it. |
| `ImageAssetRegistry.by_key` | **Simplify** | TS generates unique monotonic keys → Rust dedup never hits. Keep handle ref-counting, remove string table. |
| `ResourceManager` eviction | **Disarm** | Autonomous GPU eviction without TS notification breaks handles. TS must own lifecycle. |
| GPU pipelines: `bezier`, `circle`, `polygon`, `nebula`, `starfield`, `gradient_conic` | **Keep** | GPU is the correct direction. JS CPU rasterizer is an explicit Phase 12 stopgap. Connect in Phase 3. |
| GPU pipelines: `rect` (kind 0) | **Delete** | Redundant with `shape_rect` (kind 1). Fragmenting batches in GeometryStream outweighs trivial ALU savings. |
| GPU pipeline: `filter` (kind 19) | **Delete** | Broken by design (binds to fallback 1×1 texture). Self-filters already work via `backdrop_filter` pipeline. |
| 10 dead FFI exports | **Delete** | All genuinely obsolete (superseded by better implementations). |
| `vexart_kitty_shm_cleanup_all` | **Keep** | Active — called by `transport-lifecycle.ts` for SHM teardown. |
| Context handle `_ctx: u64` | **Defer to Phase 1b** | Correct decision (purge), but wide mechanical change. Separate PR. |
| `serde_json` font serialization | **Fix** | Replace JSON with `\0`-delimited string. Remove `serde_json` from `Cargo.toml`. |

---

## Batch 1 — Rust Changes (`native/libvexart/src/`)

### 1.1 Delete Files

| File | LOC | Reason |
| :--- | ---: | :--- |
| `layer.rs` | 421 | Dead registry — never populated in prod |
| `text/glyph_info.rs` | 287 | Pre-baked MSDF parser — 0 callers |
| `font/cache.rs` | 301 | Disk cache with binary serialization — 0 callers |
| `paint/pipelines/rect.rs` | 60 | Redundant with `shape_rect` |
| `paint/pipelines/filter.rs` | 76 | Broken by design, superseded by `backdrop_filter` |

### 1.2 Remove Dead FFI Exports from `lib.rs` + `kitty/placeholder.rs`

| Function | Line | Category |
| :--- | ---: | :--- |
| `vexart_composite_readback_region_rgba` | 1018 | Superseded — no RGBA returns to JS in prod |
| `vexart_kitty_emit_layer_target` | 1108 | Superseded — single-authority compositing |
| `vexart_kitty_emit_region_target` | 1143 | Superseded — no terminal animation support |
| `vexart_kitty_emit_placeholder_frame` | placeholder.rs:704 | Superseded — SHM placeholder replaced it |
| `vexart_layer_upsert` | 1198 | Dead LayerRegistry |
| `vexart_layer_reuse` | 1237 | Dead LayerRegistry |
| `vexart_layer_remove` | 1264 | Permanent no-op |
| `vexart_layer_clear` | 1287 | Clears empty map |
| `vexart_layer_present_dirty` | 1303 | Dead LayerRegistry |
| `vexart_kitty_shm_prepare` | 1342 | Superseded — Rust prepares SHM internally |

### 1.3 Simplify `image_asset.rs`

- Remove `by_key: HashMap<String, u64>` field and all code paths that read/write it.
- Remove `key: String` from `ImageAsset` struct if only used for `by_key`.
- Keep: `assets: HashMap<u64, ImageAsset>`, `retain()`, `release()`, `register()` (without dedup lookup).

### 1.4 Disarm `ResourceManager` Eviction

- In `lib.rs`: remove all `evict_resources(pctx, &evicted)` calls (~7 sites).
- In `resource/mod.rs`: change `try_allocate()` to track the allocation and return success
  without selecting eviction targets. Log a warning if budget is exceeded.
- Keep: budget tracking, `record()`, `release()`, stats reporting — TS uses these.
- Delete or gut: `eviction.rs`, `priority.rs` (no longer needed without autonomous eviction).

### 1.5 Remove `serde_json` — Font Family Protocol Change

**New protocol**: Font families are sent as a `\0`-delimited UTF-8 string  
(e.g., `"JetBrains Mono\0monospace"`). Single family = no delimiter.

- In `lib.rs` (~3 sites: `vexart_font_query`, `vexart_font_render_text`, `vexart_font_measure`):
  Replace `serde_json::from_str::<Vec<String>>(json_str)` with `str.split('\0').collect()`.
- Remove `serde_json = "1"` from `Cargo.toml` (verify no other uses first).
- Remove `serde` derive if only used for `serde_json` deserialization.

### 1.6 Update `mod.rs` Declarations

- `lib.rs`: remove `mod layer;` and any `use layer::*;` or `SHARED_LAYER_REGISTRY`.
- `text/mod.rs`: remove `mod glyph_info;`.
- `font/mod.rs`: remove `mod cache;`.
- `paint/pipelines/mod.rs`: remove `pub mod rect;`, `pub mod filter;`, their struct fields
  in `PipelineRegistry`, and their construction in `PipelineRegistry::new()`.

---

## Batch 2 — TypeScript Changes (`packages/`)

### 2.1 Delete Files

| File | LOC | Reason |
| :--- | ---: | :--- |
| `engine/src/ffi/native-layer-registry.ts` | 191 | Bridge to dead LayerRegistry |

### 2.2 Update `vexart-bridge.ts`

Remove FFI symbol bindings for all 10 deleted Rust exports.

### 2.3 Remove Dead Callers

- `paint.ts`: remove calls to `nativeLayerRemove`.
- `gpu-renderer-backend.ts`: remove `clearNativeLayerRegistryMirror` import/call.
- Any other file importing from `native-layer-registry.ts`.

### 2.4 Remove Legacy Exports

| Export | File | Reason |
| :--- | :--- | :--- |
| `RGBA` class | `mount.ts` / `public.ts` | Redundant with `parseColor`. Check for internal usage first. |
| `createSlot`, `createSlotRegistry` | `reconciler/plugins.ts` / `public.ts` | Zero adoption plugin mechanism |
| `SIZING`, `DIRECTION`, `ALIGN_X`, `ALIGN_Y` | `ffi/node-types.ts` / `internal.ts` | Pre-Flexily layout enums |
| `resolveNodeByPath` | `loop/assign-layers.ts` | Legacy fallback + its test |

### 2.5 Font Serialization Update

Match new Rust protocol: replace `JSON.stringify([family])` with `families.join('\0')`.  
Files: `gpu-renderer-backend.ts`, `msdf-font.ts`.

### 2.6 Fix `solid-plugin.ts`

Change `moduleName: "vexart/engine"` → `"vexart/jsx-runtime"`.

### 2.7 Remove Phantom Peer Dep

Remove `"@vexart/headless": "workspace:*"` from `packages/app/package.json` peerDependencies.

---

## Batch 3 — Root Config Changes

| File | Change |
| :--- | :--- |
| `package.json` | Remove `opentype.js` from `devDependencies` |
| `package.json` | Remove `zod` from root dependencies |
| `packages/internal-devtools/package.json` | Add `zod` to its own dependencies |
| `.dependency-cruiser.cjs` | Remove 5 rules referencing `@vexart/primitives` |

---

## Explicitly Kept (NOT deleted)

| Item | Reason |
| :--- | :--- |
| `paint/pipelines/bezier.rs` | GPU is correct direction — connect in Phase 3 |
| `paint/pipelines/circle.rs` | GPU is correct direction — connect in Phase 3 |
| `paint/pipelines/polygon.rs` | GPU is correct direction — connect in Phase 3 |
| `paint/pipelines/nebula.rs` | GPU is correct direction — connect in Phase 3 |
| `paint/pipelines/starfield.rs` | GPU is correct direction — connect in Phase 3 |
| `paint/pipelines/gradient_conic.rs` | Documented feature — connect in Phase 3 |
| `vexart_kitty_shm_cleanup_all` | Active — SHM teardown in `transport-lifecycle.ts` |
| `ShmRingBuffer` (`kitty/shm.rs`) | Functional ring buffer — activate in Phase 3 (Transport) |
| `ImageAssetRegistry` handle tracking | Active — ref-counting for WGPU textures |
| `ResourceManager` budget tracking | Active — stats and allocation tracking (just not eviction) |

---

## Deferred to Phase 1b (Separate PR)

| Item | Reason |
| :--- | :--- |
| Purge `_ctx: u64` from ~33 FFI signatures | Wide mechanical change across Rust + TS. Correct decision but separate PR to isolate risk. |
| Rename `vexart_context_create/destroy` → `vexart_init/shutdown` | Part of context handle cleanup. |

---

## Verification Criteria

1. `cd native/libvexart && cargo build --release` — compiles without errors
2. `cd native/libvexart && cargo test` — all Rust tests pass
3. `bun install` — dependency resolution succeeds
4. `bun run typecheck` — TypeScript type check passes
5. `bun run test` — all TS tests pass
6. No regressions in `bun run showcase` (if manually tested)

