# Delta for Retained Layout

Baseline: Phase 3c `native-layout-hit-test/spec.md` — Rust computes layout and damage from retained scene data; Rust owns hit-testing with scroll clipping and press bubbling.

## ADDED Requirements

### Requirement: Native layout MUST be sole source of truth in the retained path

When `nativeSceneLayout` + `nativeSceneGraph` are enabled, TS MUST read layout positions exclusively from native output (`vexart_scene_layout_compute`). TS MUST NOT run the compat Taffy path or call `nativeSceneSetLayout()` to sync TS-computed positions into Rust. Layout flows native → TS only.

(Previously: Phase 3c dual-wrote — compat Taffy computed layout, wrote to `TGENode.layout`, then synced to Rust via `nativeSceneSetLayout()`.)

#### Scenario: Frame loop skips compat Taffy when native layout is enabled

- **Given** `nativeSceneLayout` and `nativeSceneGraph` are enabled
- **When** a frame is requested
- **Then** TS calls `vexart_scene_layout_compute` to compute layout in Rust
- **And** TS reads native layout maps and writes positions into `TGENode.layout`
- **And** TS MUST NOT invoke the compat Taffy path
- **And** TS MUST NOT call `nativeSceneSetLayout()`

#### Scenario: Layout direction is strictly native → TS

- **Given** a node's layout prop changes via reconciler
- **When** the native scene mutation is applied
- **Then** Rust recomputes layout during `vexart_scene_layout_compute`
- **And** TS reads the result — never writes layout back to Rust

### Requirement: Layout parity fixtures MUST cover retained-cutover edge cases

The `native-scene-layout-parity.test.ts` suite MUST include fixtures for: nested scroll containers, absolute/floating positioning, multiline text wrapping, and border/padding combinations — in addition to existing row/column, gap, percent/grow/min-max, and alignment fixtures.

#### Scenario: Nested scroll layout parity

- **Given** a scene with a scroll container inside another scroll container
- **When** layout is computed in both compat and native paths
- **Then** both paths MUST produce identical node positions and sizes

#### Scenario: Floating positioning layout parity

- **Given** a scene with `floating` nodes using `floatAttach` and `floatOffset`
- **When** layout is computed in both compat and native paths
- **Then** both paths MUST produce identical floating node positions

#### Scenario: Border-box and padding combination parity

- **Given** a scene mixing `borderWidth`, `padding`, and `cornerRadius` on nested containers
- **When** layout is computed in both compat and native paths
- **Then** inner content positions MUST be identical between paths

### Requirement: Compat fallback MUST remain available for layout

When `nativeSceneLayout` is disabled (or `VEXART_RETAINED=0`), the TS-owned compat Taffy layout path MUST function unchanged.

#### Scenario: Compat layout via env flag

- **Given** `VEXART_NATIVE_SCENE_LAYOUT=0` is set
- **When** a frame is requested
- **Then** TS runs the compat Taffy layout path and dual-writes to `TGENode.layout`
- **And** `nativeSceneSetLayout()` syncs positions to Rust for rendering

## MODIFIED Requirements

### Requirement: Rust MUST compute layout from the native scene graph

When `nativeSceneGraph` is enabled, Rust MUST compute layout and damage from retained native scene data. When `nativeSceneLayout` is also enabled, Rust's output is the sole source of truth — TS reads native maps only and MUST NOT run the compat Taffy path.

(Previously: Rust computed layout from scene data; TS could also run compat Taffy and sync back.)

#### Scenario: Dirty prop affects layout

- **Given** a node layout prop changes
- **When** a frame is requested
- **Then** Rust MUST recompute affected layout
- **And** Rust MUST report bounded damage for affected regions

#### Scenario: Native-only layout when both flags enabled

- **Given** `nativeSceneGraph` and `nativeSceneLayout` are both enabled
- **When** a frame is requested
- **Then** Rust computes layout via `vexart_scene_layout_compute`
- **And** TS reads positions from native maps exclusively
- **And** TS MUST NOT invoke compat Taffy or `nativeSceneSetLayout()`

## REMOVED Requirements

None — all Phase 3c requirements are preserved or extended.
