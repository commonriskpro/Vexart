/**
 * Vexart Void Showcase — every styled component in one app.
 *
 * Organized by tabs: Inputs, Display, Collections, Code & Docs, Overlays, Typography.
 * Canonical demonstration of Web-Native JSX, Tailwind className utilities,
 * Void 2.0 Obsidian visual system (glassmorphism, gradients, glows), and live theme reactivity.
 *
 * Run: bun run showcase
 */
import {
  // SolidJS reactivity & control flow
  createSignal,
  Show,
  untrack,
  type JSX,

  // App lifecycle
  createApp,
  useAppTerminal,

  // Engine hooks & debug
  useTerminalDimensions,
  onInput,
  debugStatsLine,
  focusedId,

  // Tokens
  radius,
  space,
  font,
  weight,
  shadows,
  glows,
  gradients,
  borders,

  // Theme
  themeColors,
  darkTheme,
  lightTheme,
  setTheme,

  // Typography
  H1,
  H2,
  H3,
  H4,
  P,
  Lead,
  Large,
  Small,
  Muted,

  // Components
  VoidButton,
  VoidCard as BaseVoidCard,
  VoidCardHeader,
  VoidCardTitle,
  VoidCardDescription,
  VoidCardContent,
  VoidCardFooter,
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
  VoidDialog,
  VoidDialogTitle,
  VoidDialogDescription,
  VoidDialogFooter,
  VoidDropdownMenu,
  VoidPopover,
  VoidTooltip,
  VoidCode,
  VoidMarkdown,
  VoidList,
  VoidScrollView,
  VoidDiff,
  createVoidToaster,
} from "vexart"

const TS_KEYWORDS = new Set(["const", "function", "return", "type", "import", "export", "from", "async", "await", "let", "var"])
const TS_TYPES = new Set(["number", "string", "boolean", "any", "void"])

function showcaseHighlighter(code: string): Array<Array<{ text: string; color: string }>> {
  return code.split("\n").map((line) => {
    const tokens: Array<{ text: string; color: string }> = []
    const regex = /(".*?"|'.*?'|[a-zA-Z_$][a-zA-Z0-9_$]*|\d+|[^\s\w]+|\s+)/g
    let match: RegExpExecArray | null
    while ((match = regex.exec(line)) !== null) {
      const text = match[0]
      if (TS_KEYWORDS.has(text)) {
        tokens.push({ text, color: "#c678dd" })
      } else if (TS_TYPES.has(text)) {
        tokens.push({ text, color: "#e5c07b" })
      } else if (text.startsWith('"') || text.startsWith("'")) {
        tokens.push({ text, color: "#98c379" })
      } else if (/^\d+$/.test(text)) {
        tokens.push({ text, color: "#d19a66" })
      } else {
        tokens.push({ text, color: "#abb2bf" })
      }
    }
    return tokens.length > 0 ? tokens : [{ text: "", color: "#abb2bf" }]
  })
}

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
    <div className="w-full flex-row gap-4 items-start">
      {/* Column 1 */}
      <section className="flex-col gap-4 flex-1">
        <VoidCard>
          <VoidCardHeader>
            <VoidCardTitle>Text Inputs</VoidCardTitle>
            <VoidCardDescription>Single-line and multi-line editors</VoidCardDescription>
          </VoidCardHeader>
          <VoidCardContent>
            <div className="flex-col gap-4">
              <div className="flex-col gap-1">
                <Small>VoidInput</Small>
                <VoidInput value={text()} onChange={setText} placeholder="Type here..." />
              </div>
              <div className="flex-col gap-1">
                <Small>VoidTextarea</Small>
                <VoidTextarea value={area()} onChange={setArea} width={300} height={100} />
              </div>
            </div>
          </VoidCardContent>
        </VoidCard>

        <VoidCard>
          <VoidCardHeader>
            <VoidCardTitle>Selection</VoidCardTitle>
            <VoidCardDescription>Dropdown and combobox pickers</VoidCardDescription>
          </VoidCardHeader>
          <VoidCardContent>
            <div className="flex-col gap-4">
              <div className="flex-col gap-1">
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
              </div>
              <div className="flex-col gap-1">
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
              </div>
            </div>
          </VoidCardContent>
        </VoidCard>
      </section>

      {/* Column 2 */}
      <section className="flex-col gap-4 flex-1">
        <VoidCard>
          <VoidCardHeader>
            <VoidCardTitle>Toggles</VoidCardTitle>
            <VoidCardDescription>Switches and checkboxes</VoidCardDescription>
          </VoidCardHeader>
          <VoidCardContent>
            <div className="flex-col gap-3">
              <VoidCheckbox checked={checked()} onChange={setChecked} label="Enable notifications" />
              <VoidCheckbox checked={false} label="Marketing emails" />
              <VoidSeparator />
              <VoidSwitch checked={switched()} onChange={setSwitched} label="Dark mode" />
              <VoidSwitch checked={true} label="Auto-save" />
            </div>
          </VoidCardContent>
        </VoidCard>

        <VoidCard>
          <VoidCardHeader>
            <VoidCardTitle>Radio &amp; Slider</VoidCardTitle>
            <VoidCardDescription>Discrete and continuous values</VoidCardDescription>
          </VoidCardHeader>
          <VoidCardContent>
            <div className="flex-col gap-4">
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
              <div className="flex-col gap-1">
                <Small>VoidSlider: {slider()}</Small>
                <VoidSlider value={slider()} onChange={setSlider} min={0} max={100} />
              </div>
            </div>
          </VoidCardContent>
        </VoidCard>
      </section>
    </div>
  )
}

// ── Display Tab ──

function DisplayTab() {
  return (
    <div className="w-full flex-row gap-4 items-start">
      <section className="flex-col gap-4 flex-1">
        <VoidCard>
          <VoidCardHeader>
            <VoidCardTitle>Buttons</VoidCardTitle>
            <VoidCardDescription>All variants and sizes + Web-Native button</VoidCardDescription>
          </VoidCardHeader>
          <VoidCardContent>
            <div className="flex-col gap-3">
              <div className="flex-row gap-2 items-center">
                <VoidButton variant="default" onPress={() => {}}>Default</VoidButton>
                <VoidButton variant="secondary" onPress={() => {}}>Secondary</VoidButton>
                <VoidButton variant="outline" onPress={() => {}}>Outline</VoidButton>
                <VoidButton variant="ghost" onPress={() => {}}>Ghost</VoidButton>
                <VoidButton variant="destructive" onPress={() => {}}>Destructive</VoidButton>
              </div>
              <div className="flex-row gap-2 items-center">
                <VoidButton size="xs" onPress={() => {}}>XS</VoidButton>
                <VoidButton size="sm" onPress={() => {}}>SM</VoidButton>
                <VoidButton onPress={() => {}}>Default</VoidButton>
                <VoidButton size="lg" onPress={() => {}}>LG</VoidButton>
              </div>
              <VoidSeparator />
              <div className="flex-col gap-1.5">
                <Small>Web-Native &lt;button&gt; with Tailwind className &amp; onClick</Small>
                <div className="flex-row gap-2 items-center">
                  <button
                    onClick={() => {}}
                    className="px-3 py-1.5 rounded-md text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white"
                  >
                    Native JSX &lt;button&gt;
                  </button>
                  <span className="text-xs text-muted-foreground">Bare text string inside &lt;span&gt;</span>
                </div>
              </div>
            </div>
          </VoidCardContent>
        </VoidCard>

        <VoidCard>
          <VoidCardHeader>
            <VoidCardTitle>Badges</VoidCardTitle>
            <VoidCardDescription>Status indicators and tags</VoidCardDescription>
          </VoidCardHeader>
          <VoidCardContent>
            <div className="flex-row gap-2">
              <VoidBadge>Default</VoidBadge>
              <VoidBadge variant="secondary">Secondary</VoidBadge>
              <VoidBadge variant="outline">Outline</VoidBadge>
              <VoidBadge variant="destructive">Destructive</VoidBadge>
            </div>
          </VoidCardContent>
        </VoidCard>

        <VoidCard>
          <VoidCardHeader>
            <VoidCardTitle>Avatar</VoidCardTitle>
            <VoidCardDescription>User initials and custom colored avatars</VoidCardDescription>
          </VoidCardHeader>
          <VoidCardContent>
            <div className="flex-row gap-3 items-center">
              <VoidAvatar name="Sarah Chen" size="sm" />
              <VoidAvatar name="Alex Rivera" />
              <VoidAvatar name="Jordan Kim" size="lg" />
              <VoidAvatar name="Custom" color="#56d4c8" />
            </div>
          </VoidCardContent>
        </VoidCard>
      </section>

      <section className="flex-col gap-4 flex-1">
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
            <VoidCardTitle>Progress &amp; Skeleton</VoidCardTitle>
            <VoidCardDescription>Loading states and gauges</VoidCardDescription>
          </VoidCardHeader>
          <VoidCardContent>
            <div className="flex-col gap-3">
              <div className="flex-col gap-1">
                <Small>VoidProgress</Small>
                <VoidProgress value={72} max={100} />
              </div>
              <VoidSeparator />
              <div className="flex-col gap-1">
                <Small>Skeleton</Small>
                <VoidSkeleton width={200} height={12} />
                <VoidSkeleton width={160} height={12} />
                <VoidSkeleton width={120} height={12} />
              </div>
            </div>
          </VoidCardContent>
        </VoidCard>
      </section>
    </div>
  )
}

// ── Collections Tab ──

function CollectionsTab() {
  const [listIdx, setListIdx] = createSignal(0)
  const [tableRow, setTableRow] = createSignal(0)

  const tableData = [
    { name: "vexart", version: "1.0.0-beta.11", downloads: "12,470" },
    { name: "solid-js", version: "1.9.0", downloads: "892,341" },
    { name: "flexily", version: "0.6.0", downloads: "3,128" },
    { name: "wgpu", version: "29.0", downloads: "—" },
    { name: "marked", version: "18.0", downloads: "45,000,000" },
  ]

  return (
    <div className="w-full flex-row gap-4 items-start">
      <section className="flex-col gap-4 flex-1">
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
              <P>Line 6: 25 headless primitives out of the box.</P>
              <P>Line 7: Void design system with dark &amp; light theme.</P>
              <P>Line 8: Supports Kitty, Ghostty, and WezTerm.</P>
            </VoidScrollView>
          </VoidCardContent>
        </VoidCard>
      </section>

      <section className="flex-col gap-4 flex-1">
        <VoidCard>
          <VoidCardHeader>
            <VoidCardTitle>VoidTable</VoidCardTitle>
            <VoidCardDescription>Striped data table with selection</VoidCardDescription>
          </VoidCardHeader>
          <VoidCardContent>
            <VoidTable
              columns={[
                { key: "name", header: "Package", width: 120 },
                { key: "version", header: "Version", width: 90 },
                { key: "downloads", header: "Downloads", width: 120 },
              ]}
              data={tableData}
              selectedRow={tableRow()}
              onSelectedRowChange={setTableRow}
            />
          </VoidCardContent>
        </VoidCard>
      </section>
    </div>
  )
}

// ── Code & Markdown Tab ──

function CodeTab() {
  const sampleCode = `import { createApp, VoidCard, VoidButton } from "vexart"

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
- 25 headless primitives
- Void 2.0 Obsidian design system
- Web-Native JSX & Tailwind className

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
-  "version": "0.10.0-beta.9"
+  "version": "1.0.0-beta.11"`

  return (
    <div className="w-full flex-row gap-4 items-start">
      <section className="flex-col gap-4 flex-1">
        <VoidCard>
          <VoidCardHeader>
            <VoidCardTitle>VoidCode</VoidCardTitle>
            <VoidCardDescription>Syntax-highlighted code block</VoidCardDescription>
          </VoidCardHeader>
          <VoidCardContent>
            <VoidCode
              content={sampleCode}
              language="typescript"
              highlighter={showcaseHighlighter}
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
      </section>

      <section className="flex-col gap-4 flex-1">
        <VoidCard>
          <VoidCardHeader>
            <VoidCardTitle>VoidMarkdown</VoidCardTitle>
            <VoidCardDescription>Rendered markdown content</VoidCardDescription>
          </VoidCardHeader>
          <VoidCardContent>
            <VoidMarkdown
              content={sampleMarkdown}
              highlighter={showcaseHighlighter}
              width={360}
            />
          </VoidCardContent>
        </VoidCard>
      </section>
    </div>
  )
}

// ── Overlays Tab ──

function OverlaysTab() {
  const [dialogOpen, setDialogOpen] = createSignal(false)
  const [dropdownOpen, setDropdownOpen] = createSignal(false)
  const [popoverOpen, setPopoverOpen] = createSignal(false)
  const toaster = createVoidToaster({ position: "bottom-right" })

  return (
    <div className="w-full flex-row gap-4 items-start">
      <section className="flex-col gap-4 flex-1">
        <VoidCard>
          <VoidCardHeader>
            <VoidCardTitle>Dialog</VoidCardTitle>
            <VoidCardDescription>Modal with backdrop blur &amp; ambient glow</VoidCardDescription>
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
            <VoidCardTitle>Dropdown Menu</VoidCardTitle>
            <VoidCardDescription>Glassmorphic menu with item selection</VoidCardDescription>
          </VoidCardHeader>
          <VoidCardContent>
            <VoidDropdownMenu open={dropdownOpen()} onOpenChange={setDropdownOpen}>
              <VoidDropdownMenu.Trigger>
                <VoidButton variant="outline" size="sm" onPress={() => setDropdownOpen(!dropdownOpen())}>
                  Options Menu ▾
                </VoidButton>
              </VoidDropdownMenu.Trigger>
              <VoidDropdownMenu.Content>
                <VoidDropdownMenu.Label>Actions</VoidDropdownMenu.Label>
                <VoidDropdownMenu.Item onSelect={() => toaster.toast({ message: "Profile opened", variant: "info" })}>
                  Profile
                </VoidDropdownMenu.Item>
                <VoidDropdownMenu.Item onSelect={() => toaster.toast({ message: "Settings saved", variant: "success" })}>
                  Settings
                </VoidDropdownMenu.Item>
                <VoidDropdownMenu.Separator />
                <VoidDropdownMenu.Item variant="destructive" onSelect={() => toaster.toast({ message: "Logged out", variant: "error" })}>
                  Log out
                </VoidDropdownMenu.Item>
              </VoidDropdownMenu.Content>
            </VoidDropdownMenu>
          </VoidCardContent>
        </VoidCard>

        <VoidCard>
          <VoidCardHeader>
            <VoidCardTitle>Toasts</VoidCardTitle>
            <VoidCardDescription>Notification system</VoidCardDescription>
          </VoidCardHeader>
          <VoidCardContent>
            <div className="flex-row gap-2">
              <VoidButton size="sm" onPress={() => toaster.toast({ message: "Saved successfully", variant: "success" })}>
                Success
              </VoidButton>
              <VoidButton size="sm" variant="destructive" onPress={() => toaster.toast({ message: "Something went wrong", variant: "error" })}>
                Error
              </VoidButton>
              <VoidButton size="sm" variant="outline" onPress={() => toaster.toast({ message: "New update available", variant: "info" })}>
                Info
              </VoidButton>
            </div>
          </VoidCardContent>
        </VoidCard>
      </section>

      <section className="flex-col gap-4 flex-1">
        <VoidCard>
          <VoidCardHeader>
            <VoidCardTitle>Popover</VoidCardTitle>
            <VoidCardDescription>Floating panel with backdrop blur &amp; glass</VoidCardDescription>
          </VoidCardHeader>
          <VoidCardContent>
            <VoidPopover
              open={popoverOpen()}
              onOpenChange={setPopoverOpen}
              trigger={
                <VoidButton variant="secondary" size="sm" onPress={() => setPopoverOpen(!popoverOpen())}>
                  Open Popover
                </VoidButton>
              }
            >
              <div className="flex-col gap-2 p-1">
                <span className="text-xs font-semibold text-foreground">Glassmorphic Popover</span>
                <p className="text-xs text-muted-foreground">
                  Rendered with WGPU backdrop blur, specular rim, and glass gradient.
                </p>
                <VoidButton size="xs" variant="outline" onPress={() => setPopoverOpen(false)}>
                  Close
                </VoidButton>
              </div>
            </VoidPopover>
          </VoidCardContent>
        </VoidCard>

        <VoidCard>
          <VoidCardHeader>
            <VoidCardTitle>Tooltip</VoidCardTitle>
            <VoidCardDescription>Hover for details</VoidCardDescription>
          </VoidCardHeader>
          <VoidCardContent>
            <div className="flex-row gap-3">
              <VoidTooltip content="This is a tooltip">
                <VoidButton variant="outline" size="sm" onPress={() => {}}>Hover me</VoidButton>
              </VoidTooltip>
              <VoidTooltip content="Another tooltip with longer text">
                <VoidBadge>Info</VoidBadge>
              </VoidTooltip>
            </div>
          </VoidCardContent>
        </VoidCard>

        <VoidCard>
          <VoidCardHeader>
            <VoidCardTitle>Void 2.0 Surfaces &amp; Glass</VoidCardTitle>
            <VoidCardDescription>WGPU shader effects: glassmorphism, specular rim &amp; glow</VoidCardDescription>
          </VoidCardHeader>
          <VoidCardContent>
            <div className="flex-col gap-3">
              {/* Glass surface */}
              <div
                className="w-full p-3 flex-col gap-1 border"
                backdropBlur={16}
                gradient={gradients.glass}
                borderColor={borders.glassRim}
                borderWidth={1}
                cornerRadius={radius.lg}
                shadow={shadows.md}
                glow={glows.ambient}
              >
                <span className="text-xs font-semibold text-foreground">Glass Surface (Backdrop Blur 16px)</span>
                <p className="text-xs text-muted-foreground">Specular rim border with ambient glow and glass gradient</p>
              </div>

              {/* Gradient buttons & primary glow */}
              <div className="flex-row gap-2 items-center">
                <div
                  className="px-3 py-1.5 flex-row items-center justify-center border"
                  gradient={gradients.primaryButton}
                  borderColor={borders.rimTop}
                  borderWidth={1}
                  cornerRadius={radius.md}
                  glow={glows.primary}
                >
                  <span className="text-xs font-bold text-black">Primary Gradient + Glow</span>
                </div>

                <div
                  className="px-3 py-1.5 flex-row items-center justify-center border"
                  gradient={gradients.secondaryButton}
                  borderColor={borders.hairline}
                  borderWidth={1}
                  cornerRadius={radius.md}
                >
                  <span className="text-xs font-medium text-foreground">Secondary Rim</span>
                </div>
              </div>
            </div>
          </VoidCardContent>
        </VoidCard>
      </section>
    </div>
  )
}

// ── Typography Tab ──

function TypographyTab() {
  return (
    <div className="w-full flex-row gap-4 items-start">
      <section className="flex-col gap-4 flex-1">
        <VoidCard>
          <VoidCardHeader>
            <VoidCardTitle>Heading Scale</VoidCardTitle>
            <VoidCardDescription>Typography components &amp; Web-Native headings</VoidCardDescription>
          </VoidCardHeader>
          <VoidCardContent>
            <div className="flex-col gap-3">
              <H1>Heading 1</H1>
              <H2>Heading 2</H2>
              <H3>Heading 3</H3>
              <H4>Heading 4</H4>
              <VoidSeparator />
              <div className="flex-col gap-1">
                <Small>Web-Native JSX Headings</Small>
                <h1 className="text-xl font-bold text-foreground">Web-Native &lt;h1&gt; Tag</h1>
                <h2 className="text-lg font-semibold text-foreground">Web-Native &lt;h2&gt; Tag</h2>
                <h3 className="text-sm font-semibold text-muted-foreground">Web-Native &lt;h3&gt; Tag</h3>
              </div>
            </div>
          </VoidCardContent>
        </VoidCard>
      </section>

      <section className="flex-col gap-4 flex-1">
        <VoidCard>
          <VoidCardHeader>
            <VoidCardTitle>Body Text</VoidCardTitle>
            <VoidCardDescription>Prose and microcopy primitives</VoidCardDescription>
          </VoidCardHeader>
          <VoidCardContent>
            <div className="flex-col gap-3">
              <Lead>Lead — introductory text that stands out.</Lead>
              <P>Paragraph — standard body text for content areas.</P>
              <Large>Large — emphasized text for callouts.</Large>
              <Small>Small — captions, labels, and metadata.</Small>
              <Muted>Muted — secondary information, less important.</Muted>
              <VoidSeparator />
              <div className="flex-col gap-1">
                <Small>Web-Native JSX Paragraph &amp; Spans</Small>
                <p className="text-xs text-foreground">
                  Standard Web-Native <span className="font-bold text-primary">inline text</span> with Tailwind classes.
                </p>
              </div>
            </div>
          </VoidCardContent>
        </VoidCard>

        <VoidCard>
          <VoidCardHeader>
            <VoidCardTitle>Separator</VoidCardTitle>
          </VoidCardHeader>
          <VoidCardContent>
            <div className="flex-col gap-2">
              <P>Content above</P>
              <VoidSeparator />
              <P>Content below</P>
            </div>
          </VoidCardContent>
        </VoidCard>
      </section>
    </div>
  )
}

// ── App ──

function App() {
  const terminal = useAppTerminal()
  const dims = useTerminalDimensions(terminal)
  const [tab, setTab] = createSignal(0)
  const [perfLine, setPerfLine] = createSignal("")
  const [isDark, setIsDark] = createSignal(true)
  const showcaseDebug = process.env.VEXART_DEBUG_SHOWCASE === "1"

  function toggleTheme() {
    if (isDark()) {
      setTheme(lightTheme)
      setIsDark(false)
    } else {
      setTheme(darkTheme)
      setIsDark(true)
    }
  }

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

  // Keyboard shortcut: [T] toggles theme (when not typing in an editor)
  onInput((e) => {
    if (e.type === "key" && (e.key === "t" || e.key === "T") && !e.mods.ctrl && !e.mods.meta && !e.mods.alt) {
      const cur = focusedId()
      if (!cur || (!cur.includes("input") && !cur.includes("textarea") && !cur.includes("editor"))) {
        toggleTheme()
      }
    }
  })

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
    <div
      className="w-full h-full flex-col bg-background"
      width={dims.width()}
      height={dims.height()}
    >
      <div className="w-full h-2" />

      {/* Header */}
      <header className="w-full px-6 pt-3 pb-2.5 flex-row items-center justify-between border-b border-border bg-card/60 backdrop-blur-md">
        <div className="flex-col gap-0.5 flex-1">
          <div className="flex-row items-center gap-3">
            <span className="text-lg font-bold text-foreground">Void Component Showcase</span>
            <VoidBadge variant="outline">v1.0</VoidBadge>
            <Show when={perfLine()}>
              <span className="text-xs text-amber-500 font-mono">{perfLine()}</span>
            </Show>
          </div>
          <p className="text-xs text-muted-foreground">
            Void 2.0 Obsidian Design System · 25 headless primitives · [Tab] navigate · [T] theme · [Q] quit
          </p>
        </div>

        <div className="flex-row items-center gap-2">
          <VoidButton
            variant="outline"
            size="xs"
            onPress={toggleTheme}
          >
            {isDark() ? "🌙 Dark" : "☀️ Light"} [T]
          </VoidButton>
        </div>
      </header>

      {/* Tabs */}
      <main className="w-full flex-1 px-6 pt-3">
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
      </main>

      {/* Footer */}
      <footer className="w-full px-6 py-1.5 flex-row items-center justify-between border-t border-border bg-card/30">
        <span className="text-xs text-muted-foreground">
          Tab {tab() + 1} of 6 · GPU-accelerated Terminal UI · Kitty / Ghostty / WezTerm
        </span>
        <div className="flex-row items-center gap-3">
          <span className="text-xs text-muted-foreground">
            Theme: <span className="text-foreground font-semibold">{isDark() ? "Obsidian Dark" : "Pure Light"}</span>
          </span>
          <span className="text-xs text-muted-foreground">
            Press <span className="text-foreground font-semibold">T</span> to toggle
          </span>
        </div>
      </footer>
    </div>
  )
}

await createApp(() => <App />, {
  quit: ["q", "ctrl+c"],
})
