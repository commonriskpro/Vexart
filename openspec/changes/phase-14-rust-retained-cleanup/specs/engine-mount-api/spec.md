# Delta for engine-mount-api

New domain — no existing spec at `openspec/specs/engine-mount-api/`.

Refs: `docs/API-POLICY.md §5` (change classification), `docs/PRD.md §12 DEC-014`, `docs/PRD.md §6.7`, proposal `§Scope — Public API change`.

## ADDED Requirements

### REQ-EMA-001: Removed experimental flags SHALL NOT appear in mount options

The `mount()` function's `experimental` options object MUST NOT accept `nativeSceneGraph`, `nativeSceneLayout`, `nativeRenderGraph`, or `nativeEventDispatch`. These four flags are removed from the public API surface entirely, per `docs/API-POLICY.md §5.3` (breaking public symbol removal).

#### Scenario: Typecheck rejects removed flags

- **GIVEN** application code that passes `experimental: { nativeSceneGraph: true }` to `mount()`
- **WHEN** `bun typecheck` runs
- **THEN** the TypeScript compiler reports a type error on the unrecognized property
- **AND** no runtime code path reads or branches on `nativeSceneGraph`

#### Scenario: Runtime ignores removed flags silently

- **GIVEN** application code that passes `experimental: { nativeSceneGraph: true }` as `any`
- **WHEN** `mount()` is called at runtime
- **THEN** the flag has no effect — the TS-only path runs
- **AND** no warning or error is emitted (the flags simply do not exist in the options type)

#### Scenario: No symbol references remain in typecheck

- **GIVEN** the engine package after cleanup
- **WHEN** `bun typecheck` runs
- **THEN** no symbol references `nativeSceneGraph`, `nativeSceneLayout`, `nativeRenderGraph`, or `nativeEventDispatch` in any `.ts` file
- **AND** the `ExperimentalOptions` type (or equivalent) contains only `nativePresentation`, `nativeLayerRegistry`, and `forceLayerRepaint`

### REQ-EMA-002: Retained experimental flags SHALL continue to work

`nativePresentation`, `nativeLayerRegistry`, and `forceLayerRepaint` MUST remain in the `experimental` options with unchanged behavior.

#### Scenario: nativePresentation flag functions after cleanup

- **GIVEN** `mount()` called with `experimental: { nativePresentation: true }`
- **WHEN** the engine runs a frame
- **THEN** the native Rust presentation path (SHM/file/direct) is used
- **AND** the behavior is identical to before the cleanup

#### Scenario: nativeLayerRegistry flag functions after cleanup

- **GIVEN** `mount()` called with `experimental: { nativeLayerRegistry: true }`
- **WHEN** the engine manages layers
- **THEN** the native Rust layer registry FFI path is used

#### Scenario: forceLayerRepaint flag functions after cleanup

- **GIVEN** `mount()` called with `experimental: { forceLayerRepaint: true }`
- **WHEN** paint runs
- **THEN** all layers are repainted regardless of dirty state

### REQ-EMA-003: mount() default behavior is TS-only scene path

When `mount()` is called without any experimental flags, the engine MUST use the TypeScript-only path for scene graph management, layout (Taffy), render graph generation, and event dispatch.

#### Scenario: Default mount uses TS path

- **GIVEN** `mount()` called with no `experimental` options
- **WHEN** the engine runs frames
- **THEN** scene graph reactivity, layout, render command generation, and event dispatch all execute in TypeScript
- **AND** Rust FFI is called only for paint, composite, and Kitty transport
