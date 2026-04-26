/**
 * Vexart Void Showcase — comprehensive visual test of all new features.
 *
 * Tests:
 *   1. Default direction=column (layout should stack vertically)
 *   2. Linear gradient
 *   3. Radial gradient
 *   4. Multi-shadow (array of shadows)
 *   5. Backdrop blur (glassmorphism)
 *   6. Per-corner radius (cornerRadii)
 *   7. Hover states (hoverStyle)
 *   8. Active states (activeStyle)
 *   9. Backdrop blur + gradient fused (no banding)
 *  10. void/Button — 5 variants
 *  11. void/Card composition
 *  12. void/Badge — 4 variants
 *  13. void/Separator
 *  14. void/Avatar — 3 sizes
 *  15. void/Skeleton
 *  16. void/Typography — 9 presets
 *  17. void/Tokens (colors used throughout)
 *
 * Run:  bun run examples/void-showcase.tsx
 */

import { mount, onInput, useTerminalDimensions } from "@vexart/engine"
import { createTerminal } from "@vexart/engine"
import {
  Button,
  Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter,
  Badge,
  Separator,
  Avatar,
  Skeleton,
  H1, H2, H3, H4, P, Lead, Large, Small, Muted,
  colors, radius, space, font, weight, shadows,
} from "@vexart/styled"

// ── Section wrapper ──

function Section(props: { title: string; children?: any }) {
  return (
    <box direction="column" gap={space[2]} paddingBottom={space[4]}>
      <text color={colors.mutedForeground} fontSize={font.xs} fontWeight={weight.semibold}>{props.title}</text>
      <Separator />
      <box paddingTop={space[2]}>
        {props.children}
      </box>
    </box>
  )
}

// ── 1. Engine features ──

function EngineFeatures() {
  return (
    <box direction="column" gap={space[4]}>
      {/* 2. Linear gradient */}
      <Section title="LINEAR GRADIENT">
        <box direction="row" gap={space[3]}>
          <box
            width={120} height={60}
            cornerRadius={radius.lg}
            gradient={{ type: "linear", from: 0x1a1a2eff, to: 0x3a1a5eff, angle: 90 }}
            padding={space[2]}
          >
            <text color={colors.foreground} fontSize={font.xs}>angle: 90</text>
          </box>
          <box
            width={120} height={60}
            cornerRadius={radius.lg}
            gradient={{ type: "linear", from: 0x56d4c8ff, to: 0x5090d0ff, angle: 0 }}
            padding={space[2]}
          >
            <text color={0x000000ff} fontSize={font.xs}>angle: 0</text>
          </box>
          <box
            width={120} height={60}
            cornerRadius={radius.lg}
            gradient={{ type: "linear", from: 0xdc2626ff, to: 0xf59e0bff, angle: 45 }}
            padding={space[2]}
          >
            <text color={0x000000ff} fontSize={font.xs}>angle: 45</text>
          </box>
        </box>
      </Section>

      {/* 3. Radial gradient */}
      <Section title="RADIAL GRADIENT">
        <box direction="row" gap={space[3]}>
          <box
            width={120} height={80}
            cornerRadius={radius.lg}
            gradient={{ type: "radial", from: 0x56d4c8ff, to: 0x00000000 }}
            padding={space[2]}
          >
            <text color={colors.foreground} fontSize={font.xs}>cyan → transparent</text>
          </box>
          <box
            width={120} height={80}
            cornerRadius={radius.lg}
            gradient={{ type: "radial", from: 0xffffff40, to: 0x00000000 }}
            padding={space[2]}
          >
            <text color={colors.foreground} fontSize={font.xs}>white glow</text>
          </box>
        </box>
      </Section>

      {/* 4. Multi-shadow */}
      <Section title="MULTI-SHADOW">
        <box direction="row" gap={space[6]}>
          {(() => {
            const s2 = [
              { x: 0, y: 2, blur: 4, color: 0x00000040 },
              { x: 0, y: 8, blur: 24, color: 0x00000030 },
            ]
            return (
              <box
                width={120} height={60}
                backgroundColor={colors.card}
                cornerRadius={radius.lg}
                shadow={s2}
                alignX="center" alignY="center"
              >
                <text color={colors.foreground} fontSize={font.xs}>2 shadows</text>
              </box>
            )
          })()}
          {(() => {
            const s3 = [
              { x: 0, y: 1, blur: 2, color: 0x00000060 },
              { x: 0, y: 4, blur: 8, color: 0x00000040 },
              { x: 0, y: 16, blur: 32, color: 0x00000020 },
            ]
            return (
              <box
                width={120} height={60}
                backgroundColor={colors.card}
                cornerRadius={radius.lg}
                shadow={s3}
                alignX="center" alignY="center"
              >
                <text color={colors.foreground} fontSize={font.xs}>3 shadows</text>
              </box>
            )
          })()}
        </box>
      </Section>

      {/* 5. Backdrop blur */}
      <Section title="BACKDROP BLUR (glassmorphism)">
        {/* Single solid gradient background — no gaps possible */}
        <box
          width={350} height={120}
          gradient={{ type: "linear", from: 0x56d4c8ff, to: 0xdc2626ff, angle: 0 }}
        >
          {/* Text labels to show blur effect on sharp content */}
          <box direction="row" gap={40} paddingTop={10} paddingLeft={20}>
            <text color={0x000000ff} fontSize={24} fontWeight={700}>BLUR</text>
            <text color={0xffffffff} fontSize={24} fontWeight={700}>TEST</text>
            <text color={0x000000ff} fontSize={24} fontWeight={700}>OK?</text>
          </box>
          {/* Glass card */}
          <box
            width={280} height={60}
            backgroundColor={0xffffff20}
            backdropBlur={12}
            cornerRadius={radius.xl}
            borderWidth={1}
            borderColor={0xffffff30}
            alignX="center" alignY="center"
            floating="parent"
            floatOffset={{ x: 35, y: 40 }}
          >
            <text color={colors.foreground} fontSize={font.sm}>glass over content</text>
          </box>
        </box>
      </Section>

      {/* 6. Per-corner radius */}
      <Section title="PER-CORNER RADIUS">
        <box direction="row" gap={space[3]}>
          <box
            width={80} height={60}
            backgroundColor={colors.primary}
            cornerRadii={{ tl: 20, tr: 0, br: 20, bl: 0 }}
            alignX="center" alignY="center"
          >
            <text color={colors.primaryForeground} fontSize={font.xs}>TL+BR</text>
          </box>
          <box
            width={80} height={60}
            backgroundColor={colors.destructive}
            cornerRadii={{ tl: 0, tr: 20, br: 0, bl: 20 }}
            alignX="center" alignY="center"
          >
            <text color={colors.foreground} fontSize={font.xs}>TR+BL</text>
          </box>
          <box
            width={80} height={60}
            backgroundColor={colors.secondary}
            cornerRadii={{ tl: 20, tr: 20, br: 0, bl: 0 }}
            alignX="center" alignY="center"
          >
            <text color={colors.foreground} fontSize={font.xs}>top only</text>
          </box>
        </box>
      </Section>

      {/* 7+8. Hover + Active states */}
      <Section title="HOVER + ACTIVE (move mouse over boxes)">
        <box direction="row" gap={space[3]}>
          <box
            width={120} height={50}
            backgroundColor={colors.secondary}
            cornerRadius={radius.md}
            alignX="center" alignY="center"
            hoverStyle={{ backgroundColor: colors.accent }}
            activeStyle={{ backgroundColor: colors.primary }}
          >
            <text color={colors.foreground} fontSize={font.xs}>hover me</text>
          </box>
          <box
            width={120} height={50}
            backgroundColor={colors.card}
            cornerRadius={radius.md}
            borderWidth={1}
            borderColor={colors.border}
            alignX="center" alignY="center"
            hoverStyle={{ backgroundColor: 0x56d4c820, borderColor: 0x56d4c860 }}
            activeStyle={{ backgroundColor: 0x56d4c840 }}
          >
            <text color={colors.foreground} fontSize={font.xs}>glow border</text>
          </box>
          <box
            width={120} height={50}
            backgroundColor={colors.destructive}
            cornerRadius={radius.md}
            alignX="center" alignY="center"
            hoverStyle={{ backgroundColor: 0xef4444ff }}
            activeStyle={{ backgroundColor: 0xb91c1cff }}
          >
            <text color={colors.foreground} fontSize={font.xs}>destructive</text>
          </box>
        </box>
      </Section>

      {/* 9. Backdrop blur + gradient fused */}
      <Section title="BACKDROP BLUR + GRADIENT (fused — no banding)">
        <box width={300} height={100}>
          {/* Background pattern */}
          <box
            width={300} height={100}
            gradient={{ type: "linear", from: 0x22c55eff, to: 0x3b82f6ff, angle: 0 }}
          >
            <box
              width={220} height={70}
              backdropBlur={12}
              gradient={{ type: "linear", from: 0xffffff08, to: 0xffffff20, angle: 180 }}
              cornerRadius={radius.xl}
              borderWidth={1}
              borderColor={0xffffff15}
              alignX="center" alignY="center"
              floating="parent"
              floatOffset={{ x: 40, y: 15 }}
            >
              <text color={colors.foreground} fontSize={font.xs}>blur + gradient fused</text>
            </box>
          </box>
        </box>
      </Section>
    </box>
  )
}

// ── 2. Void Components ──

function VoidComponents() {
  return (
    <box direction="column" gap={space[4]}>
      {/* 10. Buttons */}
      <Section title="BUTTON VARIANTS + SIZES">
        <box direction="column" gap={space[3]}>
          <box direction="row" gap={space[2]}>
            <Button>Default</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
          </box>
          <box direction="row" gap={space[2]} alignY="center">
            <Button size="xs">XS</Button>
            <Button size="sm">SM</Button>
            <Button size="default">Default</Button>
            <Button size="lg">LG</Button>
          </box>
        </box>
      </Section>

      {/* 11. Card */}
      <Section title="CARD COMPOSITION">
        <box direction="row" gap={space[3]}>
          <Card>
            <CardHeader>
              <CardTitle>Card Title</CardTitle>
              <CardDescription>Description text here</CardDescription>
            </CardHeader>
            <CardContent>
              <P>Card content goes here. This is a full card composition.</P>
            </CardContent>
            <CardFooter>
              <Button size="sm">Action</Button>
            </CardFooter>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Small Card</CardTitle>
              <CardDescription>Compact variant</CardDescription>
            </CardHeader>
            <CardContent>
              <Muted>Less padding, tighter gaps.</Muted>
            </CardContent>
          </Card>
        </box>
      </Section>

      {/* 12. Badges */}
      <Section title="BADGE VARIANTS">
        <box direction="row" gap={space[2]}>
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="destructive">Destructive</Badge>
        </box>
      </Section>

      {/* 13. Separator already shown in Section headers */}

      {/* 14. Avatar */}
      <Section title="AVATAR SIZES">
        <box direction="row" gap={space[3]} alignY="center">
          <Avatar name="Alice" size="sm" />
          <Avatar name="Bob" />
          <Avatar name="Charlie" size="lg" />
          <Avatar name="Diana" size="lg" color={0x56d4c840} />
        </box>
      </Section>

      {/* 15. Skeleton */}
      <Section title="SKELETON LOADING">
        <box direction="column" gap={space[2]} width={250}>
          <Skeleton height={12} />
          <Skeleton height={12} width={180} />
          <Skeleton height={40} cornerRadius={radius.lg} />
        </box>
      </Section>
    </box>
  )
}

// ── 3. Typography ──

function TypographyShowcase() {
  return (
    <Section title="TYPOGRAPHY PRESETS">
      <box direction="column" gap={space[1.5]}>
        <H1>H1 — Display (36px bold)</H1>
        <H2>H2 — Title (30px semibold)</H2>
        <H3>H3 — Subtitle (20px semibold)</H3>
        <H4>H4 — Section (16px semibold)</H4>
        <P>P — Body text (14px regular)</P>
        <Lead>Lead — Emphasis (20px muted)</Lead>
        <Large>Large — Large body (16px semibold)</Large>
        <Small>Small — Caption (12px medium)</Small>
        <Muted>Muted — Helper text (12px muted)</Muted>
      </box>
    </Section>
  )
}

// ── App ──

function App(props: { terminal: Parameters<typeof useTerminalDimensions>[0] }) {
  const dims = useTerminalDimensions(props.terminal)
  const paneHeight = () => Math.max(160, dims.height() - space[6] * 2 - 44)

  return (
    <box
      width={dims.width()}
      height={dims.height()}
      backgroundColor={colors.background}
      direction="row"
      padding={space[6]}
      gap={space[6]}
    >
      {/* Left column: Engine features */}
      <box direction="column" width="grow" height="grow" gap={space[3]}>
        <H3>Engine Features</H3>
        <box
          layer
          scrollY
          height={paneHeight()}
          scrollId="void-showcase-engine"
          direction="column"
          paddingTop={space[3]}
          paddingRight={space[2]}
          gap={space[2]}
        >
          <EngineFeatures />
        </box>
      </box>

      {/* Vertical separator */}
      <Separator orientation="vertical" />

      {/* Right column: Void components + Typography */}
      <box direction="column" width="grow" height="grow" gap={space[3]}>
        <H3>Void Components</H3>
        <box
          layer
          scrollY
          height={paneHeight()}
          scrollId="void-showcase-components"
          direction="column"
          paddingTop={space[3]}
          paddingRight={space[2]}
          gap={space[2]}
        >
          <VoidComponents />
          <box paddingTop={space[4]}>
            <TypographyShowcase />
          </box>
        </box>
      </box>
    </box>
  )
}

// ── Main ──

async function main() {
  const term = await createTerminal()
  const cleanup = mount(() => <App terminal={term} />, term, {
    experimental: {
    },
  })
  const exitAfterMs = Number(process.env.VEXART_EXIT_AFTER_MS ?? process.env.LIGHTCODE_EXIT_AFTER_MS ?? 0)

  const shutdown = () => {
    cleanup.destroy()
    term.destroy()
    process.exit(0)
  }

  onInput((event) => {
    if (event.type === "key") {
      if (event.key === "q" || (event.key === "c" && event.mods.ctrl)) {
        shutdown()
      }
    }
  })

  if (Number.isFinite(exitAfterMs) && exitAfterMs > 0) {
    setTimeout(shutdown, exitAfterMs)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
