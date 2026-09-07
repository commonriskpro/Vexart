/**
 * Vexart Effects Showcase — current public API, Kitty-first.
 *
 * This is intentionally separate from the Void component showcase. It is a
 * compact visual gallery for the GPU effects that make Vexart browser-like:
 * shadows, glow, gradients, glass/backdrop filters, transforms, and states.
 *
 * Run: bun --conditions=browser run examples/effects-showcase.tsx
 */

import { createSignal } from "solid-js"
import { useTerminalDimensions } from "@vexart/engine"
import { createApp, useAppTerminal, Box, Text } from "@vexart/app"
import {
  Badge,
  Button,
  VoidTabs,
  colors,
  font,
  glows,
  radius,
  shadows,
  space,
  weight,
} from "@vexart/styled"
import type { JSX } from "solid-js"

type PanelProps = {
  title: string
  caption: string
  children: JSX.Element
  backgroundColor?: string | number
  gradient?: import("@vexart/engine").TGEProps["gradient"]
}

function Panel(props: PanelProps) {
  const captionColor = props.gradient ? 0xffffffb8 : colors.mutedForeground

  return (
    <Box
      width="grow"
      height={176}
      minWidth={150}
      padding={space[3]}
      direction="column"
      gap={space[1]}
      backgroundColor={props.backgroundColor ?? colors.card}
      gradient={props.gradient}
      borderColor={colors.border}
      borderWidth={1}
      cornerRadius={radius.lg}
      shadow={shadows.sm}
    >
      <Text color={colors.foreground} fontSize={font.sm} fontWeight={weight.semibold}>
        {props.title}
      </Text>
      <Text color={captionColor} fontSize={font.xs}>
        {props.caption}
      </Text>
      <Box width="grow" height="grow" alignX="center" alignY="center">
        {props.children}
      </Box>
    </Box>
  )
}

function Swatch(props: {
  backgroundColor?: string | number
  gradient?: {
    type: "linear"
    from: string | number
    to: string | number
    angle?: number
  } | {
    type: "radial"
    from: string | number
    to: string | number
  }
  cornerRadius?: number
  shadow?: import("@vexart/engine").TGEProps["shadow"]
  glow?: import("@vexart/engine").TGEProps["glow"]
  opacity?: number
  transform?: import("@vexart/engine").TGEProps["transform"]
  filter?: import("@vexart/engine").TGEProps["filter"]
}) {
  return (
    <Box
      width={88}
      height={76}
      backgroundColor={props.backgroundColor}
      gradient={props.gradient}
      cornerRadius={props.cornerRadius ?? radius.lg}
      shadow={props.shadow}
      glow={props.glow}
      opacity={props.opacity}
      transform={props.transform}
      filter={props.filter}
    />
  )
}

type GlassEffectProps = {
  backdropBlur?: number
  backdropBrightness?: number
  backdropContrast?: number
  backdropSaturate?: number
  backdropGrayscale?: number
  backdropInvert?: number
  backdropSepia?: number
  backdropHueRotate?: number
}

const glassStripes = [0x0f172aff, 0xf8fafcff, 0x7c3aedff, 0xfacc15ff, 0x0f172aff, 0x22d3eeff, 0xf8fafcff, 0xdb2777ff]

function GlassSample(props: { effect: GlassEffectProps }) {
  return (
    <Box width={112} height={88} direction="row">
      {glassStripes.map((color) => <Box width={14} height={88} backgroundColor={color} />)}
      <Box
        floating="parent"
        floatOffset={{ x: 12, y: 10 }}
        zIndex={20}
        width={88}
        height={68}
        backgroundColor={0xffffff18}
        borderColor={0xffffff72}
        borderWidth={1}
        cornerRadius={radius.lg}
        {...props.effect}
      />
    </Box>
  )
}

function EffectsTab() {
  return (
    <Box width="100%" direction="column" gap={space[3]}>
      <Box width="100%" direction="row" gap={space[3]} height={176}>
        <Panel title="Shadow" caption="soft elevation">
          <Swatch backgroundColor="#22c55e" shadow={{ x: 0, y: 10, blur: 18, color: 0x00000066 }} />
        </Panel>
        <Panel title="Multi-shadow" caption="layered depth">
          <Swatch
            backgroundColor="#f59e0b"
            shadow={[
              { x: 0, y: 4, blur: 8, color: 0x00000055 },
              { x: 0, y: 14, blur: 22, color: 0x7c2d1266 },
            ]}
          />
        </Panel>
        <Panel title="Glow" caption="neon halo">
          <Swatch backgroundColor="#111827" glow={{ radius: 20, color: 0x2dd4bfff, intensity: 78 }} />
        </Panel>
      </Box>
      <Box width="100%" direction="row" gap={space[3]} height={176}>
        <Panel title="Linear gradient" caption="angle: 45°">
          <Swatch gradient={{ type: "linear", from: 0x0ea5e9ff, to: 0x7c3aedff, angle: 45 }} />
        </Panel>
        <Panel title="Radial gradient" caption="center → edge">
          <Swatch gradient={{ type: "radial", from: 0x4ade80ff, to: 0x052e16ff }} />
        </Panel>
        <Panel title="Corners + opacity" caption="per-corner radius">
          <Box
            width={88}
            height={76}
            backgroundColor="#f43f5e"
            cornerRadii={{ tl: 24, tr: 4, br: 24, bl: 4 }}
            opacity={0.78}
          />
        </Panel>
      </Box>
    </Box>
  )
}

function GlassTab() {
  return (
    <Box width="100%" direction="column" gap={space[3]}>
      <Box width="100%" direction="row" gap={space[3]} height={176}>
        <Panel title="Glass blur" caption="backdropBlur: 10 · sharp backing">
          <GlassSample effect={{ backdropBlur: 10 }} />
        </Panel>
        <Panel title="Brightness" caption="backdropBrightness: 145 only">
          <GlassSample effect={{ backdropBrightness: 145 }} />
        </Panel>
        <Panel title="Contrast" caption="backdropContrast: 140 only">
          <GlassSample effect={{ backdropContrast: 140 }} />
        </Panel>
      </Box>
      <Box width="100%" direction="row" gap={space[3]} height={176}>
        <Panel title="Saturate" caption="backdropSaturate: 40 only">
          <GlassSample effect={{ backdropSaturate: 40 }} />
        </Panel>
        <Panel title="Grayscale" caption="backdropGrayscale: 100 only">
          <GlassSample effect={{ backdropGrayscale: 100 }} />
        </Panel>
        <Panel title="Invert" caption="backdropInvert: 100 only">
          <GlassSample effect={{ backdropInvert: 100 }} />
        </Panel>
      </Box>
      <Box width="100%" direction="row" gap={space[3]} height={176}>
        <Panel title="Sepia" caption="backdropSepia: 100 only">
          <GlassSample effect={{ backdropSepia: 100 }} />
        </Panel>
        <Panel title="Hue rotate" caption="backdropHueRotate: 180 only">
          <GlassSample effect={{ backdropHueRotate: 180 }} />
        </Panel>
        <Panel title="Filter contract" caption="each swatch samples stripes">
          <Box width={112} height={88} direction="column" gap={space[1]} alignX="center" alignY="center" backgroundColor={0x0f172aff} cornerRadius={radius.lg}>
            <Text color={colors.foreground} fontSize={font.xs}>Sharp backing</Text>
            <Text color={colors.mutedForeground} fontSize={font.xs}>one filter each</Text>
          </Box>
        </Panel>
      </Box>
    </Box>
  )
}

function CompositionTab() {
  return (
    <Box width="100%" direction="column" gap={space[3]}>
      <Box width="100%" direction="row" gap={space[3]} height={176}>
        <Panel title="Rotate" caption="transform.rotate: -8">
          <Swatch
            backgroundColor="#38bdf8"
            transform={{ rotate: -8 }}
            shadow={{ x: 0, y: 8, blur: 14, color: 0x00000055 }}
          />
        </Panel>
        <Panel title="Scale + translate" caption="compositor-friendly">
          <Swatch backgroundColor="#a78bfa" transform={{ scale: 1.12, translateY: -3 }} glow={glows.ring} />
        </Panel>
        <Panel title="Self filter" caption="filter: grayscale + contrast">
          <Swatch backgroundColor="#f97316" filter={{ grayscale: 72, contrast: 150 }} />
        </Panel>
      </Box>
      <Box
        width="100%"
        height={176}
        padding={space[4]}
        direction="row"
        gap={space[4]}
        alignY="center"
        backgroundColor="#111827"
        gradient={{ type: "linear", from: 0x111827ff, to: 0x312e81ff, angle: 0 }}
        cornerRadius={radius.xl}
        layer
        willChange={["transform", "opacity", "filter"]}
      >
        <Box width="grow" direction="column" gap={space[1]}>
          <Text color={colors.foreground} fontSize={font.lg} fontWeight={weight.semibold}>Retained layer</Text>
          <Text color={colors.mutedForeground} fontSize={font.sm}>Effects compose in the GPU target before Kitty presents the frame.</Text>
        </Box>
        <Swatch backgroundColor="#22d3ee" opacity={0.72} glow={{ radius: 16, color: 0x22d3eeff, intensity: 62 }} />
      </Box>
    </Box>
  )
}

function StatesTab() {
  const [presses, setPresses] = createSignal(0)
  const [armed, setArmed] = createSignal(false)

  return (
    <Box width="100%" direction="column" gap={space[3]}>
      <Box width="100%" direction="row" gap={space[3]} height={176}>
        <Panel title="Button states" caption="hover / active / focus">
          <Box direction="row" gap={space[2]} alignY="center">
            <Button size="sm" variant="default" onPress={() => setPresses((value) => value + 1)}>Press</Button>
            <Button size="sm" variant="outline" onPress={() => setArmed((value) => !value)}>{armed() ? "Armed" : "Arm"}</Button>
          </Box>
        </Panel>
        <Panel title="Custom interaction" caption="declarative style props">
          <Box
            focusable
            width={150}
            height={64}
            alignX="center"
            alignY="center"
            backgroundColor={armed() ? "#14532d" : "#1e293b"}
            borderColor={armed() ? "#4ade80" : "#475569"}
            borderWidth={1}
            cornerRadius={radius.lg}
            glow={armed() ? glows.success : undefined}
            hoverStyle={{ backgroundColor: "#334155", borderColor: "#94a3b8" }}
            activeStyle={{ backgroundColor: "#0f172a" }}
            focusStyle={{ borderColor: "#22d3ee", borderWidth: 2, glow: { radius: 8, color: 0x22d3eeaa, intensity: 65 } }}
            onPress={() => setArmed((value) => !value)}
          >
            <Text color={colors.foreground} fontSize={font.sm}>{armed() ? "Enabled" : "Focusable box"}</Text>
          </Box>
        </Panel>
        <Panel title="Live feedback" caption="same-frame re-layout">
          <Box direction="column" gap={space[1]} alignX="center">
            <Text color="#67e8f9" fontSize={font.xl} fontWeight={weight.bold}>{presses()}</Text>
            <Text color={colors.mutedForeground} fontSize={font.xs}>presses</Text>
          </Box>
        </Panel>
      </Box>
      <Box width="100%" padding={space[4]} backgroundColor={colors.card} cornerRadius={radius.xl} borderColor={colors.border} borderWidth={1}>
        <Text color={colors.mutedForeground} fontSize={font.sm}>
          Use Tab to move focus, Space/Enter to activate, and the mouse to inspect hover and active states.
        </Text>
      </Box>
    </Box>
  )
}

function App() {
  const terminal = useAppTerminal()
  const dims = useTerminalDimensions(terminal)
  const [tab, setTab] = createSignal(0)

  return (
    <Box width={dims.width()} height={dims.height()} backgroundColor={colors.background} direction="column">
      <Box width="100%" height={space[2]} />
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
        <Box width="grow" direction="column" gap={space[1]}>
          <Text color={colors.foreground} fontSize={font.xl} fontWeight={weight.bold}>Vexart Effects Showcase</Text>
          <Text color={colors.mutedForeground} fontSize={font.sm}>GPU visual effects in Kitty · Tab/Arrows navigate · Space/Enter interact · q exit</Text>
        </Box>
        <Badge variant="outline">GPU</Badge>
      </Box>
      <Box width="100%" height="grow" paddingX={space[6]} paddingTop={space[3]} scrollY>
        <VoidTabs
          activeTab={tab()}
          onTabChange={setTab}
          variant="line"
          tabs={[
            { label: "Effects", content: () => <EffectsTab /> },
            { label: "Glass", content: () => <GlassTab /> },
            { label: "Composition", content: () => <CompositionTab /> },
            { label: "States", content: () => <StatesTab /> },
          ]}
        />
      </Box>
    </Box>
  )
}

await createApp(() => <App />, {
  quit: ["q", "ctrl+c"],
})
