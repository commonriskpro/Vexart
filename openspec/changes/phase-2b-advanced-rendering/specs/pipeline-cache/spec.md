# pipeline-cache Specification

## Purpose

WGPU `PipelineCache` persisted to disk for fast startup. Eliminates per-boot shader recompilation by caching compiled pipeline state objects.

**PRD trace**: `docs/PRD.md §781-785` (PipelineCache), `docs/PRD.md §12 DEC-010`.
**ARCHITECTURE trace**: `docs/ARCHITECTURE.md §4.1` (`paint/pipeline_cache.rs`), `§12.5` (shader compilation).

## Requirements

### REQ-2B-601: Disk-persisted pipeline cache

All WGPU pipeline compilations SHALL use a shared `PipelineCache` handle persisted to `~/.cache/vexart/pipeline.{platform}-{version}.bin`. The cache file MUST be created on first run and loaded on subsequent runs. All `cache: None` pipeline sites in `libvexart` MUST be replaced with this shared cache.

#### Scenario: Cold start (no cache file)

- GIVEN no cache file exists at the expected path
- WHEN the engine starts and compiles all shaders
- THEN the cache file is written to `~/.cache/vexart/pipeline.aarch64-darwin-0.9.0.bin`
- AND startup completes in <120ms (shader compilation time only)

#### Scenario: Warm start (cache exists)

- GIVEN a valid cache file exists from a prior run
- WHEN the engine starts
- THEN pipelines load from cache without recompilation
- AND startup completes in <50ms

### REQ-2B-602: Version-based invalidation

The cache file MUST include the Vexart version in its filename. When the version changes, the old cache file MUST be ignored (not deleted) and a new cache created. This prevents binary format incompatibility across versions.

#### Scenario: Version upgrade invalidates cache

- GIVEN a cache file `pipeline.aarch64-darwin-0.8.0.bin` exists
- WHEN Vexart 0.9.0 starts
- THEN the old cache is ignored
- AND a new cache `pipeline.aarch64-darwin-0.9.0.bin` is created

#### Scenario: Same version reuses cache

- GIVEN a cache file `pipeline.aarch64-darwin-0.9.0.bin` exists
- WHEN Vexart 0.9.0 starts again
- THEN the cache is loaded and pipelines skip compilation

### REQ-2B-603: Cache directory creation

If `~/.cache/vexart/` does not exist, the system SHALL create it (including parent directories) before writing the cache file. If directory creation fails (permissions), the system SHALL fall back to in-memory caching with a `console.warn`.

#### Scenario: Missing cache directory

- GIVEN `~/.cache/vexart/` does not exist
- WHEN the engine starts
- THEN the directory is created
- AND the cache file is written successfully

#### Scenario: Permission denied on cache directory

- GIVEN `~/.cache/` is not writable
- WHEN the engine attempts to create the cache directory
- THEN pipeline compilation proceeds without disk caching
- AND `console.warn` informs the user

### REQ-2B-604: Cache corruption handling

If the cache file exists but is corrupted (truncated, invalid magic, wrong size), the system SHALL delete the corrupted file, recompile all pipelines, and write a fresh cache. A warning SHALL be logged to stderr.

#### Scenario: Corrupted cache is replaced

- GIVEN a cache file with invalid contents (e.g., zero bytes)
- WHEN the engine attempts to load it
- THEN the corrupted file is deleted
- AND pipelines recompile from scratch
- AND a fresh cache is written
