# Theming

> Expanded guide for TGE's design tokens and theme system. For the quick-reference version, see [developer-guide.md](./developer-guide.md#theming). For building custom theme packages, see [creating-theme-packages.md](./creating-theme-packages.md).

TGE's design system (`tge/void`) provides static tokens, a reactive theme system, and pre-styled components. This guide covers how tokens work, the critical difference between static and reactive colors, theme switching, and the reactivity gotcha that catches every new user.

---

## Static Tokens

Static tokens are plain JavaScript objects. They never change at runtime. Import them from `tge/void`:

```typescript
import { colors, radius, space, font, weight, shadows } from "tge/void"
```

### colors

```typescript
colors.background           // "#0a0a0a"    — app background
colors.foreground           // "#fafafa"    — default text
colors.card                 // "#171717"    — elevated surfaces
colors.cardForeground       // "#fafafa"    — text on cards
colors.popover              // "#171717"    — floating surfaces
colors.popoverForeground    // "#fafafa"    — text on popovers
colors.primary              // "#e5e5e5"    — brand/high-emphasis
colors.primaryForeground    // "#171717"    — text on primary
colors.secondary            // "#262626"    — lower-emphasis
colors.secondaryForeground  // "#fafafa"    — text on secondary
colors.muted                // "#262626"    — subtle surfaces
colors.mutedForeground      // "#a3a3a3"    — low-emphasis text
colors.accent               // "#262626"    — hover/focus surfaces
colors.accentForeground     // "#fafafa"    — text on accent
colors.destructive          // "#dc2626"    — errors/danger
colors.destructiveForeground // "#fafafa"   — text on destructive
colors.border               // "#ffffff25"  — borders
colors.input                // "#ffffff26"  — input borders
colors.ring                 // "#737373"    — focus rings
colors.transparent          // "#00000000"  — transparent
```

### radius

```typescript
radius.sm    // 6
radius.md    // 8
radius.lg    // 10
radius.xl    // 14
radius.xxl   // 18
radius.full  // 9999 (pill)
```

### space

```typescript
space.px     // 1
space[0.5]   // 2
space[1]     // 4
space[1.5]   // 6
space[2]     // 8
space[2.5]   // 10
space[3]     // 12
space[4]     // 16
space[5]     // 20
space[6]     // 24
space[8]     // 32
space[10]    // 40
```

### font

```typescript
font.xs      // 10
font.sm      // 12
font.base    // 14
font.lg      // 16
font.xl      // 20
font["2xl"]  // 24
font["3xl"]  // 30
font["4xl"]  // 36
```

### weight

```typescript
weight.normal    // 400
weight.medium    // 500
weight.semibold  // 600
weight.bold      // 700
```

### shadows

```typescript
shadows.sm   // subtle lift — [{x:0, y:1, blur:2, color:...}]
shadows.md   // card elevation — multi-shadow array
shadows.lg   // modal/dialog — wider spread
shadows.xl   // highest elevation — dramatic
```

Shadow presets are arrays of `{ x, y, blur, color }` objects. Colors are already u32.

---

## Static vs Reactive: colors vs themeColors

This is the most important concept in TGE theming. There are TWO ways to access colors:

| Import | Type | Reactivity | Use when |
|--------|------|-----------|----------|
| `colors` | Plain object | Static — never changes | Config, conditions, one-time reads |
| `themeColors` | Object with signal getters | Reactive — updates on `setTheme()` | JSX props that should respond to theme changes |

```tsx
import { colors, themeColors } from "tge/void"

// STATIC — won't update if you call setTheme()
<box backgroundColor={colors.background} />

// REACTIVE — automatically updates when theme changes
<box backgroundColor={themeColors.background} />
```

**Rule of thumb:** Use `themeColors` in JSX props. Use `colors` for static config or comparisons.

---

## The themeColors Reactivity Gotcha

**This is the #1 mistake new TGE users make.**

SolidJS components run their body ONCE. Only JSX expressions are reactive. If you capture a `themeColors` value in a const, it becomes a static snapshot.

### The problem

```tsx
import { themeColors } from "tge/void"

function BadCard() {
  // BUG: This captures the current value ONCE
  const bg = themeColors.background
  // bg is now a string like "#0a0a0a" — it will NEVER update

  return (
    <box backgroundColor={bg}>  {/* Static! Won't react to theme changes */}
      <text color="#fff">This card ignores theme switches</text>
    </box>
  )
}
```

### Why it happens

`themeColors` is implemented using `Object.defineProperties` with signal getters:

```typescript
// Simplified internal implementation
const themeColors = {}
Object.defineProperty(themeColors, "background", {
  get() { return backgroundSignal() }  // SolidJS signal getter
})
```

When you read `themeColors.background` in the component body, you call the getter ONCE. The resulting string is stored in your const. SolidJS never tracks it because the read happened outside a reactive context (JSX is compiled into effects by Babel).

### The fix: Read in JSX

```tsx
function GoodCard() {
  return (
    // themeColors.background is read HERE — inside JSX (which Babel wraps in an effect)
    <box backgroundColor={themeColors.background}>
      <text color={themeColors.foreground}>This reacts to theme changes</text>
    </box>
  )
}
```

### The fix: Use getter functions

If you need to derive values from theme colors, use a getter function:

```tsx
function GoodDerivedCard(props: { variant: "primary" | "muted" }) {
  // BAD: captured once
  // const bg = props.variant === "primary" ? themeColors.primary : themeColors.muted

  // GOOD: getter function — called fresh each time JSX evaluates
  const bg = () => props.variant === "primary" ? themeColors.primary : themeColors.muted

  return (
    <box backgroundColor={bg()}>
      <text color={themeColors.foreground}>Reactive derived color</text>
    </box>
  )
}
```

### The variantGetters pattern

For component libraries and theme packages, use getter functions to preserve reactivity:

```tsx
function ThemedButton(props: {
  variant?: "primary" | "secondary" | "ghost"
  label: string
  onPress?: () => void
}) {
  // Each variant maps to a GETTER — not a captured value
  const variantStyles = {
    primary: {
      bg: () => themeColors.primary,
      fg: () => themeColors.primaryForeground,
      border: () => themeColors.border,
    },
    secondary: {
      bg: () => themeColors.secondary,
      fg: () => themeColors.secondaryForeground,
      border: () => themeColors.border,
    },
    ghost: {
      bg: () => "transparent",
      fg: () => themeColors.foreground,
      border: () => "transparent",
    },
  }

  const style = () => variantStyles[props.variant ?? "primary"]

  return (
    <box
      focusable
      onPress={props.onPress}
      backgroundColor={style().bg()}
      borderColor={style().border()}
      borderWidth={1}
      cornerRadius={radius.md}
      paddingX={space[4]}
      paddingY={space[2]}
    >
      <text color={style().fg()}>{props.label}</text>
    </box>
  )
}
```

---

## createTheme and setTheme

### Creating a custom theme

```typescript
import { createTheme } from "tge/void"

const catppuccin = createTheme({
  colors: {
    background: "#1e1e2e",
    foreground: "#cdd6f4",
    primary: "#89b4fa",
    primaryForeground: "#1e1e2e",
    card: "#313244",
    border: "#45475a",
    muted: "#313244",
    mutedForeground: "#a6adc8",
    accent: "#313244",
    accentForeground: "#cdd6f4",
    destructive: "#f38ba8",
    ring: "#89b4fa",
  },
})
```

`createTheme` merges your overrides with the default dark theme. You only need to specify the colors you want to change.

### Switching themes at runtime

```typescript
import { setTheme, darkTheme, lightTheme } from "tge/void"

setTheme(darkTheme)       // built-in dark (default)
setTheme(lightTheme)      // built-in light
setTheme(catppuccin)      // custom
```

When you call `setTheme()`, all SolidJS signals behind `themeColors` update. Any JSX prop reading `themeColors.xxx` re-renders automatically. Static `colors.xxx` references are NOT affected.

### Built-in presets

| Theme | Description |
|-------|-------------|
| `darkTheme` | Default. OLED-optimized dark theme |
| `lightTheme` | Light theme with inverted surfaces |

---

## Theme Switching Example

```tsx
import {
  createTheme, setTheme, darkTheme, lightTheme,
  themeColors, colors, radius, space, font
} from "tge/void"
import { createSignal } from "solid-js"

const nord = createTheme({
  colors: {
    background: "#2e3440",
    foreground: "#eceff4",
    primary: "#88c0d0",
    primaryForeground: "#2e3440",
    card: "#3b4252",
    border: "#4c566a",
    muted: "#434c5e",
    mutedForeground: "#d8dee9",
  },
})

function ThemeSwitcher() {
  const themes = [
    { name: "Dark", theme: darkTheme },
    { name: "Light", theme: lightTheme },
    { name: "Nord", theme: nord },
  ] as const

  const [idx, setIdx] = createSignal(0)

  const cycle = () => {
    const next = (idx() + 1) % themes.length
    setIdx(next)
    setTheme(themes[next].theme)
  }

  return (
    <box
      width="100%"
      height="100%"
      backgroundColor={themeColors.background}
      padding={space[6]}
      gap={space[4]}
    >
      <text color={themeColors.foreground} fontSize={font.xl}>
        Theme Demo
      </text>

      <box
        backgroundColor={themeColors.card}
        cornerRadius={radius.xl}
        padding={space[4]}
        borderColor={themeColors.border}
        borderWidth={1}
        gap={space[2]}
      >
        <text color={themeColors.foreground}>
          Current: {themes[idx()].name}
        </text>
        <text color={themeColors.mutedForeground} fontSize={font.sm}>
          All colors update automatically via themeColors
        </text>
      </box>

      <box
        focusable
        onPress={cycle}
        backgroundColor={themeColors.primary}
        cornerRadius={radius.md}
        paddingX={space[4]}
        paddingY={space[2]}
        hoverStyle={{ opacity: 0.9 }}
      >
        <text color={themeColors.primaryForeground}>Switch Theme</text>
      </box>
    </box>
  )
}
```

---

## ThemeProvider

For nested themes (rare), wrap a subtree in `<ThemeProvider>`:

```tsx
import { ThemeProvider } from "tge/void"

<ThemeProvider theme={customTheme}>
  {/* Children here read the custom theme */}
</ThemeProvider>
```

For most apps, global `setTheme()` is sufficient.

---

## Void Components and Theming

Void components (from `tge/void`) read `themeColors` internally. They react to `setTheme()` automatically:

```tsx
import { Button, Card, CardHeader, CardTitle, CardContent, Badge } from "tge/void"

// These all use themeColors internally — no color props needed
<Card>
  <CardHeader>
    <CardTitle>Dashboard</CardTitle>
  </CardHeader>
  <CardContent>
    <Badge variant="secondary">3 new</Badge>
    <Button onPress={() => refresh()}>Refresh</Button>
  </CardContent>
</Card>
```

Switch theme with `setTheme()` and every Void component updates.

---

## Token Usage in Custom Components

When building your own components, use tokens for consistency:

```tsx
import { colors, themeColors, radius, space, font, weight, shadows } from "tge/void"

function CustomCard(props: { title: string; children: any }) {
  return (
    <box
      backgroundColor={themeColors.card}
      cornerRadius={radius.xl}
      padding={space[5]}
      gap={space[3]}
      shadow={shadows.md}
      borderColor={themeColors.border}
      borderWidth={1}
    >
      <text
        color={themeColors.foreground}
        fontSize={font.lg}
        fontWeight={weight.semibold}
      >
        {props.title}
      </text>
      {props.children}
    </box>
  )
}
```

---

## Summary: Reactivity Rules

| Pattern | Reactive? | Safe for theme switching? |
|---------|-----------|--------------------------|
| `<box backgroundColor={themeColors.background} />` | Yes | Yes |
| `const bg = themeColors.background; <box backgroundColor={bg} />` | No | NO — captured once |
| `const bg = () => themeColors.background; <box backgroundColor={bg()} />` | Yes | Yes |
| `<box backgroundColor={colors.background} />` | No | No — static by design |

**Golden rule:** Read `themeColors.xxx` directly in JSX props, or behind a `() =>` getter. Never store it in a const.

---

## See Also

- [creating-theme-packages.md](./creating-theme-packages.md) — build a custom theme package (like shadcn/ui themes)
- [Visual Effects](./visual-effects.md) — shadows, glow, gradients that use token values
- [Components (Headless)](./components-headless.md) — headless components accept theme props
- [developer-guide.md](./developer-guide.md#theming) — quick reference
