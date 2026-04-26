# Layout and Sizing

> Expanded guide for Vexart's layout system. For the quick-reference version, see [developer-guide.md](./developer-guide.md#layout-props).

Vexart uses Flexily, a pure JavaScript layout engine with a Yoga-compatible API, to compute the position and size of every element. Flexily implements a subset of CSS flexbox with microsecond performance. This guide covers every layout and sizing concept in depth, with web analogies where helpful.

---

## Direction: Column-First (Not Row)

The single most important difference from CSS flexbox:

| Framework | Default direction |
|-----------|------------------|
| CSS       | `row` (horizontal) |
| Vexart       | `column` (vertical) |

Terminals are vertical by nature — logs, menus, forms all stack top-to-bottom. Vexart follows that convention.

```tsx
// These are identical — column is the default
<box>
  <text color="#e0e0e0">First</text>
  <text color="#e0e0e0">Second</text>
  <text color="#e0e0e0">Third</text>
</box>

<box direction="column">
  <text color="#e0e0e0">First</text>
  <text color="#e0e0e0">Second</text>
  <text color="#e0e0e0">Third</text>
</box>
```

Use `direction="row"` for horizontal layout:

```tsx
<box direction="row" gap={8}>
  <text color="#e0e0e0">Left</text>
  <text color="#e0e0e0">Center</text>
  <text color="#e0e0e0">Right</text>
</box>
```

`flexDirection` is accepted as an alias for `direction`, for CSS familiarity:

```tsx
<box flexDirection="row" gap={8}>
  <text color="#e0e0e0">Works the same</text>
</box>
```

---

## Alignment: alignX and alignY

Vexart uses `alignX` (horizontal) and `alignY` (vertical) instead of CSS's `justify-content` / `align-items`. The mapping depends on direction.

### How alignX/alignY map to CSS

In a **column** layout (default):

| Vexart prop | CSS equivalent | What it controls |
|----------|---------------|-----------------|
| `alignX` | `align-items` | Cross-axis (horizontal placement of children) |
| `alignY` | `justify-content` | Main-axis (vertical distribution of children) |

In a **row** layout:

| Vexart prop | CSS equivalent | What it controls |
|----------|---------------|-----------------|
| `alignX` | `justify-content` | Main-axis (horizontal distribution) |
| `alignY` | `align-items` | Cross-axis (vertical placement) |

Think of it this way: **alignX always controls horizontal, alignY always controls vertical** — regardless of direction. This is simpler than CSS where `justify-content` and `align-items` swap meaning based on `flex-direction`.

### Values

| Value | Meaning |
|-------|---------|
| `"left"` / `"top"` | Pack to start (default) |
| `"right"` / `"bottom"` | Pack to end |
| `"center"` | Center on axis |
| `"space-between"` | Distribute with equal gaps, first/last flush to edges |

### Examples

```tsx
// Center everything (both axes)
<box width="100%" height="100%" alignX="center" alignY="center">
  <text color="#e0e0e0">Dead center</text>
</box>

// Header layout: title left, actions right
<box direction="row" width="100%" alignX="space-between" alignY="center" padding={16}>
  <text color="#fafafa" fontSize={18}>Dashboard</text>
  <text color="#888">Settings</text>
</box>

// Vertical list, items centered horizontally
<box direction="column" alignX="center" gap={8}>
  <text color="#e0e0e0">Item A</text>
  <text color="#e0e0e0">Item B</text>
  <text color="#e0e0e0">Item C</text>
</box>

// Bottom-right corner placement
<box width="100%" height="100%" alignX="right" alignY="bottom" padding={16}>
  <text color="#888">v1.2.3</text>
</box>
```

### CSS aliases

`justifyContent` and `alignItems` are accepted for familiarity. `flex-start` maps to `left`/`top`, `flex-end` maps to `right`/`bottom`:

```tsx
// CSS-style syntax — works identically
<box justifyContent="center" alignItems="center">
  <text color="#e0e0e0">Centered</text>
</box>

<box justifyContent="flex-end">
  <text color="#e0e0e0">Pushed right in row, bottom in column</text>
</box>
```

---

## Padding

Padding adds space inside the element, between its border and its children.

| Prop | What it does |
|------|-------------|
| `padding` | All four sides |
| `paddingX` | Left + right |
| `paddingY` | Top + bottom |
| `paddingLeft` | Left only |
| `paddingRight` | Right only |
| `paddingTop` | Top only |
| `paddingBottom` | Bottom only |

Specific props override general ones. `paddingLeft` takes precedence over `paddingX`, which takes precedence over `padding`.

```tsx
// Uniform padding
<box padding={16}>
  <text color="#e0e0e0">16px on all sides</text>
</box>

// Asymmetric — more horizontal space for a button feel
<box paddingX={24} paddingY={8} backgroundColor="#333" cornerRadius={6}>
  <text color="#fff">Click me</text>
</box>

// Card with extra top padding for a header
<box padding={16} paddingTop={24} backgroundColor="#1e1e2e" cornerRadius={12}>
  <text color="#fafafa" fontSize={18}>Title</text>
  <text color="#888">Body text</text>
</box>
```

---

## Gap

`gap` adds equal space between children. Like CSS `gap`, it only applies between children, not before the first or after the last.

```tsx
// Vertical list with 8px between items
<box direction="column" gap={8}>
  <text color="#e0e0e0">Item 1</text>
  <text color="#e0e0e0">Item 2</text>
  <text color="#e0e0e0">Item 3</text>
</box>

// Horizontal button group with 12px gaps
<box direction="row" gap={12}>
  <box padding={8} backgroundColor="#333" cornerRadius={6}>
    <text color="#fff">Cancel</text>
  </box>
  <box padding={8} backgroundColor="#4488cc" cornerRadius={6}>
    <text color="#fff">Save</text>
  </box>
</box>
```

**Web analogy:** Identical to CSS `gap` in flexbox.

---

## Sizing Modes

Vexart has four sizing modes, controlled via the `width` and `height` props.

### Fixed (number)

Exact pixel size. The element is always this size, regardless of content or parent.

```tsx
<box width={200} height={100} backgroundColor="#333" />
```

**Web analogy:** `width: 200px; height: 100px`

### Grow (string `"grow"`)

Fill all remaining space in the parent's main axis. Multiple growing children share space equally.

```tsx
// Sidebar + main content
<box direction="row" width="100%" height="100%">
  <box width={200} backgroundColor="#1a1a2e">
    <text color="#888">Sidebar</text>
  </box>
  <box width="grow" backgroundColor="#141414">
    <text color="#e0e0e0">Main content fills the rest</text>
  </box>
</box>

// Three equal columns
<box direction="row" width="100%" gap={8}>
  <box width="grow" backgroundColor="#1e1e2e" padding={8}>
    <text color="#e0e0e0">1/3</text>
  </box>
  <box width="grow" backgroundColor="#1e1e2e" padding={8}>
    <text color="#e0e0e0">1/3</text>
  </box>
  <box width="grow" backgroundColor="#1e1e2e" padding={8}>
    <text color="#e0e0e0">1/3</text>
  </box>
</box>
```

**Web analogy:** `flex: 1` or `flex-grow: 1`

### Fit (string `"fit"`)

Shrink-wrap to content size. This is the default behavior when no width/height is set.

```tsx
// Badge that sizes to its text
<box width="fit" backgroundColor="#333" paddingX={8} paddingY={4} cornerRadius={9999}>
  <text color="#fff" fontSize={12}>New</text>
</box>
```

**Web analogy:** `width: fit-content`

### Percentage (string like `"100%"`, `"50%"`)

Relative to the parent's size on that axis.

```tsx
// Full viewport
<box width="100%" height="100%" backgroundColor="#141414">
  <text color="#e0e0e0">Full screen</text>
</box>

// Half-width panel
<box width="50%" backgroundColor="#1e1e2e" padding={16}>
  <text color="#e0e0e0">Takes up half the parent</text>
</box>
```

**Web analogy:** `width: 50%`

---

## flexGrow and flexShrink

`flexGrow` is a numeric alternative to `width="grow"`:

```tsx
// These are equivalent
<box width="grow" />
<box flexGrow={1} />
```

`flexShrink` is accepted for CSS compatibility but rarely needed — Flexily handles shrinking automatically when content overflows.

---

## Constraints: min/max Width/Height

Constrain sizing without fixing it.

```tsx
// Content area: grows to fill, but never wider than 800px
<box width="grow" maxWidth={800} padding={16}>
  <text color="#e0e0e0">Readable content width</text>
</box>

// Sidebar: fits content, but at least 150px
<box width="fit" minWidth={150} backgroundColor="#1a1a2e" padding={12}>
  <text color="#888">Navigation</text>
</box>

// Card with min and max height
<box width="100%" minHeight={100} maxHeight={400} backgroundColor="#262626" cornerRadius={12} padding={16}>
  <text color="#e0e0e0">Adapts to content, within bounds</text>
</box>
```

**Web analogy:** Identical to CSS `min-width`, `max-width`, `min-height`, `max-height`.

---

## Stretch Emulation

CSS flexbox has `align-items: stretch` — children expand to fill the cross-axis by default. Flexily does NOT have stretch. Vexart emulates it:

When a child has **no explicit size** on the cross-axis, Vexart converts it to `GROW` on that axis. This means children fill the cross-axis automatically, matching the behavior web developers expect.

```tsx
// In a row, children with no explicit height stretch to fill the parent height
<box direction="row" height={100} gap={8}>
  <box width={100} backgroundColor="#333">
    {/* No height set — stretches to 100px (parent height) */}
    <text color="#fff">Fills height</text>
  </box>
  <box width={100} height={50} backgroundColor="#444">
    {/* Explicit height — stays at 50px */}
    <text color="#fff">Fixed 50px</text>
  </box>
</box>
```

If you DON'T want stretch behavior, set an explicit size or use `height="fit"`:

```tsx
<box direction="row" height={200} gap={8}>
  <box width={100} height="fit" backgroundColor="#333">
    <text color="#fff">Shrink-wraps to content</text>
  </box>
</box>
```

---

## Responsive Layout with useTerminalDimensions

Terminal windows resize. Vexart automatically re-layouts on resize, but you can also read dimensions reactively:

```tsx
import { useTerminalDimensions } from "@vexart/engine"
import { useAppTerminal } from "@vexart/app"

function ResponsiveApp() {
  const terminal = useAppTerminal()
  const dims = useTerminalDimensions(terminal)

  return (
    <box width="100%" height="100%" backgroundColor="#141414">
      {/* Switch layout based on terminal width */}
      <box direction={dims.width() > 800 ? "row" : "column"} gap={16} padding={16}>
        <box width={dims.width() > 800 ? 200 : "100%"} backgroundColor="#1a1a2e" padding={12}>
          <text color="#888">Sidebar</text>
        </box>
        <box width="grow" backgroundColor="#1e1e2e" padding={12}>
          <text color="#e0e0e0">Main</text>
          <text color="#666" fontSize={12}>
            {String(dims.width())}x{String(dims.height())} pixels, {String(dims.cols())}x{String(dims.rows())} cells
          </text>
        </box>
      </box>
    </box>
  )
}
```

**Available dimensions:**

| Getter | What |
|--------|------|
| `dims.width()` | Terminal width in pixels |
| `dims.height()` | Terminal height in pixels |
| `dims.cols()` | Column count |
| `dims.rows()` | Row count |
| `dims.cellWidth()` | Pixel width per cell |
| `dims.cellHeight()` | Pixel height per cell |

---

## Common Layout Patterns

### Holy grail layout (header, sidebar, content, footer)

```tsx
<box width="100%" height="100%" direction="column">
  {/* Header */}
  <box height={40} width="100%" backgroundColor="#1a1a2e" direction="row"
    alignX="space-between" alignY="center" paddingX={16}>
    <text color="#fafafa" fontSize={16}>My App</text>
    <text color="#888">v1.0</text>
  </box>

  {/* Body */}
  <box direction="row" width="100%" height="grow">
    {/* Sidebar */}
    <box width={180} backgroundColor="#1a1a2e" padding={12} gap={8}>
      <text color="#888">Home</text>
      <text color="#888">Settings</text>
    </box>

    {/* Main content */}
    <box width="grow" padding={16}>
      <text color="#e0e0e0">Content area</text>
    </box>
  </box>

  {/* Footer */}
  <box height={24} width="100%" backgroundColor="#1a1a2e" alignX="center" alignY="center">
    <text color="#666" fontSize={12}>Status: OK</text>
  </box>
</box>
```

### Centered card

```tsx
<box width="100%" height="100%" alignX="center" alignY="center" backgroundColor="#0a0a0a">
  <box width={400} backgroundColor="#1e1e2e" cornerRadius={14} padding={24} gap={12}>
    <text color="#fafafa" fontSize={20}>Welcome</text>
    <text color="#888">Sign in to continue</text>
  </box>
</box>
```

### Space-between with fixed + grow

```tsx
<box direction="row" width="100%" gap={8}>
  <box width="fit" paddingX={12} paddingY={6} backgroundColor="#333" cornerRadius={6}>
    <text color="#fff">Fixed</text>
  </box>
  <box width="grow" />  {/* Spacer */}
  <box width="fit" paddingX={12} paddingY={6} backgroundColor="#4488cc" cornerRadius={6}>
    <text color="#fff">Fixed</text>
  </box>
</box>
```

---

## Borders and borderBetweenChildren

Borders affect visual appearance but NOT layout size (they paint inside the element). `borderBetweenChildren` draws a divider between each child — useful for lists and menus:

```tsx
<box backgroundColor="#1e1e2e" cornerRadius={8} borderColor="#ffffff1a" borderWidth={1}
  borderBetweenChildren={1}>
  <box padding={8}><text color="#e0e0e0">Item 1</text></box>
  <box padding={8}><text color="#e0e0e0">Item 2</text></box>
  <box padding={8}><text color="#e0e0e0">Item 3</text></box>
</box>
```

---

## See Also

- [Visual Effects](./visual-effects.md) — shadows, gradients, backdrop blur
- [Interactivity and Focus](./interactivity-and-focus.md) — focusable elements, interactive styles
- [Theming](./theming.md) — design tokens for consistent spacing and sizing
- [developer-guide.md](./developer-guide.md#layout-props) — quick reference
