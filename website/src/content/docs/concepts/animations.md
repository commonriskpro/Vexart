---
title: Animations
description: Transitions, springs, and compositor-path animations.
---

## createTransition

Tween between values with easing:

```tsx
import { createTransition, easing } from "@vexart/engine"

const [opacity, start] = createTransition(0, {
  duration: 300,
  easing: easing.easeOutCubic,
})

start(1) // Animate to 1

<box opacity={opacity()}>
```

## createSpring

Physics-based spring animation:

```tsx
import { createSpring } from "@vexart/engine"

const [scale, setTarget] = createSpring(1, {
  stiffness: 200,
  damping: 15,
})

setTarget(1.2) // Bounce to 1.2x

<box transform={{ scale: scale() }}>
```

## Easing Presets

12 built-in easing functions:

`linear`, `easeInQuad`, `easeOutQuad`, `easeInOutQuad`, `easeInCubic`, `easeOutCubic`, `easeInOutCubic`, `easeInQuart`, `easeOutQuart`, `easeInOutQuart`, `easeInExpo`, `easeOutExpo`

## Compositor-Path Animations

When animating `transform` or `opacity` on a node with a backing layer (`layer={true}` or `willChange`), the animation runs on the compositor path — skipping layout, paint, and walk-tree entirely:

```tsx
<box
  layer={true}
  willChange="transform"
  transform={{ translateX: offset() }}
>
```

This maintains 60fps even under heavy JS load.

## Adaptive Frame Rate

Vexart's render loop is adaptive:
- **Idle**: 8fps (< 2% CPU)
- **Active**: up to 60fps
- **Interaction boost**: immediate frame on input
