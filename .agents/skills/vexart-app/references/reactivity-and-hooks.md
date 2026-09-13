# Reactivity, Events, and Hooks

## 1. Reactivity (SolidJS Universal)

Vexart uses SolidJS fine-grained reactivity. Component functions run ONCE.

```tsx
import { createSignal, createMemo, createEffect, Show, For, Switch, Match } from "vexart"

const [active, setActive] = createSignal(false)
const label = createMemo(() => active() ? "Enabled" : "Disabled")

// Render conditionally
<Show when={active()} fallback={<text>Offline</text>}>
  <text>Online</text>
</Show>

// Render collections
<For each={items()}>
  {(item) => <text>{item.name}</text>}
</For>
```

## 2. Focus and Keyboard Navigation

Use `useFocus` to make custom elements keyboard navigable:

```tsx
import { useFocus, colors } from "vexart"

function CustomItem(props: { title: string; onSelect: () => void }) {
  const { focused } = useFocus({
    onKeyDown(e) {
      if (e.key === "enter" || e.key === "space") {
        props.onSelect()
      }
    },
  })

  return (
    <box
      focusable
      padding={8}
      backgroundColor={focused() ? colors.accent : colors.transparent}
      cornerRadius={4}
    >
      <text color={colors.foreground}>{props.title}</text>
    </box>
  )
}
```

## 3. Global Input Hooks

- `useKeyboard()`: Reactive signal for keyboard state.
- `useMouse()`: Reactive signal for mouse position and button state.
- `onInput(callback)`: Low-level raw event listener.
- `useTerminalDimensions()`: Returns reactive `width()` and `height()` of terminal in pixels.

## 4. Animations

### Transitions (Tween)
```tsx
import { createTransition, easing } from "vexart"

const [opacity, setOpacity] = createTransition(0, {
  duration: 400,
  easing: easing.easeInOutCubic,
})

// Trigger
setOpacity(1)
```

### Springs (Physics-based)
```tsx
import { createSpring } from "vexart"

const [scale, setScale] = createSpring(1, {
  stiffness: 180,
  damping: 12,
})

setScale(1.1)
```

## 5. Data Fetching

```tsx
import { useQuery } from "vexart"

const { data, loading, error, refetch } = useQuery(async () => {
  const res = await fetch("https://api.example.com/status")
  return res.json()
})
```

