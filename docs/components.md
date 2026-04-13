# Components

TGE provides 28 built-in components across two packages.

- **`@tge/components`** — Truly headless. Behavior only, zero visual coupling. Use render props or theme props to provide all styling.
- **`@tge/void`** — Styled design system. Built on top of the headless layer.

```typescript
import { Box, Text, Button, Input, Checkbox, Tabs, List, ProgressBar, ScrollView,
         Dialog, Select, Switch, RadioGroup, Table, createToaster, Router, Route, NavigationStack,
         Tooltip, Popover, Combobox, Slider, VirtualList, createForm } from "@tge/components"
```

---

## Box

The primary layout container. Equivalent to a `<div>` — handles sizing, padding, alignment, colors, borders, shadows, glow, backdrop filters, and interactive states.

```tsx
// Card with shadow and focus
<box
  padding={16}
  backgroundColor="#1a1a2e"
  cornerRadius={12}
  shadow={{ x: 0, y: 4, blur: 12, color: 0x00000060 }}
  focusable
  focusStyle={{ borderColor: "#4488cc", borderWidth: 2 }}
  onPress={() => select()}
/>
```

### Visual Props

| Prop | Type | Notes |
|------|------|-------|
| `backgroundColor` | `string \| number` | `"#ff0000"` or `0xff0000ff` |
| `cornerRadius` | `number` | Uniform radius (alias: `borderRadius`) |
| `cornerRadii` | `{ tl, tr, br, bl }` | Per-corner radius |
| `borderColor` | `string \| number` | — |
| `borderWidth` | `number` | Uniform border |
| `opacity` | `number` | 0.0-1.0, element-level opacity |
| `shadow` | `object \| array` | Drop shadow(s) — color must be u32 |
| `glow` | `{ radius, color, intensity? }` | Outer glow |
| `gradient` | linear or radial config | Gradient fill |
| `backdropBlur` | `number` | Glassmorphism blur |
| `backdropBrightness` | `number` | 0=black, 100=unchanged, 200=2x |
| `backdropContrast` | `number` | 0=grey, 100=unchanged, 200=high |
| `backdropSaturate` | `number` | 0=grayscale, 100=unchanged |
| `backdropGrayscale` | `number` | 0=unchanged, 100=full grayscale |
| `backdropInvert` | `number` | 0=unchanged, 100=fully inverted |
| `backdropSepia` | `number` | 0=unchanged, 100=full sepia |
| `backdropHueRotate` | `number` | 0-360 degrees |

### Interactive State Props

```tsx
<box
  backgroundColor="#1e1e2e"
  hoverStyle={{ backgroundColor: "#2a2a3e" }}
  activeStyle={{ backgroundColor: "#3a3a4e" }}
  focusStyle={{ borderColor: "#4488cc", borderWidth: 2 }}
  focusable
  onPress={() => save()}
  onKeyDown={(e) => handleKey(e)}
/>
```

All three style objects accept: `backgroundColor`, `borderColor`, `borderWidth`, `cornerRadius`, `borderRadius`, `shadow`, `boxShadow`, `glow`, `gradient`, `backdropBlur`, `backdropBrightness`, `backdropContrast`, `backdropSaturate`, `backdropGrayscale`, `backdropInvert`, `backdropSepia`, `backdropHueRotate`, `opacity`.

### Event Bubbling

`onPress` events bubble up the parent node chain like DOM click events. If the clicked node doesn't have `onPress`, the event walks up to the nearest ancestor that does. Each handler receives a `PressEvent`.

> **Note:** Per-node mouse events (`onMouseDown`, `onMouseUp`, `onMouseMove`, `onMouseOver`, `onMouseOut`) do NOT bubble. They dispatch directly to the target node only. Only `onPress` bubbles.

```tsx
// Parent handles click — Button has no onPress, event bubbles to parent box
<box focusable onPress={() => handleAction()}>
  <Button>Click me</Button>
</box>

// Child stops propagation — parent never fires
<box onPress={() => closePanel()}>
  <box onPress={(e) => { e?.stopPropagation(); doAction() }}>
    <text>Click me (parent won't fire)</text>
  </box>
</box>
```

---

## Text

Renders text using the embedded bitmap font.

```tsx
<text color="#e0e6f0">Primary text</text>
<text color={themeColors.mutedForeground} fontSize={12}>Muted description</text>
<text color="#fff">Count: {count()}</text>
```

---

## Button (headless)

Interactive push button. Render props pattern — zero visual output.

```tsx
<Button
  onPress={() => save()}
  disabled={loading()}
  renderButton={({ focused, pressed, disabled }) => (
    <box
      backgroundColor={pressed ? "#333" : focused ? "#252535" : "#1e1e2e"}
      cornerRadius={6}
      padding={8}
      paddingX={16}
      borderColor={focused ? "#4488cc" : "#333"}
      borderWidth={focused ? 2 : 1}
      opacity={disabled ? 0.5 : 1}
    >
      <text color="#fff">Save</text>
    </box>
  )}
/>
```

For a styled version, use `@tge/void`'s `Button`.

---

## Input (headless)

Single-line text input with cursor, selection, and paste support.

```tsx
<Input
  value={name()}
  onChange={setName}
  onSubmit={handleSubmit}
  placeholder="Your name..."
  renderInput={({ displayText, showPlaceholder, focused }) => (
    <box
      width={240}
      padding={8}
      borderColor={focused ? "#4488cc" : "#333"}
      borderWidth={focused ? 2 : 1}
      cornerRadius={6}
    >
      <text color={showPlaceholder ? "#666" : "#fff"}>{displayText}</text>
    </box>
  )}
/>
```

### Keyboard shortcuts

| Key | Action |
|-----|--------|
| Printable chars | Insert at cursor |
| Backspace / Delete | Delete before/after cursor |
| Left / Right | Move cursor |
| Home / End | Jump to start/end |
| Shift + Left/Right/Home/End | Select |
| Ctrl+A | Select all |
| Ctrl+V / bracketed paste | Insert clipboard |
| Enter | Calls `onSubmit` |

---

## Textarea (headless)

Multi-line editor with 2D cursor, syntax highlighting, and configurable keybindings.

```tsx
<Textarea
  value={content()}
  onChange={setContent}
  language="typescript"
  theme={{ accent: "#4488cc", fg: "#e0e6f0", bg: "#1e1e2e" }}
/>
```

---

## Checkbox (headless)

Toggleable checkbox. Render prop pattern.

```tsx
<Checkbox
  checked={agreed()}
  onChange={setAgreed}
  renderCheckbox={({ checked, focused, disabled }) => (
    <box direction="row" gap={8} alignY="center">
      <box
        width={16} height={16}
        backgroundColor={checked ? "#4488cc" : "transparent"}
        borderColor={focused ? "#4488cc" : "#555"}
        borderWidth={2}
        cornerRadius={3}
      />
      <text color="#fff">I agree to the terms</text>
    </box>
  )}
/>
```

---

## Switch (headless)

Toggle switch. Render prop pattern.

```tsx
<Switch
  checked={dark()}
  onChange={setDark}
  renderSwitch={({ checked, focused }) => (
    <box direction="row" gap={8} alignY="center">
      <box
        width={36} height={20}
        backgroundColor={checked ? "#4488cc" : "#333"}
        cornerRadius={10}
        borderColor={focused ? "#6aacec" : "transparent"}
        borderWidth={focused ? 2 : 0}
      >
        <box
          width={14} height={14}
          backgroundColor="#fff"
          cornerRadius={7}
          paddingLeft={checked ? 19 : 3}
          paddingTop={3}
        />
      </box>
      <text color="#fff">Dark mode</text>
    </box>
  )}
/>
```

---

## RadioGroup (headless)

Radio option group. Render prop pattern.

```tsx
<RadioGroup
  value={selected()}
  onChange={setSelected}
  options={[
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
    { value: "system", label: "System" },
  ]}
  renderOption={(option, { selected, focused }) => (
    <box direction="row" gap={8} alignY="center" padding={4}>
      <box
        width={16} height={16}
        borderColor={focused ? "#4488cc" : "#555"}
        borderWidth={2}
        cornerRadius={8}
        backgroundColor={selected ? "#4488cc" : "transparent"}
      />
      <text color="#fff">{option.label}</text>
    </box>
  )}
/>
```

---

## Select (headless)

Dropdown select with keyboard navigation.

```tsx
<Select
  value={fruit()}
  onChange={setFruit}
  options={fruits}
  placeholder="Pick a fruit…"
  renderTrigger={(ctx) => (
    <box padding={8} borderColor={ctx.focused ? "#4488cc" : "#333"} borderWidth={1} cornerRadius={6}>
      <text color="#fff">{ctx.selectedLabel ?? ctx.placeholder}</text>
    </box>
  )}
  renderOption={(opt, ctx) => (
    <box
      backgroundColor={ctx.highlighted ? "#333" : "transparent"}
      padding={6}
    >
      <text color={ctx.selected ? "#4488cc" : "#fff"}>{opt.label}</text>
    </box>
  )}
  renderContent={(children) => (
    <box backgroundColor="#1a1a2e" cornerRadius={6} borderColor="#333" borderWidth={1}>
      {children}
    </box>
  )}
/>
```

### Keyboard

| Key | Action |
|-----|--------|
| Enter / Space | Open / select highlighted |
| Up / Down (or j/k) | Navigate options |
| Escape | Close without selecting |

**Mouse:** Click trigger to open/close. Click an option to select it.

---

## Combobox (headless)

Autocomplete input + filterable dropdown. Phase 3.

```tsx
<Combobox
  value={value()}
  onChange={setValue}
  options={countries}
  placeholder="Search countries…"
  renderInput={(ctx) => (
    <box padding={8} borderColor={ctx.focused ? "#4488cc" : "#333"} borderWidth={1} cornerRadius={6}>
      <text color={ctx.inputValue ? "#fff" : "#666"}>
        {ctx.inputValue || ctx.placeholder}
      </text>
    </box>
  )}
  renderOption={(opt, ctx) => (
    <box backgroundColor={ctx.highlighted ? "#252535" : "transparent"} padding={6}>
      <text color={ctx.selected ? "#4488cc" : "#fff"}>{opt.label}</text>
    </box>
  )}
  renderContent={(children) => (
    <box backgroundColor="#1a1a2e" cornerRadius={6} borderColor="#333" borderWidth={1} maxHeight={200} scrollY>
      {children}
    </box>
  )}
/>
```

Typing filters options. Enter selects. Escape closes and clears query.

**Mouse:** Click an option to select it. Click the input to toggle the dropdown.

---

## Slider (headless)

Numeric range input. Phase 3.

```tsx
<Slider
  value={volume()}
  onChange={setVolume}
  min={0} max={100} step={1}
  renderSlider={({ value, percentage, focused }) => (
    <box direction="column" gap={4}>
      <box
        width={200} height={8}
        backgroundColor="#333"
        cornerRadius={4}
        borderColor={focused ? "#4488cc" : "transparent"}
        borderWidth={focused ? 2 : 0}
      >
        <box
          width={`${percentage}%`}
          height={8}
          backgroundColor="#4488cc"
          cornerRadius={4}
        />
      </box>
      <text color="#999" fontSize={12}>{value}%</text>
    </box>
  )}
/>
```

### Keyboard

| Key | Action |
|-----|--------|
| Right / Up (or l/k) | Increment by step |
| Left / Down (or h/j) | Decrement by step |
| Page Up / Page Down | Large step (10x step) |
| Home / End | Min / Max |

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
      <text color="#888" fontSize={12}>{ctx.value}%</text>
    </box>
  )}
/>
```

---

## ProgressBar (headless)

Horizontal fill indicator. No interaction.

```tsx
<ProgressBar
  value={75}
  max={100}
  renderBar={({ ratio, fillWidth, width, height }) => (
    <box width={width} height={height} backgroundColor="#222" cornerRadius={4}>
      <box width={fillWidth} height={height} backgroundColor="#4488cc" cornerRadius={4} />
    </box>
  )}
/>
```

---

## Tabs (headless)

Tab switcher. Only the active panel renders.

```tsx
<Tabs
  activeTab={tab()}
  onTabChange={setTab}
  tabs={[
    { label: "General", content: () => <GeneralPanel /> },
    { label: "Advanced", content: () => <AdvancedPanel /> },
  ]}
  renderTab={(tab, ctx) => (
    <box
      padding={8}
      borderBottom={ctx.active ? 2 : 0}
      borderColor={ctx.active ? "#4488cc" : "transparent"}
    >
      <text color={ctx.active ? "#4488cc" : "#999"}>{tab.label}</text>
    </box>
  )}
/>
```

---

## List (headless)

Selectable list with keyboard navigation.

```tsx
<List
  items={["Dashboard", "Settings", "Profile", "Logout"]}
  selectedIndex={idx()}
  onSelectedChange={setIdx}
  onSelect={(i) => navigate(items[i])}
  renderItem={(item, ctx) => (
    <box
      backgroundColor={ctx.selected ? "#252535" : "transparent"}
      padding={6}
      paddingX={12}
    >
      <text color={ctx.selected ? "#fff" : "#999"}>{item}</text>
    </box>
  )}
/>
```

---

## Table (headless)

Data table with row selection.

```tsx
<Table
  columns={[
    { key: "name", header: "Name", width: 120 },
    { key: "status", header: "Status", width: 80 },
  ]}
  rows={users()}
  selectedIndex={selected()}
  onSelect={setSelected}
  renderCell={(value, col, rowIndex, ctx) => (
    <box backgroundColor={ctx.selected ? "#252535" : "transparent"} padding={6}>
      <text color={ctx.selected ? "#fff" : "#ccc"}>{String(value)}</text>
    </box>
  )}
/>
```

---

## VirtualList (headless)

Virtualized list — only renders visible items. For lists with thousands of entries. Phase 3.

```tsx
<VirtualList
  items={allUsers}          // Full array — all 10,000 items
  itemHeight={32}           // Fixed height per item (required)
  height={400}              // Visible viewport height
  overscan={5}              // Extra items above/below viewport
  renderItem={(item, index, ctx) => (
    <box
      height={32}
      padding={6}
      backgroundColor={ctx.highlighted ? "#252535" : "transparent"}
    >
      <text color="#fff">{item.name}</text>
    </box>
  )}
  onSelect={(index) => setSelected(index)}
/>
```

Only `itemHeight × overscan × 2` items are mounted at any time, regardless of list length.

---

## Dialog (headless)

Modal dialog with focus trap, Escape to close, and focus restore on unmount.

```tsx
<Show when={isOpen()}>
  <Dialog onClose={() => setOpen(false)}>
    <Dialog.Overlay backgroundColor="#00000088" backdropBlur={8} />
    <Dialog.Content
      backgroundColor="#1a1a2e"
      cornerRadius={12}
      padding={24}
      width={400}
    >
      <text color="#fff">Are you sure?</text>
      <box direction="row" gap={8}>
        <box focusable onPress={() => { confirm(); setOpen(false) }}>
          <text color="#fff">Confirm</text>
        </box>
        <box focusable onPress={() => setOpen(false)}>
          <text color="#999">Cancel</text>
        </box>
      </box>
    </Dialog.Content>
  </Dialog>
</Show>
```

- Tab/Shift+Tab cycles ONLY within the dialog (focus trap via `pushFocusScope`)
- Escape calls `onClose`
- On close, focus returns to the previously focused element

---

## Tooltip (headless)

Floating tooltip on hover. Phase 3.

```tsx
<Tooltip
  content="Save your work"
  showDelay={500}
  renderTooltip={(content) => (
    <box backgroundColor="#333" padding={6} cornerRadius={4}>
      <text color="#fff" fontSize={12}>{content}</text>
    </box>
  )}
>
  <box focusable onPress={save}>
    <text>Save</text>
  </box>
</Tooltip>
```

---

## Popover (headless)

Controlled floating panel. Phase 3.

```tsx
<Popover
  open={open()}
  onOpenChange={setOpen}
  renderTrigger={(ctx) => (
    <box focusable onPress={ctx.toggle}>
      <text>Open menu</text>
    </box>
  )}
  renderContent={() => (
    <box backgroundColor="#1a1a2e" padding={12} cornerRadius={8} borderColor="#333" borderWidth={1}>
      <text>Popover content</text>
    </box>
  )}
/>
```

---

## ScrollView

Scrollable container with scissor clipping.

```tsx
<ScrollView height={300} scrollY direction="column" gap={4}>
  <For each={items()}>
    {(item) => <text color="#fff">{item.name}</text>}
  </For>
</ScrollView>
```

---

## Toast (factory)

Imperative notification system.

```tsx
const toaster = createToaster({
  position: "bottom-right",
  defaultDuration: 3000,
  renderToast: (t, dismiss) => (
    <box
      backgroundColor="#1a1a2e"
      cornerRadius={8}
      padding={12}
      minWidth={240}
    >
      <text color={t.variant === "error" ? "#ff4444" : "#fff"}>{t.message}</text>
    </box>
  ),
})

// Render the container (once, near root)
<toaster.Toaster />

// Fire toasts imperatively
toaster.toast({ message: "Saved!", variant: "success" })
toaster.toast({ message: "Failed to save", variant: "error" })
```

---

## Router (flat + stack)

### Flat Router (React Router style)

```tsx
<Router initialPath="home">
  <Route path="home" component={Home} />
  <Route path="settings" component={Settings} />
  <Route path="profile" component={Profile} />
</Router>

// Navigate
const ctx = useRouterContext()
ctx.navigate("settings")
ctx.goBack()
```

### Navigation Stack (React Navigation style)

```tsx
<NavigationStack initial={Home} />

// Navigate
const stack = useStack()
stack.push(Settings, { section: "privacy" })
stack.pop()
```

---

## createForm

Reactive form validation factory. Phase 3.

```tsx
const form = createForm({
  initialValues: { name: "", email: "", age: 18 },
  validate: {
    name: (v) => v.length < 2 ? "Too short" : undefined,
    email: (v) => !v.includes("@") ? "Invalid email" : undefined,
    age: (v) => v < 18 ? "Must be 18+" : undefined,
  },
  validateAsync: {
    email: async (v) => {
      const taken = await checkEmailTaken(v)
      return taken ? "Email already in use" : undefined
    },
  },
  onSubmit: async (values) => {
    await saveUser(values)
    toaster.toast({ message: "Saved!", variant: "success" })
  },
})

// JSX
<box direction="column" gap={8}>
  <Input
    value={form.values.name()}
    onChange={(v) => form.setValue("name", v)}
    onBlur={() => form.setTouched("name")}
    placeholder="Name"
  />
  <Show when={form.errors.name() && form.touched.name()}>
    <text color="#ff4444">{form.errors.name()}</text>
  </Show>

  <box focusable onPress={form.submit} opacity={form.submitting() ? 0.5 : 1}>
    <text>{form.submitting() ? "Saving..." : "Submit"}</text>
  </box>
</box>
```

### FormHandle API

| Property/Method | Type | Description |
|----------------|------|-------------|
| `values.field` | `() => T` | Reactive field value |
| `errors.field` | `() => string \| undefined` | Reactive error message |
| `touched.field` | `() => boolean` | Whether field was blurred |
| `dirty.field` | `() => boolean` | Whether value differs from initial |
| `setValue(field, value)` | `void` | Update a field value |
| `setTouched(field)` | `void` | Mark field as touched + run validation |
| `setError(field, error)` | `void` | Set error manually |
| `isValid()` | `boolean` | True if no fields have errors |
| `submitting()` | `boolean` | True while onSubmit is running |
| `submit()` | `void` | Validate all fields, then call onSubmit |
| `reset()` | `void` | Reset to initialValues, clear errors/touched |
| `getValues()` | `T` | Get plain object of current values |

---

## Code / Markdown / Diff / RichText

Content components with theme prop pattern.

```tsx
<Code
  content={codeString}
  language="typescript"
  theme={{ bg: "#1a1a2e", lineNumberFg: "#555", radius: 8, padding: 12 }}
/>

<Markdown
  content={markdownString}
  theme={{ fg: "#e0e6f0", heading: "#4fc4d4", codeBg: "#252535" }}
/>

<Diff
  diff={diffString}
  view="unified"
  theme={{ addedBg: "#1a3a1a", removedBg: "#3a1a1a" }}
/>
```

---

## Portal

Render children at the root level (above all other content).

```tsx
<Portal>
  <box width="100%" height="100%" alignX="center" alignY="center">
    <text>I render on top of everything</text>
  </box>
</Portal>
```

---

## Component Patterns

### Headless Architecture

All interactive components in `@tge/components` provide **behavior only**:

| Pattern | Components | You provide |
|---------|-----------|-------------|
| Render props | Button, Checkbox, Switch, Input, List, Tabs, RadioGroup, Select, ProgressBar, Combobox, Slider, VirtualList, Table | `renderX(ctx) → JSX` |
| Theme prop | Code, Markdown, Diff, Textarea | `theme: ThemeType` object |
| Factory | Toast | `renderToast(toast, dismiss) → JSX` |
| Compound | Dialog | Wrap `Dialog.Overlay`/`Dialog.Content`/`Dialog.Close` |

### Focusable `<box>`

Any `<box>` can be made focusable without using components:

```tsx
<box
  focusable
  backgroundColor="#1e1e2e"
  focusStyle={{ borderColor: "#4488cc", borderWidth: 2 }}
  hoverStyle={{ backgroundColor: "#252535" }}
  activeStyle={{ backgroundColor: "#303050" }}
  onPress={() => activate()}
  onKeyDown={(e) => { if (e.key === "delete") remove() }}
>
  <text>Press me</text>
</box>
```

### Controlled Components

All interactive components are **controlled** — the parent owns state:

```tsx
const [value, setValue] = createSignal("")
<Input value={value()} onChange={setValue} placeholder="..." />
```

### Focus Ring

Tab/Shift+Tab cycles through focusable elements in registration order. Components register automatically when mounted and unregister on cleanup.
