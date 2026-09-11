---
title: Custom Themes
description: Create and apply custom themes at runtime.
---

## Theme System

Vexart provides a reactive, process-level Theme Manager:

```tsx
import { setTheme, getTheme, themeColors, createTheme, darkTheme, lightTheme } from "vexart"

const myTheme = createTheme({
  colors: {
    background: "#1a1b26",
    foreground: "#c0caf5",
    primary: "#7aa2f7",
    card: "#24283b",
  },
})

// Switch theme at runtime
setTheme(myTheme)
```

## Built-in Themes

| Theme | Description |
|-------|-------------|
| `darkTheme` | Default Void dark theme |
| `lightTheme` | Light variant |

## Runtime Switching

```tsx
import { setTheme, getTheme, darkTheme, lightTheme } from "vexart"

// Switch globally
setTheme(lightTheme)

// Read current theme snapshot
const current = getTheme()
```

## Reactive Theme Tokens

Access theme colors directly inside any component. SolidJS automatically tracks color signal reads:

```tsx
import { themeColors } from "vexart"

function MyComponent() {
  return <box backgroundColor={themeColors.card}>...</box>
}
```

## Creating Theme Packages

Build distributable themes as npm packages:

```tsx
// my-theme/index.ts
import { createTheme } from "@vexart/styled"

export const tokyoNight = createTheme({
  colors: {
    background: "#1a1b26",
    foreground: "#c0caf5",
    primary: "#7aa2f7",
    secondary: "#414868",
    card: "#24283b",
    muted: "#414868",
    mutedForeground: "#565f89",
    accent: "#414868",
    destructive: "#f7768e",
    border: "#3b4261",
    input: "#3b4261",
    ring: "#7aa2f7",
  },
})
```
