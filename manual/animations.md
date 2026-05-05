# Animations

> Expanded guide for Vexart's animation system. For the quick-reference version, see [developer-guide.md](./developer-guide.md#createtransitionsignal-options).

Vexart provides two animation primitives: `createTransition` (eased/tween) and `createSpring` (physics-based). Both return reactive `[getter, setter]` tuples that integrate naturally with SolidJS JSX. This guide covers both in depth, along with easing functions and the adaptive framerate system.

---

## createTransition — Eased Animation

`createTransition` animates a numeric value from its current position to a target using a timing function (easing). Think of it as CSS `transition`.

### Signature

```typescript
import { createTransition, easing } from "vexart/engine"

const [value, setValue] = createTransition(initialValue: number, options?: {
  duration?: number,    // ms, default: 300
  easing?: EasingFn,    // default: easeInOut
  delay?: number,       // ms, default: 0
})
```

**Returns:** `[getter, setter]` — a TUPLE.

- `getter` is a function: call `value()` to read the current animated value
- `setter` is a function: call `setValue(target)` to start animating toward target

### Basic example

```tsx
import { createTransition } from "vexart/engine"

function ExpandPanel() {
  const [width, setWidth] = createTransition(100, { duration: 300 })

  return (
    <box direction="column" gap={8}>
      <box focusable onPress={() => setWidth(width() < 200 ? 400 : 100)}>
        <text color="#4488cc">Toggle width</text>
      </box>
      <box
        width={Math.round(width())}
        height={60}
        backgroundColor="#1e1e2e"
        cornerRadius={8}
      >
        <text color="#e0e0e0" padding={8}>Content</text>
      </box>
    </box>
  )
}
```

**CRITICAL:** `createTransition` returns a `[getter, setter]` TUPLE, not a single accessor. This is different from `createSignal` which also returns a tuple — the difference is that the getter returns an ANIMATED value that smoothly interpolates over time.

### Multiple animated values

```tsx
const [x, setX] = createTransition(0, { duration: 400 })
const [y, setY] = createTransition(0, { duration: 400 })
const [opacity, setOpacity] = createTransition(0, { duration: 200 })

// Move to position with fade-in
setX(100)
setY(50)
setOpacity(1)

<box
  paddingLeft={Math.round(x())}
  paddingTop={Math.round(y())}
  opacity={opacity()}
>
  <text color="#fff">Animated element</text>
</box>
```

### Delay

```tsx
// Staggered entrance animation
const [a, setA] = createTransition(0, { duration: 300, delay: 0 })
const [b, setB] = createTransition(0, { duration: 300, delay: 100 })
const [c, setC] = createTransition(0, { duration: 300, delay: 200 })

// Trigger all at once — they start at different times
setA(1); setB(1); setC(1)
```

---

## Easing Presets

Easing functions control the acceleration curve of the animation. Vexart provides 9 built-in presets.

```typescript
import { easing } from "vexart/engine"
```

| Easing | Behavior | Use for |
|--------|----------|---------|
| `easing.linear` | Constant speed | Progress bars, timers |
| `easing.easeIn` | Slow start, fast end | Elements leaving the screen |
| `easing.easeOut` | Fast start, slow end | Elements entering the screen |
| `easing.easeInOut` | Slow start + end (default) | Most UI transitions |
| `easing.easeInCubic` | Aggressive slow start | Dramatic acceleration |
| `easing.easeOutCubic` | Aggressive deceleration | Snappy settle |
| `easing.easeOutBack` | Overshoot then settle | Bouncy entrance, playful UI |
| `easing.easeOutElastic` | Elastic bounce | Attention-grabbing, game UI |
| `easing.cubicBezier(x1, y1, x2, y2)` | Custom curve | Match CSS exactly |

### Examples with different easings

```tsx
// Snappy panel slide
const [x, setX] = createTransition(0, {
  duration: 300,
  easing: easing.easeOutCubic,
})

// Playful bounce
const [scale, setScale] = createTransition(0, {
  duration: 500,
  easing: easing.easeOutBack,
})

// Match a CSS cubic-bezier exactly
const [y, setY] = createTransition(0, {
  duration: 400,
  easing: easing.cubicBezier(0.16, 1, 0.3, 1),
})
```

### cubicBezier

`easing.cubicBezier(x1, y1, x2, y2)` creates a custom easing curve. The four parameters define two control points of a cubic bezier, exactly like CSS `cubic-bezier()`.

```tsx
// CSS equivalent: transition-timing-function: cubic-bezier(0.34, 1.56, 0.64, 1)
const [v, setV] = createTransition(0, {
  duration: 500,
  easing: easing.cubicBezier(0.34, 1.56, 0.64, 1),
})
```

---

## createSpring — Physics-Based Animation

`createSpring` animates using a spring physics simulation. Instead of a fixed duration, it runs until the spring settles. This produces natural, organic-feeling motion.

### Signature

```typescript
import { createSpring } from "vexart/engine"

const [value, setValue] = createSpring(initialValue: number, options?: {
  stiffness?: number,    // default: 170 (spring tension)
  damping?: number,      // default: 26 (friction)
  mass?: number,         // default: 1 (inertia)
  precision?: number,    // velocity threshold to stop, default: 0.01
})
```

**Returns:** `[getter, setter]` — a TUPLE, just like createTransition.

### Basic example

```tsx
import { createSpring } from "vexart/engine"

function SpringButton() {
  const [y, setY] = createSpring(0, { stiffness: 200, damping: 20 })

  return (
    <box
      focusable
      onPress={() => {
        setY(-20)  // Spring up
        setTimeout(() => setY(0), 100)  // Spring back
      }}
      paddingTop={Math.round(y()) + 20}
    >
      <box backgroundColor="#333" cornerRadius={8} padding={12}>
        <text color="#fff">Bouncy button</text>
      </box>
    </box>
  )
}
```

### Spring parameters

| Parameter | Effect | Low value | High value |
|-----------|--------|-----------|------------|
| `stiffness` | Spring tension | Slow, gentle | Snappy, rigid |
| `damping` | Friction | Bouncy (oscillates) | Smooth (no bounce) |
| `mass` | Inertia | Quick response | Sluggish, heavy |
| `precision` | Stop threshold | Precise settle | Quick stop |

### Spring presets for common feels

```tsx
// Responsive button press (snappy, no bounce)
createSpring(0, { stiffness: 300, damping: 30 })

// Bouncy entrance (moderate bounce)
createSpring(0, { stiffness: 200, damping: 15 })

// Gentle float (slow, smooth)
createSpring(0, { stiffness: 100, damping: 20, mass: 2 })

// Elastic snap (very bouncy)
createSpring(0, { stiffness: 400, damping: 10 })
```

**Web analogy:** `react-spring` or CSS `spring()` function.

---

## createTransition vs createSpring

| | createTransition | createSpring |
|-|-----------------|--------------|
| Timing | Fixed duration (ms) | Physics-based (settles naturally) |
| Control | Duration + easing curve | Stiffness + damping + mass |
| Interruption | Restarts from current value | Preserves velocity |
| Best for | Timed UI transitions | Natural, organic motion |
| Mental model | CSS transition | Physical spring |

**When to use which:**

- **createTransition:** Tab switches, panel slides, progress animations, fade in/out — anything with a clear "it should take X ms"
- **createSpring:** Button press feedback, drag-and-release, bouncing elements, scroll physics — anything that should feel physical

---

## Adaptive Framerate

Vexart optimizes rendering with an adaptive framerate system:

| State | FPS | When |
|-------|-----|------|
| Idle | 30 | No signals changing, no animations |
| Animating | 60 | Active transition or spring running |
| Cooldown | 60→30 | ~200ms after last animation completes |

This means:
- Your animations run at smooth 60fps automatically
- When nothing moves, Vexart drops to 30fps to save CPU
- The transition is invisible — framerate ramps up the moment you call `setValue()`

You can check if animations are active:

```tsx
import { hasActiveAnimations } from "vexart/engine"

// Returns true if any transition or spring is in progress
const isAnimating = hasActiveAnimations()
```

---

## Common Animation Patterns

### Fade in on mount

```tsx
import { createTransition, easing } from "vexart/engine"

function FadeIn(props: { children: any }) {
  const [opacity, setOpacity] = createTransition(0, {
    duration: 300,
    easing: easing.easeOut,
  })

  // Trigger immediately on mount
  setOpacity(1)

  return (
    <box opacity={opacity()}>
      {props.children}
    </box>
  )
}
```

### Slide-in panel

```tsx
function SlidePanel(props: { open: boolean; children: any }) {
  const [x, setX] = createTransition(-300, {
    duration: 300,
    easing: easing.easeOutCubic,
  })

  // React to prop changes
  createEffect(() => {
    setX(props.open ? 0 : -300)
  })

  return (
    <box paddingLeft={Math.round(x()) + 300} width={300}>
      {props.children}
    </box>
  )
}
```

### Height expand/collapse

```tsx
function Collapsible(props: { open: boolean; children: any }) {
  const [height, setHeight] = createTransition(0, { duration: 250 })

  createEffect(() => {
    setHeight(props.open ? 200 : 0)
  })

  return (
    <box height={Math.round(height())} scrollY>
      {props.children}
    </box>
  )
}
```

### Spring button feedback

```tsx
function PressButton(props: { label: string; onPress: () => void }) {
  const [scale, setScale] = createSpring(1, { stiffness: 300, damping: 15 })

  return (
    <box
      focusable
      onPress={() => {
        setScale(0.95)
        setTimeout(() => setScale(1), 50)
        props.onPress()
      }}
      paddingX={Math.round(16 * scale())}
      paddingY={Math.round(8 * scale())}
      backgroundColor="#333"
      cornerRadius={8}
    >
      <text color="#fff">{props.label}</text>
    </box>
  )
}
```

### Animated counter

```tsx
function AnimatedCounter(props: { value: number }) {
  const [display, setDisplay] = createTransition(0, {
    duration: 500,
    easing: easing.easeOutCubic,
  })

  createEffect(() => {
    setDisplay(props.value)
  })

  return (
    <text color="#fafafa" fontSize={36}>
      {String(Math.round(display()))}
    </text>
  )
}
```

### Staggered list entrance

```tsx
import { For } from "vexart/engine"

function StaggeredList(props: { items: string[] }) {
  return (
    <box direction="column" gap={4}>
      <For each={props.items}>
        {(item, index) => {
          const [opacity, setOpacity] = createTransition(0, {
            duration: 200,
            delay: index() * 50,  // 50ms stagger per item
          })
          setOpacity(1)

          return (
            <box opacity={opacity()} padding={8} backgroundColor="#1e1e2e" cornerRadius={6}>
              <text color="#e0e0e0">{item}</text>
            </box>
          )
        }}
      </For>
    </box>
  )
}
```

---

## Tips

1. **Always use `Math.round()` for pixel values.** `width={Math.round(w())}` — fractional pixels cause blurry rendering.

2. **Transitions interrupt cleanly.** If you call `setValue()` while an animation is in progress, it starts a new animation from the current interpolated value. No jumps.

3. **Springs preserve velocity.** If you interrupt a spring, the new animation starts with the current velocity. This creates natural-feeling interruptions.

4. **Don't animate too many values simultaneously.** Each animated value triggers a signal update per frame. 5-10 simultaneous animations are fine. 100+ may cause frame drops.

5. **Use `createEffect` to sync with SolidJS state.** Wrap `setValue()` in a `createEffect` to automatically animate when a signal changes.

---

## See Also

- [Visual Effects](./visual-effects.md) — shadow, opacity, glow to animate
- [Interactivity and Focus](./interactivity-and-focus.md) — trigger animations from interactions
- [Layout and Sizing](./layout-and-sizing.md) — animate width, height, padding
- [developer-guide.md](./developer-guide.md#createtransitionsignal-options) — quick reference
