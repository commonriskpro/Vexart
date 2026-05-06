---
title: Interactivity & Focus
description: Event system, pointer capture, focus management, and hit-testing.
---

## Event Bubbling (onPress)

`onPress` bubbles up the parent chain like DOM click events:

```tsx
<box onPress={() => closePanel()}>
  <box onPress={(e) => { e?.stopPropagation(); doAction() }}>
    <text>Click me (parent won't fire)</text>
  </box>
</box>
```

## Per-Node Mouse Events

Low-level callbacks dispatch directly to the target node (no bubbling):

```tsx
<box
  onMouseDown={(e) => startDrag(e)}
  onMouseMove={(e) => updateDrag(e)}
  onMouseUp={(e) => endDrag(e)}
/>
```

`NodeMouseEvent`: `{ x, y, nodeX, nodeY, width, height }`

## Focus System

```tsx
<box focusable onKeyDown={(e) => handleKey(e)}>
  <text>Focused element</text>
</box>
```

- Tab/Shift-Tab cycles through focusable nodes
- `useFocus()` hook for programmatic control
- `pushFocusScope()` for modal focus trapping

## Pointer Capture

Lock all mouse events to a node (for drag interactions):

```tsx
import { setPointerCapture, releasePointerCapture } from "@vexart/engine"

setPointerCapture(nodeId)     // All events route here
releasePointerCapture(nodeId) // Auto-released on button up
```

## Hit-Area Expansion

Interactive elements have a minimum hit-area of one terminal cell (typically 7×13px). Small elements are always clickable.

## useDrag / useHover

```tsx
import { useDrag, useHover } from "@vexart/engine"

const drag = useDrag({ onDragStart, onDrag, onDragEnd })
const hover = useHover({ onHoverStart, onHoverEnd })
```
