# Components

TGE provides 9 built-in components. All interactive components follow a **controlled** pattern — the parent owns state via SolidJS signals.

```typescript
import { Box, Text, Button, Input, Checkbox, Tabs, List, ProgressBar, ScrollView } from "@tge/components"
```

---

## Box

The primary layout container. Equivalent to a `<div>` — handles sizing, padding, alignment, colors, borders, shadows, and glow.

### Props

```typescript
type BoxProps = {
  // Layout
  direction?: "row" | "column"       // Default: "row"
  padding?: number                    // All sides (pixels)
  paddingX?: number                   // Horizontal padding
  paddingY?: number                   // Vertical padding
  gap?: number                        // Gap between children (pixels)
  alignX?: "left" | "right" | "center"
  alignY?: "top" | "bottom" | "center"

  // Sizing
  width?: number | string             // px or "100%"
  height?: number | string            // px or "100%"

  // Visual
  backgroundColor?: string | number   // Hex string ("#1a1a26") or packed u32
  cornerRadius?: number               // Border radius in pixels
  borderColor?: string | number
  borderWidth?: number

  // Effects
  shadow?: ShadowConfig               // Drop shadow
  glow?: GlowConfig                   // Glow effect

  // Compositing
  layer?: boolean                     // Promote to own Kitty image layer

  // Scrolling
  scrollX?: boolean
  scrollY?: boolean
  scrollSpeed?: number                // Lines per scroll tick

  children?: JSX.Element
}
```

### Shadow Config

```typescript
type ShadowConfig = {
  x: number       // Horizontal offset (pixels)
  y: number       // Vertical offset (pixels)
  blur: number    // Blur radius (pixels)
  color: number   // Shadow color (packed RGBA u32)
}
```

Shadows are rendered in an isolated temporary buffer, blurred, then composited — so they never corrupt neighboring pixels.

### Glow Config

```typescript
type GlowConfig = {
  radius: number       // Glow spread (pixels)
  color: number        // Glow color (packed RGBA u32)
  intensity?: number   // 0–100, default 80
}
```

### Examples

```tsx
// Simple card
<Box padding={16} backgroundColor={surface.card} cornerRadius={radius.lg}>
  <Text color={text.primary}>Card content</Text>
</Box>

// Row layout with gap
<Box direction="row" gap={8}>
  <Box width={50} height={50} backgroundColor={accent.thread} />
  <Box width={50} height={50} backgroundColor={accent.anchor} />
  <Box width={50} height={50} backgroundColor={accent.signal} />
</Box>

// Centered content
<Box width="100%" height="100%" alignX="center" alignY="center">
  <Text>Centered!</Text>
</Box>

// With shadow
<Box padding={16} backgroundColor={surface.card} cornerRadius={12} shadow={shadow.elevated}>
  <Text>Elevated card</Text>
</Box>

// With glow
<Box padding={16} backgroundColor={surface.card} cornerRadius={12}
  glow={{ radius: 20, color: accent.thread, intensity: 60 }}>
  <Text>Glowing card</Text>
</Box>

// With border
<Box padding={16} backgroundColor={surface.card} cornerRadius={8}
  borderColor={border.normal} borderWidth={1}>
  <Text>Bordered card</Text>
</Box>

// Own compositing layer (only retransmits when dirty)
<Box layer padding={16} backgroundColor={surface.card}>
  <Text>{counter()}</Text>
</Box>
```

---

## Text

Renders text using the embedded bitmap font (SF Mono 14px).

### Props

```typescript
type TextProps = {
  color?: string | number     // Hex string or packed u32
  fontSize?: number           // Font size (currently only 14px atlas available)
  fontId?: number             // Font atlas ID
  children?: JSX.Element      // Text content (string)
}
```

### Examples

```tsx
<Text color={text.primary}>Primary text</Text>
<Text color={text.muted}>Muted description</Text>
<Text color={accent.thread}>Accent colored</Text>
<Text color="#4fc4d4">Hex color</Text>

// Dynamic text (reactive)
<Text color={text.primary}>Count: {count()}</Text>
```

### Notes

- Text is monospace (SF Mono). Each character is 9px wide, 17px tall at the default 14px size.
- Text content comes from `children`. It must be a string or a reactive expression that resolves to a string.

---

## Button

Interactive push button with focus management and keyboard activation.

### Props

```typescript
type ButtonVariant = "solid" | "outline" | "ghost"

type ButtonProps = {
  onPress?: () => void             // Callback on Enter/Space
  variant?: ButtonVariant          // Default: "solid"
  color?: number                   // Accent color (packed u32). Default: accent.thread
  disabled?: boolean               // Grayed out, not focusable
  focusId?: string                 // Custom focus ID
  children?: JSX.Element           // Button label (string)
}
```

### Variants

| Variant | Appearance |
|---------|-----------|
| `solid` | Filled background with accent color |
| `outline` | Transparent with accent-colored border |
| `ghost` | Transparent, text-only, border on focus |

### Interaction

- **Tab / Shift+Tab** — Focus cycling
- **Enter / Space** — Activates the button
- Visual press feedback (100ms flash)

### Examples

```tsx
<Button onPress={() => console.log("clicked!")}>Save</Button>
<Button variant="outline" color={accent.signal}>Cancel</Button>
<Button variant="ghost">Skip</Button>
<Button disabled>Locked</Button>

// Multiple buttons with Tab cycling
<Box direction="row" gap={8}>
  <Button onPress={handleSave}>Save</Button>
  <Button variant="outline" onPress={handleCancel}>Cancel</Button>
</Box>
```

---

## Input

Text input field with full keyboard editing, cursor, selection, and paste support.

### Props

```typescript
type InputProps = {
  value: string                        // Current value (CONTROLLED)
  onChange?: (value: string) => void    // Value change callback
  onSubmit?: (value: string) => void   // Enter key callback
  placeholder?: string                 // Placeholder text
  width?: number                       // Width in pixels. Default: 200
  color?: number                       // Accent color. Default: accent.thread
  disabled?: boolean
  focusId?: string
}
```

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Printable characters | Insert at cursor |
| Backspace | Delete before cursor |
| Delete | Delete after cursor |
| Left / Right | Move cursor |
| Home / End | Jump to start / end |
| Shift + Left/Right/Home/End | Select text |
| Ctrl+A | Select all |
| Ctrl+V / Bracketed paste | Insert clipboard |
| Enter | Calls `onSubmit` |

### Examples

```tsx
import { createSignal } from "solid-js"

// Basic input
const [name, setName] = createSignal("")
<Input value={name()} onChange={setName} placeholder="Your name..." />

// With submit handler
const [email, setEmail] = createSignal("")
<Input
  value={email()}
  onChange={setEmail}
  onSubmit={(val) => console.log("Submitted:", val)}
  placeholder="email@example.com"
  width={300}
/>

// Multiple inputs (Tab cycles between them)
<Box direction="column" gap={8}>
  <Input value={first()} onChange={setFirst} placeholder="First name" />
  <Input value={last()} onChange={setLast} placeholder="Last name" />
  <Button onPress={handleSubmit}>Submit</Button>
</Box>
```

---

## Checkbox

Toggleable checkbox with optional label.

### Props

```typescript
type CheckboxProps = {
  checked: boolean                     // Current state (CONTROLLED)
  onChange?: (checked: boolean) => void // Toggle callback
  label?: string                       // Label text next to checkbox
  color?: number                       // Accent color. Default: accent.thread
  disabled?: boolean
  focusId?: string
}
```

### Interaction

- **Tab / Shift+Tab** — Focus cycling
- **Enter / Space** — Toggle checked state

### Examples

```tsx
const [agreed, setAgreed] = createSignal(false)

<Checkbox checked={agreed()} onChange={setAgreed} label="I agree to the terms" />

// Multiple checkboxes
<Box direction="column" gap={4}>
  <Checkbox checked={opt1()} onChange={setOpt1} label="Option 1" color={accent.thread} />
  <Checkbox checked={opt2()} onChange={setOpt2} label="Option 2" color={accent.green} />
  <Checkbox checked={opt3()} onChange={setOpt3} label="Option 3" color={accent.signal} />
</Box>
```

---

## Tabs

Tab switcher with panel content. Only the active panel renders.

### Props

```typescript
type TabItem = {
  label: string                    // Tab header label
  content: () => JSX.Element       // Panel content (lazy render function)
}

type TabsProps = {
  activeTab: number                // Active tab index (CONTROLLED)
  onTabChange?: (index: number) => void
  tabs: TabItem[]                  // Tab definitions
  color?: number                   // Accent color. Default: accent.thread
  focusId?: string
}
```

### Interaction

- **Tab / Shift+Tab** — Focus the tab bar
- **Left / Right** — Switch between tabs

### Examples

```tsx
const [tab, setTab] = createSignal(0)

<Tabs
  activeTab={tab()}
  onTabChange={setTab}
  tabs={[
    { label: "Overview", content: () => <Text>Overview panel</Text> },
    { label: "Details",  content: () => <Text>Details panel</Text> },
    { label: "Settings", content: () => (
      <Box direction="column" gap={4}>
        <Checkbox checked={dark()} onChange={setDark} label="Dark mode" />
        <Checkbox checked={sound()} onChange={setSound} label="Sound" />
      </Box>
    )},
  ]}
/>
```

---

## List

Selectable list with keyboard navigation.

### Props

```typescript
type ListProps = {
  items: string[]                           // List items
  selectedIndex: number                     // Currently selected (CONTROLLED)
  onSelectedChange?: (index: number) => void // Selection change
  onSelect?: (index: number) => void        // Enter key on item
  color?: number                            // Accent color. Default: accent.thread
  focusId?: string
}
```

### Interaction

- **Tab / Shift+Tab** — Focus the list
- **Up / Down / j / k** — Navigate items
- **Enter** — Select current item (calls `onSelect`)

### Examples

```tsx
const [idx, setIdx] = createSignal(0)
const items = ["Dashboard", "Settings", "Profile", "Logout"]

<List
  items={items}
  selectedIndex={idx()}
  onSelectedChange={setIdx}
  onSelect={(i) => navigate(items[i])}
/>
```

---

## ProgressBar

Horizontal progress indicator. No focus/interaction — purely visual.

### Props

```typescript
type ProgressBarProps = {
  value: number             // Current value (clamped to [0, max])
  max?: number              // Maximum value. Default: 100
  color?: number            // Fill color. Default: accent.thread
  trackColor?: number       // Track color. Default: surface.context
  width?: number            // Width in pixels. Default: 200
  height?: number           // Height in pixels. Default: 12
}
```

### Examples

```tsx
// Simple progress
<ProgressBar value={75} />

// Custom max and color
<ProgressBar value={3} max={10} color={accent.green} />

// Animated progress (reactive)
const [progress, setProgress] = createSignal(0)
setInterval(() => setProgress(p => Math.min(p + 1, 100)), 100)
<ProgressBar value={progress()} width={300} />

// Download indicator
<Box direction="column" gap={4}>
  <Text color={text.muted}>Downloading... {downloaded()}MB / {total()}MB</Text>
  <ProgressBar value={downloaded()} max={total()} color={accent.anchor} width={250} />
</Box>
```

---

## ScrollView

Scrollable container with SCISSOR clipping. Content that overflows is clipped and scrollable.

### Props

```typescript
type ScrollViewProps = {
  width?: number | string
  height?: number | string
  scrollX?: boolean                  // Enable horizontal scroll
  scrollY?: boolean                  // Enable vertical scroll
  scrollSpeed?: number               // Lines per scroll tick
  backgroundColor?: string | number
  cornerRadius?: number
  borderColor?: string | number
  borderWidth?: number
  direction?: "row" | "column"
  padding?: number
  paddingX?: number
  paddingY?: number
  gap?: number
  alignX?: "left" | "right" | "center"
  alignY?: "top" | "bottom" | "center"
  children?: JSX.Element
}
```

### Notes

- Automatically promoted to its own compositing layer
- Uses Clay's built-in scroll offset tracking
- Clipping is done via SCISSOR commands — content outside the viewport is not painted

### Examples

```tsx
// Vertical scroll
<ScrollView width={400} height={300} scrollY direction="column" gap={4}>
  <For each={items()}>
    {(item) => (
      <Box padding={8} backgroundColor={surface.card}>
        <Text color={text.primary}>{item.name}</Text>
      </Box>
    )}
  </For>
</ScrollView>

// Log viewer
<ScrollView width="100%" height={200} scrollY backgroundColor={surface.panel}>
  <For each={logs()}>
    {(line) => <Text color={text.muted}>{line}</Text>}
  </For>
</ScrollView>
```

---

## Component Patterns

### Controlled Components

All interactive components are **controlled** — the parent owns state:

```tsx
// The parent creates the signal
const [value, setValue] = createSignal("")

// The component reads and writes through props
<Input value={value()} onChange={setValue} />
```

This matches the SolidJS reactive model. The component never holds internal state for values — it reads from `value` and calls `onChange` to request changes.

### Focus Management

Interactive components use `useFocus()` internally. The focus ring cycles through components in registration order:

```
Tab → Button 1 → Input 1 → Checkbox 1 → Input 2 → Button 2 → (wrap to Button 1)
Shift+Tab → reverse
```

The focused component receives keyboard events through its `onKeyDown` handler. Non-focused components ignore keyboard input.

### Compositing Layers

Add `layer` to any `<Box>` to promote it to its own Kitty image:

```tsx
<Box layer backgroundColor={surface.card}>
  <Text>{liveCounter()}</Text>
</Box>
```

When the counter updates, only this box's layer retransmits to the terminal. All other boxes remain in GPU VRAM. This is critical for performance when you have expensive static content and small dynamic regions.
