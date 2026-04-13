# Interactivity and Focus

> Expanded guide for TGE's focus system and interactive styles. For the quick-reference version, see [developer-guide.md](./developer-guide.md#interactive-states).

TGE has a built-in focus management system that works like the browser's tabindex and :focus/:hover/:active pseudo-classes. This guide covers the focusable prop, interactive styles, Tab cycling, the useFocus hook, focus scopes (traps), and how focus interacts with mouse input.

---

## The `focusable` Prop

The simplest way to make an element interactive. Adding `focusable` to a `<box>` registers it in the global focus ring.

```tsx
<box
  focusable
  backgroundColor="#262626"
  cornerRadius={8}
  padding={12}
>
  <text color="#fafafa">Tab to focus me</text>
</box>
```

**Web analogy:** `tabindex="0"` on a `<div>`.

What `focusable` does:
1. Registers the element in the focus ring (Tab/Shift+Tab cycling)
2. The element can receive keyboard events via `onKeyDown`
3. The element can receive press events via `onPress`
4. Mouse click on the element automatically sets focus
5. `focusStyle` becomes active when the element has focus
6. On component cleanup, the element is automatically unregistered

---

## Declarative Interactive Styles

TGE provides three style override props that merge visual properties based on interaction state. No signals or manual tracking needed — the engine handles hover, active, and focus detection internally.

| Prop | When active | Web equivalent |
|------|------------|----------------|
| `hoverStyle` | Pointer is over the element | CSS `:hover` |
| `activeStyle` | Element is being pressed (mousedown) | CSS `:active` |
| `focusStyle` | Element has keyboard focus | CSS `:focus` |

### Available properties in interactive styles

All three props accept the same partial set of visual properties:

- `backgroundColor`
- `borderColor`
- `borderWidth`
- `cornerRadius`
- `borderRadius` (alias for cornerRadius)
- `shadow` / `boxShadow`
- `glow`
- `gradient`
- `backdropBlur`
- `backdropBrightness`
- `backdropContrast`
- `backdropSaturate`
- `backdropGrayscale`
- `backdropInvert`
- `backdropSepia`
- `backdropHueRotate`
- `opacity`

### Basic hover/active example

```tsx
<box
  backgroundColor="#262626"
  cornerRadius={8}
  padding={12}
  hoverStyle={{ backgroundColor: "#333333" }}
  activeStyle={{ backgroundColor: "#444444" }}
>
  <text color="#fafafa">Hover and click me</text>
</box>
```

**What happens:**
- Default: background is `#262626`
- Mouse enters: background becomes `#333333`
- Mouse button down: background becomes `#444444`
- Mouse button up: returns to hover style `#333333`
- Mouse leaves: returns to default `#262626`

### Focus ring with glow

```tsx
<box
  focusable
  backgroundColor="#262626"
  cornerRadius={14}
  borderColor="#ffffff1a"
  borderWidth={1}
  padding={16}
  focusStyle={{
    borderColor: "#4488cc",
    borderWidth: 2,
    glow: { radius: 16, color: 0x4488cc80, intensity: 50 },
  }}
>
  <text color="#fafafa">Tab to see focus ring</text>
</box>
```

### Complete interactive card

```tsx
<box
  focusable
  onPress={() => console.log("pressed!")}
  backgroundColor="#1e1e2e"
  cornerRadius={12}
  padding={16}
  borderColor="#ffffff1a"
  borderWidth={1}
  shadow={{ x: 0, y: 2, blur: 8, color: 0x00000030 }}
  hoverStyle={{
    backgroundColor: "#262636",
    shadow: { x: 0, y: 4, blur: 12, color: 0x00000050 },
  }}
  activeStyle={{
    backgroundColor: "#2a2a3a",
    shadow: { x: 0, y: 1, blur: 4, color: 0x00000030 },
  }}
  focusStyle={{
    borderColor: "#4488cc",
    borderWidth: 2,
  }}
>
  <text color="#fafafa">Interactive card</text>
  <text color="#888">Click, hover, or Tab to focus</text>
</box>
```

### Style priority

When multiple states are active simultaneously:

```
Base styles < hoverStyle < activeStyle < focusStyle
```

If you're hovering AND pressing AND focused, all three merge with later ones overriding earlier ones. focusStyle has the highest priority.

---

## Tab/Shift+Tab Focus Cycling

Focusable elements form a ring in registration order (order they appear in the JSX tree). Tab moves forward, Shift+Tab moves backward.

```tsx
<box direction="column" gap={8}>
  {/* Tab order: 1 → 2 → 3 → 1 → ... */}
  <box focusable padding={8} backgroundColor="#333"
    focusStyle={{ borderColor: "#4488cc", borderWidth: 2 }}>
    <text color="#fff">First</text>
  </box>

  <box focusable padding={8} backgroundColor="#333"
    focusStyle={{ borderColor: "#4488cc", borderWidth: 2 }}>
    <text color="#fff">Second</text>
  </box>

  <box focusable padding={8} backgroundColor="#333"
    focusStyle={{ borderColor: "#4488cc", borderWidth: 2 }}>
    <text color="#fff">Third</text>
  </box>
</box>
```

**Auto-focus:** The first registered focusable element receives focus automatically. No `autoFocus` prop needed.

---

## Mouse Click Sets Focus

When you click a focusable element, it receives focus automatically. This mirrors browser behavior:

```tsx
<box focusable onPress={() => doAction()} backgroundColor="#333"
  focusStyle={{ borderColor: "#4488cc", borderWidth: 2 }}>
  <text color="#fff">Click me — I'll get focus too</text>
</box>
```

If you click a non-focusable element, the `onPress` event bubbles up to the nearest focusable parent (see [Event System](./event-system.md)).

---

## `useFocus()` Hook vs `focusable` Prop

TGE provides two ways to make things focusable. Use the right one for the right job.

### When to use `focusable` (simple cases)

Use the `focusable` prop when:
- You just need Tab cycling and visual focus styles
- Your interaction is limited to `onPress` and `onKeyDown`
- You don't need programmatic focus control

```tsx
<box
  focusable
  onPress={() => save()}
  onKeyDown={(e) => { if (e.key === "escape") cancel() }}
  focusStyle={{ borderColor: "#4488cc", borderWidth: 2 }}
  padding={12} cornerRadius={8} backgroundColor="#333"
>
  <text color="#fff">Save</text>
</box>
```

### When to use `useFocus()` (advanced cases)

Use the `useFocus()` hook when:
- You need a reactive `focused()` signal for conditional rendering
- You need the `focus()` method for programmatic focus
- You're building a custom interactive component
- You need the focus ID for external reference

```tsx
import { useFocus, Show } from "tge"

function SearchInput(props: { onSearch: (q: string) => void }) {
  const { focused, focus, id } = useFocus({
    onKeyDown: (e) => {
      if (e.key === "escape") blur()
    },
  })

  return (
    <box
      padding={8}
      cornerRadius={6}
      backgroundColor={focused() ? "#2a2a3e" : "#1e1e2e"}
      borderColor={focused() ? "#4488cc" : "#333"}
      borderWidth={1}
    >
      <text color={focused() ? "#fff" : "#666"}>
        {focused() ? "Type to search..." : "Press / to search"}
      </text>
      <Show when={focused()}>
        <text color="#333" fontSize={12}>ESC to close</text>
      </Show>
    </box>
  )
}
```

**useFocus return value:**

| Property | Type | Description |
|----------|------|-------------|
| `focused` | `() => boolean` | Reactive signal — true when this element has focus |
| `focus` | `() => void` | Programmatically set focus to this element |
| `id` | `string` | The auto-generated or custom focus ID |

**useFocus options:**

```typescript
useFocus({
  id?: string,                         // override auto-generated ID
  onKeyDown?: (event: KeyEvent) => void,  // keyboard events when focused
  onPress?: (event?: PressEvent) => void, // Enter/Space activation
})
```

---

## Focus Scopes (Focus Traps)

`pushFocusScope()` creates a focus trap — Tab/Shift+Tab only cycles within the scope. Previous focus state is saved and restored when the scope is popped.

```tsx
import { pushFocusScope } from "tge"
import { onCleanup } from "solid-js"

function Modal(props: { children: any; onClose: () => void }) {
  // Create focus trap — Tab only cycles within modal
  const popScope = pushFocusScope()
  onCleanup(popScope)  // restore previous scope on unmount

  return (
    <box
      floating="root"
      zIndex={999}
      width="100%"
      height="100%"
      backgroundColor="#00000088"
      alignX="center"
      alignY="center"
    >
      <box backgroundColor="#1e1e2e" cornerRadius={14} padding={24}>
        {props.children}
      </box>
    </box>
  )
}
```

**Web analogy:** The `inert` attribute on background content + a focus-trap library. The Dialog component uses `pushFocusScope()` internally, so you get this for free with `<Dialog>`.

**How it works:**
1. `pushFocusScope()` saves the current focus ring and focus ID
2. A new empty focus ring starts — only focusables registered AFTER this call are included
3. Tab/Shift+Tab cycles within the new ring only
4. When the returned cleanup function is called, the previous ring and focus are restored

---

## Focus Cleanup

When a focusable element unmounts (component cleanup), TGE automatically:
1. Unregisters it from the focus ring
2. If it was focused, moves focus to the next element
3. Cleans up any subtree focus registrations (via `removeNode` → `unregisterSubtree`)

You don't need to manually unregister — SolidJS cleanup handles it.

---

## Combining Focus with Interactive Styles

A complete pattern for an interactive component with all states:

```tsx
function ActionButton(props: { label: string; onPress: () => void; variant?: "primary" | "danger" }) {
  const isPrimary = () => (props.variant ?? "primary") === "primary"

  return (
    <box
      focusable
      onPress={props.onPress}
      backgroundColor={isPrimary() ? "#1a365d" : "#3b1111"}
      cornerRadius={8}
      paddingX={16}
      paddingY={10}
      borderColor="#ffffff15"
      borderWidth={1}

      hoverStyle={{
        backgroundColor: isPrimary() ? "#1e4080" : "#4a1515",
        shadow: { x: 0, y: 2, blur: 8, color: 0x00000040 },
      }}

      activeStyle={{
        backgroundColor: isPrimary() ? "#234fa0" : "#5a1919",
        shadow: { x: 0, y: 1, blur: 3, color: 0x00000020 },
      }}

      focusStyle={{
        borderColor: isPrimary() ? "#4488cc" : "#ff4444",
        borderWidth: 2,
        glow: {
          radius: 12,
          color: isPrimary() ? 0x4488cc60 : 0xff444460,
          intensity: 40,
        },
      }}
    >
      <text color="#fafafa">{props.label}</text>
    </box>
  )
}
```

---

## Focus with setFocus / focusedId

For external focus control, use `setFocus()` and `focusedId()`:

```tsx
import { setFocus, focusedId } from "tge"

// Focus a specific element by ID
setFocus("save-button")

// Read the currently focused element's ID (reactive)
const currentFocus = focusedId()
```

To set a stable focus ID, use the `useFocus` hook with a custom ID or the `focusId` prop on headless components:

```tsx
import { Button } from "tge/components"

<Button
  focusId="save-button"
  onPress={() => save()}
  renderButton={({ focused }) => (
    <box padding={8} backgroundColor={focused ? "#444" : "#333"} cornerRadius={6}>
      <text color="#fff">Save</text>
    </box>
  )}
/>
```

---

## Interaction Debugging

Use `focusedId()` to display which element has focus:

```tsx
import { focusedId } from "tge"

function DebugBar() {
  return (
    <box height={20} width="100%" backgroundColor="#1a1a2e" paddingX={8} alignY="center">
      <text color="#666" fontSize={10}>Focus: {focusedId() ?? "none"}</text>
    </box>
  )
}
```

---

## See Also

- [Event System](./event-system.md) — onPress, PressEvent, event bubbling
- [Visual Effects](./visual-effects.md) — shadow, glow, gradient (used in interactive styles)
- [Components (Headless)](./components-headless.md) — Button, Input, Dialog use focus internally
- [Animations](./animations.md) — animate focus transitions
- [developer-guide.md](./developer-guide.md#interactive-states) — quick reference
