# Proposal: Phase 4d — Native Canvas Display List API

## Problem

Canvas rendering is still JS callback-owned through `canvas.onDraw`. The retained render graph can represent canvas nodes, but the actual drawing behavior depends on a per-frame JS callback and `CanvasContext` command capture. That keeps an imperative callback hot path in the native renderer.

## Goal

Introduce a declarative canvas display-list API that lets JS produce stable drawing commands while Rust owns storage, replay, resource accounting, and native render graph references.

## Scope

- Define a compact canvas display-list command schema for the supported canvas primitives.
- Add native FFI to register/update a display list for a canvas node or handle.
- Extend TS `CanvasContext` to materialize display-list commands after `onDraw` runs.
- Update native render graph canvas ops to reference a display-list handle when available.
- Preserve `onDraw` as the authoring API during migration.

## Non-goals

- Removing `onDraw` immediately.
- Supporting arbitrary Canvas2D APIs beyond existing `CanvasContext` commands.
- Replacing image asset handles.
- Changing JSX canvas props in a breaking way.

## Verification

- Rust tests for display-list registration and replay metadata.
- TS tests proving deterministic display-list output from `CanvasContext`.
- Native render graph parity remains green.
- Perf check has no regression.

## Rollback

- If native display-list replay is disabled, retain the current JS `onDraw` canvas path.
