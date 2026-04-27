/**
 * MSDF Font System Test
 *
 * Verifies that the MSDF font system initializes, discovers system fonts,
 * queries font faces, and measures text correctly.
 *
 * Run: bun --conditions=browser run examples/msdf-test.tsx
 */
import { createApp, Box, Text } from "@vexart/app"
import { colors, radius, space } from "@vexart/styled"
import {
  isMsdfFontAvailable,
  msdfFontInit,
  msdfFontQuery,
  msdfMeasureText,
} from "@vexart/engine"

// ── Run MSDF font system tests ──────────────────────────────────────────

const results: { label: string; value: string; ok: boolean }[] = []

const available = isMsdfFontAvailable()
results.push({ label: "MSDF available", value: String(available), ok: available })

if (available) {
  const faceCount = msdfFontInit()
  results.push({ label: "System fonts", value: `${faceCount} faces`, ok: faceCount > 0 })

  const mono = msdfFontQuery(["JetBrains Mono", "Menlo", "monospace"], 400, false)
  results.push({ label: "Mono font", value: mono ? `handle ${mono}` : "NOT FOUND", ok: !!mono })

  const sans = msdfFontQuery(["Helvetica", "Arial", "sans-serif"], 400, false)
  results.push({ label: "Sans font", value: sans ? `handle ${sans}` : "NOT FOUND", ok: !!sans })

  const serif = msdfFontQuery(["Georgia", "Times New Roman", "serif"], 400, false)
  results.push({ label: "Serif font", value: serif ? `handle ${serif}` : "NOT FOUND", ok: !!serif })

  const bold = msdfFontQuery(["Helvetica", "sans-serif"], 700, false)
  results.push({ label: "Bold font", value: bold ? `handle ${bold}` : "NOT FOUND", ok: !!bold })

  const m1 = msdfMeasureText("Hello World", ["Helvetica", "sans-serif"], 14)
  results.push({
    label: "Measure 'Hello World' 14px",
    value: m1 ? `${m1.width.toFixed(1)} × ${m1.height.toFixed(1)}` : "FAILED",
    ok: !!m1 && m1.width > 0,
  })

  const m2 = msdfMeasureText("MSDF\nMulti-line", ["Menlo", "monospace"], 16)
  results.push({
    label: "Measure multi-line 16px",
    value: m2 ? `${m2.width.toFixed(1)} × ${m2.height.toFixed(1)}` : "FAILED",
    ok: !!m2 && m2.height > 20,
  })

  const emoji = msdfMeasureText("Hello 🌍", ["Helvetica", "sans-serif"], 14)
  results.push({
    label: "Measure with emoji",
    value: emoji ? `${emoji.width.toFixed(1)} × ${emoji.height.toFixed(1)}` : "FAILED",
    ok: !!emoji,
  })
}

const passed = results.filter(r => r.ok).length
const total = results.length

function App() {
  return (
    <Box
      width="100%"
      height="100%"
      backgroundColor={colors.background}
      alignX="center"
      alignY="center"
    >
      <Box
        backgroundColor={colors.card}
        cornerRadius={radius.xl}
        padding={space[6]}
        direction="column"
        gap={space[3]}
        minWidth={400}
      >
        <Text color={colors.foreground} fontSize={18}>
          MSDF Font System Test
        </Text>
        <Text color={passed === total ? 0x22c55eff : 0xf59e0bff} fontSize={14}>
          {passed}/{total} checks passed
        </Text>

        <Box height={1} backgroundColor={colors.border} />

        {results.map(r => (
          <Box direction="row" gap={space[2]} alignY="center">
            <Text color={r.ok ? 0x22c55eff : 0xdc2626ff} fontSize={12}>
              {r.ok ? "✓" : "✗"}
            </Text>
            <Text color={colors.mutedForeground} fontSize={12}>
              {r.label}:
            </Text>
            <Text color={colors.foreground} fontSize={12}>
              {r.value}
            </Text>
          </Box>
        ))}

        <Box height={1} backgroundColor={colors.border} />

        <Text color={colors.mutedForeground} fontSize={11}>
          Press Ctrl+C to exit
        </Text>
      </Box>
    </Box>
  )
}

await createApp(() => <App />)
