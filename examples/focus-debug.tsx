/**
 * Minimal focus-change debug: 3 focusable buttons in a sidebar.
 * Tab or click between them to reproduce the "disappearing siblings" bug.
 *
 * Run: bun --conditions=browser run examples/focus-debug.tsx
 */
import { createApp, Box, Text } from "@vexart/app"
import { colors, radius, space } from "@vexart/styled"

function SidebarButton(props: { label: string }) {
  return (
    <box
      focusable
      backgroundColor={0x1e1e2eff}
      cornerRadius={8}
      padding={8}
      hoverStyle={{ backgroundColor: 0x2a2a3eff }}
      focusStyle={{ backgroundColor: 0x3a3a4eff, borderColor: 0x4488ccff, borderWidth: 2 }}
    >
      <text color={0xfafafaff} fontSize={14}>
        {props.label}
      </text>
    </box>
  )
}

function App() {
  return (
    <box
      width="100%"
      height="100%"
      backgroundColor={0x141414ff}
      direction="row"
    >
      {/* Sidebar */}
      <box
        width={180}
        height="100%"
        backgroundColor={0x1a1a2eff}
        direction="column"
        padding={12}
        gap={8}
      >
        <text color={0xfafafaff} fontSize={16}>
          Nova
        </text>
        <box height={1} backgroundColor={0xffffff1a} />
        <SidebarButton label="Sessions" />
        <SidebarButton label="Files" />
        <SidebarButton label="Settings" />
        <box height="grow" />
        <text color={0xa3a3a3ff} fontSize={10}>
          v0.1.0
        </text>
      </box>

      {/* Main content */}
      <box
        width="grow"
        height="100%"
        backgroundColor={0x0f0f17ff}
        padding={16}
      >
        <text color={0xa3a3a3ff} fontSize={12}>
          Tab between sidebar buttons — siblings should NOT disappear
        </text>
      </box>
    </box>
  )
}

await createApp(() => <App />)
