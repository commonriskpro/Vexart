# gpu-resource-manager Specification

## Purpose

Unified `ResourceManager` in Rust with priority-based LRU eviction. All GPU-resident assets (layer targets, font atlases, glyph atlases, image sprites, transform sprites, backdrop sprites) routed through a single allocator with configurable budget.

**PRD trace**: `docs/PRD.md §787-793` (unified GPU memory budget), `docs/PRD.md §12 DEC-010`.
**ARCHITECTURE trace**: `docs/ARCHITECTURE.md §8` (resource management), `§4.1` (`resource/` module).

## Requirements

### REQ-2B-701: Unified ResourceManager struct

A `ResourceManager` struct SHALL hold all GPU-resident assets. Resource kinds: `LayerTarget`, `FontAtlas`, `GlyphAtlas`, `ImageSprite`, `TransformSprite`, `BackdropSprite`. Each resource tracks: kind, size_bytes, priority, last_used_frame, gpu_handle. The manager uses `DashMap` for concurrent-safe access and a `BinaryHeap` for priority-based eviction.

#### Scenario: Resource registration

- GIVEN a new font atlas is loaded (MSDF pipeline)
- WHEN the atlas texture is created
- THEN it is registered with `ResourceManager` as kind `FontAtlas`
- AND its byte size is added to `current_usage`

#### Scenario: Existing independent caches migrated

- GIVEN the legacy `MAX_CACHE`, `MAX_FONT_ATLAS_CACHE`, `MAX_IMAGE_CACHE` constants exist
- WHEN the `ResourceManager` is active
- THEN all GPU allocations route through the manager
- AND the legacy constants are removed

### REQ-2B-702: Priority tiers and promotion

Resources SHALL have three priority tiers: `Visible` (currently rendered), `Recent` (used within last 5 seconds), `Cold` (older). Each frame, touched resources are promoted to `Visible`. At frame end, untouched resources demote: `Visible → Recent` → `Cold` after 5 seconds.

#### Scenario: Resource promotion on use

- GIVEN a `Cold` font atlas
- WHEN text using that atlas is rendered in a frame
- THEN the atlas is promoted to `Visible`
- AND its `last_used_frame` is updated

#### Scenario: Priority demotion over time

- GIVEN a `Visible` image sprite not used for 3 frames
- WHEN the frame-end demotion pass runs
- THEN it demotes to `Recent`
- WHEN 5 more seconds pass without use
- THEN it demotes to `Cold`

### REQ-2B-703: LRU eviction with global budget

The manager SHALL enforce a configurable global memory budget (default 128MB, min 32MB, configurable via `mount({ gpuBudgetMb: N })`). When `current_usage > budget_bytes`, the manager SHALL evict resources from `Cold` first, then `Recent`, never `Visible`. Eviction proceeds until `current_usage ≤ budget_bytes`.

#### Scenario: Budget exceeded triggers eviction

- GIVEN budget is 128MB and current usage is 130MB
- WHEN a new resource allocation is requested
- THEN the manager evicts `Cold` resources until usage ≤ 128MB
- AND the new resource is allocated

#### Scenario: No Visible resources evicted

- GIVEN budget is exceeded and only `Visible` resources remain
- WHEN eviction runs
- THEN no `Visible` resource is evicted
- AND the allocation returns `ERR_OUT_OF_BUDGET` (-3)

#### Scenario: Budget configuration via mount

- GIVEN `mount({ gpuBudgetMb: 256 })` is called
- WHEN the engine initializes
- THEN `ResourceManager` is configured with a 256MB budget

### REQ-2B-704: Observability — ResourceStats

`getRendererResourceStats()` SHALL expose: `budgetBytes`, `currentUsage`, `highWaterMark`, `resourcesByKind` (count + bytes per kind), `evictionsLastFrame`, `evictionsTotal`.

#### Scenario: Stats reflect current state

- GIVEN 3 font atlases (15MB) and 5 image sprites (20MB) loaded
- WHEN `getRendererResourceStats()` is called
- THEN `currentUsage` is 35MB
- AND `resourcesByKind['FontAtlas']` is `{ count: 3, bytes: 15_728_640 }`

#### Scenario: High-water mark tracked

- GIVEN usage peaked at 100MB and then dropped to 60MB
- WHEN stats are queried
- THEN `highWaterMark` is 100MB

### REQ-2B-705: Budget survival benchmark

A lifespan of 200 fonts + 500 images SHALL stay within 128MB with zero crashes. The `ResourceManager` MUST evict as needed to stay within budget.

#### Scenario: Heavy load stays within budget

- GIVEN 200 fonts (atlas textures) and 500 image sprites are loaded over time
- WHEN the resource budget is 128MB
- THEN `current_usage` never exceeds 128MB
- AND the application does not crash
- AND eviction count is reported in stats
