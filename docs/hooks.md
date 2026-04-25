# Hooks & Signals

Vexart uses SolidJS reactivity. Hooks live in `@vexart/engine` and are designed for custom primitives, headless components, and app-level orchestration.

```tsx
import {
  createTerminal,
  mount,
  onInput,
  useFocus,
  useKeyboard,
  useMouse,
  useDrag,
  useHover,
  useTerminalDimensions,
  markDirty,
  pushFocusScope,
  createTransition,
  createSpring,
} from "@vexart/engine"
```

## Terminal dimensions

```tsx
function App(props: { terminal: Awaited<ReturnType<typeof createTerminal>> }) {
  const dims = useTerminalDimensions(props.terminal)

  return (
    <box width={dims.width()} height={dims.height()}>
      <text>{dims.width()}×{dims.height()}</text>
    </box>
  )
}
```

## Keyboard input

```tsx
const unsubscribe = onInput((event) => {
  if (event.type === "key" && event.key === "escape") process.exit(0)
})
```

For component-level keyboard behavior, use focusable nodes:

```tsx
<box
  focusable
  onKeyDown={(event) => {
    if (event.key === "enter") save()
  }}
/>
```

## Focus

```tsx
const focus = useFocus()

<box focusable focusStyle={{ borderColor: 0x56d4c8ff, borderWidth: 2 }}>
  <text>Focusable panel</text>
</box>
```

Use `pushFocusScope()` for modal/dialog focus trapping.

## Mouse, hover, and drag

```tsx
const drag = useDrag({ axis: "both" })
const hover = useHover()

<box
  {...drag.props}
  {...hover.props}
  width={160}
  height={80}
  backgroundColor={hover.state.hovered() ? 0x2a2a3eff : 0x1a1a2eff}
/>
```

For low-level handlers:

```tsx
<box
  onMouseDown={(event) => startDrag(event)}
  onMouseMove={(event) => updateDrag(event)}
  onMouseUp={(event) => stopDrag(event)}
/>
```

## Animation

```tsx
const opacity = createSpring(0, { stiffness: 180, damping: 22 })

<box opacity={opacity()} />
```

Transform and opacity animations should use `layer` or `willChange` so they can take the compositor fast path:

```tsx
<box layer willChange="transform" transform={{ translateX: 24 }} />
```

## Manual invalidation

Most Solid signal changes invalidate automatically. Use `markDirty()` only when external imperative state changes outside Solid:

```tsx
externalEmitter.on("tick", () => {
  updateExternalStore()
  markDirty()
})
```
