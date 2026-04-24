# Design: Phase 4d — Native Canvas Display List API

## Current ownership

```txt
<canvas onDraw>
  → walk-tree queues CanvasPaintConfig.onDraw
  → TS renderer invokes callback with CanvasContext
  → CanvasContext buffers commands in JS
  → backend consumes JS commands
```

This is correct behaviorally but keeps canvas drawing execution in the JS frame path.

## Target ownership

```txt
<canvas onDraw>
  → JS callback produces deterministic command list
  → TS serializes display list to Rust once per dirty canvas
  → Rust stores display-list handle/version
  → native render graph references handle
  → Rust replays commands during render
```

## Display-list schema

Initial command set should mirror existing `CanvasContext` commands, not the entire browser Canvas2D API.

Candidate binary command format:

```txt
header: magic, version, command_count
command: kind:u16, flags:u16, payload_len:u32, payload...
```

Candidate commands:

- fill rect
- stroke rect
- line/path primitives currently represented by `CanvasContext`
- text/image commands only if already supported in current canvas path

## Dirty model

- Run `onDraw` when canvas node is dirty or viewport changes.
- Hash serialized display list; upload only when hash changes.
- Store handle/version on the native scene node.

## Rust ownership

- Add display-list registry keyed by handle.
- Track memory size in native resource stats.
- Render graph canvas op includes `displayListHandle` and `canvasViewportJson`.

## Compatibility

- `CanvasPaintConfig.onDraw` remains until Phase 8.
- Offscreen/test paths can keep consuming JS commands.
- Native path prefers display-list handle when present.

## Tradeoffs

- Keeping `onDraw` as authoring API avoids breaking users.
- Declarative command storage moves render ownership to Rust but still runs JS when canvas content changes.
- Full Canvas2D parity is explicitly out of scope; the API should cover Vexart's existing canvas subset first.
