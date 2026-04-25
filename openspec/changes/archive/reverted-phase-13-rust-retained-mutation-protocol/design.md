# Design — Rust-retained mutation protocol

## Architecture

The Solid reconciler remains the public authoring shell. When native scene graph mode is enabled, native scene calls are queued into a compact binary mutation buffer and flushed with one FFI call.

```txt
Solid reconciler operation
  -> TGENode compatibility mirror updated
  -> native scene mutation queued with stable node id
  -> flushNativeSceneMutations()
  -> vexart_scene_apply_mutations(ctx, scene, buffer)
  -> Rust SceneGraph applies mutations and owns retained tree state
```

## Binary format

Header, little-endian:

| Offset | Type | Field |
|---:|---|---|
| 0 | u32 | magic `VXMU` (`0x554d5856`) |
| 4 | u16 | version `1` |
| 6 | u16 | command count |
| 8 | u32 | payload bytes |
| 12 | u32 | reserved |

Each command:

| Offset | Type | Field |
|---:|---|---|
| 0 | u16 | op |
| 2 | u16 | flags |
| 4 | u32 | payload length |
| 8 | u64 | a |
| 16 | u64 | b |
| 24 | u64 | c |

Payload follows each command immediately.

## Ops

- `CREATE_NODE`: `a=node_id`, `b=kind`.
- `DESTROY_NODE`: `a=node_id`.
- `INSERT_NODE`: `a=parent_id`, `b=child_id`, `c=anchor_id|0`.
- `REMOVE_NODE`: `a=parent_id`, `b=child_id`.
- `SET_PROPS`: `a=node_id`, payload is existing native prop packet format.
- `SET_TEXT`: `a=node_id`, payload is UTF-8.
- `SET_LAYOUT`: `a=node_id`, payload is four `f32` values: x, y, width, height.

## Key decisions

- JS node IDs become the retained native IDs for batched-created nodes.
- Direct FFI calls remain as fallback for compatibility and tests.
- The queue flushes before native layout compute and native render graph snapshot so Rust consumers never read stale scene state.
- No JSON is introduced in this path.

## Risks

- Mixed direct-created root nodes and JS-id-created children need stable non-conflicting IDs. The Rust graph updates `next_node_id` when explicit IDs are inserted.
- Batch flushing is still synchronous. Future phases can move toward frame-level native render calls.
