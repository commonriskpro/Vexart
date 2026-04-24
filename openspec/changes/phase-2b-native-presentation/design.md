# Design: Phase 2b — Native Presentation

## Technical Approach

Keep the existing TypeScript scene/render graph pipeline for now, but change the presentation boundary. Instead of returning raw RGBA buffers to TypeScript for normal terminal output, Rust performs native readback, Kitty encoding, and SHM presentation.

This is intentionally smaller than Rust-retained scene ownership. The first architecture win is removing frame-sized JS payloads without changing JSX, Solid reconciliation, layout ownership, or render graph generation.

## Architecture Decisions

### Decision: Native presentation is feature-flagged

| Option | Tradeoff | Verdict |
|---|---|---|
| Replace TS presentation immediately | Fast cleanup but high regression risk | Rejected |
| Feature flag with TS fallback | Slightly more code during migration, safer rollout | Chosen |

Feature flag: `nativePresentation`. Emergency env override: `VEXART_NATIVE_PRESENTATION=0`.

### Decision: SHM-only transport in this phase

| Option | Tradeoff | Verdict |
|---|---|---|
| SHM/direct/file all at once | Complete but bigger surface | Rejected |
| SHM only | Matches current priority and reduces scope | Chosen |

Direct/file transport remain follow-up work.

### Decision: Stats through FFI

| Option | Tradeoff | Verdict |
|---|---|---|
| Parse logs | Easy but not stable or testable | Rejected |
| Add `stats_out` / last-stats FFI | Stable and observable | Chosen |

Native presentation stats must include bytes emitted, bytes read back, readback time, encode time, write time, and presentation mode.

### Decision: Keep raw readback for explicit test/offscreen APIs

Normal presentation must not return RGBA to JS. Offscreen testing and screenshots may still intentionally request raw buffers.

## Data Flow

### Current normal presentation

```txt
TS render graph
  -> Rust paint/composite target
  -> Rust readback RGBA
  -> JS Uint8Array
  -> TS Kitty/layer composer output
```

### Target normal presentation

```txt
TS render graph
  -> Rust paint/composite target
  -> Rust readback internally
  -> Rust Kitty encode + SHM output
  -> JS receives stats/status only
```

## Backend Contract

Add a new backend result variant:

```ts
type RendererBackendPaintResult =
  | { output: "kitty-payload"; ... }
  | { output: "skip-present"; ... }
  | { output: "native-presented"; strategy?: GpuLayerStrategyMode | null; stats?: NativePresentationStats }
```

For final-frame end results:

```ts
type RendererBackendFrameResult =
  | { output: "none"; ... }
  | { output: "final-frame-raw"; ... }
  | { output: "native-presented"; strategy?: GpuLayerStrategyMode | null; stats?: NativePresentationStats }
```

## Native API Shape

Exact signatures may use packed buffers to satisfy <=8 parameter policy.

Required capabilities:

```rust
vexart_kitty_emit_frame_with_stats(ctx, target, image_id, stats_out) -> i32
vexart_kitty_emit_layer(ctx, image_id, rgba_ptr, rgba_len, layer_ptr, stats_out) -> i32
vexart_kitty_emit_layer_target(ctx, target, image_id, layer_ptr, stats_out) -> i32
vexart_kitty_emit_region(ctx, image_id, rgba_ptr, rgba_len, region_ptr, stats_out) -> i32
vexart_kitty_emit_region_target(ctx, target, image_id, region_ptr, stats_out) -> i32
vexart_kitty_delete_layer(ctx, image_id, stats_out) -> i32
```

`vexart_kitty_emit_layer_target` and `vexart_kitty_emit_region_target` are the normal dirty-layer paths because they keep GPU target readback inside Rust. The raw `vexart_kitty_emit_layer` / `vexart_kitty_emit_region` wrappers exist only for fallback/compatibility callers that already hold RGBA bytes in JS.

If existing `vexart_kitty_emit_frame` can be extended without breaking callers, keep it and add a separate `vexart_kitty_get_last_stats`. If not, prefer a new `_with_stats` export.

## Stats Struct

Minimum fields:

```txt
u32 version
u32 mode
u64 rgba_bytes_read
u64 kitty_bytes_emitted
u64 readback_us
u64 encode_us
u64 write_us
u64 total_us
u32 transport
u32 flags
```

## Compatibility

- Native presentation off: old path remains active.
- Native presentation on: normal terminal output uses Rust emitter.
- Regional repaint uses target-backed native region emission; the layer target is rendered correctly, then Rust reads and transmits only the damaged region.
- Tests/offscreen rendering can still request raw buffers.
- Public APIs do not change.

## Verification

- Compare before/after metrics.
- Verify no normal presentation path allocates frame-sized RGBA in JS.
- Verify fallback path still works.
- Verify showcase visual parity.
