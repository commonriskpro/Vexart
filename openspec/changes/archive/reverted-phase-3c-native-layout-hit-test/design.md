# Design: Phase 3c — Native Layout, Damage, And Hit-Testing

## Technical Approach

Cut over frame preparation before rendering. Rust owns layout, damage, layer metadata, and input targeting, but TS may still use compatibility rendering from native-prepared data until the render graph phase.

## Native Responsibilities

- Retained Taffy node mapping.
- Layout dirty propagation.
- Damage rect computation.
- Scroll viewport clipping.
- Hit-testing with transform/scissor awareness.
- Event record generation.

## Event Flow

```txt
JS input parser
  -> vexart_input_pointer / vexart_input_key
  -> Rust hit-test + interaction state
  -> ordered event records
  -> JS callback registry dispatch
```

`stopPropagation()` may be implemented by returning ordered bubbling chains and stopping locally in JS, or by one-event-at-a-time acknowledgement if required by native state.
