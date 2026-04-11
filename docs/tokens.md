# Design Tokens

TGE includes a built-in dark theme ("Void Black") with semantic tokens for colors, spacing, border radius, and shadows.

```typescript
import { palette, surface, accent, text, border, spacing, radius, shadow } from "@tge/tokens"
import { rgba, pack, alpha } from "@tge/tokens"
```

---

## Color System

All colors are packed as `u32` RGBA values (`0xRRGGBBAA`). This is the native format used by the Zig paint engine — no conversion overhead.

### Color Utilities

```typescript
// Unpack u32 to [r, g, b, a] tuple
const [r, g, b, a] = rgba(0x4fc4d4ff)  // [79, 196, 212, 255]

// Pack [r, g, b, a] to u32
const color = pack(0x4f, 0xc4, 0xd4, 0xff)  // 0x4fc4d4ff

// Modify alpha channel (0x00 = transparent, 0xff = opaque)
const semi = alpha(0x4fc4d4ff, 0x80)  // 50% opacity cyan
```

### Why u32?

Components also accept hex strings (`"#4fc4d4"`) for convenience — they're converted to u32 internally. But using u32 directly is faster (no parsing). The token system exports u32 values for this reason.

---

## Raw Palette

The base color palette. These are the raw colors — use semantic tokens below for most cases.

```typescript
const palette = {
  void:         0x04040aff,   // #04040a — Deepest black
  surface:      0x0a0a12ff,   // #0a0a12 — Base surface
  raised:       0x0e0e18ff,   // #0e0e18 — Raised surface
  elevated:     0x14141fff,   // #14141f — Elevated surface
  floating:     0x1a1a26ff,   // #1a1a26 — Floating surface

  borderWeak:   0x181c2aff,   // #181c2a — Subtle border
  borderBase:   0x222838ff,   // #222838 — Normal border
  borderStrong: 0x303850ff,   // #303850 — Strong border
  borderFocus:  0x3e4a68ff,   // #3e4a68 — Focus ring

  muted:        0x52587aff,   // #52587a — Muted text
  text:         0xc8cedeff,   // #c8cede — Normal text
  bright:       0xe0e6f0ff,   // #e0e6f0 — Bright text

  thread:       0x4fc4d4ff,   // #4fc4d4 — Cyan/teal (primary accent)
  anchor:       0x4088ccff,   // #4088cc — Blue
  signal:       0xc8a040ff,   // #c8a040 — Gold
  drift:        0xa8483eff,   // #a8483e — Red/rust
  purple:       0x6b5a9aff,   // #6b5a9a — Purple
  green:        0x5cb878ff,   // #5cb878 — Green
  yellow:       0xb8a850ff,   // #b8a850 — Yellow

  transparent:  0x00000000,   // Fully transparent
}
```

---

## Semantic Tokens

### Surface

Background colors for different elevation levels.

```typescript
const surface = {
  void:     palette.void,       // Deepest background (root)
  panel:    palette.surface,    // Panel / sidebar background
  card:     palette.raised,     // Card background
  context:  palette.elevated,   // Context menus, elevated areas
  floating: palette.floating,   // Floating elements, tooltips
}
```

**Usage pattern — elevation hierarchy:**

```tsx
<Box backgroundColor={surface.void}>               {/* Root background */}
  <Box backgroundColor={surface.panel}>             {/* Sidebar */}
    <Box backgroundColor={surface.card}>            {/* Card inside sidebar */}
      <Text>Content</Text>
    </Box>
  </Box>
</Box>
```

### Accent

Semantic accent colors for interactive and decorative elements.

```typescript
const accent = {
  thread: palette.thread,   // Primary accent (cyan/teal)
  anchor: palette.anchor,   // Links, secondary actions (blue)
  signal: palette.signal,   // Warnings, attention (gold)
  drift:  palette.drift,    // Errors, destructive actions (red/rust)
  purple: palette.purple,   // Special, tags (purple)
  green:  palette.green,    // Success, positive (green)
}
```

### Text

Text colors by prominence.

```typescript
const text = {
  primary:   palette.bright,  // Headings, important text
  secondary: palette.text,    // Body text
  muted:     palette.muted,   // Descriptions, labels, hints
}
```

### Border

Border colors by state.

```typescript
const border = {
  subtle: palette.borderWeak,    // Barely visible dividers
  normal: palette.borderBase,    // Standard borders
  active: palette.borderStrong,  // Hover, active states
  focus:  palette.borderFocus,   // Focus ring
}
```

---

## Spacing

Consistent spacing scale in pixels.

```typescript
const spacing = {
  xs:  2,
  sm:  4,
  md:  8,
  lg:  16,
  xl:  24,
  xxl: 32,
}
```

**Usage:**

```tsx
<Box padding={spacing.lg} gap={spacing.md}>
  <Text>16px padding, 8px gap</Text>
</Box>
```

---

## Border Radius

Corner radius presets.

```typescript
const radius = {
  none: 0,
  sm:   2,
  md:   4,
  lg:   8,
  xl:   12,
  pill: 999,   // Fully rounded (pill shape)
}
```

**Usage:**

```tsx
<Box cornerRadius={radius.lg}>Rounded card</Box>
<Box cornerRadius={radius.pill} width={40} height={40} backgroundColor={accent.green}>
  {/* Circle */}
</Box>
```

---

## Shadow Presets

Pre-configured shadow configurations for common elevation levels.

```typescript
type Shadow = {
  x: number       // Horizontal offset
  y: number       // Vertical offset
  blur: number    // Blur radius
  color: number   // Shadow color (packed RGBA u32)
}

const shadow = {
  none:     { x: 0, y: 0, blur: 0,  color: palette.transparent },
  subtle:   { x: 0, y: 1, blur: 3,  color: alpha(palette.void, 0x80) },
  elevated: { x: 0, y: 2, blur: 6,  color: alpha(palette.void, 0xa0) },
  floating: { x: 0, y: 4, blur: 12, color: alpha(palette.void, 0xc0) },
}
```

**Usage:**

```tsx
<Box shadow={shadow.subtle}>Subtle depth</Box>
<Box shadow={shadow.elevated}>Card-like elevation</Box>
<Box shadow={shadow.floating}>Floating modal</Box>

// Custom shadow
<Box shadow={{ x: 4, y: 4, blur: 8, color: alpha(accent.drift, 0x60) }}>
  Red-tinted shadow
</Box>
```

---

## Custom Themes

The token system is simple constants — you can create your own theme by defining the same structure:

```typescript
// my-theme.ts
import { pack, alpha } from "@tge/tokens"

export const surface = {
  void:     pack(0x1a, 0x1b, 0x26, 0xff),
  panel:    pack(0x24, 0x25, 0x33, 0xff),
  card:     pack(0x2e, 0x30, 0x40, 0xff),
  context:  pack(0x38, 0x3b, 0x4d, 0xff),
  floating: pack(0x42, 0x46, 0x5a, 0xff),
}

export const accent = {
  thread: pack(0xff, 0x79, 0xc6, 0xff),  // Pink
  anchor: pack(0x8b, 0xe9, 0xfd, 0xff),  // Cyan
  signal: pack(0xf1, 0xfa, 0x8c, 0xff),  // Yellow
  drift:  pack(0xff, 0x55, 0x55, 0xff),  // Red
  purple: pack(0xbd, 0x93, 0xf9, 0xff),  // Purple
  green:  pack(0x50, 0xfa, 0x7b, 0xff),  // Green
}

// Then use your theme tokens in components
import { surface, accent } from "./my-theme"
```
