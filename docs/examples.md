# Examples & Recipes

Practical patterns for building TGE applications. Each recipe is self-contained and runnable.

---

## Minimal App

The smallest possible TGE application:

```tsx
import { mount } from "@tge/renderer"
import { Box, Text } from "@tge/components"
import { createTerminal } from "@tge/terminal"

function App() {
  return (
    <Box width="100%" height="100%" padding={16} backgroundColor={0x0a0a12ff}>
      <Text color={0xe0e6f0ff}>Hello TGE</Text>
    </Box>
  )
}

const terminal = await createTerminal()
mount(App, terminal)
```

---

## Counter

Classic counter with keyboard interaction:

```tsx
import { mount } from "@tge/renderer"
import { Box, Text, Button } from "@tge/components"
import { colors, radius, space } from "@tge/void"
import { createTerminal } from "@tge/terminal"
import { createSignal } from "solid-js"

function App() {
  const [count, setCount] = createSignal(0)

  return (
    <Box width="100%" height="100%" padding={space[6]} backgroundColor={colors.background}
      direction="column" alignX="center" alignY="center" gap={space[4]}>
      <Text color={colors.foreground}>Count: {count()}</Text>
      <Box direction="row" gap={space[2]}>
        <Button onPress={() => setCount(c => c - 1)} variant="outline">-1</Button>
        <Button onPress={() => setCount(c => c + 1)}>+1</Button>
        <Button onPress={() => setCount(0)} variant="ghost" color={colors.accent}>Reset</Button>
      </Box>
    </Box>
  )
}

const terminal = await createTerminal()
mount(App, terminal)
```

---

## Form with Multiple Inputs

A contact form with validation:

```tsx
import { mount, onInput } from "@tge/renderer"
import { Box, Text, Input, Button } from "@tge/components"
import { colors, radius, space, shadows } from "@tge/void"
import { createTerminal } from "@tge/terminal"
import { createSignal, onCleanup } from "solid-js"

function App() {
  const [name, setName] = createSignal("")
  const [email, setEmail] = createSignal("")
  const [message, setMessage] = createSignal("")
  const [submitted, setSubmitted] = createSignal(false)

  const handleSubmit = () => {
    if (name() && email()) {
      setSubmitted(true)
    }
  }

  // Global quit handler
  const unsub = onInput((e) => {
    if (e.type === "key" && e.key === "escape") process.exit(0)
  })
  onCleanup(unsub)

  return (
    <Box width="100%" height="100%" padding={space[6]} backgroundColor={colors.background}
      alignX="center" alignY="center">
      <Box padding={space[6]} backgroundColor={colors.card} cornerRadius={radius.xl}
        shadow={shadows.xl} direction="column" gap={space[4]} width={400}>

        <Text color={colors.foreground}>Contact Form</Text>

        <Box direction="column" gap={space[1]}>
          <Text color={colors.mutedForeground}>Name</Text>
          <Input value={name()} onChange={setName} placeholder="Your name..." />
        </Box>

        <Box direction="column" gap={space[1]}>
          <Text color={colors.mutedForeground}>Email</Text>
          <Input value={email()} onChange={setEmail} placeholder="email@example.com"
            color={colors.accent} />
        </Box>

        <Box direction="column" gap={space[1]}>
          <Text color={colors.mutedForeground}>Message</Text>
          <Input value={message()} onChange={setMessage} placeholder="Say something..."
            width={360} color={colors.accent} />
        </Box>

        <Box direction="row" gap={space[2]}>
          <Button onPress={handleSubmit}>Submit</Button>
          <Button variant="ghost" color={colors.secondary}
            onPress={() => { setName(""); setEmail(""); setMessage("") }}>
            Clear
          </Button>
        </Box>

        {submitted() && <Text color={colors.primary}>Form submitted!</Text>}
      </Box>
    </Box>
  )
}

const terminal = await createTerminal()
mount(App, terminal)
```

---

## Dashboard with Live Updates

Multiple independent widgets, each on its own compositing layer:

```tsx
import { mount } from "@tge/renderer"
import { Box, Text } from "@tge/components"
import { colors, radius, space, shadows } from "@tge/void"
import { createTerminal } from "@tge/terminal"
import { createSignal, onCleanup } from "solid-js"

function Clock() {
  const [time, setTime] = createSignal(new Date())
  const timer = setInterval(() => setTime(new Date()), 1000)
  onCleanup(() => clearInterval(timer))

  return (
    <Box layer padding={space[4]} backgroundColor={colors.card}
      cornerRadius={radius.lg} shadow={shadows.sm}>
      <Text color={colors.foreground}>{time().toLocaleTimeString()}</Text>
    </Box>
  )
}

function Stats() {
  const [frames, setFrames] = createSignal(0)
  const timer = setInterval(() => setFrames(f => f + 1), 33)
  onCleanup(() => clearInterval(timer))

  return (
    <Box layer padding={space[4]} backgroundColor={colors.card}
      cornerRadius={radius.lg} shadow={shadows.sm}>
      <Text color={colors.foreground}>Frames: {frames()}</Text>
    </Box>
  )
}

function App() {
  return (
    <Box width="100%" height="100%" padding={space[6]} backgroundColor={colors.background}
      direction="column" gap={space[4]}>
      <Text color={colors.foreground}>Dashboard</Text>
      <Box direction="row" gap={space[4]}>
        <Clock />
        <Stats />
      </Box>
    </Box>
  )
}

const terminal = await createTerminal()
mount(App, terminal)
```

> The `layer` prop on each widget means only the widget that changes retransmits — the rest stays in GPU VRAM.

---

## Settings Panel with Tabs

```tsx
import { mount } from "@tge/renderer"
import { Box, Text, Tabs, Checkbox, List } from "@tge/components"
import { colors, radius, space, shadows } from "@tge/void"
import { createTerminal } from "@tge/terminal"
import { createSignal } from "solid-js"

function App() {
  const [tab, setTab] = createSignal(0)
  const [darkMode, setDarkMode] = createSignal(true)
  const [notifications, setNotifications] = createSignal(true)
  const [sound, setSound] = createSignal(false)
  const [themeIdx, setThemeIdx] = createSignal(0)

  return (
    <Box width="100%" height="100%" padding={space[6]} backgroundColor={colors.background}
      alignX="center" alignY="center">
      <Box width={500} padding={space[6]} backgroundColor={colors.card}
        cornerRadius={radius.xl} shadow={shadows.xl} direction="column" gap={space[4]}>

        <Text color={colors.foreground}>Settings</Text>

        <Tabs
          activeTab={tab()}
          onTabChange={setTab}
          tabs={[
            {
              label: "General",
              content: () => (
                <Box direction="column" gap={space[2]} padding={space[2]}>
                  <Checkbox checked={darkMode()} onChange={setDarkMode} label="Dark mode" />
                  <Checkbox checked={notifications()} onChange={setNotifications}
                    label="Notifications" color={colors.accent} />
                  <Checkbox checked={sound()} onChange={setSound}
                    label="Sound effects" color={colors.primary} />
                </Box>
              )
            },
            {
              label: "Theme",
              content: () => (
                <Box padding={space[2]}>
                  <List
                    items={["Void Black", "Midnight Blue", "Forest Green", "Dracula"]}
                    selectedIndex={themeIdx()}
                    onSelectedChange={setThemeIdx}
                    color={colors.accent}
                  />
                </Box>
              )
            },
            {
              label: "About",
              content: () => (
                <Box direction="column" gap={space[1]} padding={space[2]}>
                  <Text color={colors.foreground}>TGE v0.0.1</Text>
                  <Text color={colors.mutedForeground}>Terminal Graphics Engine</Text>
                  <Text color={colors.mutedForeground}>MIT License</Text>
                </Box>
              )
            },
          ]}
        />
      </Box>
    </Box>
  )
}

const terminal = await createTerminal()
mount(App, terminal)
```

---

## Scrollable Log Viewer

```tsx
import { mount, onInput } from "@tge/renderer"
import { Box, Text, ScrollView } from "@tge/components"
import { colors, radius, space } from "@tge/void"
import { createTerminal } from "@tge/terminal"
import { createSignal, onCleanup } from "solid-js"
import { For } from "@tge/renderer"

function App() {
  const [logs, setLogs] = createSignal<string[]>([])

  // Simulate incoming logs
  let counter = 0
  const timer = setInterval(() => {
    const timestamp = new Date().toLocaleTimeString()
    const level = ["INFO", "WARN", "ERROR", "DEBUG"][Math.floor(Math.random() * 4)]
    setLogs(prev => [...prev, `[${timestamp}] ${level}: Event #${counter++}`])
  }, 500)
  onCleanup(() => clearInterval(timer))

  const unsub = onInput((e) => {
    if (e.type === "key" && e.key === "q") process.exit(0)
  })
  onCleanup(unsub)

  return (
    <Box width="100%" height="100%" padding={space[4]} backgroundColor={colors.background}
      direction="column" gap={space[2]}>
      <Text color={colors.foreground}>Log Viewer ({logs().length} entries) — press Q to quit</Text>
      <ScrollView width="100%" height={400} scrollY backgroundColor={colors.card}
        cornerRadius={radius.lg} direction="column" padding={space[1]} gap={2}>
        <For each={logs()}>
          {(line) => (
            <Box padding={space[0.5]} paddingX={space[1]}>
              <Text color={line.includes("ERROR") ? colors.destructive :
                           line.includes("WARN") ? colors.accent : colors.mutedForeground}>
                {line}
              </Text>
            </Box>
          )}
        </For>
      </ScrollView>
    </Box>
  )
}

const terminal = await createTerminal()
mount(App, terminal)
```

---

## Imperative Pixel Art (No JSX)

Use TGE as a pixel buffer library without any JSX or layout engine:

```typescript
import { createTerminal } from "@tge/terminal"
import { create, paint, clear } from "@tge/pixel"
import { createComposer } from "@tge/output"

const term = await createTerminal()
const { pixelWidth, pixelHeight, cols, rows, cellWidth, cellHeight } = term.size
const buf = create(pixelWidth, pixelHeight)
const composer = createComposer(term.write, term.rawWrite, term.caps)

// Background gradient
paint.linearGradient(buf, 0, 0, pixelWidth, pixelHeight,
  0x0a, 0x0a, 0x12, 0xff,   // Dark blue
  0x1a, 0x1a, 0x26, 0xff,   // Slightly lighter
  135)                        // 135° angle

// Rounded card with shadow
const cardX = 40, cardY = 40, cardW = 300, cardH = 150

// Shadow (paint, blur, then paint card on top)
paint.roundedRect(buf, cardX + 4, cardY + 4, cardW, cardH, 0x00, 0x00, 0x00, 0x80, 12)
paint.blur(buf, cardX, cardY, cardW + 20, cardH + 20, 8, 3)

// Card background
paint.roundedRect(buf, cardX, cardY, cardW, cardH, 0x0e, 0x0e, 0x18, 0xff, 12)

// Card border
paint.strokeRect(buf, cardX, cardY, cardW, cardH, 0x22, 0x28, 0x38, 0xff, 12, 1)

// Title text
paint.drawText(buf, cardX + 16, cardY + 20, "Hello from Zig", 0xe0, 0xe6, 0xf0, 0xff)

// Accent line
paint.fillRect(buf, cardX + 16, cardY + 50, 100, 3, 0x4f, 0xc4, 0xd4, 0xff)

// Glowing circle
paint.halo(buf, 500, 200, 30, 30, 0x4f, 0xc4, 0xd4, 0x60, 80)
paint.filledCircle(buf, 500, 200, 20, 20, 0x4f, 0xc4, 0xd4, 0xff)

// Render
term.beginSync(term.write)
composer.render(buf, 0, 0, cols, rows, cellWidth, cellHeight)
term.endSync(term.write)

// Wait for quit
process.stdin.on("data", (data) => {
  if (data[0] === 3 || data[0] === 113) { // Ctrl+C or 'q'
    term.destroy()
    process.exit(0)
  }
})
```

---

## Conditional Rendering

```tsx
import { Show } from "@tge/renderer"
import { createSignal } from "solid-js"

function App() {
  const [showDetails, setShowDetails] = createSignal(false)

  return (
    <Box direction="column" gap={space[2]}>
      <Button onPress={() => setShowDetails(s => !s)}>
        {showDetails() ? "Hide" : "Show"} Details
      </Button>
      <Show when={showDetails()}>
        <Box padding={space[2]} backgroundColor={colors.card} cornerRadius={radius.lg}>
          <Text color={colors.mutedForeground}>Here are the details!</Text>
        </Box>
      </Show>
    </Box>
  )
}
```

---

## Dynamic Lists

```tsx
import { For } from "@tge/renderer"
import { createSignal } from "solid-js"

function TodoList() {
  const [items, setItems] = createSignal(["Learn TGE", "Build an app", "Ship it"])
  const [input, setInput] = createSignal("")

  return (
    <Box direction="column" gap={space[2]}>
      <Input value={input()} onChange={setInput}
        onSubmit={(val) => {
          setItems(prev => [...prev, val])
          setInput("")
        }}
        placeholder="New todo..."
      />
      <For each={items()}>
        {(item, i) => (
          <Box direction="row" gap={space[1]} padding={space[0.5]}>
            <Text color={colors.accent}>{i() + 1}.</Text>
            <Text color={colors.mutedForeground}>{item}</Text>
          </Box>
        )}
      </For>
    </Box>
  )
}
```

---

## Running the Built-In Demos

TGE includes 10 working demos in the `examples/` directory:

```bash
bun run demo       # Phase 1: imperative pixel painting
bun run demo2      # Phase 2: Clay layout engine
bun run demo3      # Phase 3: first JSX rendering
bun run demo4      # Phase 4: interactive (focus, signals)
bun run demo5      # Phase 5: layer compositing
bun run demo6      # Dashboard (5 independent layers)
bun run demo7      # Scroll containers
bun run demo8      # Component showcase (all components)
bun run demo9      # Shadow & glow effects
bun run demo10     # Text input form
```

Each demo is a standalone file you can use as a starting point for your own application.
