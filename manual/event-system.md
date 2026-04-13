# Event System

> Expanded guide for TGE's event handling: press events, bubbling, keyboard, and mouse input. For the quick-reference version, see [developer-guide.md](./developer-guide.md#interaction-props).

TGE has a multi-layered event system. At the lowest level, raw terminal input is parsed into typed events. These events flow through the focus system, trigger interactive state changes, and bubble up the component tree like DOM events. This guide covers the complete event flow.

---

## PressEvent and onPress

`onPress` is the primary interaction handler. It fires on:
- **Mouse click** (release while hovering the element)
- **Enter/Space** when the element is focused

```tsx
<box
  focusable
  onPress={(event) => {
    console.log("pressed!")
  }}
  backgroundColor="#333"
  cornerRadius={8}
  padding={12}
>
  <text color="#fff">Click or press Enter</text>
</box>
```

### PressEvent type

```typescript
type PressEvent = {
  stopPropagation: () => void
  readonly propagationStopped: boolean
}
```

The event parameter is optional — you can write `onPress={() => doSomething()}` if you don't need to control propagation.

---

## Event Bubbling

`onPress` events bubble up the parent chain, exactly like DOM click events. When an element is pressed, TGE walks up the tree from the pressed node to the root, calling `onPress` on each ancestor that has one.

### The Bubbling Flow

```
mouse click detected
  → updateInteractiveStates detects release-while-hovered
    → create PressEvent
      → walk parent chain:
        → each node: set focus if focusable → call onPress(event) if present
        → stop if event.propagationStopped or reached root
```

### Bubbling in practice

```tsx
// Parent handles press even though the text has no onPress
<box focusable onPress={() => handleAction()} backgroundColor="#333" padding={12} cornerRadius={8}>
  <text color="#fff">Click anywhere in the box</text>
</box>
```

The `<text>` element has no `onPress`. When you click on the text, the event bubbles up to the parent `<box>`, which handles it. This is identical to how clicking a `<span>` inside a `<button>` works in the browser.

### Bubbling through multiple layers

```tsx
<box onPress={() => console.log("grandparent")} padding={16}>
  <box onPress={() => console.log("parent")} padding={12}>
    <box onPress={() => console.log("child")} padding={8}>
      <text color="#fff">Click me</text>
    </box>
  </box>
</box>
```

Clicking the text fires: `child` → `parent` → `grandparent` (bottom-up).

### stopPropagation

Call `event.stopPropagation()` to prevent the event from reaching ancestors:

```tsx
<box onPress={() => closePanel()} padding={16}>
  {/* Child stops propagation — parent's closePanel won't fire */}
  <box
    focusable
    onPress={(event) => {
      event?.stopPropagation()
      doAction()
    }}
    backgroundColor="#333"
    padding={12}
    cornerRadius={8}
  >
    <text color="#fff">Click me (parent won't fire)</text>
  </box>
</box>
```

**Common pattern — overlay with dismiss:**

```tsx
// Click overlay to close, but clicking content stops propagation
<box
  onPress={() => setOpen(false)}
  width="100%" height="100%"
  backgroundColor="#00000088"
  alignX="center" alignY="center"
>
  <box
    onPress={(e) => e?.stopPropagation()}
    backgroundColor="#1e1e2e"
    cornerRadius={14}
    padding={24}
    width={400}
  >
    <text color="#fafafa">Modal content — click here stays open</text>
    <text color="#888">Click outside to close</text>
  </box>
</box>
```

---

## Void Button and Bubbling

An important detail: The Void `Button` component (from `tge/void`) is a **purely visual** component. It does NOT handle `onPress` internally. To make it interactive, either:

**Option 1: Pass onPress to Void Button (if supported by your version)**

```tsx
import { Button } from "tge/void"

<Button variant="default" onPress={() => save()}>
  Save
</Button>
```

**Option 2: Wrap in a focusable box (event bubbles through Button)**

```tsx
import { Button } from "tge/void"

<box focusable onPress={() => save()}>
  <Button variant="default">Save</Button>
</box>
```

The headless `Button` from `tge/components` is different — it manages focus and calls your `onPress`:

```tsx
import { Button } from "tge/components"

<Button
  onPress={() => save()}
  renderButton={({ focused }) => (
    <box padding={8} backgroundColor={focused ? "#444" : "#333"} cornerRadius={6}>
      <text color="#fff">Save</text>
    </box>
  )}
/>
```

---

## onKeyDown

`onKeyDown` fires keyboard events when the element has focus.

```tsx
<box
  focusable
  onKeyDown={(event) => {
    if (event.key === "right") nextItem()
    if (event.key === "left") prevItem()
    if (event.key === "escape") close()
  }}
  backgroundColor="#333"
  padding={12}
  cornerRadius={8}
>
  <text color="#fff">Arrow keys to navigate, Escape to close</text>
</box>
```

### KeyEvent type

```typescript
type KeyEvent = {
  type: "key"
  key: string        // "a", "enter", "escape", "tab", "up", "down", "f1", etc.
  char?: string      // printable character (undefined for special keys)
  mods: {
    shift: boolean
    ctrl: boolean
    alt: boolean
    meta: boolean
  }
}
```

**Common key names:** `"a"`-`"z"`, `"0"`-`"9"`, `"enter"`, `"escape"`, `"tab"`, `"space"`, `"backspace"`, `"delete"`, `"up"`, `"down"`, `"left"`, `"right"`, `"home"`, `"end"`, `"pageup"`, `"pagedown"`, `"f1"`-`"f12"`.

### Modifier keys

```tsx
<box focusable onKeyDown={(e) => {
  if (e.key === "s" && e.mods.ctrl) saveFile()
  if (e.key === "z" && e.mods.ctrl && e.mods.shift) redo()
  if (e.key === "z" && e.mods.ctrl) undo()
}}>
  <text color="#fff">Editor</text>
</box>
```

---

## Global Input Hooks

TGE provides several hooks for listening to input events at different levels.

### onInput(handler) — Global Event Bus

Not a hook, not reactive. Registers a callback for ALL input events. Good for global hotkeys and side effects.

```tsx
import { onInput } from "tge"

const unsub = onInput((event) => {
  if (event.type === "key" && event.key === "q" && event.mods.ctrl) {
    process.exit(0)
  }
})

// Later: unsub() to unsubscribe
```

`onInput` fires for EVERY input event — before focus routing. Use it for app-level shortcuts that should work regardless of which element is focused.

### useKeyboard() — Reactive Keyboard Signal

Returns a reactive signal that updates on every keypress.

```tsx
import { useKeyboard } from "tge"

function StatusBar() {
  const kb = useKeyboard()

  return (
    <box direction="row" gap={8}>
      <text color="#666">Last key: {kb.key()?.key ?? "none"}</text>
      <text color="#666">
        {kb.key()?.mods.ctrl ? "Ctrl+" : ""}{kb.key()?.key ?? ""}
      </text>
    </box>
  )
}
```

**useKeyboard return type:**

```typescript
type KeyboardState = {
  key: () => KeyEvent | null       // last key event (reactive)
  pressed: (name: string) => boolean  // check if last key matches
}
```

### useMouse() — Reactive Mouse Signal

```tsx
import { useMouse } from "tge"

function CursorPosition() {
  const mouse = useMouse()

  return (
    <text color="#666" fontSize={12}>
      Mouse: {String(mouse.pos().x)}, {String(mouse.pos().y)}
    </text>
  )
}
```

**useMouse return type:**

```typescript
type MouseState = {
  mouse: () => MouseEvent | null
  pos: () => { x: number; y: number }   // cell coordinates
}
```

**MouseEvent type:**

```typescript
type MouseEvent = {
  type: "mouse"
  x: number          // column (0-indexed)
  y: number          // row (0-indexed)
  button: number     // 0=left, 1=middle, 2=right, 64=scrollUp, 65=scrollDown
  action: "press" | "release" | "move" | "scroll"
  mods: { shift: boolean; ctrl: boolean; alt: boolean; meta: boolean }
}
```

### useInput() — All Events

Returns a signal for ALL input events (key, mouse, paste, focus).

```tsx
import { useInput } from "tge"

function DebugInput() {
  const event = useInput()
  return <text color="#666">{JSON.stringify(event())}</text>
}
```

### When to Use Which

| Need | Use |
|------|-----|
| Global hotkeys, app-level shortcuts | `onInput()` |
| Reactive display of keyboard state | `useKeyboard()` |
| Reactive display of mouse state | `useMouse()` |
| Per-element keyboard handling | `onKeyDown` prop |
| Click/Enter interaction | `onPress` prop |
| All events as a signal | `useInput()` |

---

## Event Flow: From Terminal to JSX

The complete flow of an input event:

```
Terminal stdin
  → Raw bytes parsed by @tge/input
    → Typed event (KeyEvent | MouseEvent | PasteEvent | FocusEvent)
      → onInput() global callbacks fire (all subscribers)
        → useInput() / useKeyboard() / useMouse() signals update
          → Focus system routes to focused element:
            → onKeyDown fires on focused element
            → Tab/Shift+Tab triggers focus cycling
            → Enter/Space creates PressEvent → onPress + bubble
          → Mouse system:
            → Hover detection → hoverStyle application
            → Click detection → activeStyle application
            → Release-while-hovered → PressEvent → onPress + bubble
            → Click on focusable → setFocus
```

---

## Common Patterns

### Keyboard navigation in a custom list

```tsx
import { createSignal } from "solid-js"

function KeyboardList(props: { items: string[] }) {
  const [selected, setSelected] = createSignal(0)

  return (
    <box
      focusable
      onKeyDown={(e) => {
        if (e.key === "down" || e.key === "j") {
          setSelected(i => Math.min(i + 1, props.items.length - 1))
        }
        if (e.key === "up" || e.key === "k") {
          setSelected(i => Math.max(i - 1, 0))
        }
        if (e.key === "enter") {
          console.log("Selected:", props.items[selected()])
        }
      }}
      direction="column"
      focusStyle={{ borderColor: "#4488cc", borderWidth: 1 }}
    >
      {props.items.map((item, i) => (
        <box padding={4} backgroundColor={selected() === i ? "#2a2a4e" : "transparent"}>
          <text color={selected() === i ? "#fff" : "#888"}>{item}</text>
        </box>
      ))}
    </box>
  )
}
```

### Global Ctrl+Q quit handler

```tsx
import { onInput } from "tge"

// In your main() function, after mount:
onInput((event) => {
  if (event.type === "key" && event.key === "q" && event.mods.ctrl) {
    app.destroy()
    term.destroy()
    process.exit(0)
  }
})
```

### Combined mouse + keyboard interaction

```tsx
<box
  focusable
  onPress={() => toggleExpanded()}
  onKeyDown={(e) => {
    if (e.key === "right") expand()
    if (e.key === "left") collapse()
  }}
  hoverStyle={{ backgroundColor: "#2a2a3e" }}
  focusStyle={{ borderColor: "#4488cc", borderWidth: 1 }}
  padding={8}
  cornerRadius={6}
  backgroundColor="#1e1e2e"
>
  <text color="#e0e0e0">Click or use arrows</text>
</box>
```

---

## See Also

- [Interactivity and Focus](./interactivity-and-focus.md) — focus system, focusable prop, useFocus hook
- [Components (Headless)](./components-headless.md) — Button, Input, Select all use events internally
- [developer-guide.md](./developer-guide.md#interaction-props) — quick reference
