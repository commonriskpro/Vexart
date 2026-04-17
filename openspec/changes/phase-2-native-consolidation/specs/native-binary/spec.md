# Spec: native-binary

## Overview

This capability defines the enduring Phase 2 contract for Vexart’s single native runtime: one Rust `libvexart` cdylib that owns layout, paint-adjacent FFI, and the internal TS↔Rust boundary while legacy Zig/Clay/native helper artifacts stay deleted. The capability is named `native-binary` because the stable behavior being introduced is not “Taffy” or “Kitty” in isolation, but the consolidated native boundary that those subsystems now live behind, per `docs/PRD.md §11`, `docs/PRD.md §12 DEC-004`, `docs/ARCHITECTURE.md §2.3`, `docs/ARCHITECTURE.md §4`, and `docs/API-POLICY.md §11`.

## Requirements

### REQ-NB-001: Vexart ships exactly one native cdylib

Phase 2 MUST leave Vexart with exactly one native cdylib, `libvexart`, and Vexart’s build MUST NOT produce any second native artifact for layout, paint, Kitty transport, or any other feature, per `docs/PRD.md §10.2`, `docs/PRD.md §11`, `docs/PRD.md §12 DEC-004`, and `docs/ARCHITECTURE.md §2.3`.

#### Scenario: Second native target is rejected

- **Given** the repository native manifests and build outputs are reviewed after Phase 2
- **When** a reviewer checks the declared cdylib targets
- **Then** only `libvexart` exists as a Vexart native runtime artifact
- **And** any additional cdylib target makes the repository non-compliant

### REQ-NB-002: Legacy multi-binary and fallback surfaces stay deleted

The paths `zig/`, `vendor/clay*`, `packages/engine/src/paint-legacy/`, `packages/engine/src/loop/clay-layout.ts`, `packages/engine/src/ffi/gpu-stub.ts`, `native/wgpu-canvas-bridge/`, and `native/kitty-shm-helper/` MUST NOT exist after Phase 2, and placeholder or halfblock output backends MUST NOT exist, per `docs/PRD.md §11`, `docs/PRD.md §12 DEC-004`, `docs/PRD.md §12 DEC-005`, and `docs/ARCHITECTURE.md §14`.

#### Scenario: Deleted legacy path is resurrected

- **Given** one removed path or fallback backend reappears in the repository tree
- **When** compliance review runs
- **Then** the repository is non-compliant with Phase 2
- **And** the resurrected surface MUST be removed again

### REQ-NB-003: Every exported FFI function obeys the libvexart contract

Every public FFI export from `libvexart` MUST be named `vexart_<module>_<action>`, MUST take at most 8 parameters unless additional fields are packed into a caller-owned buffer, MUST return `i32`, MUST wrap its body in `std::panic::catch_unwind`, and MUST expose error retrieval through `vexart_get_last_error_length` plus `vexart_copy_last_error`, per `docs/PRD.md §6.4`, `docs/PRD.md §10.2`, `docs/ARCHITECTURE.md §4.2`, and `docs/API-POLICY.md §11`.

#### Scenario: Export violates the FFI contract

- **Given** a Rust export under `native/libvexart/src/lib.rs`
- **When** its name, arity, return type, panic wrapper, or error-retrieval path is inspected
- **Then** it matches the `vexart_*` contract defined by `libvexart`
- **And** any violation makes that export non-compliant

### REQ-NB-004: Layout is owned by Taffy inside libvexart

Layout computation MUST be implemented by Taffy inside `libvexart`; Clay MUST NOT remain in the repository; and `vexart_layout_compute`, `vexart_layout_measure`, and `vexart_layout_writeback` MUST exist as the layout FFI surface. The `taffy` crate version, when declared, MUST be pinned exactly to `0.10.1` for Phase 2, per `docs/PRD.md §6.3`, `docs/PRD.md §11`, `docs/PRD.md §12 DEC-004`, and `docs/ARCHITECTURE.md §4.1`.

#### Scenario: Layout engine compliance is checked

- **Given** the native workspace manifests and source tree are reviewed
- **When** a reviewer checks the layout engine and exports
- **Then** Taffy is the declared layout dependency and Clay is absent
- **And** the three `vexart_layout_*` exports are present

### REQ-NB-005: Phase 2 text behavior is a stubbed no-paint contract

`vexart_text_load_atlas`, `vexart_text_dispatch`, and `vexart_text_measure` MUST exist during Phase 2 as success-returning stubs with no glyph painting; `vexart_text_measure` MUST write width `0` and height `0`; and the first `vexart_text_dispatch` call per process MUST emit exactly one stderr warning containing `[vexart]`, `Phase 2`, and `DEC-011`, while later calls MUST be silent, per `docs/PRD.md §11`, `docs/PRD.md §12 DEC-011`, and `docs/ARCHITECTURE.md §4.2`.

#### Scenario: Text stub is invoked twice

- **Given** a process calls `vexart_text_dispatch` more than once during Phase 2
- **When** the calls complete
- **Then** each call returns success without crashing or painting glyphs
- **And** only the first call emits the DEC-011 warning

### REQ-NB-006: Kitty shared-memory transport is implemented natively

`vexart_kitty_shm_prepare(name, data, size, mode)` MUST create a POSIX shared-memory region, copy the requested bytes, and return a non-zero handle on success; `vexart_kitty_shm_release(handle, unlink)` MUST close that handle and MAY unlink the name when requested; and any failure MUST be retrievable through the shared `vexart_get_last_error_*` mechanism, per `docs/PRD.md §11`, `docs/ARCHITECTURE.md §4.1`, `docs/ARCHITECTURE.md §4.2`, and `docs/API-POLICY.md §11`.

#### Scenario: SHM transport round-trip succeeds

- **Given** a valid Kitty SHM name and payload on macOS or Linux
- **When** `vexart_kitty_shm_prepare` and then `vexart_kitty_shm_release` are called
- **Then** prepare returns a non-zero handle and release succeeds
- **And** an invalid input path exposes a retrievable last-error message

### REQ-NB-007: Kitty encoding stays in TypeScript until Phase 2b

During Phase 2, `packages/engine/src/output/kitty.ts` MUST remain responsible for base64 encoding, `deflateSync` compression, and Kitty escape-sequence assembly, and `libvexart` MUST NOT require a `vexart_kitty_emit_frame` export before Phase 2b, per `docs/PRD.md §11`, `docs/PRD.md §12 DEC-010`, `docs/ARCHITECTURE.md §14`, and the Phase 2 proposal scope.

#### Scenario: Native Kitty encoder is proposed during Phase 2

- **Given** Phase 2 work is under review
- **When** a reviewer checks the frame-encoding path
- **Then** `kitty.ts` still owns encode-and-escape assembly in TypeScript
- **And** no Phase 2 compliance rule requires a native frame-emitter export yet

### REQ-NB-008: The Rust workspace and toolchain are root-pinned

The repository root MUST contain a `Cargo.toml` workspace declaring `native/libvexart` as its only Cargo member for Phase 2, and MUST contain `rust-toolchain.toml` with `channel = "1.95.0"`, required components `rustfmt` and `clippy`, and targets for `aarch64-apple-darwin`, `x86_64-apple-darwin`, `x86_64-unknown-linux-gnu`, and `aarch64-unknown-linux-gnu`, per `docs/PRD.md §7.5`, `docs/PRD.md §11`, `docs/ARCHITECTURE.md §4.1`, and the approved proposal scope.

#### Scenario: Fresh checkout inspects Rust entrypoints

- **Given** a reviewer opens the repository root on a fresh checkout
- **When** the Rust workspace and toolchain files are inspected
- **Then** the root workspace points only to `native/libvexart`
- **And** the toolchain file pins the required channel, components, and platform targets

### REQ-NB-009: Phase 2 crate versions are exact and justified

Every Phase 2 crate that is actually consumed by `libvexart` MUST be pinned to its exact approved version in Cargo metadata and MUST include a one-line rationale comment; this includes `taffy = "0.10.1"`, `wgpu = "29.0.1"`, and `nix = "0.29"` when used, while `base64 = "0.22.1"`, `flate2 = "1.1.9"`, and `fdsm = "0.8.0"` MAY be deferred until Phase 2b if still unused at Phase 2 exit, per `docs/PRD.md §11`, `docs/PRD.md §12 DEC-008`, `docs/PRD.md §12 DEC-010`, `docs/ARCHITECTURE.md §4.1`, and `openspec/config.yaml` rules.design.

#### Scenario: Cargo dependencies are reviewed for Phase 2

- **Given** `Cargo.toml` files are inspected for native dependencies
- **When** a reviewer checks each declared crate version and comment
- **Then** every consumed Phase 2 crate is pinned exactly with a rationale
- **And** unused Phase 2b-reserved crates are optional rather than mandatory

### REQ-NB-010: Phase 2 visual validation masks text and nothing else

Phase 2 exit evaluation MUST treat text-bearing regions as expected blank output and MUST NOT fail on absent glyphs, while all non-text regions of `examples/showcase.tsx` MUST remain visually identical to the pre-Phase-2 baseline, per `docs/PRD.md §11` and `docs/PRD.md §12 DEC-011`.

#### Scenario: Showcase parity is reviewed after consolidation

- **Given** `examples/showcase.tsx` is rendered after Phase 2 migration
- **When** the visual result is compared to the pre-migration baseline
- **Then** blank text regions are accepted as expected Phase 2 behavior
- **And** any non-text visual drift fails the phase exit gate

### REQ-NB-011: Deleted native and legacy surfaces have no remaining callers

No TypeScript or Rust source file MAY import, reference, or bind `@vexart/pixel`, any `tge_*` or `clay_*` FFI symbol, or any deleted path under `vendor/clay`, `zig/`, `paint-legacy/`, `clay-layout.ts`, `gpu-stub.ts`, or removed fallback backends, per `docs/PRD.md §11`, `docs/PRD.md §12 DEC-004`, `docs/PRD.md §12 DEC-005`, and `docs/ARCHITECTURE.md §14`.

#### Scenario: A deleted surface is still referenced

- **Given** repository source files are searched for legacy imports or FFI names
- **When** a match to a deleted surface is found
- **Then** the repository is non-compliant with the Phase 2 native-boundary contract
- **And** the reverse dependency MUST be removed
