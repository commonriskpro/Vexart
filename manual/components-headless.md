# Components (Headless Architecture)

> Expanded guide for Vexart's component system. For the quick-reference version, see [developer-guide.md](./developer-guide.md#components-vexartheadless). For building custom theme packages, see [creating-theme-packages.md](./creating-theme-packages.md).

Vexart separates behavior from presentation using a headless architecture inspired by Radix UI and Headless UI. This guide explains the two patterns (render props and theme props), lists all 28 components with their APIs, and shows how to use them.

---

## The Two-Layer Architecture

```
@vexart/headless  →  Behavior only (focus, keyboard, state, ARIA-like semantics)
@vexart/styled    →  Pre-styled using Void design tokens
```

**Web analogy:**
- `@vexart/headless` = Radix Primitives / Headless UI
- `@vexart/styled` = shadcn/ui

You can use `@vexart/styled` for quick development, or use `@vexart/headless` directly for full visual control. You can also build your own theme package (see [creating-theme-packages.md](./creating-theme-packages.md)).

---

## Two Headless Patterns

### Pattern 1: Render Props (Interactive Components)

For components with simple visual output (Button, Checkbox, Switch, List, etc.), the headless component manages state and focus, and you provide a render function that receives the state.

```tsx
import { Button } from "vexart"

<Button
  onPress={() => save()}
  renderButton={({ focused, pressed, disabled }) => (
    <box
      backgroundColor={pressed ? "#444" : focused ? "#333" : "#222"}
      cornerRadius={6}
      padding={8}
      borderColor={focused ? "#4488cc" : "#555"}
      borderWidth={1}
    >
      <text color={disabled ? "#555" : "#fff"}>Save</text>
    </box>
  )}
/>
```

The component gives you state booleans. You return JSX. You control every pixel.

### Pattern 2: Theme Props (Content Components)

For complex content components (Code, Markdown, Diff, Textarea), there are too many visual elements for individual render props. Instead, they accept a `theme` object with typed color/spacing configuration.

```tsx
import { Code } from "vexart"
import { ONE_DARK } from "vexart/engine"

<Code
  content={`const x = 42;\nconsole.log(x);`}
  language="typescript"
  syntaxStyle={ONE_DARK}
  theme={{
    bg: "#1e1e2e",
    lineNumberFg: "#555",
    radius: 8,
    padding: 12,
  }}
/>
```

All theme fields are optional — sensible dark defaults are used for any field you don't specify.

---

## Complete Component Reference

### 1. Box

Layout container. Thin typed wrapper over the `<box>` intrinsic.

```tsx
import { Box } from "vexart"

<Box padding={16} backgroundColor="#1a1a2e" cornerRadius={12} gap={8}>
  <Text color="#e0e0e0">Hello</Text>
</Box>
```

### 2. Text

Text display with typed props.

```tsx
import { Text } from "vexart"

<Text color="#e0e0e0" fontSize={16} fontWeight={700}>Heading</Text>
```

### 3. ScrollView

Scrollable container with visual scrollbar. Content that overflows is clipped.

```tsx
import { ScrollView } from "vexart"

let scrollRef

<ScrollView
  ref={(h) => scrollRef = h}
  width={400}
  height={300}
  scrollY
  showScrollbar
  gap={4}
>
  {/* Children that overflow 300px are scrollable */}
</ScrollView>

// Programmatic: scrollRef.scrollTo(0), scrollRef.scrollBy(100)
```

**Keyboard:** Mouse wheel scrolls. Programmatic via `ScrollHandle`.

### 4. Button

Headless interactive button with focus and Enter/Space activation.

**Render context:** `{ focused: boolean, pressed: boolean, disabled: boolean, buttonProps: { focusable, onPress } }`

Spread `ctx.buttonProps` on the root element for automatic mouse click + keyboard support:

```tsx
import { Button } from "vexart"

<Button
  onPress={() => doAction()}
  disabled={isLoading()}
  renderButton={({ focused, pressed, disabled }) => (
    <box
      backgroundColor={disabled ? "#1a1a1a" : pressed ? "#444" : focused ? "#333" : "#222"}
      cornerRadius={6} padding={8}
      borderColor={focused ? "#4488cc" : "#555"} borderWidth={1}
    >
      <text color={disabled ? "#555" : "#fff"}>Click Me</text>
    </box>
  )}
/>
```

**Keyboard:** Tab to focus, Enter/Space to press.

### 5. Input

Headless single-line text input. Controlled component.

**Render context:** `{ value, displayText, showPlaceholder, cursor, blink, focused, disabled, selection }`

```tsx
import { Input } from "vexart"
import { createSignal } from "solid-js"

const [text, setText] = createSignal("")

<Input
  value={text()}
  onChange={setText}
  onSubmit={(v) => search(v)}
  placeholder="Search..."
  renderInput={(ctx) => (
    <box width={250} height={24} backgroundColor="#1e1e2e" cornerRadius={4}
      borderColor={ctx.focused ? "#4488cc" : "#444"} borderWidth={1} padding={4}>
      <text color={ctx.showPlaceholder ? "#666" : "#fff"}>{ctx.displayText}</text>
    </box>
  )}
/>
```

**Keyboard:** Arrows, Home/End, Backspace/Delete, Shift+arrows for selection, Ctrl+A, Enter to submit.

### 6. Textarea

Multi-line text editor with 2D cursor, syntax highlighting, extmarks, and key bindings.

**Pattern:** Theme prop

```tsx
import { Textarea } from "vexart"
import { ONE_DARK } from "vexart/engine"

const [code, setCode] = createSignal("")

<Textarea
  value={code()}
  onChange={setCode}
  width={600}
  height={400}
  syntaxStyle={ONE_DARK}
  language="typescript"
  theme={{ accent: "#4488cc", fg: "#e0e0e0", bg: "#1e1e2e", border: "#333", radius: 8, padding: 8, muted: "#666", disabledBg: "#111" }}
/>
```

**Keyboard:** Full editing — arrows, Home/End, Ctrl+Home/End, PgUp/PgDown, selection, Ctrl+Enter to submit.

**TextareaHandle (via ref):** `setText()`, `insertText()`, `clear()`, `gotoBufferEnd()`, `focus()`, `blur()`, `extmarks`.

### 7. Checkbox

Headless toggleable checkbox. Controlled.

**Render context:** `{ checked: boolean, focused: boolean, disabled: boolean, toggleProps: { focusable, onPress } }`

Spread `ctx.toggleProps` on the root element for click-to-toggle support:

```tsx
import { Checkbox } from "vexart"

<Checkbox
  checked={agreed()}
  onChange={setAgreed}
  renderCheckbox={({ checked, focused }) => (
    <box direction="row" gap={8} alignY="center">
      <box width={16} height={16} cornerRadius={3}
        backgroundColor={checked ? "#22c55e" : "#333"}
        borderColor={focused ? "#22c55e" : "#666"} borderWidth={1}>
        {checked ? <text color="#fff" fontSize={10}>x</text> : null}
      </box>
      <text color="#e0e0e0">I agree</text>
    </box>
  )}
/>
```

**Keyboard:** Tab to focus, Enter/Space to toggle.

### 8. Switch

Headless toggle switch. Controlled.

**Render context:** `{ checked: boolean, focused: boolean, disabled: boolean, toggleProps: { focusable, onPress } }`

Spread `ctx.toggleProps` on the root element for click-to-toggle support:

```tsx
import { Switch } from "vexart"

<Switch
  checked={darkMode()}
  onChange={setDarkMode}
  renderSwitch={({ checked, focused }) => (
    <box direction="row" gap={8} alignY="center">
      <box width={36} height={20} cornerRadius={10}
        backgroundColor={checked ? "#22c55e" : "#444"}
        borderColor={focused ? "#22c55e" : "transparent"} borderWidth={1}
        direction="row" alignX={checked ? "right" : "left"} padding={3}>
        <box width={14} height={14} cornerRadius={7} backgroundColor="#fff" />
      </box>
      <text color="#e0e0e0">Dark mode</text>
    </box>
  )}
/>
```

**Keyboard:** Tab to focus, Enter/Space to toggle.

### 9. RadioGroup

Headless radio button group with arrow key navigation.

**Render context:** `{ selected: boolean, focused: boolean, disabled: boolean, index: number, optionProps: { onPress } }`

Spread `ctx.optionProps` on each option element for click-to-select support:

```tsx
import { RadioGroup } from "vexart"

<RadioGroup
  value={size()}
  onChange={setSize}
  options={[
    { value: "sm", label: "Small" },
    { value: "md", label: "Medium" },
    { value: "lg", label: "Large" },
  ]}
  renderOption={(opt, ctx) => (
    <box direction="row" gap={8} alignY="center">
      <box width={16} height={16} cornerRadius={8}
        borderColor={ctx.selected ? "#4488cc" : "#555"} borderWidth={1}>
        {ctx.selected ? <box width={8} height={8} cornerRadius={4} backgroundColor="#4488cc" /> : null}
      </box>
      <text color={ctx.selected ? "#fff" : "#888"}>{opt.label}</text>
    </box>
  )}
/>
```

**Keyboard:** Tab to focus group, Up/Down/Left/Right/j/k to navigate, Enter/Space to confirm.

### 10. Select

Headless dropdown select with keyboard navigation.

**Trigger context:** `{ selectedLabel, placeholder, open, focused, disabled }`
**Option context:** `{ highlighted, selected, disabled }`

```tsx
import { Select } from "vexart"

<Select
  value={fruit()}
  onChange={setFruit}
  options={[
    { value: "apple", label: "Apple" },
    { value: "banana", label: "Banana" },
  ]}
  placeholder="Pick a fruit..."
  renderTrigger={(ctx) => (
    <box padding={8} borderColor={ctx.focused ? "#4488cc" : "#444"} borderWidth={1} cornerRadius={4}>
      <text color={ctx.selectedLabel ? "#fff" : "#666"}>
        {ctx.selectedLabel || ctx.placeholder}
      </text>
    </box>
  )}
  renderOption={(opt, ctx) => (
    <box padding={6} backgroundColor={ctx.highlighted ? "#333" : "transparent"}>
      <text color={ctx.selected ? "#4488cc" : "#e0e0e0"}>{opt.label}</text>
    </box>
  )}
/>
```

**Keyboard:** Tab to focus, Enter/Space to open, Up/Down to navigate, Enter to select, Escape to close.

**Mouse:** Click trigger to open/close. Click an option to select it.

### 11. Combobox

Headless autocomplete with text filtering.

**Input context:** `{ inputValue, placeholder, open, focused, disabled, selectedLabel }`
**Option context:** `{ highlighted, selected, disabled }`

```tsx
import { Combobox } from "vexart"

<Combobox
  value={country()}
  onChange={setCountry}
  options={countries}
  placeholder="Search countries..."
  renderInput={(ctx) => (
    <box padding={6} borderWidth={1} borderColor={ctx.focused ? "#4488cc" : "#444"} cornerRadius={4}>
      <text color={ctx.inputValue ? "#fff" : "#666"}>{ctx.inputValue || ctx.placeholder}</text>
    </box>
  )}
  renderOption={(opt, ctx) => (
    <box padding={4} backgroundColor={ctx.highlighted ? "#333" : "transparent"}>
      <text color="#e0e0e0">{opt.label}</text>
    </box>
  )}
  renderEmpty={() => <text color="#666">No results</text>}
/>
```

**Keyboard:** Type to filter, Up/Down to navigate, Enter to select, Escape to close.

**Mouse:** Click the input to open/close dropdown and grab focus for typing. Hover over options to highlight them. Click an option to select it.

### 12. Slider

Headless numeric range input.

**Render context:** `{ value, min, max, percentage, focused, disabled, trackProps, dragging }`

```tsx
import { Slider } from "vexart"

<Slider
  value={volume()}
  onChange={setVolume}
  min={0} max={100} step={1}
  renderSlider={(ctx) => (
    <box direction="row" gap={8} alignY="center">
      <box width={200} height={8} backgroundColor="#333" cornerRadius={4}>
        <box width={ctx.percentage * 2} height={8} backgroundColor="#4488cc" cornerRadius={4} />
      </box>
      <text color="#888" fontSize={12}>{String(ctx.value)}%</text>
    </box>
  )}
/>
```

**Keyboard:** Left/Right by step, PgUp/PgDown by large step, Home/End to min/max.

**Mouse:** Click the track to jump to that position. Drag to scrub continuously. The render context includes `trackProps` (spread onto the track element for mouse handling) and `dragging` (boolean, true while scrubbing).

```tsx
<Slider
  value={volume()}
  onChange={setVolume}
  min={0} max={100} step={1}
  renderSlider={(ctx) => (
    <box direction="row" gap={8} alignY="center">
      <box width={200} height={8} backgroundColor="#333" cornerRadius={4} {...ctx.trackProps}>
        <box width={ctx.percentage * 2} height={8} backgroundColor="#4488cc" cornerRadius={4} />
      </box>
      <text color={ctx.dragging ? "#fff" : "#888"} fontSize={12}>{String(ctx.value)}%</text>
    </box>
  )}
/>
```

### 13. Tabs

Headless tab switcher.

**Render context:** `{ active: boolean, focused: boolean, index: number, tabProps: { onPress } }`

Spread `ctx.tabProps` on each tab element for click-to-switch support:

```tsx
import { Tabs } from "vexart"

<Tabs
  activeTab={tab()}
  onTabChange={setTab}
  tabs={[
    { label: "General", content: () => <text color="#e0e0e0">General settings</text> },
    { label: "Advanced", content: () => <text color="#e0e0e0">Advanced settings</text> },
  ]}
  renderTab={(tab, ctx) => (
    <box padding={8} backgroundColor={ctx.active ? "#333" : "transparent"}>
      <text color={ctx.active ? "#fff" : "#888"}>{tab.label}</text>
    </box>
  )}
/>
```

**Keyboard:** Tab to focus tab bar, Left/Right to switch tabs.

### 14. List

Headless selectable list with Up/Down navigation.

**Render context:** `{ selected: boolean, focused: boolean, index: number, itemProps: { onPress } }`

Spread `ctx.itemProps` on each item element for click-to-select support:

```tsx
import { List } from "vexart"

<List
  items={["Alpha", "Beta", "Gamma"]}
  selectedIndex={idx()}
  onSelectedChange={setIdx}
  onSelect={(i) => console.log("picked:", i)}
  renderItem={(item, ctx) => (
    <box padding={4} backgroundColor={ctx.selected ? "#2a2a4e" : "transparent"}>
      <text color={ctx.selected ? "#fff" : "#aaa"}>{item}</text>
    </box>
  )}
/>
```

**Keyboard:** Up/Down/j/k to navigate, Enter to select.

### 15. Table

Headless data table with row selection.

**Cell context:** `{ selected: boolean, focused: boolean, rowIndex: number, rowProps: { onPress } }`

Spread `ctx.rowProps` on each row element for click-to-select support:

```tsx
import { Table } from "vexart"

<Table
  columns={[
    { key: "name", header: "Name", width: 120 },
    { key: "role", header: "Role", width: "grow" },
  ]}
  data={users()}
  selectedRow={selectedIdx()}
  onSelectedRowChange={setSelectedIdx}
  renderHeader={(col) => <text color="#888" fontSize={12}>{col.header}</text>}
  renderCell={(value, col, rowIdx, ctx) => (
    <text color={ctx.selected ? "#fff" : "#aaa"}>{String(value)}</text>
  )}
/>
```

**Keyboard:** Up/Down/j/k to navigate, Enter to select row.

### 16. ProgressBar

Headless progress indicator. No focus (pure visual).

**Render context:** `{ ratio, fillWidth, width, height, value, max }`

```tsx
import { ProgressBar } from "vexart"

<ProgressBar
  value={progress()} max={100} width={300}
  renderBar={({ fillWidth, width, height }) => (
    <box width={width} height={height} backgroundColor="#333" cornerRadius={6}>
      <box width={fillWidth} height={height} backgroundColor="#22c55e" cornerRadius={6} />
    </box>
  )}
/>
```

### 17. Dialog

Headless modal. Compound component with built-in focus trap.

```tsx
import { Dialog, Button } from "vexart"
import { Show } from "vexart/engine"
import { createSignal } from "solid-js"

const [open, setOpen] = createSignal(false)

<Show when={open()}>
  <Dialog onClose={() => setOpen(false)}>
    <Dialog.Overlay backgroundColor="#00000088" backdropBlur={4} />
    <Dialog.Content backgroundColor="#1e1e2e" cornerRadius={12} padding={20} width={400}>
      <text color="#fff" fontSize={18}>Confirm</text>
      <text color="#888">Are you sure?</text>
      <box direction="row" gap={8} paddingTop={16}>
        <Button onPress={() => setOpen(false)}
          renderButton={({ focused }) => (
            <box padding={8} cornerRadius={6} backgroundColor={focused ? "#333" : "#222"}>
              <text color="#fff">Cancel</text>
            </box>
          )}
        />
      </box>
    </Dialog.Content>
  </Dialog>
</Show>
```

**Keyboard:** Escape to close. Tab/Shift+Tab trapped within dialog.

**Mouse:** `Dialog.Overlay` accepts an `onClick` prop that wires to `onPress` on the overlay box. Pass `onClick={props.onClose}` to enable click-outside-to-close:

```tsx
<Dialog.Overlay backgroundColor="#00000088" backdropBlur={4} onClick={() => setOpen(false)} />
```

### 18. Tooltip

Headless delayed tooltip on hover.

```tsx
import { Tooltip } from "vexart"

<Tooltip
  content="Save your work (Ctrl+S)"
  placement="top"
  renderTooltip={(content) => (
    <box backgroundColor="#333" padding={4} cornerRadius={4}>
      <text color="#fff" fontSize={12}>{content}</text>
    </box>
  )}
>
  <text color="#4488cc">Save</text>
</Tooltip>
```

### 19. Popover

Headless controlled popover panel.

**Trigger context:** `{ open: boolean, toggle: () => void }`

```tsx
import { Popover } from "vexart"

<Popover
  open={menuOpen()}
  onOpenChange={setMenuOpen}
  placement="bottom"
  renderTrigger={(ctx) => (
    <box focusable onPress={() => ctx.toggle()}>
      <text color="#4488cc">Options...</text>
    </box>
  )}
  renderContent={() => (
    <box backgroundColor="#1e1e2e" cornerRadius={8} padding={8} gap={4}>
      <text color="#e0e0e0">Edit</text>
      <text color="#dc2626">Delete</text>
    </box>
  )}
/>
```

### 20. Toast / createToaster

Imperative toast notification system. Factory pattern.

```tsx
import { createToaster } from "vexart"

const { toast, Toaster } = createToaster({
  position: "bottom-right",
  maxVisible: 5,
  defaultDuration: 3000,
  renderToast: (t, dismiss) => (
    <box backgroundColor="#222" padding={8} cornerRadius={6} direction="row" gap={8}>
      <text color="#fff">{t.message}</text>
      <box focusable onPress={dismiss}><text color="#888">x</text></box>
    </box>
  ),
})

// Mount once: <Toaster />
// Fire: toast("Saved!") or toast({ message: "Error!", variant: "error" })
```

**ToastData:** `{ id, message, variant, duration, description? }`
**Variants:** `"default" | "success" | "error" | "warning" | "info"`

### 21. Router / Route / NavigationStack

Two navigation models.

**Flat routing** (dashboard-style):

```tsx
import { Router, Route, useRouterContext } from "vexart"

<Router initial="home">
  <Route path="home" component={HomeScreen} />
  <Route path="settings" component={SettingsScreen} />
</Router>

// Navigate: router.navigate("settings"), router.goBack()
```

**Stack routing** (wizard/drill-down):

```tsx
import { NavigationStack, useStack } from "vexart"

<NavigationStack initial={HomeScreen}>
  {(screen) => <box width="100%" height="100%">{screen()}</box>}
</NavigationStack>

// Navigate: stack.push(DetailScreen, { id: 42 }), stack.pop()
```

### 22. VirtualList

Virtualized list for large datasets. Only renders visible items. Supports keyboard navigation (Up/Down/j/k, PgUp/PgDown, Home/End, Enter to select) and mouse interaction (hover highlighting, click to select). Mouse events are handled at the container level using absolute coordinates — no per-item callbacks needed.

**Render context:** `{ selected: boolean, highlighted: boolean, hovered: boolean, index: number }`

```tsx
import { VirtualList } from "vexart"

<VirtualList
  items={allUsers}           // 100K+ items
  itemHeight={24}
  height={400}
  overscan={5}
  selectedIndex={selectedIdx()}
  onSelect={setSelectedIdx}
  renderItem={(user, index, ctx) => (
    <box height={24} padding={4}
      backgroundColor={ctx.selected ? "#2a2a4e" : ctx.hovered ? "#333" : "transparent"}>
      <text color={ctx.selected ? "#fff" : "#aaa"}>{user.name}</text>
    </box>
  )}
/>
```

**Keyboard:** Up/Down/j/k to navigate, PgUp/PgDown for pages, Home/End to jump, Enter to select.

**Mouse:** Hover to highlight items, click to select. The VirtualList handles mouse events at the container level — `onMouseMove` computes the hovered item index from absolute mouse position + scroll offset. No per-item interaction props needed.

### 23. Portal

Renders children in a separate compositing layer above everything.

```tsx
import { Portal } from "vexart"

<Portal>
  <box width="100%" height="100%" backgroundColor="#000000aa"
    alignX="center" alignY="center">
    <text color="#fff">Above everything</text>
  </box>
</Portal>
```

**Web analogy:** `ReactDOM.createPortal(children, document.body)`.

### 24. Code

Syntax-highlighted code block with tree-sitter tokenization.

**Pattern:** Theme prop

```tsx
import { Code } from "vexart"
import { ONE_DARK } from "vexart/engine"

<Code
  content={sourceCode}
  language="typescript"
  syntaxStyle={ONE_DARK}
  width={600}
  theme={{ bg: "#1e1e2e", lineNumberFg: "#555", radius: 8, padding: 12 }}
/>
```

### 25. Markdown

Markdown renderer with inline styling.

**Pattern:** Theme prop

```tsx
import { Markdown } from "vexart"
import { ONE_DARK } from "vexart/engine"

<Markdown
  content={readmeText}
  syntaxStyle={ONE_DARK}
  width={600}
  theme={{ fg: "#e0e0e0", heading: "#56d4c8", codeBg: "#2c313a" }}
/>
```

### 26. Diff

Unified diff viewer with per-line coloring and syntax highlighting.

**Pattern:** Theme prop

```tsx
import { Diff } from "vexart"

<Diff
  diff={unifiedDiff}
  syntaxStyle={ONE_DARK}
  filetype="typescript"
  width={600}
  theme={{ addedBg: "#1a3a1a", removedBg: "#3a1a1a" }}
/>
```

### 27. RichText / Span

Multi-span inline text for mixed styling.

```tsx
import { RichText, Span } from "vexart"

<RichText color="#e0e0e0">
  <Span>Hello </Span>
  <Span color="#4488cc" fontWeight={700}>world</Span>
  <Span> from Vexart</Span>
</RichText>
```

### 28. WrapRow

Flex-wrap workaround (Flexily doesn't support `flexWrap`). Manually computes row breaks.

```tsx
import { WrapRow } from "vexart"

<WrapRow width={400} itemWidth={80} gap={8}>
  {tags.map((tag) => (
    <box width={80} padding={4} backgroundColor="#333" cornerRadius={4}>
      <text color="#fff" fontSize={12}>{tag}</text>
    </box>
  ))}
</WrapRow>
```

---

## createForm — Form Validation

Factory function for reactive form state with validation. NOT a component — it returns a handle.

```tsx
import { createForm, Input, Button } from "vexart"
import { Show } from "vexart/engine"

const form = createForm({
  initialValues: { name: "", email: "" },
  validate: {
    name: (v) => v.length < 2 ? "Too short" : undefined,
    email: (v) => !v.includes("@") ? "Invalid" : undefined,
  },
  onSubmit: async (values) => { await register(values) },
})

// form.values.name()   — reactive getter
// form.errors.name()   — reactive error
// form.touched.name()  — reactive touched state
// form.setValue("name", "Alice")
// form.submit()
// form.reset()
// form.isValid()
```

---

## Quick Reference: Component to Pattern

| Component | Pattern | Render prop / Theme key |
|-----------|---------|------------------------|
| Button | Render prop | `renderButton(ctx)` |
| Checkbox | Render prop | `renderCheckbox(ctx)` |
| Switch | Render prop | `renderSwitch(ctx)` |
| Input | Render prop | `renderInput(ctx)` |
| List | Render prop | `renderItem(item, ctx)` |
| Tabs | Render prop | `renderTab(tab, ctx)` |
| RadioGroup | Render prop | `renderOption(opt, ctx)` |
| Select | Render prop | `renderTrigger(ctx)` + `renderOption(opt, ctx)` |
| Combobox | Render prop | `renderInput(ctx)` + `renderOption(opt, ctx)` |
| Slider | Render prop | `renderSlider(ctx)` |
| ProgressBar | Render prop | `renderBar(ctx)` |
| Table | Render prop | `renderCell(value, col, idx, ctx)` |
| Tooltip | Render prop | `renderTooltip(content)` |
| Popover | Render prop | `renderTrigger(ctx)` + `renderContent()` |
| VirtualList | Render prop | `renderItem(item, index, ctx)` |
| Toast | Factory | `createToaster({ renderToast })` |
| Code | Theme prop | `theme: Partial<CodeTheme>` |
| Markdown | Theme prop | `theme: Partial<MarkdownTheme>` |
| Diff | Theme prop | `theme: Partial<DiffTheme>` |
| Textarea | Theme prop | `theme: Partial<TextareaTheme>` |
| Dialog | Compound | `Dialog.Overlay` + `Dialog.Content` + `Dialog.Close` |
| Router | Pure logic | No visual |
| Portal | Pass-through | Renders children as-is |
| Box / Text | Typed wrapper | Direct props |
| ScrollView | Typed wrapper | Direct props |
| RichText / Span | Direct | Direct props |
| WrapRow | Layout helper | Direct props |

---

## See Also

- [creating-theme-packages.md](./creating-theme-packages.md) — build your own theme on top of headless components
- [Event System](./event-system.md) — onPress, PressEvent, keyboard events
- [Interactivity and Focus](./interactivity-and-focus.md) — focus system used by all interactive components
- [developer-guide.md](./developer-guide.md#components-vexartheadless) — quick reference
