---
title: Custom Themes
description: Create and apply custom themes at runtime.
---

## Theme System

Vexart supports runtime theme switching via `ThemeProvider`:

```tsx
import { ThemeProvider, createTheme, darkTheme, useTheme } from "@vexart/styled"

const myTheme = createTheme({
  colors: {
    background: "#1a1b26",
    foreground: "#c0caf5",
    primary: "#7aa2f7",
    card: "#24283b",
  },
})

function App() {
  return (
    <ThemeProvider theme={myTheme}>
      <MyContent />
    </ThemeProvider>
  )
}
```

## Built-in Themes

| Theme | Description |
|-------|-------------|
| `darkTheme` | Default Void dark theme |
| `lightTheme` | Light variant |

## Runtime Switching

```tsx
import { setTheme, getTheme, darkTheme, lightTheme } from "@vexart/styled"

// Switch globally
setTheme(lightTheme)

// Read current
const current = getTheme()
```

## useTheme Hook

Access theme tokens inside any component:

```tsx
import { useTheme } from "@vexart/styled"

function MyComponent() {
  const theme = useTheme()
  return <box backgroundColor={theme.colors.card}>...</box>
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
