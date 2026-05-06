---
title: Layout & Sizing
description: Flexbox layout with Flexily — the pure JS layout engine.
---

## Layout Engine

Vexart uses **Flexily** — a pure JavaScript layout engine with a Yoga-compatible API. Layout is reactive and incremental: only dirty subtrees recompute.

## Direction

Default `<box>` direction is **column** (vertical flow). Use `direction="row"` for horizontal:

```tsx
<box direction="row" gap={12}>
  <box width={100} height={50} backgroundColor={0xff0000ff} />
  <box width={100} height={50} backgroundColor={0x00ff00ff} />
</box>
```

## Sizing

| Value | Behavior |
|-------|----------|
| `width={200}` | Fixed 200 pixels |
| `width="grow"` | Expand to fill available space |
| `width="fit"` | Shrink to content |
| `width="100%"` | Percentage of parent |
| `flexGrow={1}` | Flex grow factor |

```tsx
<box direction="row" width="100%">
  <box width="grow" backgroundColor={0x1e1e2eff}>Fills remaining</box>
  <box width={200} backgroundColor={0x2a2a3eff}>Fixed 200px</box>
</box>
```

## Spacing

| Prop | Purpose |
|------|---------|
| `padding` | Uniform inner spacing |
| `paddingX` / `paddingY` | Axis padding |
| `paddingLeft/Right/Top/Bottom` | Per-side |
| `margin` | Uniform outer spacing |
| `marginX` / `marginY` | Axis margin |
| `gap` | Space between children |

## Alignment

| Prop | Values | Default |
|------|--------|---------|
| `alignX` | `"left"`, `"right"`, `"center"`, `"space-between"` | `"left"` |
| `alignY` | `"top"`, `"bottom"`, `"center"`, `"space-between"` | `"top"` |

CSS-compatible aliases: `justifyContent`, `alignItems` (+ `"flex-start"`, `"flex-end"`).

## Constraints

```tsx
<box minWidth={100} maxWidth={500} minHeight={50} maxHeight={300}>
  Content adapts within bounds
</box>
```

## Responsive

Terminal resize triggers automatic re-layout. Use `useTerminalDimensions()` for reactive dimensions:

```tsx
import { useTerminalDimensions } from "vexart/engine"

const dims = useTerminalDimensions(terminal)
// dims().cols, dims().rows, dims().width, dims().height
```
