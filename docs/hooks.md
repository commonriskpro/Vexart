# Hooks & Signals

TGE provides reactive hooks for building custom interactive components. All hooks return SolidJS signals — when input changes, your UI automatically updates.

```typescript
import { useKeyboard, useMouse, useFocus, useInput, onInput, setFocus, markDirty } from "@tge/renderer"
```

---

## useKeyboard()

Reactive keyboard state. Returns the last key event as a signal.

### Signature

```typescript
type KeyboardState = {
  key: () => KeyEvent | null           // Last key event (signal)
  pressed: (name: string) => boolean   // Check if key matches last pressed
}

function useKeyboard(): KeyboardState
```

### Usage

```tsx
function KeyDisplay() {
  const kb = useKeyboard()

  return (
    <Box direction="column" gap={4}>
      <Text color={text.primary}>Last key: {kb.key()?.key ?? "none"}</Text>
      <Text color={kb.pressed("escape") ? accent.drift : text.muted}>
        {kb.pressed("escape") ? "ESC pressed!" : "Press ESC"}
      </Text>
    </Box>
  )
}
```

### Notes

- `key()` returns the most recent `KeyEvent`, or `null` if no key has been pressed.
- `pressed(name)` is a convenience — it checks `key()?.key === name`.
- The signal updates on every keypress, triggering reactive re-renders.

---

## useMouse()

Reactive mouse state. Returns position and event signals.

### Signature

```typescript
type MouseState = {
  mouse: () => MouseEvent | null       // Last mouse event (signal)
  pos: () => { x: number; y: number }  // Current mouse position (signal)
}

function useMouse(): MouseState
```

### Usage

```tsx
function MouseTracker() {
  const ms = useMouse()

  return (
    <Box direction="column" gap={4}>
      <Text color={text.primary}>
        Mouse: {ms.pos().x}, {ms.pos().y}
      </Text>
      <Text color={text.muted}>
        Button: {ms.mouse()?.button ?? "none"}
      </Text>
    </Box>
  )
}
```

### Notes

- Mouse coordinates are in terminal cell units (col, row), not pixels.
- The position signal updates on every mouse move, scroll, and click.
- Mouse tracking is automatically enabled by `createTerminal()`.

---

## useFocus(opts?)

Make a component focusable. Registers it in the global focus ring for Tab/Shift+Tab cycling.

### Signature

```typescript
type FocusHandle = {
  focused: () => boolean    // Whether this element is currently focused (signal)
  focus: () => void         // Programmatically focus this element
}

function useFocus(opts?: {
  id?: string                                 // Unique focus ID
  onKeyDown?: (event: KeyEvent) => void       // Keyboard handler (only fires when focused)
}): FocusHandle
```

### How Focus Works

1. Components call `useFocus()` during initialization — this registers them in the focus ring.
2. The first registered component is auto-focused.
3. **Tab** moves focus forward, **Shift+Tab** moves backward, wrapping at the edges.
4. Only the focused component's `onKeyDown` handler receives keyboard events.
5. Components read `focused()` to adjust their visual styling (borders, colors, etc.).

### Building a Custom Interactive Component

```tsx
import { useFocus } from "@tge/renderer"
import { Box, Text } from "@tge/components"
import { border, text, accent } from "@tge/tokens"

function ColorPicker(props: { colors: number[]; selected: number; onChange: (i: number) => void }) {
  const { focused } = useFocus({
    onKeyDown(e) {
      if (e.key === "left") {
        props.onChange(Math.max(0, props.selected - 1))
      } else if (e.key === "right") {
        props.onChange(Math.min(props.colors.length - 1, props.selected + 1))
      }
    }
  })

  return (
    <Box
      direction="row"
      gap={4}
      padding={8}
      borderColor={focused() ? border.focus : border.subtle}
      borderWidth={focused() ? 2 : 1}
      cornerRadius={4}
    >
      <For each={props.colors}>
        {(color, i) => (
          <Box
            width={24}
            height={24}
            backgroundColor={color}
            cornerRadius={4}
            borderColor={i() === props.selected ? 0xffffffff : 0x00000000}
            borderWidth={i() === props.selected ? 2 : 0}
          />
        )}
      </For>
    </Box>
  )
}
```

---

## useInput()

Low-level hook. Returns a signal of ALL input events (key, mouse, focus, paste, resize).

### Signature

```typescript
function useInput(): () => InputEvent | null
```

### Usage

```tsx
function RawInputDisplay() {
  const input = useInput()

  return (
    <Text color={text.muted}>
      Last event: {input()?.type ?? "none"}
    </Text>
  )
}
```

---

## onInput(handler)

Global event subscription (non-hook). Subscribe to all input events from anywhere. Returns an unsubscribe function.

### Signature

```typescript
function onInput(handler: (event: InputEvent) => void): () => void
```

### Usage

```tsx
import { onInput } from "@tge/renderer"
import { onCleanup } from "solid-js"

function App() {
  const unsub = onInput((event) => {
    if (event.type === "key" && event.key === "q") {
      process.exit(0)
    }
  })

  onCleanup(unsub)

  return <Box><Text>Press Q to quit</Text></Box>
}
```

### Notes

- `onInput` fires for ALL events regardless of focus.
- Useful for global shortcuts (quit, help, etc.).
- Always call the returned unsubscribe function in `onCleanup()`.

---

## setFocus(id)

Programmatically set focus to a component by its focus ID.

### Signature

```typescript
function setFocus(id: string): void
```

### Usage

```tsx
// Give a component a focus ID
const { focused } = useFocus({ id: "email-input" })

// Later, set focus programmatically
setFocus("email-input")
```

---

## markDirty()

Manually trigger a repaint on the next frame. Useful when you change state outside of SolidJS signals.

### Signature

```typescript
function markDirty(): void
```

### Usage

```typescript
import { markDirty } from "@tge/renderer"

// After modifying external state
someExternalState.value = newValue
markDirty()  // Tell TGE to repaint
```

### Notes

- Normally you don't need this. SolidJS signal changes automatically trigger `markDirty()`.
- Use it only when integrating with external state management or imperative APIs.

---

## Patterns

### Quit Handler

```tsx
function App() {
  const unsub = onInput((e) => {
    if (e.type === "key" && e.key === "q" && !e.mods.ctrl) {
      process.exit(0)
    }
  })
  onCleanup(unsub)
  return <Box>...</Box>
}
```

### Focus-Dependent Styling

```tsx
function FocusableCard(props: { children: JSX.Element }) {
  const { focused } = useFocus()

  return (
    <Box
      padding={12}
      backgroundColor={focused() ? surface.floating : surface.card}
      borderColor={focused() ? accent.thread : border.subtle}
      borderWidth={focused() ? 2 : 1}
      cornerRadius={8}
    >
      {props.children}
    </Box>
  )
}
```

### Keyboard Shortcut Map

```tsx
function App() {
  const { focused } = useFocus({
    onKeyDown(e) {
      const actions: Record<string, () => void> = {
        "1": () => setTab(0),
        "2": () => setTab(1),
        "3": () => setTab(2),
        "enter": handleSubmit,
        "escape": handleCancel,
      }
      actions[e.key]?.()
    }
  })

  return <Box>...</Box>
}
```

### Timer with Auto-Cleanup

```tsx
function Clock() {
  const [time, setTime] = createSignal(new Date())

  const timer = setInterval(() => setTime(new Date()), 1000)
  onCleanup(() => clearInterval(timer))

  return <Text color={text.primary}>{time().toLocaleTimeString()}</Text>
}
```
