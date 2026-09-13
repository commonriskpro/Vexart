# Vexart Examples and Tutorials

Comprehensive, battle-tested practical patterns for building GPU-accelerated terminal UI applications.

---

## 1. 16:9 Widescreen Responsive Layout

Modern terminal emulators run on 16:9 widescreen desktop monitors. This pattern establishes a header, collapsible sidebar, content area, and status bar:

```tsx
import {
  createApp,
  createSignal,
  colors,
  space,
  radius,
  VoidCard,
  VoidCardHeader,
  VoidCardTitle,
  VoidCardContent,
  VoidButton,
  useTerminalDimensions,
} from "vexart"

function App() {
  const [sidebarOpen, setSidebarOpen] = createSignal(true)
  const dims = useTerminalDimensions()

  return (
    <box
      width="100%"
      height="100%"
      direction="column"
      backgroundColor={colors.background}
      padding={space[4]}
      gap={space[4]}
    >
      {/* Top App Bar (Horizontal Flow) */}
      <box
        width="100%"
        height={48}
        direction="row"
        alignX="space-between"
        alignY="center"
        paddingLeft={space[4]}
        paddingRight={space[4]}
        backgroundColor={colors.card}
        cornerRadius={radius.md}
        borderWidth={1}
        borderColor={colors.border}
      >
        <box direction="row" gap={space[3]} alignY="center">
          <VoidButton
            size="sm"
            variant="ghost"
            onPress={() => setSidebarOpen(!sidebarOpen())}
          >
            {sidebarOpen() ? "◀" : "▶"}
          </VoidButton>
          <text color={colors.foreground} fontSize={16} fontWeight={600}>
            Analytics Workstation
          </text>
        </box>
        <text color={colors.mutedForeground} fontSize={12}>
          {dims.cols()} cols × {dims.rows()} rows ({dims.width()}×{dims.height()}px)
        </text>
      </box>

      {/* Main Workspace (Row: Sidebar + Content) */}
      <box width="100%" height="grow" direction="row" gap={space[4]}>
        {sidebarOpen() && (
          <VoidCard width={240} height="100%">
            <VoidCardHeader>
              <VoidCardTitle>Channels</VoidCardTitle>
            </VoidCardHeader>
            <VoidCardContent>
              <box direction="column" gap={space[2]}>
                <VoidButton variant="ghost" alignX="start"># general</VoidButton>
                <VoidButton variant="ghost" alignX="start"># telemetry</VoidButton>
                <VoidButton variant="ghost" alignX="start"># alerts</VoidButton>
              </box>
            </VoidCardContent>
          </VoidCard>
        )}

        {/* Dynamic Center Canvas */}
        <box
          width="grow"
          height="100%"
          direction="column"
          backgroundColor={colors.card}
          cornerRadius={radius.lg}
          borderWidth={1}
          borderColor={colors.border}
          padding={space[6]}
          gap={space[4]}
        >
          <text color={colors.foreground} fontSize={20} fontWeight={700}>
            Active Telemetry Feed
          </text>
          <text color={colors.mutedForeground}>
            All GPU shaders and WGPU compositing pipelines active at 60 FPS.
          </text>
        </box>
      </box>
    </box>
  )
}

createApp(() => <App />, { quit: ["ctrl+c"] })
```

---

## 2. Interactive Form with Signals & Void Controls

```tsx
import {
  createApp,
  createSignal,
  colors,
  space,
  radius,
  VoidInput,
  VoidButton,
  VoidCheckbox,
  VoidCard,
  VoidCardHeader,
  VoidCardTitle,
  VoidCardContent,
  VoidCardFooter,
  Show,
} from "vexart"

function LoginForm() {
  const [username, setUsername] = createSignal("")
  const [rememberMe, setRememberMe] = createSignal(false)
  const [submitted, setSubmitted] = createSignal(false)

  const handleSubmit = () => {
    if (username().trim().length > 0) {
      setSubmitted(true)
    }
  }

  return (
    <box
      width="100%"
      height="100%"
      direction="column"
      alignX="center"
      alignY="center"
      backgroundColor={colors.background}
    >
      <VoidCard width={380}>
        <VoidCardHeader>
          <VoidCardTitle>Terminal Login</VoidCardTitle>
        </VoidCardHeader>
        <VoidCardContent>
          <box direction="column" gap={space[4]}>
            <box direction="column" gap={space[1]}>
              <text color={colors.mutedForeground} fontSize={12}>Operator ID</text>
              <VoidInput
                value={username()}
                onChange={setUsername}
                placeholder="e.g. operator@vexart.dev"
                onSubmit={handleSubmit}
              />
            </box>
            <VoidCheckbox
              checked={rememberMe()}
              onChange={setRememberMe}
              label="Persist session credentials"
            />
            <Show when={submitted()}>
              <text color={colors.primary} fontSize={12}>
                Session authenticated for {username()}!
              </text>
            </Show>
          </box>
        </VoidCardContent>
        <VoidCardFooter>
          <VoidButton variant="primary" onPress={handleSubmit}>
            Sign In
          </VoidButton>
        </VoidCardFooter>
      </VoidCard>
    </box>
  )
}

createApp(() => <LoginForm />, { quit: ["ctrl+c", "esc"] })
```

---

## 3. Dynamic Lists with `<For>` and Filtering

```tsx
import {
  createApp,
  createSignal,
  createMemo,
  colors,
  space,
  radius,
  VoidInput,
  VoidBadge,
  For,
} from "vexart"

interface ServiceItem {
  name: string
  status: "active" | "standby" | "down"
  latencyMs: number
}

function ServiceDirectory() {
  const [query, setQuery] = createSignal("")
  const [services] = createSignal<ServiceItem[]>([
    { name: "Auth Microservice", status: "active", latencyMs: 14 },
    { name: "PostgreSQL Replica", status: "active", latencyMs: 3 },
    { name: "Ingress Gateway", status: "active", latencyMs: 8 },
    { name: "Audit Logger Worker", status: "standby", latencyMs: 0 },
    { name: "Legacy Bridge", status: "down", latencyMs: 999 },
  ])

  const filtered = createMemo(() => {
    const q = query().toLowerCase()
    return services().filter((s) => s.name.toLowerCase().includes(q))
  })

  return (
    <box
      width="100%"
      height="100%"
      direction="column"
      backgroundColor={colors.background}
      padding={space[6]}
      gap={space[4]}
    >
      <VoidInput
        value={query()}
        onChange={setQuery}
        placeholder="Filter services by name..."
        width={340}
      />

      <box direction="column" gap={space[2]} width="100%">
        <For each={filtered()}>
          {(svc) => (
            <box
              width="100%"
              height={40}
              direction="row"
              alignX="space-between"
              alignY="center"
              paddingLeft={space[4]}
              paddingRight={space[4]}
              backgroundColor={colors.card}
              cornerRadius={radius.md}
              borderWidth={1}
              borderColor={colors.border}
            >
              <text color={colors.foreground} fontSize={14}>
                {svc.name}
              </text>
              <box direction="row" gap={space[3]} alignY="center">
                <text color={colors.mutedForeground} fontSize={12}>
                  {svc.latencyMs} ms
                </text>
                <VoidBadge
                  variant={svc.status === "active" ? "default" : svc.status === "down" ? "destructive" : "secondary"}
                >
                  {svc.status.toUpperCase()}
                </VoidBadge>
              </box>
            </box>
          )}
        </For>
      </box>
    </box>
  )
}

createApp(() => <ServiceDirectory />, { quit: ["ctrl+c"] })
```

