# msdf-text-pipeline Specification

## Purpose

Offline MSDF atlas generation tool → runtime atlas loading → WGSL distance-field sampling. Replaces the 89-glyph ASCII bitmap path. Covers 8-72px range with 1024×1024 atlas per font.

**PRD trace**: `docs/PRD.md §749-755` (MSDF text pipeline), `docs/PRD.md §12 DEC-008`.
**ARCHITECTURE trace**: `docs/ARCHITECTURE.md §4.1` (`text/` module), `§16.3` (font atlas registration).

## Requirements

### REQ-2B-201: Offline atlas generation tool

`@vexart/internal-atlas-gen` CLI tool SHALL accept a TTF file and produce a 1024×1024 MSDF PNG atlas + metrics JSON file. Metrics MUST include per-glyph: Unicode codepoint, atlas UV bounds, advance width, bearing, and size range coverage (8-72px).

#### Scenario: Generate atlas from TTF

- GIVEN a standard TTF font file (e.g., `JetBrainsMono-Regular.ttf`)
- WHEN `internal-atlas-gen --input font.ttf --output atlas/` is run
- THEN `atlas/` contains `font.png` (1024×1024 MSDF) and `font.json` (metrics)

#### Scenario: Atlas covers 8-72px range

- GIVEN a generated atlas
- WHEN the engine renders glyphs at 8px, 16px, 32px, and 72px
- THEN all sizes produce sharp, anti-aliased output with no pixelation

### REQ-2B-202: Runtime atlas loading

`vexart_text_load_atlas(ctx, atlas_id, png_ptr, png_len, metrics_ptr, metrics_len) -> i32` SHALL load a pre-generated MSDF atlas into GPU memory as a WGPU texture. The atlas ID MUST be unique per font. Existing bitmap `tge_load_font_atlas` call sites MUST be replaced.

#### Scenario: Load atlas at runtime

- GIVEN a valid MSDF PNG and metrics JSON in memory
- WHEN `vexart_text_load_atlas(ctx, 1, png, png_len, metrics, metrics_len)` is called
- THEN atlas ID 1 is available for text rendering
- AND the GPU texture is registered with `ResourceManager` as `FontAtlas`

#### Scenario: Duplicate atlas ID rejected

- GIVEN atlas ID 1 is already loaded
- WHEN `vexart_text_load_atlas(ctx, 1, ...)` is called again
- THEN the return code is `ERR_INVALID_FONT` (-8)

#### Scenario: Corrupted metrics rejected

- GIVEN metrics JSON is malformed or missing required fields
- WHEN load is attempted
- THEN the return code is `ERR_INVALID_FONT` (-8)

### REQ-2B-203: WGSL MSDF shader

`paint/shaders/msdf_text.wgsl` SHALL implement distance-field sampling with subpixel edge reconstruction. The shader MUST sample the MSDF atlas, compute the signed distance, and output anti-aliased pixel colors. Pipeline: `paint/pipelines/glyph.rs`.

#### Scenario: Sharp rendering at all sizes

- GIVEN a loaded MSDF atlas
- WHEN text is rendered at 8px, 16px, 32px, and 72px
- THEN output is visually sharp at each size (golden test comparison)

#### Scenario: Subpixel edges are smooth

- GIVEN a glyph rendered at 13px (non-integer scale factor)
- WHEN the output is inspected at 4× zoom
- THEN edge pixels show smooth anti-aliased gradients, not binary on/off

### REQ-2B-204: Text paint dispatch integration

MSDF text rendering MUST integrate into the existing paint pipeline as a new `cmd_kind` (reserved Phase 2b slot in `paint/mod.rs`). Glyph instances MUST be batched like other paint instances for minimal draw calls.

#### Scenario: Batched glyph rendering

- GIVEN a render graph with 100 text glyphs across 3 fonts
- WHEN paint dispatch processes the graph
- THEN glyphs are batched by atlas (at most 3 draw calls for text)
- AND each glyph samples the correct atlas region

#### Scenario: Mixed primitives and text

- GIVEN a render graph with rects, gradients, and text
- WHEN paint dispatch processes the graph
- THEN all primitives render correctly in z-order
- AND text is composited with proper alpha blending

### REQ-2B-205: Bitmap path deletion

After MSDF pipeline is complete, the 89-glyph ASCII bitmap font atlas code and `tge_draw_text` / `tge_load_font_atlas` legacy paths MUST be removed. `packages/engine/src/ffi/functions.ts` stubs for `tge_*` text functions SHALL be replaced with `vexart_text_*` equivalents.

#### Scenario: No legacy bitmap references

- GIVEN MSDF pipeline is complete
- WHEN `grep -r "tge_draw_text\|tge_load_font_atlas\|tge_measure_text" packages/ native/` is run
- THEN zero matches are found
