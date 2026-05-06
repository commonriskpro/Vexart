---
title: FFI Exports
description: All 53 native Rust functions exposed via bun:ffi.
---

The native boundary is bound in `packages/engine/src/ffi/vexart-bridge.ts` and implemented in `native/libvexart/src/lib.rs`.

## Convention

- All exports prefixed with `vexart_`
- Return `i32` status codes (0 = OK, negative = error)
- Wrapped in panic guards (`ffi_guard!`)
- ARM64-safe: ≤8 params, packed buffers for overflow

## Context Lifecycle (4)

| Function | Purpose |
|----------|---------|
| `vexart_version` | Return ABI version (`0x00020B00`) |
| `vexart_context_create` | Create native context handle |
| `vexart_context_destroy` | Destroy native context handle |
| `vexart_context_resize` | Notify context of terminal resize |

## Paint (3)

| Function | Purpose |
|----------|---------|
| `vexart_paint_dispatch` | Execute packed render graph into target |
| `vexart_paint_upload_image` | Upload RGBA to GPU image handle |
| `vexart_paint_remove_image` | Release GPU image handle |

## Composite (13)

| Function | Purpose |
|----------|---------|
| `vexart_composite_target_create` | Create offscreen render target |
| `vexart_composite_target_destroy` | Destroy render target |
| `vexart_composite_target_begin_layer` | Begin layer rendering |
| `vexart_composite_target_end_layer` | End layer + submit GPU |
| `vexart_composite_render_image_layer` | Composite image with z-order |
| `vexart_composite_render_image_transform_layer` | Composite with transform |
| `vexart_composite_update_uniform` | Update transform/opacity uniform |
| `vexart_composite_copy_region_to_image` | Extract region to image |
| `vexart_composite_image_filter_backdrop` | Apply backdrop filter chain |
| `vexart_composite_image_mask_rounded_rect` | Apply rounded-rect mask |
| `vexart_composite_merge` | Z-order merge to final target |
| `vexart_composite_readback_rgba` | Full target readback |
| `vexart_composite_readback_region_rgba` | Region readback |

## Text (3)

| Function | Purpose |
|----------|---------|
| `vexart_text_load_atlas` | Load MSDF atlas to GPU |
| `vexart_text_dispatch` | Render MSDF glyphs |
| `vexart_text_measure` | Measure text with atlas metrics |

## Kitty Transport (10)

| Function | Purpose |
|----------|---------|
| `vexart_kitty_emit_frame` | Emit full frame |
| `vexart_kitty_emit_frame_with_stats` | Emit frame + timing stats |
| `vexart_kitty_emit_layer` | Emit raw RGBA layer |
| `vexart_kitty_emit_layer_target` | Emit GPU target as layer |
| `vexart_kitty_emit_region` | Emit dirty region (RGBA) |
| `vexart_kitty_emit_region_target` | Emit dirty region (target) |
| `vexart_kitty_delete_layer` | Delete Kitty image/layer |
| `vexart_kitty_set_transport` | Set transport mode (0=direct, 1=file, 2=SHM) |
| `vexart_kitty_shm_prepare` | Prepare POSIX SHM |
| `vexart_kitty_shm_release` | Release POSIX SHM |

## Layer Registry (6)

| Function | Purpose |
|----------|---------|
| `vexart_layer_upsert` | Upsert layer by stable key |
| `vexart_layer_mark_dirty` | Mark layer dirty |
| `vexart_layer_reuse` | Reuse clean layer |
| `vexart_layer_remove` | Remove layer |
| `vexart_layer_clear` | Clear all layers |
| `vexart_layer_present_dirty` | Mark presented + get image ID |

## Resources (8)

| Function | Purpose |
|----------|---------|
| `vexart_resource_get_stats` | Get stats as JSON |
| `vexart_resource_set_budget` | Set memory budget (MB) |
| `vexart_image_asset_register` | Register image asset |
| `vexart_image_asset_touch` | Touch for lifetime tracking |
| `vexart_image_asset_release` | Release image asset |
| `vexart_canvas_display_list_update` | Update canvas display list |
| `vexart_canvas_display_list_touch` | Touch display list |
| `vexart_canvas_display_list_release` | Release display list |

## Font System (4)

| Function | Purpose |
|----------|---------|
| `vexart_font_init` | Initialize font system (fontdb) |
| `vexart_font_query` | Query font face availability |
| `vexart_font_render_text` | Render text via native MSDF |
| `vexart_font_measure` | Measure text with native metrics |

## Error (2)

| Function | Purpose |
|----------|---------|
| `vexart_get_last_error_length` | Error buffer length |
| `vexart_copy_last_error` | Copy error string |
