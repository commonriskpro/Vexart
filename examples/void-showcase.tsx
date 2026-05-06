/**
 * Vexart Void Showcase — every styled component in one app.
 *
 * Organized by tabs: Inputs, Display, Collections, Overlays, Typography, New.
 * Uses ONLY the public styled API — no raw primitives.
 *
 * Run: bun --conditions=browser run examples/void-showcase.tsx
 */
import { createSignal, Show } from "solid-js"
import { useTerminalDimensions, SyntaxStyle, ONE_DARK } from "@vexart/engine"
import { createApp, useAppTerminal, Box, Text } from "@vexart/app"
import {
  // Tokens
  colors, radius, space, font, weight, shadows,
  // Theme
  themeColors, darkTheme, lightTheme, setTheme,
  // Typography
  H1, H2, H3, H4, P, Lead, Large, Small, Muted,
  // Components
  Button,
  Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter,
  Badge,
  Avatar,
  Separator,
  Skeleton,
  VoidInput,
  VoidTextarea,
  VoidCheckbox,
  VoidSwitch,
  VoidRadioGroup,
  VoidSelect,
  VoidCombobox,
  VoidSlider,
  VoidProgress,
  VoidTabs,
  VoidTable,
  VoidDialog, VoidDialogTitle, VoidDialogDescription, VoidDialogFooter,
  VoidTooltip,
  VoidCode,
  VoidMarkdown,
  VoidList,
  VoidScrollView,
  VoidDiff,
  createVoidToaster,
} from "@vexart/styled"

const syntaxStyle = SyntaxStyle.fromTheme(ONE_DARK)

// ── Inputs Tab ──

function InputsTab() {
  const [text, setText] = createSignal("")
  const [area, setArea] = createSignal("Hello\nWorld")
  const [checked, setChecked] = createSignal(true)
  const [switched, setSwitched] = createSignal(false)
  const [radio, setRadio] = createSignal("a")
  const [selected, setSelected] = createSignal("ts")
  const [combo, setCombo] = createSignal("")
  const [slider, setSlider] = createSignal(42)

  return (
    <Box direction="row" gap={space[4]} alignY="top">
      {/* Column 1 */}
      <Box direction="column" gap={space[4]} width="grow">
        <Card>
          <CardHeader>
            <CardTitle>Text Inputs</CardTitle>
            <CardDescription>Single-line and multi-line editors</CardDescription>
          </CardHeader>
          <CardContent>
            <Box direction="column" gap={space[4]}>
              <Box direction="column" gap={space[1]}>
                <Small>VoidInput</Small>
                <VoidInput value={text()} onChange={setText} placeholder="Type here..." />
              </Box>
              <Box direction="column" gap={space[1]}>
                <Small>VoidTextarea</Small>
                <VoidTextarea value={area()} onChange={setArea} width={300} height={100} />
              </Box>
            </Box>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Selection</CardTitle>
          </CardHeader>
          <CardContent>
            <Box direction="column" gap={space[4]}>
              <Box direction="column" gap={space[1]}>
                <Small>VoidSelect</Small>
                <VoidSelect
                  value={selected()}
                  onChange={setSelected}
                  options={[
                    { value: "ts", label: "TypeScript" },
                    { value: "rs", label: "Rust" },
                    { value: "go", label: "Go" },
                    { value: "py", label: "Python" },
                  ]}
                />
              </Box>
              <Box direction="column" gap={space[1]}>
                <Small>VoidCombobox</Small>
                <VoidCombobox
                  value={combo()}
                  onChange={setCombo}
                  options={[
                    { value: "vexart", label: "Vexart" },
                    { value: "ink", label: "Ink" },
                    { value: "bubbletea", label: "Bubbletea" },
                    { value: "textual", label: "Textual" },
                  ]}
                  placeholder="Search frameworks..."
                />
              </Box>
            </Box>
          </CardContent>
        </Card>
      </Box>

      {/* Column 2 */}
      <Box direction="column" gap={space[4]} width="grow">
        <Card>
          <CardHeader>
            <CardTitle>Toggles</CardTitle>
          </CardHeader>
          <CardContent>
            <Box direction="column" gap={space[3]}>
              <VoidCheckbox checked={checked()} onChange={setChecked} label="Enable notifications" />
              <VoidCheckbox checked={false} label="Marketing emails" />
              <Separator />
              <VoidSwitch checked={switched()} onChange={setSwitched} label="Dark mode" />
              <VoidSwitch checked={true} label="Auto-save" />
            </Box>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Radio & Slider</CardTitle>
          </CardHeader>
          <CardContent>
            <Box direction="column" gap={space[4]}>
              <VoidRadioGroup
                value={radio()}
                onChange={setRadio}
                options={[
                  { value: "a", label: "Option A" },
                  { value: "b", label: "Option B" },
                  { value: "c", label: "Option C" },
                ]}
              />
              <Separator />
              <Box direction="column" gap={space[1]}>
                <Small>VoidSlider: {slider()}</Small>
                <VoidSlider value={slider()} onChange={setSlider} min={0} max={100} />
              </Box>
            </Box>
          </CardContent>
        </Card>
      </Box>
    </Box>
  )
}

// ── Display Tab ──

function DisplayTab() {
  return (
    <Box direction="row" gap={space[4]} alignY="top">
      <Box direction="column" gap={space[4]} width="grow">
        <Card>
          <CardHeader>
            <CardTitle>Buttons</CardTitle>
            <CardDescription>All variants and sizes</CardDescription>
          </CardHeader>
          <CardContent>
            <Box direction="column" gap={space[3]}>
              <Box direction="row" gap={space[2]} alignY="center">
                <Button variant="default" onPress={() => {}}>Default</Button>
                <Button variant="secondary" onPress={() => {}}>Secondary</Button>
                <Button variant="outline" onPress={() => {}}>Outline</Button>
                <Button variant="ghost" onPress={() => {}}>Ghost</Button>
                <Button variant="destructive" onPress={() => {}}>Destructive</Button>
              </Box>
              <Box direction="row" gap={space[2]} alignY="center">
                <Button size="xs" onPress={() => {}}>XS</Button>
                <Button size="sm" onPress={() => {}}>SM</Button>
                <Button onPress={() => {}}>Default</Button>
                <Button size="lg" onPress={() => {}}>LG</Button>
              </Box>
            </Box>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Badges</CardTitle>
          </CardHeader>
          <CardContent>
            <Box direction="row" gap={space[2]}>
              <Badge>Default</Badge>
              <Badge variant="secondary">Secondary</Badge>
              <Badge variant="outline">Outline</Badge>
              <Badge variant="destructive">Destructive</Badge>
            </Box>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Avatar</CardTitle>
          </CardHeader>
          <CardContent>
            <Box direction="row" gap={space[3]} alignY="center">
              <Avatar name="Sarah Chen" size="sm" />
              <Avatar name="Alex Rivera" />
              <Avatar name="Jordan Kim" size="lg" />
              <Avatar name="Custom" color="#56d4c8" />
            </Box>
          </CardContent>
        </Card>
      </Box>

      <Box direction="column" gap={space[4]} width="grow">
        <Card>
          <CardHeader>
            <CardTitle>Card Anatomy</CardTitle>
            <CardDescription>Every Card sub-component</CardDescription>
          </CardHeader>
          <CardContent>
            <P>This is the CardContent area. It holds the main content of the card.</P>
          </CardContent>
          <CardFooter>
            <Button variant="outline" size="sm" onPress={() => {}}>Cancel</Button>
            <Button size="sm" onPress={() => {}}>Save</Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Progress & Skeleton</CardTitle>
          </CardHeader>
          <CardContent>
            <Box direction="column" gap={space[3]}>
              <Box direction="column" gap={space[1]}>
                <Small>VoidProgress</Small>
                <VoidProgress value={72} max={100} />
              </Box>
              <Separator />
              <Box direction="column" gap={space[1]}>
                <Small>Skeleton</Small>
                <Skeleton width={200} height={12} />
                <Skeleton width={160} height={12} />
                <Skeleton width={120} height={12} />
              </Box>
            </Box>
          </CardContent>
        </Card>
      </Box>
    </Box>
  )
}

// ── Collections Tab ──

function CollectionsTab() {
  const [listIdx, setListIdx] = createSignal(0)
  const [tableRow, setTableRow] = createSignal(0)

  const tableData = [
    { name: "vexart", version: "0.9.0", downloads: "1,247" },
    { name: "solid-js", version: "1.9.0", downloads: "892,341" },
    { name: "flexily", version: "0.6.0", downloads: "3,128" },
    { name: "wgpu", version: "29.0", downloads: "—" },
    { name: "marked", version: "18.0", downloads: "45,000,000" },
  ]

  return (
    <Box direction="row" gap={space[4]} alignY="top">
      <Box direction="column" gap={space[4]} width="grow">
        <Card>
          <CardHeader>
            <CardTitle>VoidList</CardTitle>
            <CardDescription>Keyboard navigable list</CardDescription>
          </CardHeader>
          <CardContent>
            <VoidList
              items={["Dashboard", "Settings", "Profile", "Notifications", "Billing", "Help"]}
              selectedIndex={listIdx()}
              onSelectedChange={setListIdx}
              width={280}
              height={200}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>VoidScrollView</CardTitle>
            <CardDescription>Themed scrollable container</CardDescription>
          </CardHeader>
          <CardContent>
            <VoidScrollView width={280} height={120} padding={space[3]} gap={space[2]}>
              <P>Line 1: Vexart is a GPU-accelerated terminal UI engine.</P>
              <P>Line 2: Write JSX with SolidJS reconciliation.</P>
              <P>Line 3: Get browser-quality visuals in the terminal.</P>
              <P>Line 4: Shadows, gradients, glow, backdrop blur.</P>
              <P>Line 5: MSDF text rendering for crisp fonts.</P>
              <P>Line 6: 26 headless components out of the box.</P>
              <P>Line 7: Void design system with dark theme.</P>
              <P>Line 8: Supports Kitty, Ghostty, and WezTerm.</P>
            </VoidScrollView>
          </CardContent>
        </Card>
      </Box>

      <Box direction="column" gap={space[4]} width="grow">
        <Card>
          <CardHeader>
            <CardTitle>VoidTable</CardTitle>
            <CardDescription>Striped data table with selection</CardDescription>
          </CardHeader>
          <CardContent>
            <VoidTable
              columns={[
                { key: "name", header: "Package", width: 120 },
                { key: "version", header: "Version", width: 80 },
                { key: "downloads", header: "Downloads", width: 120 },
              ]}
              data={tableData}
              selectedRow={tableRow()}
              onSelectedRowChange={setTableRow}
            />
          </CardContent>
        </Card>
      </Box>
    </Box>
  )
}

// ── Code & Markdown Tab ──

function CodeTab() {
  const sampleCode = `import { createApp, Box, Text } from "vexart"
import { Button, Card, colors } from "vexart"

function App() {
  return (
    <Card>
      <Button onPress={() => save()}>
        Save Changes
      </Button>
    </Card>
  )
}

await createApp(() => <App />)`

  const sampleMarkdown = `# Vexart

The **first** GPU-accelerated UI engine for the terminal.

## Features

- Pixel-perfect rendering
- JSX + SolidJS reactivity
- 26 headless components
- Void design system

## Quick Start

\`\`\`typescript
import { createApp } from "vexart"
await createApp(() => <App />)
\`\`\`

> Built with Rust and WGPU.`

  const sampleDiff = `--- a/package.json
+++ b/package.json
@@ -1,5 +1,5 @@
 {
-  "name": "@vxrt/core",
+  "name": "vexart",
   "version": "0.9.0-beta.19",
-  "description": "Terminal rendering engine",
+  "description": "GPU-accelerated terminal UI engine",
   "type": "module"
 }`

  return (
    <Box direction="row" gap={space[4]} alignY="top">
      <Box direction="column" gap={space[4]} width="grow">
        <Card>
          <CardHeader>
            <CardTitle>VoidCode</CardTitle>
            <CardDescription>Syntax-highlighted code block</CardDescription>
          </CardHeader>
          <CardContent>
            <VoidCode
              content={sampleCode}
              language="typescript"
              syntaxStyle={syntaxStyle}
              width={360}
              lineNumbers
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>VoidDiff</CardTitle>
            <CardDescription>Unified diff viewer</CardDescription>
          </CardHeader>
          <CardContent>
            <VoidDiff diff={sampleDiff} showLineNumbers width={360} />
          </CardContent>
        </Card>
      </Box>

      <Box direction="column" gap={space[4]} width="grow">
        <Card>
          <CardHeader>
            <CardTitle>VoidMarkdown</CardTitle>
            <CardDescription>Rendered markdown content</CardDescription>
          </CardHeader>
          <CardContent>
            <VoidMarkdown
              content={sampleMarkdown}
              syntaxStyle={syntaxStyle}
              width={360}
            />
          </CardContent>
        </Card>
      </Box>
    </Box>
  )
}

// ── Overlays Tab ──

function OverlaysTab() {
  const [dialogOpen, setDialogOpen] = createSignal(false)
  const toaster = createVoidToaster({ position: "bottom-right" })

  return (
    <Box direction="row" gap={space[4]} alignY="top">
      <Box direction="column" gap={space[4]} width="grow">
        <Card>
          <CardHeader>
            <CardTitle>Dialog</CardTitle>
            <CardDescription>Modal with backdrop blur</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onPress={() => setDialogOpen(true)}>Open Dialog</Button>
          </CardContent>
        </Card>

        <Show when={dialogOpen()}>
          <VoidDialog onClose={() => setDialogOpen(false)} width={360}>
            <VoidDialogTitle>Confirm Action</VoidDialogTitle>
            <VoidDialogDescription>
              Are you sure you want to proceed? This action cannot be undone.
            </VoidDialogDescription>
            <VoidDialogFooter>
              <Button variant="outline" onPress={() => setDialogOpen(false)}>Cancel</Button>
              <Button variant="destructive" onPress={() => setDialogOpen(false)}>Delete</Button>
            </VoidDialogFooter>
          </VoidDialog>
        </Show>

        <Card>
          <CardHeader>
            <CardTitle>Toasts</CardTitle>
            <CardDescription>Notification system</CardDescription>
          </CardHeader>
          <CardContent>
            <Box direction="row" gap={space[2]}>
              <Button size="sm" onPress={() => toaster.toast({ message: "Saved successfully", variant: "success" })}>
                Success
              </Button>
              <Button size="sm" variant="destructive" onPress={() => toaster.toast({ message: "Something went wrong", variant: "error" })}>
                Error
              </Button>
              <Button size="sm" variant="outline" onPress={() => toaster.toast({ message: "New update available", variant: "info" })}>
                Info
              </Button>
            </Box>
          </CardContent>
        </Card>
      </Box>

      <Box direction="column" gap={space[4]} width="grow">
        <Card>
          <CardHeader>
            <CardTitle>Tooltip</CardTitle>
            <CardDescription>Hover for details</CardDescription>
          </CardHeader>
          <CardContent>
            <Box direction="row" gap={space[3]}>
              <VoidTooltip content="This is a tooltip">
                <Button variant="outline" size="sm" onPress={() => {}}>Hover me</Button>
              </VoidTooltip>
              <VoidTooltip content="Another tooltip with longer text">
                <Badge>Info</Badge>
              </VoidTooltip>
            </Box>
          </CardContent>
        </Card>
      </Box>
    </Box>
  )
}

// ── Typography Tab ──

function TypographyTab() {
  return (
    <Box direction="row" gap={space[4]} alignY="top">
      <Box direction="column" gap={space[4]} width="grow">
        <Card>
          <CardHeader>
            <CardTitle>Heading Scale</CardTitle>
          </CardHeader>
          <CardContent>
            <Box direction="column" gap={space[3]}>
              <H1>Heading 1</H1>
              <H2>Heading 2</H2>
              <H3>Heading 3</H3>
              <H4>Heading 4</H4>
            </Box>
          </CardContent>
        </Card>
      </Box>

      <Box direction="column" gap={space[4]} width="grow">
        <Card>
          <CardHeader>
            <CardTitle>Body Text</CardTitle>
          </CardHeader>
          <CardContent>
            <Box direction="column" gap={space[3]}>
              <Lead>Lead — introductory text that stands out.</Lead>
              <P>Paragraph — standard body text for content areas.</P>
              <Large>Large — emphasized text for callouts.</Large>
              <Small>Small — captions, labels, and metadata.</Small>
              <Muted>Muted — secondary information, less important.</Muted>
            </Box>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Separator</CardTitle>
          </CardHeader>
          <CardContent>
            <Box direction="column" gap={space[2]}>
              <P>Content above</P>
              <Separator />
              <P>Content below</P>
            </Box>
          </CardContent>
        </Card>
      </Box>
    </Box>
  )
}

// ── App ──

function App() {
  const terminal = useAppTerminal()
  const dims = useTerminalDimensions(terminal)
  const [tab, setTab] = createSignal(0)

  return (
    <Box
      width={dims.width()}
      height={dims.height()}
      backgroundColor={colors.background}
      direction="column"
    >
      {/* Header */}
      <Box
        paddingX={space[6]}
        paddingY={space[3]}
        direction="row"
        alignY="center"
        borderColor={colors.border}
        borderBottom={1}
      >
        <Box direction="column" gap={space[0.5]} width="grow">
          <Text color={colors.foreground} fontSize={font.lg} fontWeight={weight.bold}>
            Void Component Showcase
          </Text>
          <Muted>Every styled component in the Vexart design system</Muted>
        </Box>
        <Badge variant="outline">v0.9</Badge>
      </Box>

      {/* Tabs */}
      <Box paddingX={space[6]} paddingTop={space[3]}>
        <VoidTabs
          activeTab={tab()}
          onTabChange={setTab}
          tabs={[
            { label: "Inputs", content: () => <InputsTab /> },
            { label: "Display", content: () => <DisplayTab /> },
            { label: "Collections", content: () => <CollectionsTab /> },
            { label: "Code & Docs", content: () => <CodeTab /> },
            { label: "Overlays", content: () => <OverlaysTab /> },
            { label: "Typography", content: () => <TypographyTab /> },
          ]}
        />
      </Box>

      {/* Footer */}
      <Box width="grow" />
      <Box
        paddingX={space[6]}
        paddingY={space[2]}
        borderColor={colors.border}
        borderTop={1}
      >
        <Muted>Tab: navigate  Space/Enter: interact  q: exit</Muted>
      </Box>
    </Box>
  )
}

await createApp(() => <App />, {
  quit: ["q", "ctrl+c"],
})
