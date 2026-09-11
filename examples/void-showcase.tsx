/**
 * Vexart Void Showcase — every styled component in one app.
 *
 * Organized by tabs: Inputs, Display, Collections, Overlays, Typography, New.
 * Uses ONLY the public styled API — no raw primitives.
 *
 * Run: bun --conditions=browser run examples/void-showcase.tsx
 */
import { createSignal, Show } from "solid-js"
import { untrack } from "solid-js"
import type { JSX } from "solid-js"
import { useTerminalDimensions, SyntaxStyle, ONE_DARK, setDebug, debugStatsLine, onInput } from "@vexart/engine"
import { createApp, useAppTerminal, Box, Text } from "@vexart/app"
import {
  // Tokens
  colors, radius, space, font, weight, shadows,
  // Theme
  themeColors, darkTheme, lightTheme, setTheme,
  // Typography
  H1, H2, H3, H4, P, Lead, Large, Small, Muted,
  // Components
  VoidButton,
  VoidCard as BaseVoidCard, VoidCardHeader, VoidCardTitle, VoidCardDescription, VoidCardContent, VoidCardFooter,
  VoidBadge,
  VoidAvatar,
  VoidSeparator,
  VoidSkeleton,
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

type ShowcaseCardProps = { children?: JSX.Element }

function VoidCard(props: ShowcaseCardProps) {
  const content = untrack(() => props.children)
  return <BaseVoidCard size="sm">{content}</BaseVoidCard>
}

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
    <Box width="100%" direction="row" gap={space[4]} alignY="top">
      {/* Column 1 */}
      <Box direction="column" gap={space[4]} width="grow">
        <VoidCard>
          <VoidCardHeader>
            <VoidCardTitle>Text Inputs</VoidCardTitle>
            <VoidCardDescription>Single-line and multi-line editors</VoidCardDescription>
          </VoidCardHeader>
          <VoidCardContent>
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
          </VoidCardContent>
        </VoidCard>

        <VoidCard>
          <VoidCardHeader>
            <VoidCardTitle>Selection</VoidCardTitle>
          </VoidCardHeader>
          <VoidCardContent>
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
          </VoidCardContent>
        </VoidCard>
      </Box>

      {/* Column 2 */}
      <Box direction="column" gap={space[4]} width="grow">
        <VoidCard>
          <VoidCardHeader>
            <VoidCardTitle>Toggles</VoidCardTitle>
          </VoidCardHeader>
          <VoidCardContent>
            <Box direction="column" gap={space[3]}>
              <VoidCheckbox checked={checked()} onChange={setChecked} label="Enable notifications" />
              <VoidCheckbox checked={false} label="Marketing emails" />
              <VoidSeparator />
              <VoidSwitch checked={switched()} onChange={setSwitched} label="Dark mode" />
              <VoidSwitch checked={true} label="Auto-save" />
            </Box>
          </VoidCardContent>
        </VoidCard>

        <VoidCard>
          <VoidCardHeader>
            <VoidCardTitle>Radio & Slider</VoidCardTitle>
          </VoidCardHeader>
          <VoidCardContent>
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
              <VoidSeparator />
              <Box direction="column" gap={space[1]}>
                <Small>VoidSlider: {slider()}</Small>
                <VoidSlider value={slider()} onChange={setSlider} min={0} max={100} />
              </Box>
            </Box>
          </VoidCardContent>
        </VoidCard>
      </Box>
    </Box>
  )
}

// ── Display Tab ──

function DisplayTab() {
  return (
    <Box width="100%" direction="row" gap={space[4]} alignY="top">
      <Box direction="column" gap={space[4]} width="grow">
        <VoidCard>
          <VoidCardHeader>
            <VoidCardTitle>Buttons</VoidCardTitle>
            <VoidCardDescription>All variants and sizes</VoidCardDescription>
          </VoidCardHeader>
          <VoidCardContent>
            <Box direction="column" gap={space[3]}>
              <Box direction="row" gap={space[2]} alignY="center">
                <VoidButton variant="default" onPress={() => {}}>Default</VoidButton>
                <VoidButton variant="secondary" onPress={() => {}}>Secondary</VoidButton>
                <VoidButton variant="outline" onPress={() => {}}>Outline</VoidButton>
                <VoidButton variant="ghost" onPress={() => {}}>Ghost</VoidButton>
                <VoidButton variant="destructive" onPress={() => {}}>Destructive</VoidButton>
              </Box>
              <Box direction="row" gap={space[2]} alignY="center">
                <VoidButton size="xs" onPress={() => {}}>XS</VoidButton>
                <VoidButton size="sm" onPress={() => {}}>SM</VoidButton>
                <VoidButton onPress={() => {}}>Default</VoidButton>
                <VoidButton size="lg" onPress={() => {}}>LG</VoidButton>
              </Box>
            </Box>
          </VoidCardContent>
        </VoidCard>

        <VoidCard>
          <VoidCardHeader>
            <VoidCardTitle>Badges</VoidCardTitle>
          </VoidCardHeader>
          <VoidCardContent>
            <Box direction="row" gap={space[2]}>
              <VoidBadge>Default</VoidBadge>
              <VoidBadge variant="secondary">Secondary</VoidBadge>
              <VoidBadge variant="outline">Outline</VoidBadge>
              <VoidBadge variant="destructive">Destructive</VoidBadge>
            </Box>
          </VoidCardContent>
        </VoidCard>

        <VoidCard>
          <VoidCardHeader>
            <VoidCardTitle>Avatar</VoidCardTitle>
          </VoidCardHeader>
          <VoidCardContent>
            <Box direction="row" gap={space[3]} alignY="center">
              <VoidAvatar name="Sarah Chen" size="sm" />
              <VoidAvatar name="Alex Rivera" />
              <VoidAvatar name="Jordan Kim" size="lg" />
              <VoidAvatar name="Custom" color="#56d4c8" />
            </Box>
          </VoidCardContent>
        </VoidCard>
      </Box>

      <Box direction="column" gap={space[4]} width="grow">
        <VoidCard>
          <VoidCardHeader>
            <VoidCardTitle>Card Anatomy</VoidCardTitle>
            <VoidCardDescription>Every Card sub-component</VoidCardDescription>
          </VoidCardHeader>
          <VoidCardContent>
            <P>This is the CardContent area. It holds the main content of the card.</P>
          </VoidCardContent>
          <VoidCardFooter>
            <VoidButton variant="outline" size="sm" onPress={() => {}}>Cancel</VoidButton>
            <VoidButton size="sm" onPress={() => {}}>Save</VoidButton>
          </VoidCardFooter>
        </VoidCard>

        <VoidCard>
          <VoidCardHeader>
            <VoidCardTitle>Progress & Skeleton</VoidCardTitle>
          </VoidCardHeader>
          <VoidCardContent>
            <Box direction="column" gap={space[3]}>
              <Box direction="column" gap={space[1]}>
                <Small>VoidProgress</Small>
                <VoidProgress value={72} max={100} />
              </Box>
              <VoidSeparator />
              <Box direction="column" gap={space[1]}>
                <Small>Skeleton</Small>
                <VoidSkeleton width={200} height={12} />
                <VoidSkeleton width={160} height={12} />
                <VoidSkeleton width={120} height={12} />
              </Box>
            </Box>
          </VoidCardContent>
        </VoidCard>
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
    <Box width="100%" direction="row" gap={space[4]} alignY="top">
      <Box direction="column" gap={space[4]} width="grow">
        <VoidCard>
          <VoidCardHeader>
            <VoidCardTitle>VoidList</VoidCardTitle>
            <VoidCardDescription>Keyboard navigable list</VoidCardDescription>
          </VoidCardHeader>
          <VoidCardContent>
            <VoidList
              items={["Dashboard", "Settings", "Profile", "Notifications", "Billing", "Help"]}
              selectedIndex={listIdx()}
              onSelectedChange={setListIdx}
              width={280}
              height={200}
            />
          </VoidCardContent>
        </VoidCard>

        <VoidCard>
          <VoidCardHeader>
            <VoidCardTitle>VoidScrollView</VoidCardTitle>
            <VoidCardDescription>Themed scrollable container</VoidCardDescription>
          </VoidCardHeader>
          <VoidCardContent>
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
          </VoidCardContent>
        </VoidCard>
      </Box>

      <Box direction="column" gap={space[4]} width="grow">
        <VoidCard>
          <VoidCardHeader>
            <VoidCardTitle>VoidTable</VoidCardTitle>
            <VoidCardDescription>Striped data table with selection</VoidCardDescription>
          </VoidCardHeader>
          <VoidCardContent>
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
          </VoidCardContent>
        </VoidCard>
      </Box>
    </Box>
  )
}

// ── Code & Markdown Tab ──

function CodeTab() {
  const sampleCode = `import { createApp, Box, Text, VoidCard, VoidButton } from "vexart"
function App() {
  return (
    <VoidCard>
      <VoidButton onPress={() => save()}>
        Save Changes
      </VoidButton>
    </VoidCard>
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
@@ -1,3 +1,3 @@
-  "name": "@vxrt/core",
+  "name": "vexart",
    "version": "0.10.0-beta.3"`

  return (
    <Box width="100%" direction="row" gap={space[4]} alignY="top">
      <Box direction="column" gap={space[4]} width="grow">
        <VoidCard>
          <VoidCardHeader>
            <VoidCardTitle>VoidCode</VoidCardTitle>
            <VoidCardDescription>Syntax-highlighted code block</VoidCardDescription>
          </VoidCardHeader>
          <VoidCardContent>
            <VoidCode
              content={sampleCode}
              language="typescript"
              syntaxStyle={syntaxStyle}
              width={360}
              lineNumbers
            />
          </VoidCardContent>
        </VoidCard>

        <VoidCard>
          <VoidCardHeader>
            <VoidCardTitle>VoidDiff</VoidCardTitle>
            <VoidCardDescription>Unified diff viewer</VoidCardDescription>
          </VoidCardHeader>
          <VoidCardContent>
            <VoidDiff diff={sampleDiff} showLineNumbers width={360} />
          </VoidCardContent>
        </VoidCard>
      </Box>

      <Box direction="column" gap={space[4]} width="grow">
        <VoidCard>
          <VoidCardHeader>
            <VoidCardTitle>VoidMarkdown</VoidCardTitle>
            <VoidCardDescription>Rendered markdown content</VoidCardDescription>
          </VoidCardHeader>
          <VoidCardContent>
            <VoidMarkdown
              content={sampleMarkdown}
              syntaxStyle={syntaxStyle}
              width={360}
            />
          </VoidCardContent>
        </VoidCard>
      </Box>
    </Box>
  )
}

// ── Overlays Tab ──

function OverlaysTab() {
  const [dialogOpen, setDialogOpen] = createSignal(false)
  const toaster = createVoidToaster({ position: "bottom-right" })

  return (
    <Box width="100%" direction="row" gap={space[4]} alignY="top">
      <Box direction="column" gap={space[4]} width="grow">
        <VoidCard>
          <VoidCardHeader>
            <VoidCardTitle>Dialog</VoidCardTitle>
            <VoidCardDescription>Modal with backdrop blur</VoidCardDescription>
          </VoidCardHeader>
          <VoidCardContent>
            <VoidButton onPress={() => setDialogOpen(true)}>Open Dialog</VoidButton>
          </VoidCardContent>
        </VoidCard>

        <Show when={dialogOpen()}>
          <VoidDialog onClose={() => setDialogOpen(false)} width={360}>
            <VoidDialogTitle>Confirm Action</VoidDialogTitle>
            <VoidDialogDescription>
              Are you sure you want to proceed? This action cannot be undone.
            </VoidDialogDescription>
            <VoidDialogFooter>
              <VoidButton variant="outline" onPress={() => setDialogOpen(false)}>Cancel</VoidButton>
              <VoidButton variant="destructive" onPress={() => setDialogOpen(false)}>Delete</VoidButton>
            </VoidDialogFooter>
          </VoidDialog>
        </Show>

        <VoidCard>
          <VoidCardHeader>
            <VoidCardTitle>Toasts</VoidCardTitle>
            <VoidCardDescription>Notification system</VoidCardDescription>
          </VoidCardHeader>
          <VoidCardContent>
            <Box direction="row" gap={space[2]}>
              <VoidButton size="sm" onPress={() => toaster.toast({ message: "Saved successfully", variant: "success" })}>
                Success
              </VoidButton>
              <VoidButton size="sm" variant="destructive" onPress={() => toaster.toast({ message: "Something went wrong", variant: "error" })}>
                Error
              </VoidButton>
              <VoidButton size="sm" variant="outline" onPress={() => toaster.toast({ message: "New update available", variant: "info" })}>
                Info
              </VoidButton>
            </Box>
          </VoidCardContent>
        </VoidCard>
      </Box>

      <Box direction="column" gap={space[4]} width="grow">
        <VoidCard>
          <VoidCardHeader>
            <VoidCardTitle>Tooltip</VoidCardTitle>
            <VoidCardDescription>Hover for details</VoidCardDescription>
          </VoidCardHeader>
          <VoidCardContent>
            <Box direction="row" gap={space[3]}>
              <VoidTooltip content="This is a tooltip">
                <VoidButton variant="outline" size="sm" onPress={() => {}}>Hover me</VoidButton>
              </VoidTooltip>
              <VoidTooltip content="Another tooltip with longer text">
                <VoidBadge>Info</VoidBadge>
              </VoidTooltip>
            </Box>
          </VoidCardContent>
        </VoidCard>
      </Box>
    </Box>
  )
}

// ── Typography Tab ──

function TypographyTab() {
  return (
    <Box width="100%" direction="row" gap={space[4]} alignY="top">
      <Box direction="column" gap={space[4]} width="grow">
        <VoidCard>
          <VoidCardHeader>
            <VoidCardTitle>Heading Scale</VoidCardTitle>
          </VoidCardHeader>
          <VoidCardContent>
            <Box direction="column" gap={space[3]}>
              <H1>Heading 1</H1>
              <H2>Heading 2</H2>
              <H3>Heading 3</H3>
              <H4>Heading 4</H4>
            </Box>
          </VoidCardContent>
        </VoidCard>
      </Box>

      <Box direction="column" gap={space[4]} width="grow">
        <VoidCard>
          <VoidCardHeader>
            <VoidCardTitle>Body Text</VoidCardTitle>
          </VoidCardHeader>
          <VoidCardContent>
            <Box direction="column" gap={space[3]}>
              <Lead>Lead — introductory text that stands out.</Lead>
              <P>Paragraph — standard body text for content areas.</P>
              <Large>Large — emphasized text for callouts.</Large>
              <Small>Small — captions, labels, and metadata.</Small>
              <Muted>Muted — secondary information, less important.</Muted>
            </Box>
          </VoidCardContent>
        </VoidCard>

        <VoidCard>
          <VoidCardHeader>
            <VoidCardTitle>Separator</VoidCardTitle>
          </VoidCardHeader>
          <VoidCardContent>
            <Box direction="column" gap={space[2]}>
              <P>Content above</P>
              <VoidSeparator />
              <P>Content below</P>
            </Box>
          </VoidCardContent>
        </VoidCard>
      </Box>
    </Box>
  )
}

// ── App ──

function App() {
  const terminal = useAppTerminal()
  const dims = useTerminalDimensions(terminal)
  const [tab, setTab] = createSignal(0)
  const [perfLine, setPerfLine] = createSignal("")
  const showcaseDebug = process.env.VEXART_DEBUG_SHOWCASE === "1"

  // Keep the default example graphics-only. Diagnostics are opt-in because
  // stderr text can overwrite a Kitty graphics frame while it is displayed.
  if (showcaseDebug) setDebug(true)

  // Instrument tab switches
  function onTabSwitch(index: number) {
    const t0 = performance.now()
    setTab(index)
    const t1 = performance.now()
    const msg = `[tab-switch] setTab(${index}): ${(t1 - t0).toFixed(2)}ms`
    if (showcaseDebug) {
      setPerfLine(msg)
      console.error(msg)
    }
  }

  // Log frame stats after each input
  if (showcaseDebug) {
    onInput((e) => {
      if (e.type === "key" || e.type === "mouse") {
        queueMicrotask(() => {
          const stats = debugStatsLine()
          if (stats) console.error(`[frame] ${stats}`)
        })
      }
    })
  }

  return (
    <Box
      width={dims.width()}
      height={dims.height()}
      backgroundColor={colors.background}
      direction="column"
    >
      <Box width="100%" height={space[2]} />
      {/* Header */}
      <Box
        width="100%"
        paddingX={space[6]}
        paddingTop={space[4]}
        paddingBottom={space[2]}
        direction="row"
        alignY="center"
        borderColor={colors.border}
        borderBottom={1}
      >
        <Box direction="column" gap={space[0.5]} width="grow">
          <Text color={colors.foreground} fontSize={font.lg} fontWeight={weight.bold} marginTop={space[1]}>
            Void Component Showcase
          </Text>
          <Muted>Every styled component in the Vexart design system · Tab navigate · Space/Enter interact · q exit</Muted>
        </Box>
        <Box direction="row" gap={space[2]} alignY="center">
          <Text color="#f59e0b" fontSize={font.xs}>{perfLine()}</Text>
          <VoidBadge variant="outline">v0.9</VoidBadge>
        </Box>
      </Box>

      {/* Tabs */}
      <Box width="100%" paddingX={space[6]} paddingTop={space[3]}>
        <VoidTabs
          activeTab={tab()}
          onTabChange={onTabSwitch}
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

    </Box>
  )
}

await createApp(() => <App />, {
  quit: ["q", "ctrl+c"],
})
