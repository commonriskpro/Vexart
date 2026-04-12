/**
 * TGE Comprehensive Showcase — validates EVERY engine feature visually.
 *
 * Structure: Tabbed UI with 7 tabs, each validating a feature category.
 * Tab navigation: Left/Right arrows (or 1-7 keys).
 * Within each tab: scroll content with mouse wheel.
 *
 * Features validated:
 *   Tab 1 — Visual Effects: shadows, glow, gradients (linear/radial), per-corner radius, multi-shadow
 *   Tab 2 — Backdrop Filters: 7 CSS filters + glassmorphism + element opacity
 *   Tab 3 — Interactive: focusStyle, onPress, hover/active, Dialog focus trap
 *   Tab 4 — Forms: createForm validation, Combobox, Slider
 *   Tab 5 — Data + Virtual: useQuery mock, VirtualList 1000 items
 *   Tab 6 — Void + Theming: Button variants, Card, Badge, Avatar, dark/light switch
 *   Tab 7 — Event Bubbling: onPress bubbling, stopPropagation, component boundaries
 *
 * Run: bun run showcase
 */

import { createSignal, onCleanup } from "solid-js"
import {
  mount,
  createTerminal,
  onInput,
  useFocus,
  useQuery,
  useTerminalDimensions,
  createTransition,
  createSpring,
  For,
  Show,
} from "@tge/renderer"
import {
  Slider,
  Combobox,
  VirtualList,
  Dialog,
  createForm,
} from "@tge/components"
import {
  Button,
  Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter,
  Badge,
  Separator,
  Avatar,
  Skeleton,
  H2, H3, H4, P, Small, Muted,
  colors, themeColors, radius, space, font, weight, shadows,
  darkTheme, lightTheme, setTheme,
} from "@tge/void"

// ── Shared helpers ──

function SectionTitle(props: { children: any }) {
  return <text color={themeColors.mutedForeground} fontSize={font.xs} fontWeight={weight.semibold}>{props.children}</text>
}

function SectionBox(props: { title: string; children: any }) {
  return (
    <box direction="column" gap={space[2]} paddingBottom={space[4]}>
      <SectionTitle>{props.title}</SectionTitle>
      <Separator />
      <box paddingTop={space[1]}>{props.children}</box>
    </box>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TAB 1: Visual Effects
// Validates: shadows, glow, linear/radial gradient, per-corner radius,
//            multi-shadow, gradient + rounded rect masking
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function TabVisualEffects() {
  return (
    <box direction="column" gap={space[4]} padding={space[4]} width="grow">
      {/* Shadows */}
      <SectionBox title="DROP SHADOWS (sm / md / lg / colored)">
        <box direction="row" gap={space[6]}>
          <box backgroundColor={themeColors.card} cornerRadius={radius.lg} padding={space[5]} shadow={shadows.sm}>
            <text color={themeColors.foreground} fontSize={font.sm}>Subtle</text>
          </box>
          <box backgroundColor={themeColors.card} cornerRadius={radius.lg} padding={space[5]} shadow={shadows.md}>
            <text color={themeColors.foreground} fontSize={font.sm}>Elevated</text>
          </box>
          <box backgroundColor={themeColors.card} cornerRadius={radius.lg} padding={space[5]} shadow={shadows.lg}>
            <text color={themeColors.foreground} fontSize={font.sm}>Floating</text>
          </box>
          <box backgroundColor={themeColors.card} cornerRadius={radius.lg} padding={space[5]} shadow={{ x: 4, y: 4, blur: 12, color: 0xa855f760 }}>
            <text color="#a855f7" fontSize={font.sm}>Purple</text>
          </box>
        </box>
      </SectionBox>

      {/* Multi-shadow */}
      <SectionBox title="MULTI-SHADOW (2 + 3 layers)">
        <box direction="row" gap={space[6]}>
          <box
            backgroundColor={themeColors.card} cornerRadius={radius.lg} padding={space[5]}
            shadow={[
              { x: 0, y: 2, blur: 4, color: 0x00000040 },
              { x: 0, y: 8, blur: 24, color: 0x00000030 },
            ]}
          >
            <text color={themeColors.foreground} fontSize={font.sm}>2 shadows</text>
          </box>
          <box
            backgroundColor={themeColors.card} cornerRadius={radius.lg} padding={space[5]}
            shadow={[
              { x: 0, y: 1, blur: 2, color: 0x00000060 },
              { x: 0, y: 4, blur: 8, color: 0x00000040 },
              { x: 0, y: 16, blur: 32, color: 0x00000020 },
            ]}
          >
            <text color={themeColors.foreground} fontSize={font.sm}>3 shadows</text>
          </box>
        </box>
      </SectionBox>

      {/* Glow */}
      <SectionBox title="GLOW EFFECTS (4 colors)">
        <box direction="row" gap={space[6]}>
          <box backgroundColor={themeColors.card} cornerRadius={radius.lg} padding={space[5]} glow={{ radius: 20, color: "#4fc4d4", intensity: 60 }}>
            <text color="#4fc4d4" fontSize={font.sm}>Cyan</text>
          </box>
          <box backgroundColor={themeColors.card} cornerRadius={radius.lg} padding={space[5]} glow={{ radius: 20, color: "#a855f7", intensity: 60 }}>
            <text color="#a855f7" fontSize={font.sm}>Purple</text>
          </box>
          <box backgroundColor={themeColors.card} cornerRadius={radius.lg} padding={space[5]} glow={{ radius: 20, color: "#f59e0b", intensity: 60 }}>
            <text color="#f59e0b" fontSize={font.sm}>Amber</text>
          </box>
          <box backgroundColor={themeColors.card} cornerRadius={radius.lg} padding={space[5]} glow={{ radius: 20, color: "#22c55e", intensity: 60 }}>
            <text color="#22c55e" fontSize={font.sm}>Green</text>
          </box>
        </box>
      </SectionBox>

      {/* Linear gradients */}
      <SectionBox title="LINEAR GRADIENT (3 angles)">
        <box direction="row" gap={space[3]}>
          <box width={140} height={60} cornerRadius={radius.lg} gradient={{ type: "linear", from: 0x1a1a2eff, to: 0x3a1a5eff, angle: 90 }} padding={space[2]}>
            <text color={themeColors.foreground} fontSize={font.xs}>90°</text>
          </box>
          <box width={140} height={60} cornerRadius={radius.lg} gradient={{ type: "linear", from: 0x56d4c8ff, to: 0x5090d0ff, angle: 0 }} padding={space[2]}>
            <text color={0x000000ff} fontSize={font.xs}>0°</text>
          </box>
          <box width={140} height={60} cornerRadius={radius.lg} gradient={{ type: "linear", from: 0xdc2626ff, to: 0xf59e0bff, angle: 45 }} padding={space[2]}>
            <text color={0x000000ff} fontSize={font.xs}>45°</text>
          </box>
        </box>
      </SectionBox>

      {/* Radial gradient */}
      <SectionBox title="RADIAL GRADIENT">
        <box direction="row" gap={space[3]}>
          <box width={140} height={80} cornerRadius={radius.lg} gradient={{ type: "radial", from: 0x56d4c8ff, to: 0x00000000 }} padding={space[2]}>
            <text color={themeColors.foreground} fontSize={font.xs}>cyan → transparent</text>
          </box>
          <box width={140} height={80} cornerRadius={radius.lg} gradient={{ type: "radial", from: 0xa855f780, to: 0x00000000 }} padding={space[2]}>
            <text color={themeColors.foreground} fontSize={font.xs}>purple glow</text>
          </box>
        </box>
      </SectionBox>

      {/* Per-corner radius */}
      <SectionBox title="PER-CORNER RADIUS">
        <box direction="row" gap={space[3]}>
          <box width={80} height={60} backgroundColor={themeColors.primary} cornerRadii={{ tl: 20, tr: 0, br: 20, bl: 0 }} alignX="center" alignY="center">
            <text color={themeColors.foreground} fontSize={font.xs}>TL+BR</text>
          </box>
          <box width={80} height={60} backgroundColor="#dc2626" cornerRadii={{ tl: 0, tr: 20, br: 0, bl: 20 }} alignX="center" alignY="center">
            <text color={themeColors.foreground} fontSize={font.xs}>TR+BL</text>
          </box>
          <box width={80} height={60} backgroundColor={themeColors.secondary} cornerRadii={{ tl: 20, tr: 20, br: 0, bl: 0 }} alignX="center" alignY="center">
            <text color={themeColors.foreground} fontSize={font.xs}>Top only</text>
          </box>
          <box width={80} height={60} backgroundColor="#22c55e" cornerRadii={{ tl: 0, tr: 0, br: 20, bl: 20 }} alignX="center" alignY="center">
            <text color="#000" fontSize={font.xs}>Bottom</text>
          </box>
        </box>
      </SectionBox>

      {/* Shadow + glow combined */}
      <SectionBox title="SHADOW + GLOW COMBINED">
        <box direction="row" gap={space[6]}>
          <box backgroundColor={themeColors.card} cornerRadius={radius.xl} padding={space[5]} shadow={shadows.md} glow={{ radius: 16, color: "#4fc4d4", intensity: 50 }}>
            <text color="#4fc4d4" fontSize={font.sm}>Shadow+Glow</text>
          </box>
          <box backgroundColor={themeColors.card} cornerRadius={radius.xl} padding={space[5]} shadow={{ x: 0, y: 6, blur: 16, color: 0xa855f780 }} glow={{ radius: 24, color: "#a855f7", intensity: 40 }}>
            <text color="#a855f7" fontSize={font.sm}>Deep Purple</text>
          </box>
        </box>
      </SectionBox>
    </box>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TAB 2: Backdrop Filters + Opacity
// Validates: backdropBlur, 7 CSS filters, glassmorphism, opacity
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function TabBackdropFilters() {
  return (
    <box direction="column" gap={space[4]} padding={space[4]} width="grow">
      {/* Glassmorphism */}
      <SectionBox title="GLASSMORPHISM (backdrop blur + semi-transparent)">
        <box width={450} height={130} gradient={{ type: "linear", from: 0x56d4c8ff, to: 0xdc2626ff, angle: 0 }}>
          <box direction="row" gap={40} paddingTop={10} paddingLeft={20}>
            <text color={0x000000ff} fontSize={24} fontWeight={700}>BLUR</text>
            <text color={0xffffffff} fontSize={24} fontWeight={700}>TEST</text>
            <text color={0x000000ff} fontSize={24} fontWeight={700}>SHARP</text>
          </box>
          <box
            width={380} height={60}
            backgroundColor={0xffffff20}
            backdropBlur={16}
            cornerRadius={radius.xl}
            borderWidth={1} borderColor={0xffffff30}
            alignX="center" alignY="center"
            floating="parent" floatOffset={{ x: 35, y: 50 }}
          >
            <text color={themeColors.foreground} fontSize={font.sm}>glass panel — content behind is blurred</text>
          </box>
        </box>
      </SectionBox>

      {/* Backdrop filters — each on a gradient background */}
      <SectionBox title="BACKDROP FILTERS (7 CSS-spec filters)">
        <box direction="column" gap={space[3]}>
          {/* Background stripe with text to show filter effects */}
          <box direction="row" gap={space[2]}>
            {/* Brightness */}
            <box width={130} height={80} gradient={{ type: "linear", from: 0x4488ccff, to: 0x22c55eff, angle: 45 }}>
              <box
                width={110} height={40}
                backdropBrightness={180}
                backgroundColor={0xffffff08}
                cornerRadius={radius.md}
                alignX="center" alignY="center"
                floating="parent" floatOffset={{ x: 10, y: 30 }}
              >
                <text color="#fff" fontSize={font.xs}>brightness 180</text>
              </box>
              <text color="#fff" fontSize={font.xs} fontWeight={weight.semibold}>Brightness</text>
            </box>

            {/* Contrast */}
            <box width={130} height={80} gradient={{ type: "linear", from: 0x4488ccff, to: 0x22c55eff, angle: 45 }}>
              <box
                width={110} height={40}
                backdropContrast={200}
                backgroundColor={0xffffff08}
                cornerRadius={radius.md}
                alignX="center" alignY="center"
                floating="parent" floatOffset={{ x: 10, y: 30 }}
              >
                <text color="#fff" fontSize={font.xs}>contrast 200</text>
              </box>
              <text color="#fff" fontSize={font.xs} fontWeight={weight.semibold}>Contrast</text>
            </box>

            {/* Grayscale */}
            <box width={130} height={80} gradient={{ type: "linear", from: 0xdc2626ff, to: 0xf59e0bff, angle: 0 }}>
              <box
                width={110} height={40}
                backdropGrayscale={100}
                backgroundColor={0xffffff08}
                cornerRadius={radius.md}
                alignX="center" alignY="center"
                floating="parent" floatOffset={{ x: 10, y: 30 }}
              >
                <text color="#fff" fontSize={font.xs}>grayscale 100</text>
              </box>
              <text color="#fff" fontSize={font.xs} fontWeight={weight.semibold}>Grayscale</text>
            </box>
          </box>

          <box direction="row" gap={space[2]}>
            {/* Invert */}
            <box width={130} height={80} gradient={{ type: "linear", from: 0x4488ccff, to: 0xa855f7ff, angle: 0 }}>
              <box
                width={110} height={40}
                backdropInvert={100}
                backgroundColor={0xffffff08}
                cornerRadius={radius.md}
                alignX="center" alignY="center"
                floating="parent" floatOffset={{ x: 10, y: 30 }}
              >
                <text color="#000" fontSize={font.xs}>invert 100</text>
              </box>
              <text color="#fff" fontSize={font.xs} fontWeight={weight.semibold}>Invert</text>
            </box>

            {/* Sepia */}
            <box width={130} height={80} gradient={{ type: "linear", from: 0x4488ccff, to: 0x22c55eff, angle: 90 }}>
              <box
                width={110} height={40}
                backdropSepia={100}
                backgroundColor={0xffffff08}
                cornerRadius={radius.md}
                alignX="center" alignY="center"
                floating="parent" floatOffset={{ x: 10, y: 30 }}
              >
                <text color="#fff" fontSize={font.xs}>sepia 100</text>
              </box>
              <text color="#fff" fontSize={font.xs} fontWeight={weight.semibold}>Sepia</text>
            </box>

            {/* Hue rotate */}
            <box width={130} height={80} gradient={{ type: "linear", from: 0xdc2626ff, to: 0x4488ccff, angle: 0 }}>
              <box
                width={110} height={40}
                backdropHueRotate={180}
                backgroundColor={0xffffff08}
                cornerRadius={radius.md}
                alignX="center" alignY="center"
                floating="parent" floatOffset={{ x: 10, y: 30 }}
              >
                <text color="#fff" fontSize={font.xs}>hue +180°</text>
              </box>
              <text color="#fff" fontSize={font.xs} fontWeight={weight.semibold}>Hue Rotate</text>
            </box>
          </box>

          <box direction="row" gap={space[2]}>
            {/* Saturate */}
            <box width={130} height={80} gradient={{ type: "linear", from: 0x4488ccff, to: 0xf59e0bff, angle: 0 }}>
              <box
                width={110} height={40}
                backdropSaturate={0}
                backgroundColor={0xffffff08}
                cornerRadius={radius.md}
                alignX="center" alignY="center"
                floating="parent" floatOffset={{ x: 10, y: 30 }}
              >
                <text color="#fff" fontSize={font.xs}>saturate 0</text>
              </box>
              <text color="#fff" fontSize={font.xs} fontWeight={weight.semibold}>Desaturate</text>
            </box>

            {/* Combined blur + brightness + saturate */}
            <box width={270} height={80} gradient={{ type: "linear", from: 0x22c55eff, to: 0x3b82f6ff, angle: 0 }}>
              <box direction="row" gap={30} paddingTop={6} paddingLeft={15}>
                <text color={0x000000ff} fontSize={20} fontWeight={700}>TGE</text>
                <text color={0xffffffff} fontSize={20} fontWeight={700}>ENGINE</text>
              </box>
              <box
                width={230} height={45}
                backdropBlur={12}
                backdropBrightness={130}
                backdropSaturate={160}
                backgroundColor={0xffffff15}
                cornerRadius={radius.lg}
                borderWidth={1} borderColor={0xffffff20}
                alignX="center" alignY="center"
                floating="parent" floatOffset={{ x: 20, y: 28 }}
              >
                <text color="#fff" fontSize={font.xs}>blur + bright + saturate combined</text>
              </box>
            </box>
          </box>
        </box>
      </SectionBox>

      {/* Opacity levels */}
      <SectionBox title="ELEMENT OPACITY (0.2 / 0.5 / 0.8 / 1.0)">
        <box direction="row" gap={space[3]}>
          <box width={100} height={50} backgroundColor="#4488cc" cornerRadius={radius.md} opacity={0.2} alignX="center" alignY="center">
            <text color="#fff" fontSize={font.xs}>0.2</text>
          </box>
          <box width={100} height={50} backgroundColor="#4488cc" cornerRadius={radius.md} opacity={0.5} alignX="center" alignY="center">
            <text color="#fff" fontSize={font.xs}>0.5</text>
          </box>
          <box width={100} height={50} backgroundColor="#4488cc" cornerRadius={radius.md} opacity={0.8} alignX="center" alignY="center">
            <text color="#fff" fontSize={font.xs}>0.8</text>
          </box>
          <box width={100} height={50} backgroundColor="#4488cc" cornerRadius={radius.md} opacity={1.0} alignX="center" alignY="center">
            <text color="#fff" fontSize={font.xs}>1.0</text>
          </box>
        </box>
      </SectionBox>
    </box>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TAB 3: Interactive
// Validates: focusStyle, onPress, hover/active, Dialog focus trap,
//            createTransition, createSpring
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function TabInteractive() {
  const [pressCount, setPressCount] = createSignal(0)
  const [dialogOpen, setDialogOpen] = createSignal(false)
  const [expanded, setExpanded] = createSignal(false)
  const [springActive, setSpringActive] = createSignal(false)

  // createTransition returns [getter, setter]
  const [animWidth, setAnimWidth] = createTransition(120, { duration: 400 })
  const [springY, setSpringY] = createSpring(30, { stiffness: 180, damping: 14 })

  return (
    <box direction="column" gap={space[4]} padding={space[4]} width="grow">
      {/* focusStyle + onPress */}
      <SectionBox title="FOCUSABLE BOX + FOCUS STYLE + ONPRESS (Tab to cycle, Enter to press)">
        <box direction="row" gap={space[3]}>
          <box
            focusable
            width={140} height={60}
            backgroundColor={themeColors.card}
            cornerRadius={radius.lg}
            borderWidth={1} borderColor={themeColors.border}
            focusStyle={{ borderColor: "#4fc4d4", borderWidth: 2, backgroundColor: "#1a2a3a" }}
            hoverStyle={{ backgroundColor: "#1e1e2e" }}
            activeStyle={{ backgroundColor: "#2a2a3e" }}
            onPress={() => setPressCount(c => c + 1)}
            alignX="center" alignY="center"
            direction="column" gap={2}
          >
            <text color="#4fc4d4" fontSize={font.sm}>Press me</text>
            <text color={themeColors.mutedForeground} fontSize={font.xs}>Count: {pressCount()}</text>
          </box>

          <box
            focusable
            width={140} height={60}
            backgroundColor={themeColors.card}
            cornerRadius={radius.lg}
            borderWidth={1} borderColor={themeColors.border}
            focusStyle={{ borderColor: "#a855f7", borderWidth: 2, glow: { radius: 16, color: "#a855f7", intensity: 60 } }}
            onPress={() => setPressCount(0)}
            alignX="center" alignY="center"
          >
            <text color="#a855f7" fontSize={font.sm}>Reset (glow)</text>
          </box>

          <box
            focusable
            width={140} height={60}
            backgroundColor={themeColors.card}
            cornerRadius={radius.lg}
            borderWidth={1} borderColor={themeColors.border}
            focusStyle={{ borderColor: "#22c55e", borderWidth: 2, shadow: { x: 0, y: 4, blur: 16, color: 0x22c55e60 } }}
            onPress={() => setDialogOpen(true)}
            alignX="center" alignY="center"
          >
            <text color="#22c55e" fontSize={font.sm}>Open Dialog</text>
          </box>
        </box>
      </SectionBox>

      {/* Animations */}
      <SectionBox title="ANIMATIONS (createTransition + createSpring)">
        <box direction="column" gap={space[3]}>
          {/* Transition */}
          <box direction="row" gap={space[3]} alignY="center">
            <box
              focusable
              onPress={() => {
                const next = !expanded()
                setExpanded(next)
                setAnimWidth(next ? 350 : 120)
              }}
              width={100} height={36}
              backgroundColor={themeColors.secondary}
              cornerRadius={radius.md}
              focusStyle={{ borderColor: themeColors.ring, borderWidth: 2 }}
              alignX="center" alignY="center"
            >
              <text color={themeColors.foreground} fontSize={font.xs}>{expanded() ? "Collapse" : "Expand"}</text>
            </box>
            <box width={animWidth()} height={36} backgroundColor="#4488cc" cornerRadius={radius.md} alignX="center" alignY="center">
              <text color="#fff" fontSize={font.xs}>{Math.round(animWidth())}px</text>
            </box>
          </box>

          {/* Spring */}
          <box direction="row" gap={space[3]} alignY="center">
            <box
              focusable
              onPress={() => {
                const next = !springActive()
                setSpringActive(next)
                setSpringY(next ? 0 : 30)
              }}
              width={100} height={36}
              backgroundColor={themeColors.secondary}
              cornerRadius={radius.md}
              focusStyle={{ borderColor: themeColors.ring, borderWidth: 2 }}
              alignX="center" alignY="center"
            >
              <text color={themeColors.foreground} fontSize={font.xs}>{springActive() ? "Reset" : "Spring!"}</text>
            </box>
            <box paddingTop={springY()}>
              <box width={60} height={36} backgroundColor="#a855f7" cornerRadius={radius.md} alignX="center" alignY="center">
                <text color="#fff" fontSize={font.xs}>↕ {Math.round(springY())}</text>
              </box>
            </box>
          </box>
        </box>
      </SectionBox>

      {/* Dialog */}
      <Show when={dialogOpen()}>
        <Dialog onClose={() => setDialogOpen(false)}>
          <Dialog.Overlay backgroundColor={0x00000088} backdropBlur={8} />
          <Dialog.Content backgroundColor={themeColors.card} cornerRadius={radius.xl} padding={space[6]} width={350}>
            <box direction="column" gap={space[4]}>
              <text color={themeColors.foreground} fontSize={font.lg} fontWeight={weight.semibold}>Focus Trap Test</text>
              <text color={themeColors.mutedForeground} fontSize={font.sm}>Tab should cycle ONLY within this dialog. Escape to close.</text>
              <Separator />
              <box direction="row" gap={space[2]}>
                <box
                  focusable
                  onPress={() => setDialogOpen(false)}
                  padding={space[2]} paddingX={space[4]}
                  backgroundColor="#4488cc"
                  cornerRadius={radius.md}
                  focusStyle={{ borderColor: "#fff", borderWidth: 2 }}
                >
                  <text color="#fff" fontSize={font.sm}>Confirm</text>
                </box>
                <box
                  focusable
                  onPress={() => setDialogOpen(false)}
                  padding={space[2]} paddingX={space[4]}
                  backgroundColor={themeColors.secondary}
                  cornerRadius={radius.md}
                  focusStyle={{ borderColor: themeColors.ring, borderWidth: 2 }}
                >
                  <text color={themeColors.foreground} fontSize={font.sm}>Cancel</text>
                </box>
              </box>
            </box>
          </Dialog.Content>
        </Dialog>
      </Show>
    </box>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TAB 4: Forms + Combobox + Slider
// Validates: createForm, field validation, Combobox, Slider
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function TabForms() {
  // Form validation
  const form = createForm({
    initialValues: { name: "", email: "" },
    validate: {
      name: (v) => v.length > 0 && v.length < 2 ? "Too short (min 2)" : undefined,
      email: (v) => v.length > 0 && !v.includes("@") ? "Must contain @" : undefined,
    },
    onSubmit: async (values) => {
      await new Promise(r => setTimeout(r, 500))
    },
  })

  // Combobox
  const [comboValue, setComboValue] = createSignal("")
  const comboOptions = [
    { value: "ts", label: "TypeScript" },
    { value: "js", label: "JavaScript" },
    { value: "py", label: "Python" },
    { value: "rs", label: "Rust" },
    { value: "go", label: "Go" },
    { value: "zig", label: "Zig" },
    { value: "c", label: "C" },
    { value: "cpp", label: "C++" },
    { value: "java", label: "Java" },
    { value: "swift", label: "Swift" },
  ]

  // Slider
  const [sliderVal, setSliderVal] = createSignal(50)

  return (
    <box direction="column" gap={space[4]} padding={space[4]} width="grow">
      {/* Form validation */}
      <SectionBox title="FORM VALIDATION (type and blur to see errors)">
        <box direction="column" gap={space[3]} width={350}>
          {/* Name field */}
          <box direction="column" gap={space[1]}>
            <text color={themeColors.mutedForeground} fontSize={font.xs}>Name</text>
            <box
              focusable
              padding={space[2]}
              backgroundColor={themeColors.secondary}
              cornerRadius={radius.md}
              borderWidth={1}
              borderColor={form.errors.name() ? "#dc2626" : themeColors.border}
              focusStyle={{ borderColor: "#4488cc", borderWidth: 2 }}
              onKeyDown={(e: any) => {
                if (e.key.length === 1 && !e.mods?.ctrl) {
                  form.setValue("name", form.values.name() + e.key)
                } else if (e.key === "backspace") {
                  form.setValue("name", form.values.name().slice(0, -1))
                }
              }}
            >
              <text color={form.values.name() ? themeColors.foreground : themeColors.mutedForeground} fontSize={font.sm}>
                {form.values.name() || "Type a name..."}
              </text>
            </box>
            <Show when={form.errors.name()}>
              <text color="#dc2626" fontSize={font.xs}>{form.errors.name()}</text>
            </Show>
          </box>

          {/* Email field */}
          <box direction="column" gap={space[1]}>
            <text color={themeColors.mutedForeground} fontSize={font.xs}>Email</text>
            <box
              focusable
              padding={space[2]}
              backgroundColor={themeColors.secondary}
              cornerRadius={radius.md}
              borderWidth={1}
              borderColor={form.errors.email() ? "#dc2626" : themeColors.border}
              focusStyle={{ borderColor: "#4488cc", borderWidth: 2 }}
              onKeyDown={(e: any) => {
                if (e.key.length === 1 && !e.mods?.ctrl) {
                  form.setValue("email", form.values.email() + e.key)
                } else if (e.key === "backspace") {
                  form.setValue("email", form.values.email().slice(0, -1))
                }
              }}
            >
              <text color={form.values.email() ? themeColors.foreground : themeColors.mutedForeground} fontSize={font.sm}>
                {form.values.email() || "Type an email..."}
              </text>
            </box>
            <Show when={form.errors.email()}>
              <text color="#dc2626" fontSize={font.xs}>{form.errors.email()}</text>
            </Show>
          </box>

          {/* Submit */}
          <box direction="row" gap={space[2]}>
            <box
              focusable
              onPress={() => form.submit()}
              padding={space[2]} paddingX={space[4]}
              backgroundColor="#4488cc"
              cornerRadius={radius.md}
              opacity={form.submitting() ? 0.5 : 1}
              focusStyle={{ borderColor: "#fff", borderWidth: 2 }}
            >
              <text color="#fff" fontSize={font.sm}>{form.submitting() ? "Saving..." : "Submit"}</text>
            </box>
            <box
              focusable
              onPress={() => form.reset()}
              padding={space[2]} paddingX={space[4]}
              backgroundColor={themeColors.secondary}
              cornerRadius={radius.md}
              focusStyle={{ borderColor: themeColors.ring, borderWidth: 2 }}
            >
              <text color={themeColors.foreground} fontSize={font.sm}>Reset</text>
            </box>
          </box>
          <text color={themeColors.mutedForeground} fontSize={font.xs}>
            Valid: {form.isValid() ? "✓ yes" : "✗ no"} | Dirty: name={form.dirty.name() ? "yes" : "no"}, email={form.dirty.email() ? "yes" : "no"}
          </text>
        </box>
      </SectionBox>

      {/* Combobox */}
      <SectionBox title="COMBOBOX (type to filter, arrows to navigate, Enter to select)">
        <Combobox
          value={comboValue()}
          onChange={setComboValue}
          options={comboOptions}
          placeholder="Search languages..."
          renderInput={(ctx) => (
            <box
              width={300}
              padding={space[2]}
              backgroundColor={themeColors.secondary}
              cornerRadius={radius.md}
              borderWidth={ctx.focused ? 2 : 1}
              borderColor={ctx.focused ? "#4488cc" : themeColors.border}
            >
              <text color={ctx.inputValue ? themeColors.foreground : themeColors.mutedForeground} fontSize={font.sm}>
                {ctx.inputValue || ctx.placeholder}
              </text>
            </box>
          )}
          renderOption={(opt, ctx) => (
            <box
              backgroundColor={ctx.highlighted ? themeColors.accent : "transparent"}
              padding={space[1.5]} paddingX={space[3]}
            >
              <text color={ctx.selected ? "#4488cc" : themeColors.foreground} fontSize={font.sm}>{opt.label}</text>
            </box>
          )}
          renderContent={(children) => (
            <box backgroundColor={themeColors.card} cornerRadius={radius.md} borderWidth={1} borderColor={themeColors.border} paddingY={space[1]}>
              {children}
            </box>
          )}
        />
        <box paddingTop={space[1]}>
          <text color={themeColors.mutedForeground} fontSize={font.xs}>
            Selected: {comboValue() || "(none)"}
          </text>
        </box>
      </SectionBox>

      {/* Slider */}
      <SectionBox title="SLIDER (Left/Right arrows, Home/End)">
        <Slider
          value={sliderVal()}
          onChange={setSliderVal}
          min={0} max={100} step={1}
          renderSlider={(ctx) => (
            <box direction="column" gap={space[2]}>
              <box
                width={300} height={12}
                backgroundColor={themeColors.secondary}
                cornerRadius={6}
                borderWidth={ctx.focused ? 2 : 0}
                borderColor={ctx.focused ? "#4488cc" : "transparent"}
              >
                <box
                  width={Math.round(ctx.percentage * 3)}
                  height={12}
                  backgroundColor="#4488cc"
                  cornerRadius={6}
                />
              </box>
              <text color={themeColors.foreground} fontSize={font.sm}>Value: {ctx.value} / {ctx.max} ({Math.round(ctx.percentage)}%)</text>
            </box>
          )}
        />
      </SectionBox>
    </box>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TAB 5: Data + Virtual
// Validates: useQuery, VirtualList (1000 items)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Generate 1000 items for virtual list
const VIRTUAL_ITEMS = Array.from({ length: 1000 }, (_, i) => ({
  id: i,
  name: `Item #${i + 1}`,
  value: Math.floor(Math.random() * 1000),
  category: ["Frontend", "Backend", "DevOps", "Data", "Mobile"][i % 5],
}))

function TabDataVirtual() {
  // Mock useQuery — simulates 1.5s fetch
  const mockData = useQuery(
    () => new Promise<{ users: { id: number; name: string; role: string }[] }>(resolve =>
      setTimeout(() => resolve({
        users: [
          { id: 1, name: "Alice", role: "Engineer" },
          { id: 2, name: "Bob", role: "Designer" },
          { id: 3, name: "Charlie", role: "PM" },
          { id: 4, name: "Diana", role: "DevOps" },
          { id: 5, name: "Eve", role: "QA" },
        ]
      }), 1500)
    ),
  )

  const [selected, setSelected] = createSignal(-1)

  return (
    <box direction="column" gap={space[4]} padding={space[4]} width="grow">
      {/* useQuery */}
      <SectionBox title="USE QUERY (simulated 1.5s fetch)">
        <box direction="column" gap={space[2]} width={350}>
          <Show when={mockData.loading()}>
            <box direction="column" gap={space[2]}>
              <Skeleton height={16} width={200} />
              <Skeleton height={16} width={280} />
              <Skeleton height={16} width={240} />
              <text color={themeColors.mutedForeground} fontSize={font.xs}>Loading users...</text>
            </box>
          </Show>
          <Show when={mockData.error()}>
            <text color="#dc2626" fontSize={font.sm}>Error: {mockData.error()!.message}</text>
          </Show>
          <Show when={mockData.data()}>
            <For each={mockData.data()!.users}>
              {(user) => (
                <box direction="row" gap={space[3]} padding={space[2]} backgroundColor={themeColors.card} cornerRadius={radius.md}>
                  <Avatar name={user.name} size="sm" />
                  <box direction="column">
                    <text color={themeColors.foreground} fontSize={font.sm}>{user.name}</text>
                    <text color={themeColors.mutedForeground} fontSize={font.xs}>{user.role}</text>
                  </box>
                  <Badge variant="secondary">{user.role}</Badge>
                </box>
              )}
            </For>
            <box
              focusable
              onPress={() => mockData.refetch()}
              padding={space[1.5]} paddingX={space[3]}
              backgroundColor={themeColors.secondary}
              cornerRadius={radius.md}
              focusStyle={{ borderColor: themeColors.ring, borderWidth: 2 }}
            >
              <text color={themeColors.foreground} fontSize={font.xs}>Refetch</text>
            </box>
          </Show>
        </box>
      </SectionBox>

      {/* VirtualList */}
      <SectionBox title="VIRTUAL LIST (1000 items — only visible rows render)">
        <box direction="column" gap={space[2]}>
          <text color={themeColors.mutedForeground} fontSize={font.xs}>
            {selected() >= 0 ? `Selected: ${VIRTUAL_ITEMS[selected()].name} (${VIRTUAL_ITEMS[selected()].category})` : "Use ↑↓ to navigate, Enter to select"}
          </text>
          <VirtualList
            items={VIRTUAL_ITEMS}
            itemHeight={28}
            height={250}
            width={450}
            overscan={3}
            selectedIndex={selected()}
            onSelect={setSelected}
            renderItem={(item, index, ctx) => (
              <box
                height={28}
                direction="row" gap={space[3]}
                paddingX={space[3]} alignY="center"
                backgroundColor={ctx.selected ? "#1a2a3a" : ctx.highlighted ? themeColors.accent : "transparent"}
              >
                <text color={themeColors.mutedForeground} fontSize={10}>{String(index + 1).padStart(4, " ")}</text>
                <text color={ctx.selected ? "#4fc4d4" : themeColors.foreground} fontSize={font.xs}>{item.name}</text>
                <text color={themeColors.mutedForeground} fontSize={10}>{item.category}</text>
                <text color="#4488cc" fontSize={10}>{item.value}</text>
              </box>
            )}
          />
        </box>
      </SectionBox>
    </box>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TAB 6: Void Components + Theme Switch
// Validates: all void components, dark/light theme, themeColors reactivity
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function TabVoidTheme() {
  const [isDark, setIsDark] = createSignal(true)
  const [clickedBtn, setClickedBtn] = createSignal("")
  const [cardClicks, setCardClicks] = createSignal(0)

  const toggleTheme = () => {
    const next = !isDark()
    setIsDark(next)
    setTheme(next ? darkTheme : lightTheme)
  }

  return (
    <box direction="column" gap={space[4]} padding={space[4]} width="grow">
      {/* Theme switch */}
      <SectionBox title="THEME SWITCH (dark ↔ light — validates themeColors reactivity)">
        <box direction="row" gap={space[3]} alignY="center">
          <box focusable onPress={toggleTheme} focusStyle={{ borderColor: themeColors.ring, borderWidth: 2 }} cornerRadius={radius.md}>
            <Button>{isDark() ? "Switch to Light" : "Switch to Dark"}</Button>
          </box>
          <text color={themeColors.mutedForeground} fontSize={font.xs}>Current: {isDark() ? "Dark" : "Light"}</text>
        </box>
      </SectionBox>

      {/* Button variants */}
      <SectionBox title="BUTTON VARIANTS + SIZES (click any — shows last clicked)">
        <box direction="column" gap={space[2]}>
          <box direction="row" gap={space[2]}>
            <box focusable onPress={() => setClickedBtn("Default")} focusStyle={{ borderColor: themeColors.ring, borderWidth: 2 }} cornerRadius={radius.md}>
              <Button>Default</Button>
            </box>
            <box focusable onPress={() => setClickedBtn("Secondary")} focusStyle={{ borderColor: themeColors.ring, borderWidth: 2 }} cornerRadius={radius.md}>
              <Button variant="secondary">Secondary</Button>
            </box>
            <box focusable onPress={() => setClickedBtn("Outline")} focusStyle={{ borderColor: themeColors.ring, borderWidth: 2 }} cornerRadius={radius.md}>
              <Button variant="outline">Outline</Button>
            </box>
            <box focusable onPress={() => setClickedBtn("Ghost")} focusStyle={{ borderColor: themeColors.ring, borderWidth: 2 }} cornerRadius={radius.md}>
              <Button variant="ghost">Ghost</Button>
            </box>
            <box focusable onPress={() => setClickedBtn("Destructive")} focusStyle={{ borderColor: themeColors.ring, borderWidth: 2 }} cornerRadius={radius.md}>
              <Button variant="destructive">Destructive</Button>
            </box>
          </box>
          <box direction="row" gap={space[2]} alignY="center">
            <box focusable onPress={() => setClickedBtn("XS")} focusStyle={{ borderColor: themeColors.ring, borderWidth: 2 }} cornerRadius={radius.md}>
              <Button size="xs">XS</Button>
            </box>
            <box focusable onPress={() => setClickedBtn("SM")} focusStyle={{ borderColor: themeColors.ring, borderWidth: 2 }} cornerRadius={radius.md}>
              <Button size="sm">SM</Button>
            </box>
            <box focusable onPress={() => setClickedBtn("Default")} focusStyle={{ borderColor: themeColors.ring, borderWidth: 2 }} cornerRadius={radius.md}>
              <Button size="default">Default</Button>
            </box>
            <box focusable onPress={() => setClickedBtn("LG")} focusStyle={{ borderColor: themeColors.ring, borderWidth: 2 }} cornerRadius={radius.md}>
              <Button size="lg">LG</Button>
            </box>
          </box>
          <Show when={clickedBtn()}>
            <text color="#4fc4d4" fontSize={font.xs}>Last clicked: {clickedBtn()}</text>
          </Show>
        </box>
      </SectionBox>

      {/* Card */}
      <SectionBox title="CARD COMPOSITION (Action button is clickable)">
        <box direction="row" gap={space[3]}>
          <Card>
            <CardHeader>
              <CardTitle>Card Title</CardTitle>
              <CardDescription>Description text</CardDescription>
            </CardHeader>
            <CardContent>
              <P>Card body content. Theme-reactive colors.</P>
            </CardContent>
            <CardFooter>
              <box focusable onPress={() => setCardClicks(c => c + 1)} focusStyle={{ borderColor: "#4488cc", borderWidth: 2 }} cornerRadius={radius.md}>
                <Button size="sm">Action ({cardClicks()})</Button>
              </box>
            </CardFooter>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Small Card</CardTitle>
              <CardDescription>Compact</CardDescription>
            </CardHeader>
            <CardContent>
              <Muted>Tighter spacing variant.</Muted>
            </CardContent>
          </Card>
        </box>
      </SectionBox>

      {/* Badge + Avatar + Skeleton */}
      <SectionBox title="BADGE + AVATAR + SKELETON">
        <box direction="column" gap={space[3]}>
          <box direction="row" gap={space[2]}>
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge variant="destructive">Error</Badge>
          </box>
          <box direction="row" gap={space[3]} alignY="center">
            <Avatar name="Alice" size="sm" />
            <Avatar name="Bob" />
            <Avatar name="Charlie" size="lg" />
          </box>
          <box direction="column" gap={space[1]} width={250}>
            <Skeleton height={12} />
            <Skeleton height={12} width={180} />
            <Skeleton height={40} cornerRadius={radius.lg} />
          </box>
        </box>
      </SectionBox>

      {/* Typography */}
      <SectionBox title="TYPOGRAPHY PRESETS (9 levels)">
        <box direction="column" gap={space[1]}>
          <H2>H2 — Title</H2>
          <H3>H3 — Subtitle</H3>
          <H4>H4 — Section</H4>
          <P>P — Body text (14px regular)</P>
          <Small>Small — Caption (12px)</Small>
          <Muted>Muted — Helper text</Muted>
        </box>
      </SectionBox>
    </box>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TAB 7: Event Bubbling + stopPropagation
// Validates: onPress bubbling up the tree, stopPropagation to prevent it
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function TabEventBubbling() {
  const [log, setLog] = createSignal<string[]>([])
  const addLog = (msg: string) => setLog((prev) => [...prev.slice(-8), msg])
  const clearLog = () => setLog([])

  return (
    <box direction="column" gap={space[4]} padding={space[4]} width="grow">
      {/* Demo 1: Bubbling without stopPropagation */}
      <SectionBox title="BUBBLING (click inner — both handlers fire)">
        <box direction="row" gap={space[3]}>
          <box
            focusable
            onPress={() => addLog("Outer onPress fired")}
            backgroundColor={colors.card}
            cornerRadius={radius.lg}
            padding={space[4]}
            focusStyle={{ borderColor: "#4488cc", borderWidth: 2 }}
          >
            <box direction="column" gap={space[2]}>
              <text color={colors.mutedForeground} fontSize={font.xs}>OUTER (has onPress)</text>
              <box
                focusable
                onPress={() => addLog("Inner onPress fired")}
                backgroundColor={colors.secondary}
                cornerRadius={radius.md}
                padding={space[3]}
                hoverStyle={{ backgroundColor: "#3a3a4aff" }}
                focusStyle={{ borderColor: "#22c55e", borderWidth: 2 }}
              >
                <text color={colors.foreground} fontSize={font.sm}>Click me (inner)</text>
              </box>
              <text color={colors.mutedForeground} fontSize={10}>Both "Inner" and "Outer" should fire</text>
            </box>
          </box>
        </box>
      </SectionBox>

      {/* Demo 2: stopPropagation */}
      <SectionBox title="STOP PROPAGATION (click inner — only inner fires)">
        <box direction="row" gap={space[3]}>
          <box
            focusable
            onPress={() => addLog("Outer onPress fired (SHOULD NOT HAPPEN)")}
            backgroundColor={colors.card}
            cornerRadius={radius.lg}
            padding={space[4]}
            focusStyle={{ borderColor: "#4488cc", borderWidth: 2 }}
          >
            <box direction="column" gap={space[2]}>
              <text color={colors.mutedForeground} fontSize={font.xs}>OUTER (has onPress — should NOT fire)</text>
              <box
                focusable
                onPress={(e) => {
                  addLog("Inner onPress + stopPropagation()")
                  e?.stopPropagation()
                }}
                backgroundColor={colors.secondary}
                cornerRadius={radius.md}
                padding={space[3]}
                hoverStyle={{ backgroundColor: "#3a3a4aff" }}
                focusStyle={{ borderColor: "#f59e0b", borderWidth: 2 }}
              >
                <text color={colors.foreground} fontSize={font.sm}>Click me (stops bubbling)</text>
              </box>
              <text color={colors.mutedForeground} fontSize={10}>Only "Inner" should fire, outer is blocked</text>
            </box>
          </box>
        </box>
      </SectionBox>

      {/* Demo 3: Nested wrapper — Void Button inside focusable box */}
      <SectionBox title="VOID BUTTON IN WRAPPER (bubbling through component boundary)">
        <box direction="row" gap={space[3]}>
          <box
            focusable
            onPress={() => addLog("Wrapper onPress fired (bubbled from Button)")}
            cornerRadius={radius.md}
            focusStyle={{ borderColor: "#4488cc", borderWidth: 2 }}
          >
            <Button>Click this Button</Button>
          </box>
          <text color={colors.mutedForeground} fontSize={font.xs}>Button has no onPress — event bubbles to wrapper</text>
        </box>
      </SectionBox>

      {/* Event log */}
      <SectionBox title="EVENT LOG">
        <box direction="column" gap={space[1]}>
          <box direction="row" gap={space[2]}>
            <box focusable onPress={clearLog} backgroundColor={colors.secondary} cornerRadius={radius.md} padding={space[2]} paddingX={space[3]} hoverStyle={{ backgroundColor: "#3a3a4aff" }} focusStyle={{ borderColor: "#4488cc", borderWidth: 2 }}>
              <text color={colors.foreground} fontSize={font.xs}>Clear log</text>
            </box>
          </box>
          <For each={log()}>
            {(entry) => <text color="#4fc4d4" fontSize={font.xs}>{entry}</text>}
          </For>
          <Show when={log().length === 0}>
            <text color={colors.mutedForeground} fontSize={font.xs}>Click buttons above to see events</text>
          </Show>
        </box>
      </SectionBox>
    </box>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN APP — Tab navigation shell
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const TABS = [
  { num: "1", name: "Visual",       key: "visual" },
  { num: "2", name: "Backdrop",     key: "backdrop" },
  { num: "3", name: "Interactive",  key: "interactive" },
  { num: "4", name: "Forms",        key: "forms" },
  { num: "5", name: "Data",         key: "data" },
  { num: "6", name: "Void",         key: "void" },
  { num: "7", name: "Events",       key: "events" },
]

function App(props: { terminal: any }) {
  const [activeTab, setActiveTab] = createSignal(0)
  const dims = useTerminalDimensions(props.terminal)

  useFocus({
    id: "tab-nav",
    onKeyDown(e) {
      const num = parseInt(e.key)
      if (num >= 1 && num <= TABS.length) {
        setActiveTab(num - 1)
      }
    },
  })

  // useTerminalDimensions returns reactive signals — updates on resize.
  // Equivalent to CSS 100vw/100vh but as SolidJS signals.
  return (
    <box width={dims.width()} height={dims.height()} direction="column" backgroundColor={colors.background}>
      {/* Header bar */}
      <box direction="row" height="fit" padding={space[3]} paddingX={space[4]} gap={space[4]} alignY="center" backgroundColor={colors.card}>
        <text color={colors.foreground} fontSize={font.lg} fontWeight={weight.bold}>TGE Showcase</text>
        <box width="grow" />
        <text color={colors.mutedForeground} fontSize={font.xs}>
          Keys: 1-7 switch tabs | Tab cycles focus | q quit
        </text>
      </box>

      {/* Tab bar — clickable + keyboard navigable */}
      <box direction="row" height="fit" backgroundColor={colors.card} borderBottom={1} borderColor={colors.border}>
        <For each={TABS}>
          {(tab, i) => {
            const active = () => activeTab() === i()
            return (
              <box
                focusable
                onPress={() => setActiveTab(i())}
                direction="row" gap={4}
                paddingX={space[4]} paddingY={space[2]}
                backgroundColor={active() ? colors.background : "transparent"}
                hoverStyle={{ backgroundColor: active() ? colors.background : colors.accent }}
                focusStyle={{ borderColor: "#4488cc", borderWidth: 1 }}
                borderBottom={active() ? 2 : 0}
                borderColor={active() ? "#4488cc" : "transparent"}
                height="fit"
              >
                <text
                  color={active() ? "#4488cc" : colors.mutedForeground}
                  fontSize={font.sm}
                  fontWeight={active() ? weight.semibold : weight.normal}
                >
                  {tab.num}
                </text>
                <text
                  color={active() ? "#4488cc" : colors.mutedForeground}
                  fontSize={font.sm}
                  fontWeight={active() ? weight.semibold : weight.normal}
                >
                  {tab.name}
                </text>
              </box>
            )
          }}
        </For>
      </box>

      {/* Tab content — takes remaining height, scrollable */}
      <box height="grow" direction="column" scrollY>
        {activeTab() === 0 ? <TabVisualEffects /> : null}
        {activeTab() === 1 ? <TabBackdropFilters /> : null}
        {activeTab() === 2 ? <TabInteractive /> : null}
        {activeTab() === 3 ? <TabForms /> : null}
        {activeTab() === 4 ? <TabDataVirtual /> : null}
        {activeTab() === 5 ? <TabVoidTheme /> : null}
        {activeTab() === 6 ? <TabEventBubbling /> : null}
      </box>
    </box>
  )
}

// ── Main ──

async function main() {
  const term = await createTerminal()
  const app = mount(() => <App terminal={term} />, term)

  onInput((event) => {
    if (event.type === "key") {
      if (event.key === "q" || (event.key === "c" && event.mods.ctrl)) {
        app.destroy()
        term.destroy()
        process.exit(0)
      }
    }
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
