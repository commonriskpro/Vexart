/**
 * Font Rendering Showcase — demonstrates Rust MSDF native font system.
 *
 * All text here is rendered through the Rust/WGPU MSDF pipeline:
 *   TS → vexart_font_render_text FFI → Rust fontdb + ttf-parser + fdsm → GPU
 *
 * Run: bun --conditions=browser run src/font-showcase.tsx
 */
import { createSignal } from "solid-js"
import { createApp, Box, Text } from "@vexart/app"
import { useTerminalDimensions, For } from "@vexart/engine"
import { space, font, colors } from "@vexart/styled"
import { useAppTerminal } from "@vexart/app"

function Section(props: { title: string; children: any }) {
  return (
    <Box direction="column" gap={space[2]} width="100%">
      <Text color="#56d4c8" fontSize={font.sm} fontWeight={700}>
        {props.title}
      </Text>
      <Box direction="column" gap={space[1]} paddingLeft={space[2]} width="100%">
        {props.children}
      </Box>
    </Box>
  )
}

function App() {
  const terminal = useAppTerminal()
  const dims = useTerminalDimensions(terminal)

  const pangram = "The quick brown fox jumps over the lazy dog"
  const sizes = [10, 12, 14, 16, 20, 24, 30]
  const lorem = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris."

  return (
    <Box
      width={dims.width()} height={dims.height()}
      backgroundColor="#0a0a0a" padding={space[4]} gap={space[4]}
      scrollY scrollSpeed={3}
    >
      {/* Header */}
      <Box direction="column" gap={space[1]} width="100%">
        <Text color="#ffffff" fontSize={font["2xl"]} fontWeight={700}>
          Rust MSDF Font Rendering
        </Text>
        <Text color="#737373" fontSize={font.sm}>
          All text rendered via Rust/WGPU native MSDF pipeline — no DOM, no Skia, no Pretext
        </Text>
      </Box>

      {/* Font size scale */}
      <Section title="FONT SIZE SCALE">
        <For each={sizes}>
          {(size: number) => (
            <Box direction="row" gap={space[3]} alignY="center" width="100%">
              <Box width={40}>
                <Text color="#737373" fontSize={font.xs}>{String(size)}px</Text>
              </Box>
              <Text color="#e5e5e5" fontSize={size}>{pangram}</Text>
            </Box>
          )}
        </For>
      </Section>

      {/* Word wrapping */}
      <Section title="WORD WRAPPING (responsive to terminal width)">
        <Box width="100%" direction="column" gap={space[2]}>
          <Box width="100%" backgroundColor="#171717" padding={space[3]} cornerRadius={8}>
            <Text color="#e5e5e5" fontSize={font.base}>
              {lorem}
            </Text>
          </Box>
          <Box width="60%" backgroundColor="#171717" padding={space[3]} cornerRadius={8}>
            <Text color="#e5e5e5" fontSize={font.base}>
              {lorem}
            </Text>
          </Box>
          <Box width="40%" backgroundColor="#171717" padding={space[3]} cornerRadius={8}>
            <Text color="#e5e5e5" fontSize={font.base}>
              {lorem}
            </Text>
          </Box>
        </Box>
      </Section>

      {/* Color palette */}
      <Section title="COLOR RENDERING">
        <Box direction="row" gap={space[2]} width="100%">
          <Text color="#ef4444" fontSize={font.lg}>Red</Text>
          <Text color="#f97316" fontSize={font.lg}>Orange</Text>
          <Text color="#eab308" fontSize={font.lg}>Yellow</Text>
          <Text color="#22c55e" fontSize={font.lg}>Green</Text>
          <Text color="#06b6d4" fontSize={font.lg}>Cyan</Text>
          <Text color="#3b82f6" fontSize={font.lg}>Blue</Text>
          <Text color="#8b5cf6" fontSize={font.lg}>Purple</Text>
          <Text color="#ec4899" fontSize={font.lg}>Pink</Text>
        </Box>
      </Section>

      {/* Mixed content — UI card */}
      <Section title="UI COMPOSITION — CARD">
        <Box
          width="grow" maxWidth={500}
          backgroundColor="#171717" cornerRadius={12}
          padding={space[5]} gap={space[3]}
          shadow={{ x: 0, y: 4, blur: 20, color: "#00000060" }}
        >
          <Text color="#ffffff" fontSize={font.xl} fontWeight={700}>
            GPU-Accelerated Text
          </Text>
          <Text color="#a3a3a3" fontSize={font.sm}>
            Every glyph is rendered as a Signed Distance Field quad on the GPU. Anti-aliased at any size, resolution-independent, with sub-pixel positioning.
          </Text>
          <Box direction="row" gap={space[2]}>
            <Box backgroundColor="#22c55e20" padding={space[1]} paddingX={space[2]} cornerRadius={6}>
              <Text color="#22c55e" fontSize={font.xs}>MSDF</Text>
            </Box>
            <Box backgroundColor="#3b82f620" padding={space[1]} paddingX={space[2]} cornerRadius={6}>
              <Text color="#3b82f6" fontSize={font.xs}>WGPU</Text>
            </Box>
            <Box backgroundColor="#8b5cf620" padding={space[1]} paddingX={space[2]} cornerRadius={6}>
              <Text color="#8b5cf6" fontSize={font.xs}>Rust</Text>
            </Box>
          </Box>
        </Box>
      </Section>

      {/* Density test */}
      <Section title="DENSITY TEST — MIXED SIZES IN ONE VIEW">
        <Box direction="column" gap={space[1]} width="100%">
          <Text color="#ffffff" fontSize={font["3xl"]} fontWeight={700}>
            Heading One
          </Text>
          <Text color="#e5e5e5" fontSize={font.xl}>
            A secondary heading with more detail
          </Text>
          <Text color="#a3a3a3" fontSize={font.base}>
            Body text at the default size. This is what most content uses. It should be readable at any terminal resolution, whether you're on a 13" laptop or a 32" monitor.
          </Text>
          <Text color="#737373" fontSize={font.xs}>
            Fine print — small caption text for metadata, timestamps, and secondary info. Still crisp thanks to MSDF.
          </Text>
        </Box>
      </Section>

      {/* Numbers and special chars */}
      <Section title="CHARACTER COVERAGE">
        <Text color="#e5e5e5" fontSize={font.base}>
          {"ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz"}
        </Text>
        <Text color="#e5e5e5" fontSize={font.base}>
          {"0123456789 !@#$%^&*()_+-=[]{}|;':\",./<>?"}
        </Text>
        <Text color="#e5e5e5" fontSize={font.base}>
          {"Ñ ñ ü ö ä é è ê ë à â ç ß æ ø å — € £ ¥ © ® ™ °"}
        </Text>
      </Section>

      {/* Terminal info */}
      <Box direction="row" gap={space[2]} paddingTop={space[2]} width="100%">
        <Text color="#404040" fontSize={font.xs}>
          {`Terminal: ${dims.width()}×${dims.height()}px | Press q to quit`}
        </Text>
      </Box>
    </Box>
  )
}

await createApp(() => <App />, { quit: ["q", "ctrl+c"] })
