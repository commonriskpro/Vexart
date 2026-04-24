# Design: Phase 8 — Retained Cleanup And Simplification

## Cleanup categories

### 1. Delete dead hot paths

Remove TypeScript render/layer paths only after equivalent native ownership exists and gates prove parity.

Candidates:

- TS render graph hot path used only by native-enabled runtime.
- TS layer target cache / sprite orchestration replaced by Rust registries.
- Backend modes returning raw presentation buffers where native presentation owns output.

### 2. Isolate compatibility paths

Some TypeScript paths remain valuable:

- native-disabled fallback
- offscreen/screenshot rendering
- unit tests that do not initialize native presentation
- JS callback shell for user handlers

These should be explicitly named as fallback/test/binding-shell paths.

### 3. Rename binding-shell files

Where files remain but no longer own behavior, rename or annotate them to avoid architectural confusion.

Examples:

- `native-render-graph.ts` may become a snapshot/translation binding.
- paint/composite wrappers should describe native orchestration ownership.

### 4. Update docs and gates

Docs must stop describing stale hybrid ownership after cleanup. Add grep gates for phrases that should not reappear outside archived docs.

## Execution strategy

Phase 8 should be incremental, not one giant deletion commit:

1. inventory and grep gates
2. remove dead render graph path
3. remove dead layer/sprite path
4. rename binding shell files
5. docs/API verification

## Safety rules

- Do not delete fallback code until a targeted test proves fallback replacement or explicit non-support.
- Every deletion commit must include before/after grep evidence or tests.
- Keep rollback env vars documented until final removal.
