---
title: Your First App
description: Build a complete Vexart app in 30 lines.
---

## The Simplest App

```tsx
import { createApp, Box, Text, colors } from "vexart"

await createApp(() => (
  <Box
    width="100%"
    height="100%"
    backgroundColor={colors.background}
    alignX="center"
    alignY="center"
  >
    <Text color={colors.foreground} fontSize={16}>
      Hello from Vexart!
    </Text>
  </Box>
))
```

Run:
```bash
bun --conditions=browser run app.tsx
```

## Entry Points

Vexart offers three entry points at different abstraction levels:

| Entry | Use Case |
|-------|----------|
| `createApp()` | Managed — handles terminal, input, lifecycle |
| `mountApp()` | Semi-managed — async lifecycle control |
| `mount()` | Manual — you own terminal + input plumbing |

### `createApp()` — Recommended

```tsx
import { createApp, Box, Text, Button, colors, radius, space } from "vexart"

function App() {
  return (
    <Box backgroundColor={colors.background} padding={space[6]} direction="column" gap={space[3]}>
      <Text color={colors.foreground} fontSize={20} fontWeight={700}>
        My Terminal App
      </Text>
      <Button
        onPress={() => process.exit(0)}
        renderButton={(ctx) => (
          <Box {...ctx.buttonProps} backgroundColor={colors.primary}
               cornerRadius={radius.md} padding={space[3]}>
            <Text color={colors.background}>Quit</Text>
          </Box>
        )}
      />
    </Box>
  )
}

await createApp(() => <App />)
```

## SolidJS Reactivity

Vexart uses **SolidJS**, not React. Key differences:

```tsx
import { createSignal, Show } from "vexart/engine"

function Counter() {
  const [count, setCount] = createSignal(0)

  return (
    <Box direction="column" gap={8}>
      <Text>Count: {count()}</Text>
      <Button
        onPress={() => setCount(c => c + 1)}
        renderButton={(ctx) => (
          <Box {...ctx.buttonProps} backgroundColor={0x56d4c8ff} cornerRadius={6} padding={8}>
            <Text color={0x0a0a0fff}>Increment</Text>
          </Box>
        )}
      />
    </Box>
  )
}
```

- **Signals, not state.** `createSignal` returns `[getter, setter]`. The getter is a function call: `count()`.
- **No VDOM.** Components run once. Only signal reads inside JSX are tracked.
- **No useMemo/useCallback.** Fine-grained reactivity makes them unnecessary.

## JSX Intrinsic Elements

Vexart has four built-in elements:

| Element | HTML Equivalent | Purpose |
|---------|----------------|---------|
| `<box>` | `<div>` | Layout container + visual styling |
| `<text>` | `<span>` | Text display |
| `<image>` / `<img>` | `<img>` | Image from file path |
| `<canvas>` | `<canvas>` | Imperative drawing via `onDraw` |

## Default Layout

- `<box>` defaults to **column** direction (vertical flow)
- Use `direction="row"` for horizontal layout
- Terminal resize triggers automatic re-layout
