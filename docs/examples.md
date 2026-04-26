# Examples & Recipes

Practical patterns for building Vexart applications. Repository examples are runnable with Bun and the Solid browser condition:

```bash
bun --conditions=browser run examples/hello.tsx
```

## Package imports

```tsx
import { createApp, Box, Text } from "@vexart/app"
import { Button, Input, ScrollView, VirtualList } from "@vexart/headless"
import { colors, radius, space } from "@vexart/styled"
```

## Minimal app

```tsx
import { createApp } from "@vexart/app"

function App() {
  return (
    <box width="100%" height="100%" padding={16} backgroundColor={0x0a0a12ff}>
      <text color={0xe0e6f0ff}>Hello Vexart</text>
    </box>
  )
}

await createApp(() => <App />)
```

## Counter

```tsx
import { createApp } from "@vexart/app"
import { Button } from "@vexart/headless"
import { colors, space } from "@vexart/styled"
import { createSignal } from "solid-js"

function App() {
  const [count, setCount] = createSignal(0)

  return (
    <box width="100%" height="100%" padding={space[6]} backgroundColor={colors.background} direction="column" gap={space[4]} alignX="center" alignY="center">
      <text color={colors.foreground}>Count: {count()}</text>
      <Button
        onPress={() => setCount((value) => value + 1)}
        renderButton={(ctx) => (
          <box {...ctx.buttonProps} backgroundColor={colors.primary} cornerRadius={6} padding={8}>
            <text color={colors.background}>Increment</text>
          </box>
        )}
      />
    </box>
  )
}

await createApp(() => <App />)
```

## Form

```tsx
import { createApp } from "@vexart/app"
import { Button, Input } from "@vexart/headless"
import { colors, radius, space } from "@vexart/styled"
import { createSignal } from "solid-js"

function App() {
  const [name, setName] = createSignal("")

  return (
    <box width="100%" height="100%" padding={space[6]} backgroundColor={colors.background} alignX="center" alignY="center">
      <box padding={space[6]} backgroundColor={colors.card} cornerRadius={radius.xl} direction="column" gap={space[4]} width={420}>
        <text color={colors.foreground}>Contact</text>
        <Input value={name()} onChange={setName} placeholder="Your name..." />
        <Button
          onPress={() => console.log(name())}
          renderButton={(ctx) => (
            <box {...ctx.buttonProps} backgroundColor={colors.primary} cornerRadius={radius.md} padding={space[3]}>
              <text color={colors.background}>Submit</text>
            </box>
          )}
        />
      </box>
    </box>
  )
}

await createApp(() => <App />)
```

`createApp()` is the default examples pattern. Use `mountApp()` when you need custom app bootstrapping, or `mount()` from `@vexart/engine` only for low-level integrations that manage terminal creation manually.

## Image and canvas intrinsics

```tsx
<image src="./assets/logo.png" width={128} height={128} objectFit="contain" />

<canvas
  width={320}
  height={180}
  onDraw={(ctx) => {
    ctx.fillStyle = 0x56d4c8ff
    ctx.fillRect(0, 0, 320, 180)
  }}
/>
```

## Example inventory for v0.9 validation

The v0.9 release checklist validates at least these 15 runnable examples:

1. `examples/hello.tsx`
2. `examples/interactive.tsx`
3. `examples/layers.tsx`
4. `examples/dashboard.tsx`
5. `examples/scroll.tsx`
6. `examples/components.tsx`
7. `examples/effects.tsx`
8. `examples/input.tsx`
9. `examples/text-wrap.tsx`
10. `examples/scroll-programmatic.tsx`
11. `examples/textarea.tsx`
12. `examples/syntax.tsx`
13. `examples/markdown.tsx`
14. `examples/showcase.tsx`
15. `examples/gpu-verify.tsx`

Run smoke validation with:

```bash
bun test packages/engine/src/testing/showcase-tab2.test.tsx
```

Use real terminal validation before release:

```bash
bun run validate:terminal-transport:bench
```
