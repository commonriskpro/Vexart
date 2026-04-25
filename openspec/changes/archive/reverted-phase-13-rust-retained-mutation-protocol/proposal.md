> **REVERTED by phase-14-rust-retained-cleanup** (April 2026) — Rust retained scene graph / render graph / layout / event dispatch was reverted based on cosmic-shell-1080p bench evidence (TS path 4.8× faster). See `openspec/changes/phase-14-rust-retained-cleanup/proposal.md` and DEC-014 in PRD v0.7.

# Phase 13 — Rust-retained mutation protocol

## Intent

Move Vexart toward the adopted Rust-retained engine target by replacing chatty per-node native scene graph FFI calls with a batched binary mutation protocol while preserving the public TSX/JSX API.

## Master document alignment

- `docs/PRD.md` — supports the retained/native rendering decision log and performance goals.
- `docs/ARCHITECTURE.md` — satisfies the target engine flow where the Solid shell sends packed mutations to `libvexart`.
- `docs/API-POLICY.md` — keeps this work internal; no user-facing API is added.
- `docs/PRD-RUST-RETAINED-ENGINE.md` §§3, 6, 8 — stable JS API, Rust-owned scene graph, packed FFI mutation surface.
- `docs/ROADMAP-RUST-RETAINED-ENGINE.md` Phase 3 — native scene graph skeleton and mutation parity.

## Scope

- Add `vexart_scene_apply_mutations(ctx, scene, ptr, len)` to apply multiple scene graph mutations in one FFI call.
- Support explicit JS-owned node IDs in the native scene graph so Rust can become the retained source of truth keyed by stable IDs.
- Batch native scene create/insert/remove/destroy/prop/text/layout operations from the TS bridge.
- Flush queued mutations before native layout/render snapshot consumers.
- Add tests for batch mutation semantics.

## Non-goals

- Do not remove the TS renderer path.
- Do not make native render graph authoritative in this change.
- Do not expose new public package APIs.
- Do not rewrite Solid components or user-facing JSX.

## Rollback

- Disable mutation batching with `VEXART_NATIVE_MUTATION_BATCH=0`.
- Existing direct `vexart_node_*` calls remain available as compatibility fallback.
