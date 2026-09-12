# Examples & Recipes

Practical patterns for building Vexart applications. Repository examples are runnable with Bun and the Solid browser condition:

```bash
bun run showcase
```

## Package imports

```tsx
import { createApp, Box, Text, Button, Input, ScrollView, VirtualList, colors, radius, space } from "vexart"
```

## Minimal app

```tsx
import { createApp } from "vexart"

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
import { createApp, Button, colors, space } from "vexart"
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
import { createApp, Button, Input, colors, radius, space } from "vexart"
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

`createApp()` is the default examples pattern. Use `mountApp()` when you need custom app bootstrapping, or `mount()` from `@vexart/engine` (via `"vexart/engine"`) only for low-level integrations that manage terminal creation manually.

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

## Example inventory

The repository includes 5 primary example entry points in `examples/`:

1. `examples/void-showcase.tsx` — Void design system component showcase (`bun run showcase`)
2. `examples/effects-showcase.tsx` — GPU visual effects showcase (`bun run effects-showcase`)
3. `examples/facebook-app.tsx` — Full Facebook feed demo (`bun run facebook`)
4. `examples/showcase-legacy.tsx` — Review-only legacy component snapshot (`bun run showcase:legacy`)
5. `examples/ps5/src/main.tsx` — PS5 dashboard console UI (`bun --conditions=browser run examples/ps5/src/main.tsx`)

Run smoke validation with:

```bash
bun test packages/engine/src/testing/showcase-tab2.test.tsx
```

Use real terminal validation before release:

```bash
bun run validate:terminal-transport:bench
```
