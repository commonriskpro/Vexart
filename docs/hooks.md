# Hooks & Signals

TGE provides reactive hooks for building custom interactive components. All hooks return SolidJS signals — when input changes, your UI automatically updates.

```typescript
import { useKeyboard, useMouse, useFocus, useInput, onInput, setFocus, markDirty } from "@tge/renderer-solid"
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
      <Text color={colors.foreground}>Last key: {kb.key()?.key ?? "none"}</Text>
      <Text color={kb.pressed("escape") ? colors.destructive : colors.mutedForeground}>
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
      <Text color={colors.foreground}>
        Mouse: {ms.pos().x}, {ms.pos().y}
      </Text>
      <Text color={colors.mutedForeground}>
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
- **`useMouse()` vs per-node `onMouse*` events:** `useMouse()` is a global reactive signal that reports mouse position in terminal cell coordinates. Per-node mouse events (`onMouseDown`, `onMouseMove`, `onMouseUp`, `onMouseOver`, `onMouseOut`) are callbacks dispatched directly to the node under the pointer, with coordinates relative to the node's layout origin via `NodeMouseEvent` (`{ x, y, nodeX, nodeY, width, height }`). Use `useMouse()` for reactive UI updates. Use per-node events for element-specific interactions like drag and hover.

---

## useFocus(opts?)

Make a component focusable. Registers it in the global focus ring for Tab/Shift+Tab cycling.

### Signature

```typescript
type FocusHandle = {
  focused: () => boolean    // Whether this element is currently focused (signal)
  focus: () => void         // Programmatically focus this element
  id: string                // The focus ID (auto-generated or custom)
}

function useFocus(opts?: {
  id?: string                                 // Unique focus ID
  onKeyDown?: (event: KeyEvent) => void       // Keyboard handler (only fires when focused)
  onPress?: (event?: PressEvent) => void       // Fires on Enter/Space when focused
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
import { useFocus } from "@tge/renderer-solid"
import { Box, Text } from "@tge/components"
import { colors } from "@tge/void"

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
      borderColor={focused() ? colors.ring : colors.border}
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
    <Text color={colors.mutedForeground}>
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
import { onInput } from "@tge/renderer-solid"
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
import { markDirty } from "@tge/renderer-solid"

// After modifying external state
someExternalState.value = newValue
markDirty()  // Tell TGE to repaint
```

### Notes

- Normally you don't need this. SolidJS signal changes automatically trigger `markDirty()`.
- Use it only when integrating with external state management or imperative APIs.

---

## pushFocusScope()

Create a focus scope (trap) for modals and dialogs. Tab/Shift+Tab only cycles within the active scope.

### Signature

```typescript
function pushFocusScope(): () => void
```

Returns a cleanup function that pops the scope and restores previous focus.

### Usage

```tsx
import { pushFocusScope } from "@tge/renderer-solid"
import { onCleanup } from "solid-js"

function Modal(props: { children: any }) {
  const popScope = pushFocusScope()
  onCleanup(popScope)
  
  return (
    <box width="100%" height="100%" alignX="center" alignY="center">
      {props.children}
    </box>
  )
}
```

### Notes

- Focus scopes stack — nested dialogs create nested scopes.
- When popped, focus returns to the element that was focused before the scope was pushed.
- The built-in `<Dialog>` component uses this automatically.

---

## Focusable `<box>`

Make any `<box>` focusable without `useFocus()`. Like HTML `<div tabindex="0">`.

### Props

```tsx
<box
  focusable                           // Register in focus ring
  focusStyle={{ borderColor: "#4488cc", borderWidth: 2 }}  // Visual on focus
  onPress={() => save()}              // Mouse click + Enter/Space
  onKeyDown={(e) => handleKey(e)}     // Keyboard when focused
>
  <text>Focusable content</text>
</box>
```

Per-node mouse events also work on any `<box>`:

```tsx
<box
  width={200} height={100}
  backgroundColor="#333"
  onMouseDown={(e) => startDrag(e)}
  onMouseMove={(e) => updatePosition(e)}
  onMouseUp={(e) => endDrag(e)}
>
  <text color="#fff">Drag target</text>
</box>
```

### Notes

- `focusable` auto-registers the node in the focus system — no `useFocus()` needed.
- `focusStyle` works like `hoverStyle`/`activeStyle` — partial props merged when focused.
- `onPress` fires on mouse click (release while hovered) OR Enter/Space when focused. Events bubble up the parent node chain like DOM click events — if the clicked node doesn't have `onPress`, the event walks up to the nearest ancestor that does. Use `event.stopPropagation()` to prevent further bubbling.
- Mouse click on a focusable node automatically sets focus (like browser behavior).
- `useFocus()` still exists for advanced use (programmatic focus, custom focus IDs).
- Per-node mouse events (`onMouseDown`, `onMouseUp`, `onMouseMove`, `onMouseOver`, `onMouseOut`) work on any `<box>`, not just focusable ones. They do NOT bubble — they dispatch directly to the target node. Each receives a `NodeMouseEvent` with `{ x, y, nodeX, nodeY, width, height }`.

---

## useQuery(fetcher, options?)

Data fetching hook with loading/error/data states.

### Signature

```typescript
type QueryResult<T> = {
  data: () => T | undefined
  loading: () => boolean
  error: () => Error | undefined
  refetch: () => void
  mutate: (data: T | ((prev: T | undefined) => T)) => void
}

type QueryOptions = {
  enabled?: boolean          // Auto-fetch on mount. Default: true
  refetchInterval?: number   // Auto-refetch interval (ms). 0 = disabled
  retry?: number             // Retry count on error. Default: 0
  retryDelay?: number        // Retry delay (ms). Default: 1000
}

function useQuery<T>(fetcher: () => Promise<T>, options?: QueryOptions): QueryResult<T>
```

### Usage

```tsx
import { useQuery } from "@tge/renderer-solid"
import { Show, For } from "@tge/renderer-solid"

function UserList() {
  const users = useQuery(() => fetch("/api/users").then(r => r.json()))

  return (
    <box direction="column" gap={4}>
      <Show when={users.loading()}>
        <text color="#999">Loading...</text>
      </Show>
      <Show when={users.error()}>
        <text color="#ff4444">{users.error()!.message}</text>
      </Show>
      <For each={users.data() ?? []}>
        {(user) => <text color="#fff">{user.name}</text>}
      </For>
    </box>
  )
}
```

---

## useMutation(mutator, options?)

Mutation hook with optimistic updates and rollback.

### Signature

```typescript
type MutationResult<T, V> = {
  data: () => T | undefined
  loading: () => boolean
  error: () => Error | undefined
  mutate: (variables: V) => Promise<T | undefined>
  reset: () => void
}

type MutationOptions<T, V> = {
  onMutate?: (variables: V) => T | undefined     // Optimistic update
  onSuccess?: (data: T, variables: V) => void
  onError?: (error: Error, variables: V, previousData: T | undefined) => void
  onSettled?: (data: T | undefined, error: Error | undefined, variables: V) => void
}

function useMutation<T, V = void>(
  mutator: (variables: V) => Promise<T>,
  options?: MutationOptions<T, V>
): MutationResult<T, V>
```

### Usage

```tsx
import { useMutation } from "@tge/renderer-solid"

function SaveButton() {
  const save = useMutation(
    (data: { name: string }) => fetch("/api/save", { method: "POST", body: JSON.stringify(data) }),
    {
      onSuccess: () => toast({ message: "Saved!" }),
      onError: (err) => toast({ message: err.message, variant: "error" }),
    }
  )

  return (
    <box focusable onPress={() => save.mutate({ name: "Alice" })}>
      <text>{save.loading() ? "Saving..." : "Save"}</text>
    </box>
  )
}
```

---

## createTransition(signal, options)

Animate numeric signal changes with easing.

### Signature

```typescript
function createTransition(
  signal: () => number,
  options?: { duration?: number; easing?: (t: number) => number }
): () => number
```

### Usage

```tsx
import { createTransition } from "@tge/renderer-solid"
import { createSignal } from "solid-js"

function ExpandingBox() {
  const [expanded, setExpanded] = createSignal(false)
  const width = createTransition(() => expanded() ? 300 : 100, { duration: 300 })

  return (
    <box focusable onPress={() => setExpanded(e => !e)}>
      <box width={width()} height={50} backgroundColor="#4488cc" cornerRadius={8} />
    </box>
  )
}
```

---

## createSpring(signal, options)

Physics-based spring animation.

### Signature

```typescript
function createSpring(
  signal: () => number,
  options?: { stiffness?: number; damping?: number; mass?: number }
): () => number
```

### Usage

```tsx
import { createSpring } from "@tge/renderer-solid"

const springY = createSpring(() => active() ? 0 : 100, { stiffness: 200, damping: 20 })
<box floatOffset={{ x: 0, y: springY() }}>...</box>
```

---

## useDrag(options)

Encapsulates drag interactions — pointer capture, `isDragging` flag, and mouse event wiring. Returns `dragProps` to spread on the drag target.

### Signature

```typescript
import { useDrag } from "@tge/renderer-solid"

type DragOptions = {
  onDragStart?: (event: NodeMouseEvent) => void
  onDrag?: (event: NodeMouseEvent) => void
  onDragEnd?: (event: NodeMouseEvent) => void
  disabled?: () => boolean
}

type DragState = {
  dragging: () => boolean    // reactive signal — true while dragging
  dragProps: DragProps        // spread on the target element
}

function useDrag(options: DragOptions): DragState
```

### Usage

```tsx
import { useDrag } from "@tge/renderer-solid"

function DragTrack(props: { value: number; onChange: (v: number) => void }) {
  const { dragging, dragProps } = useDrag({
    onDragStart: (e) => props.onChange(Math.round((e.nodeX / e.width) * 100)),
    onDrag: (e) => {
      const ratio = Math.max(0, Math.min(1, e.nodeX / e.width))
      props.onChange(Math.round(ratio * 100))
    },
  })

  return (
    <box {...dragProps} width={200} height={12} backgroundColor="#333" cornerRadius={6}>
      <box width={`${props.value}%`} height={12}
        backgroundColor={dragging() ? "#66aaff" : "#4488cc"} cornerRadius={6} />
    </box>
  )
}
```

### Notes

- `useDrag` handles `setPointerCapture`/`releasePointerCapture` internally.
- The Slider component uses `useDrag` — its `trackProps` are built on top of it.
- `dragProps` includes `onMouseDown`, `onMouseMove`, and `onMouseUp`.

---

## useHover(options)

Encapsulates hover detection with configurable enter/leave delays. Returns `hovered` signal and `hoverProps` to spread on the target.

### Signature

```typescript
import { useHover } from "@tge/renderer-solid"

type HoverOptions = {
  delay?: number          // ms before onEnter fires (default: 0)
  leaveDelay?: number     // ms before onLeave fires (default: 0)
  onEnter?: () => void
  onLeave?: () => void
}

type HoverState = {
  hovered: () => boolean    // reactive signal
  hoverProps: HoverProps    // spread on target element
}

function useHover(options?: HoverOptions): HoverState
```

### Usage

```tsx
import { useHover } from "@tge/renderer-solid"

function HoverCard(props: { children: any }) {
  const { hovered, hoverProps } = useHover({
    delay: 300,
    leaveDelay: 100,
    onEnter: () => console.log("entered"),
    onLeave: () => console.log("left"),
  })

  return (
    <box {...hoverProps}
      backgroundColor={hovered() ? "#333" : "#222"}
      padding={12} cornerRadius={8}
    >
      {props.children}
    </box>
  )
}
```

### Notes

- `hoverProps` includes `onMouseOver` and `onMouseOut`.
- The Tooltip component uses `useHover` internally for delayed show/hide.
- Delays are useful to prevent flicker when the pointer briefly leaves the element.

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
      backgroundColor={focused() ? colors.accent : colors.card}
      borderColor={focused() ? colors.ring : colors.border}
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

  return <Text color={colors.foreground}>{time().toLocaleTimeString()}</Text>
}
```
