# Design: Phase 3b — Native Scene Graph Skeleton

## Technical Approach

The Solid reconciler keeps returning opaque JS node handles, but each handle maps to a native node ID. During this phase, TS still renders from its compatibility tree; Rust only mirrors and validates state.

## Native Node Data

- `node_id: u64`
- kind: root, box, text, image, canvas
- parent and ordered children
- normalized props
- text content
- interaction flags
- dirty flags
- optional computed layout placeholder

## Prop Encoding

Prop updates use compact binary payloads:

```txt
u16 prop_count
repeat:
  u16 prop_id
  u8 value_kind
  u8 flags
  u32 byte_len
  bytes...
```

Callback props remain JS closures. Rust receives capability flags only.

## Verification

- Snapshot comparison between TS and Rust trees.
- Rust unit tests for tree invariants and prop decoder.
- TS reconciler tests that verify native mutation calls are emitted in the right order.
