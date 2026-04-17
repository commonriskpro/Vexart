# Proposal: Phase 2 Native Consolidation

## Metadata

- **Change ID**: `phase-2-native-consolidation`
- **Phase**: 2 — Native Consolidation
- **Status**: Draft
- **Date**: 2026-04-17

## Intent

Phase 2 consolidates Vexart’s native runtime into one Rust cdylib (`libvexart`) by removing Zig and Clay, replacing Clay layout with Taffy, and reworking the TS↔native bridge to the internal `vexart_*` FFI contract so the engine can move into Phase 2b/3 without carrying legacy multi-binary debt (`docs/PRD.md §11 Phase 2`, `docs/PRD.md §12 DEC-004`, `docs/ARCHITECTURE.md §4`, `docs/API-POLICY.md §11`).

## Scope

### In Scope

- Delete `zig/` directory entirely (`docs/PRD.md §11 Phase 2`, `docs/PRD.md §12 DEC-004`).
- Delete `vendor/clay*` entirely (`docs/PRD.md §11 Phase 2`, `docs/PRD.md §12 DEC-004`).
- Delete `packages/engine/src/paint-legacy/` (founder-confirmed obsolete temporary helper; aligns to CPU-path removal) (`docs/PRD.md §11 Phase 2`).
- Delete `packages/engine/src/loop/clay-layout.ts` (Phase 1 temporary bridge no longer valid post-Taffy) (`docs/PRD.md §11 Phase 2`).
- Delete `packages/engine/src/ffi/gpu-stub.ts` (redundant after FFI consolidation) (`docs/PRD.md §11 Phase 2`).
- Delete placeholder backend (tmux braille) (`docs/PRD.md §12 DEC-005`, `docs/PRD.md §11 Phase 2`).
- Delete halfblock backend (ANSI fallback) (`docs/PRD.md §12 DEC-005`, `docs/PRD.md §11 Phase 2`).
- Merge native artifacts into one `libvexart` cdylib (`docs/PRD.md §11 Phase 2`, `docs/PRD.md §12 DEC-004`):
  - `libclay` (C, from `vendor/clay*`) → **DELETED**.
  - `libtge` (Zig, from `zig/`) → **DELETED**.
  - `native/wgpu-canvas-bridge/` → **RENAMED/CONSOLIDATED** into `native/libvexart/`.
  - `native/kitty-shm-helper/` (139 LOC C, POSIX `shm_open`/`mmap`/`ftruncate`/`munmap` transport only — NOT Kitty protocol encoding) → **PORTED** to Rust under `native/libvexart/src/kitty/shm.rs` with **real functional implementation** (not a stub), exposed as FFI `vexart_kitty_shm_prepare` / `vexart_kitty_shm_release` / `vexart_kitty_shm_get_last_error*`. Rationale: the C helper exists only because Bun lacks native `shm_open`/`mmap` bindings; porting it to Rust is trivial (~80 LOC in an isolated module) and must happen in Phase 2 because the C artifact is deleted. This is strictly **transport plumbing**, scoped distinct from Kitty protocol encoding (`base64` + `flate2` + escape-sequence assembly in `packages/engine/src/output/kitty.ts`) which remains in TypeScript until Phase 2b Tier 1 per DEC-010.
- Integrate Taffy `0.10.1` as layout engine replacing Clay (`docs/PRD.md §11 Phase 2`, `docs/PRD.md §12 DEC-004`).
- Land DEC-011 text stubs: `vexart_text_load_atlas`, `vexart_text_dispatch`, `vexart_text_measure` return success with no side effects; text renders as empty placeholder; one-time warning on first dispatch: `[vexart] text rendering disabled during Phase 2 (DEC-011) — MSDF lands in Phase 2b` (`docs/PRD.md §11 Phase 2`, `docs/PRD.md §12 DEC-011`).
- Update `packages/engine/src/ffi/` to match `libvexart` exports and `vexart_<module>_<action>` naming (`docs/PRD.md §11 Phase 2`, `docs/ARCHITECTURE.md §4.2`, `docs/API-POLICY.md §11`).
- Create root `Cargo.toml` workspace with `native/libvexart` as single cdylib member (`docs/PRD.md §12 DEC-004`, `docs/ARCHITECTURE.md §4.1`).
- Add root `rust-toolchain.toml` with `channel = "1.95.0"`, components `rustfmt`, `clippy`, and targets for macOS/Linux (`aarch64` + `x86_64`); justification: this matches session sanity check (`rustc 1.95.0`) and keeps local/CI parity (`docs/PRD.md §11 Phase 2`, `openspec/config.yaml` rules.design).
- Rework `packages/engine/src/loop/` and `packages/engine/src/reconciler/` consumers that currently assume Clay output to consume Taffy output (`docs/PRD.md §11 Phase 2`, `docs/ARCHITECTURE.md §5`).
- Pin native crates with documented rationale (`docs/PRD.md §11 Phase 2`, `openspec/config.yaml` rules.design):
  - `taffy = "0.10.1"` — latest stable; explicit Clay replacement for Phase 2.
  - `wgpu = "29.0.1"` — latest stable; Phase 2 bridge consolidation baseline.
  - `base64 = "0.22.1"` — Kitty payload encoding primitive; aligns with current TS path and protocol needs.
  - `flate2 = "1.1.9"` — zlib/deflate required by Kitty protocol (`o=z`).
  - `fdsm = "0.8.0"` — reserved for Phase 2b MSDF implementation; added now to lock FFI-adjacent text module shape.
  - `nix = "0.29"` — typed POSIX bindings (NOT the Nix package manager; unrelated homonym). Scope: `shm_open`, `ftruncate`, `mmap`, `munmap`, `msync`, `close`, `shm_unlink` for the Kitty SHM transport port. Justification: alternative is hand-rolled `unsafe { libc::* }` blocks; founder approved `nix` crate for type-safety and reduced unsafe surface in the POSIX boundary. Scope is isolated to `native/libvexart/src/kitty/shm.rs`.

### Out of Scope (deferred)

- MSDF text real implementation → Phase 2b (`docs/PRD.md §12 DEC-008`, `docs/PRD.md §12 DEC-011`, `docs/PRD.md §11 Phase 2b`).
- Compositor-thread animations → Phase 2b (`docs/PRD.md §12 DEC-008`, `docs/PRD.md §11 Phase 2b`).
- Self filters (`filter` prop) → Phase 2b (`docs/PRD.md §12 DEC-008`, `docs/PRD.md §11 Phase 2b`).
- `willChange` / `contain` props → Phase 2b (`docs/PRD.md §12 DEC-008`, `docs/PRD.md §11 Phase 2b`).
- Full native Kitty **protocol encoding** (base64 + `flate2` deflate + escape-sequence assembly + chunking) migration to Rust → Phase 2b Tier 1. In Phase 2 `packages/engine/src/output/kitty.ts` remains untouched; no `vexart_kitty_emit_frame` FFI surface is introduced yet (would be unimplemented dead weight). Only the SHM **transport** subset is ported now — see In Scope entry for `kitty-shm-helper` (`docs/PRD.md §12 DEC-010`, `docs/PRD.md §11 Phase 2b`).
- WGPU `PipelineCache` persisted to disk → Phase 2b Tier 1 (`docs/PRD.md §12 DEC-010`, `docs/PRD.md §11 Phase 2b`).
- `ResourceManager` unified 128MB budget → Phase 2b Tier 1 (`docs/PRD.md §12 DEC-010`, `docs/PRD.md §11 Phase 2b`).
- Viewport culling automatic → Phase 3 Tier 2 (`docs/PRD.md §12 DEC-010`, `docs/PRD.md §11 Phase 3`).
- Frame budget scheduler → Phase 3 Tier 2 (`docs/PRD.md §12 DEC-010`, `docs/PRD.md §11 Phase 3`).
- `loop.ts` decomposition (`walk-tree/layout/paint/composite/output`) → Phase 3 (`docs/PRD.md §11 Phase 3`).
- `api-extractor` / `public.ts` CI locking → Phase 4 (`docs/PRD.md §11 Phase 4`, `docs/API-POLICY.md §12`).
- Golden image test suite → Phase 4 (`docs/PRD.md §11 Phase 4`).

## Capabilities

### New Capabilities

- **TBD (sdd-spec to define capability name)**: Phase 2 native consolidation contract for single-binary Rust runtime, Taffy layout swap, and DEC-011 text-stub behavior.

### Modified Capabilities

- **None (spec-level behavior unchanged in existing capabilities)**.

## Relation to Existing Capabilities

- `openspec/specs/project-governance/spec.md` remains binding, especially REQ-PG-002 (explicit PRD traceability) and REQ-PG-003 (strict SDD lifecycle) (`docs/PRD.md §12 DEC-007`).
- `openspec/specs/package-boundaries/spec.md` MUST remain satisfied; Phase 2 does not alter the four public package graph or allowed dependency direction (`docs/PRD.md §6.2`, `docs/PRD.md §12 DEC-006`).

## Approach (high-level)

1. Big-bang migration: no Clay/Taffy dual-run path (exploration Q1/Q9; aligns with Phase 2 intent in `docs/PRD.md §11`).
2. Scaffold `native/libvexart` cdylib with stub `vexart_*` FFI surface; wire TS loader and validate empty-stub load path.
3. Port real WGPU pipelines from `native/wgpu-canvas-bridge` into `libvexart` paint module.
4. Integrate Taffy and `vexart_layout_*`; rework TS loop/reconciler consumers from Clay output assumptions to Taffy output shape.
5. Delete legacy assets/codepaths: Zig, Clay, paint-legacy, `clay-layout.ts`, `gpu-stub.ts`, placeholder backend, halfblock backend, `kitty-shm-helper` crate.
6. Validate required checks: `bun run typecheck`, `bun test`, `bun run lint:boundaries`, `cargo test`, `bun --conditions=browser run examples/showcase.tsx` (text regions blank expected per DEC-011).

## Affected Areas (explicit)

| Area | Impact | Description |
|---|---|---|
| `native/libvexart/` | New | Single Rust cdylib target (`docs/ARCHITECTURE.md §4.1`). |
| `native/wgpu-canvas-bridge/` | Removed/Merged | WGPU bridge logic absorbed into `libvexart` (`docs/PRD.md §11 Phase 2`). |
| `native/kitty-shm-helper/` | Removed/Merged | SHM helper behavior moves under Rust native boundary. |
| `zig/` | Removed | Zig runtime deleted (`docs/PRD.md §11`, `docs/PRD.md §12 DEC-004`). |
| `vendor/clay*` | Removed | Clay C dependency deleted (`docs/PRD.md §11`, `docs/PRD.md §12 DEC-004`). |
| `packages/engine/src/ffi/` | Modified | New `libvexart` FFI surface and loader (`docs/ARCHITECTURE.md §4.2`). |
| `packages/engine/src/loop/` | Modified | Taffy output integration; remove Clay bridge assumptions (`docs/PRD.md §11`). |
| `packages/engine/src/reconciler/` | Modified | Layout consumer updates for Taffy shape (`docs/PRD.md §11`). |
| `packages/engine/src/output/` | Modified/Removed | Remove placeholder + halfblock fallback paths per DEC-005. |
| `Cargo.toml` (root), `rust-toolchain.toml` (root) | New | Workspace and toolchain pinning for reproducible native builds. |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| WGPU 26 → 29 API breakage | High | Rewrite bridge surface directly to target API; avoid piecemeal patches. |
| Clay → Taffy semantic differences (space-between, measure callbacks, percent sizing, layout forks) | High | Lock showcase parity checks and targeted layout fixtures before deletion steps. |
| TS/Rust FFI contract drift | High | Atomic lockstep commits for TS declarations + Rust exports + error codes. |
| Tests depending on `paint-legacy/` or bitmap text atlas fail | Medium | Pre-delete inventory and replacement mapping in same task. |
| Text-heavy examples look blank during Phase 2 | Medium | Keep DEC-011 one-time warning + proposal-level expectation language. |
| `loop/` and `reconciler/` Clay shape assumptions missed | High | Treat consumer migration as first-class scope item, not implicit refactor tail. |

## Rollback Plan

- Before apply starts, create git tag `pre-phase-2`.
- If consolidation becomes unstable after destructive deletions, hard-stop apply and revert to `pre-phase-2` tag baseline.
- Re-apply in smaller internal slices only after spec/design/tasks are updated to reflect the discovered failure mode.

## Dependencies

- `taffy = "0.10.1"` (`docs/PRD.md §11`, `docs/PRD.md §12 DEC-004`).
- `wgpu = "29.0.1"` (`docs/PRD.md §11`, `docs/PRD.md §12 DEC-009`).
- `base64 = "0.22.1"` + `flate2 = "1.1.9"` (`docs/PRD.md §11 Phase 2b Tier 1`, `docs/PRD.md §12 DEC-010`).
- `fdsm = "0.8.0"` reserved for Phase 2b text (`docs/PRD.md §12 DEC-008`, `docs/PRD.md §12 DEC-011`).
- `nix = "0.29"` for POSIX SHM transport (`docs/PRD.md §11 Phase 2`).
- Root Rust toolchain pin: `1.95.0` (session sanity check: `rustc 1.95.0 (59807616e 2026-04-14)`).

## Success Criteria

- [ ] zig/ dir no longer exists.
  - PRD trace: `docs/PRD.md §11 Phase 2`; `docs/PRD.md §12 DEC-004`.
- [ ] vendor/clay* no longer exists.
  - PRD trace: `docs/PRD.md §11 Phase 2`; `docs/PRD.md §12 DEC-004`.
- [ ] packages/engine/src/paint-legacy/ no longer exists.
  - PRD trace: `docs/PRD.md §11 Phase 2` (CPU/legacy-path removal intent).
- [ ] packages/engine/src/loop/clay-layout.ts no longer exists.
  - PRD trace: `docs/PRD.md §11 Phase 2` (Clay replacement by Taffy).
- [ ] packages/engine/src/ffi/gpu-stub.ts no longer exists.
  - PRD trace: `docs/PRD.md §11 Phase 2` (single native surface).
- [ ] Exactly one native binary: libvexart. No libclay, no libtge, no libkitty-shm-helper, no libwgpu-canvas-bridge.
  - PRD trace: `docs/PRD.md §11 Phase 2`; `docs/PRD.md §12 DEC-004`.
- [ ] Taffy integrated as layout engine (pinned version with justification).
  - PRD trace: `docs/PRD.md §11 Phase 2`; `docs/PRD.md §12 DEC-004`.
- [ ] FFI surface in packages/engine/src/ffi/ matches libvexart exports.
  - PRD trace: `docs/PRD.md §11 Phase 2`; `docs/PRD.md §12 DEC-004`; `docs/PRD.md §12 DEC-011`.
- [ ] vexart_text_* functions exist as stubs that do not crash and log the DEC-011 warning once.
  - PRD trace: `docs/PRD.md §11 Phase 2`; `docs/PRD.md §12 DEC-011`.
- [ ] Placeholder + halfblock backends deleted (DEC-005).
  - PRD trace: `docs/PRD.md §12 DEC-005`; `docs/PRD.md §11 Phase 2`.
- [ ] cargo test passes.
  - PRD trace: `docs/PRD.md §11 Phase 2` (phase exit validation of consolidated native runtime).
- [ ] bun run typecheck passes.
  - PRD trace: `docs/PRD.md §11` phase-gated quality baseline.
- [ ] bun test passes.
  - PRD trace: `docs/PRD.md §11` phase-gated quality baseline.
- [ ] bun run lint:boundaries passes with zero violations.
  - PRD trace: `docs/PRD.md §6.2`; `docs/PRD.md §12 DEC-006`.
- [ ] bun --conditions=browser run examples/showcase.tsx starts without crash (text regions blank per DEC-011 — expected).
  - PRD trace: `docs/PRD.md §11 Phase 2`; `docs/PRD.md §12 DEC-011`.
- [ ] Non-text regions of the showcase visually identical to pre-Phase-2 (per PRD §11 Phase 2 exit criteria).
  - PRD trace: `docs/PRD.md §11 Phase 2` (exit criteria line).
- [ ] Commit history on main uses conventional commits and no Co-Authored-By.
  - PRD trace: `docs/PRD.md §10.3` governance execution discipline; `docs/PRD.md §12 DEC-007`.
- [ ] Phase 2 archived under openspec/changes/archive/YYYY-MM-DD-phase-2-native-consolidation/.
  - PRD trace: `docs/PRD.md §10.3`; `docs/PRD.md §12 DEC-007`.
- [ ] Delta specs merged to openspec/specs/ — the capability name is TBD (sdd-spec will propose).
  - PRD trace: `docs/PRD.md §10.3`; `docs/PRD.md §12 DEC-007`.

## Open Questions / Ambiguities for Orchestrator Review

1. ~~**Kitty scope boundary wording**: this proposal includes merging `native/kitty-shm-helper` into `libvexart` now, while full native Kitty encoding is explicitly deferred to Phase 2b Tier 1.~~ **RESOLVED (2026-04-17, founder)**: The C helper is strictly POSIX SHM transport (139 LOC: `shm_open`/`mmap`/`ftruncate`/`munmap`), NOT encoding. Phase 2 ports it to Rust with real implementation (`vexart_kitty_shm_*` via `nix` crate). Phase 2b Tier 1 migrates encoding (base64 + deflate + escape sequences) from `packages/engine/src/output/kitty.ts` to Rust as a separate workstream. No scope bleed — transport and encoding are cleanly separable.

**No remaining open questions blocking spec phase.**
