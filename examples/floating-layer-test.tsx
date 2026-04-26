/**
 * Minimal test: floating + layer background visibility.
 * 
 * Test A: layer WITHOUT floating (should work — like dashboard)
 * Test B: layer WITH floating="root" (fails in cosmic shell)
 * 
 * Run: bun --conditions=browser run examples/floating-layer-test.tsx
 */

import { useTerminalDimensions } from "@vexart/engine"
import { createApp, useAppTerminal, Box, Text } from "@vexart/app"

function App() {
  const terminal = useAppTerminal()
  const dims = useTerminalDimensions(terminal)

  return (
    <Box
      width={dims.width()}
      height={dims.height()}
      backgroundColor={0x111111ff}
      direction="column"
      alignX="center"
      alignY="center"
      gap={20}
    >
      {/* 5 floating+layer windows like cosmic shell */}
      {/* W1: Background (no bg, canvas placeholder) */}
      <Box layer floating="root" floatOffset={{ x: 0, y: 0 }} zIndex={0} width={dims.width()} height={dims.height()}>
        <Box width={dims.width()} height={dims.height()} backgroundColor={0x00000001} />
      </Box>

      {/* W2: Left Rail — with scroll */}
      <Box layer contain="paint" floating="root" floatOffset={{ x: 20, y: 40 }} zIndex={5} width={260} height={Math.round(dims.height() * 0.85)}>
        <Box width={260} height={Math.round(dims.height() * 0.85)} backgroundColor={0x10182bd9} borderColor={0xffffff2e} borderWidth={1} cornerRadius={18} padding={16} direction="column" gap={8}>
          <Text color={0xe5e7ebff} fontSize={17} fontWeight={700}>LEFT RAIL</Text>
          <Text color={0x64748bff} fontSize={11}>With scroll content</Text>
          <Box width="grow" height="grow" scrollY direction="column" gap={4}>
            <Text color={0x94a3b8ff} fontSize={12}>Item 1</Text>
            <Text color={0x94a3b8ff} fontSize={12}>Item 2</Text>
            <Text color={0x94a3b8ff} fontSize={12}>Item 3</Text>
            <Text color={0x94a3b8ff} fontSize={12}>Item 4</Text>
            <Text color={0x94a3b8ff} fontSize={12}>Item 5</Text>
            <Text color={0x94a3b8ff} fontSize={12}>Item 6</Text>
            <Text color={0x94a3b8ff} fontSize={12}>Item 7</Text>
            <Text color={0x94a3b8ff} fontSize={12}>Item 8</Text>
          </Box>
        </Box>
      </Box>

      {/* W3: Main Editor */}
      <Box layer contain="paint" floating="root" floatOffset={{ x: 300, y: 40 }} zIndex={10} width={Math.round(dims.width() * 0.5)} height={Math.round(dims.height() * 0.85)}>
        <Box width="grow" height="grow" backgroundColor={0x0b1428dc} borderColor={0xffffff2a} borderWidth={1} cornerRadius={18} padding={16} direction="column" gap={8}>
          <Text color={0xe5e7ebff} fontSize={17} fontWeight={700}>EDITOR</Text>
          <Text color={0x64748bff} fontSize={11}>Code content</Text>
          <Box width="grow" height="grow" scrollY direction="column" gap={2} backgroundColor={0x081225d9}>
            <Text color={0xa78bffff} fontSize={14}>import &#123; useEffect &#125; from 'react';</Text>
            <Text color={0x94a3b8ff} fontSize={14}>import &#123; Card &#125; from '@components/ui/card';</Text>
            <Text color={0x94a3b8ff} fontSize={14}>export default function OrbitTraffic() &#123;</Text>
            <Text color={0x67e8f9ff} fontSize={14}>  const [data, setData] = useState([]);</Text>
            <Text color={0x94a3b8ff} fontSize={14}>  return &lt;Card&gt;...&lt;/Card&gt;;</Text>
            <Text color={0x94a3b8ff} fontSize={14}>&#125;</Text>
          </Box>
        </Box>
      </Box>

      {/* W4: Right Nova panel */}
      <Box layer contain="paint" floating="root" floatOffset={{ x: Math.round(dims.width() * 0.5 + 320), y: 40 }} zIndex={15} width={Math.round(dims.width() * 0.3)} height={Math.round(dims.height() * 0.85)}>
        <Box width="grow" height="grow" backgroundColor={0x11182dda} borderColor={0xffffff2e} borderWidth={1} cornerRadius={18} padding={16} direction="column" gap={8}>
          <Text color={0xe5e7ebff} fontSize={17} fontWeight={700}>NOVA PANEL</Text>
          <Text color={0x34d399ff} fontSize={11}>ONLINE</Text>
          <Text color={0x94a3b8ff} fontSize={13}>How can I assist?</Text>
        </Box>
      </Box>

      {/* W5: Bottom Dock */}
      <Box layer contain="paint" floating="root" floatOffset={{ x: 20, y: Math.round(dims.height() * 0.88) }} zIndex={20} width={Math.round(dims.width() - 40)} height={64}>
        <Box width="grow" height={64} backgroundColor={0x10182ce8} borderColor={0xffffff2b} borderWidth={1} cornerRadius={18} direction="row" alignY="center" gap={16} paddingX={16}>
          <Text color={0xe5e7ebff} fontSize={12} fontWeight={700}>Editor</Text>
          <Text color={0xe5e7ebff} fontSize={12}>Terminal</Text>
          <Text color={0xe5e7ebff} fontSize={12}>Explorer</Text>
          <Text color={0xe5e7ebff} fontSize={12}>Git</Text>
          <Text color={0xe5e7ebff} fontSize={12}>Assistant</Text>
        </Box>
      </Box>

      <Text color={0xe0e0e0ff} fontSize={14}>Press q to exit</Text>
    </Box>
  )
}

await createApp(() => <App />, {
  quit: ["q", "ctrl+c"],
  mount: {
    experimental: {
      forceLayerRepaint: false,
      nativePresentation: true,
      nativeLayerRegistry: true,
    },
  },
})
