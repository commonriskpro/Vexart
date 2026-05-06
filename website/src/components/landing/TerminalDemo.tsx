'use client'
import { motion } from 'framer-motion'

const code = `import { createApp, Box, Text, Button, colors, radius, space } from "vexart"

function App() {
  return (
    <Box backgroundColor={colors.background} padding={space[6]} gap={space[4]}>
      <Box backgroundColor={colors.card} cornerRadius={radius.lg}
           padding={space[5]} shadow={{ x: 0, y: 4, blur: 16, color: 0x00000040 }}>
        <Text color={colors.foreground} fontSize={18} fontWeight={600}>
          Hello from Vexart
        </Text>
        <Text color={colors.mutedForeground} fontSize={13}>
          Anti-aliased corners, real shadows, GPU pixels
        </Text>
      </Box>
      <Button onPress={() => console.log("GPU-rendered click!")}
        renderButton={(ctx) => (
          <Box {...ctx.buttonProps} backgroundColor={0x56d4c8ff}
               cornerRadius={radius.md} padding={space[3]}
               hoverStyle={{ backgroundColor: 0x7ee8ddff }}>
            <Text color={0x0a0a0fff} fontWeight={600}>Get Started</Text>
          </Box>
        )}
      />
    </Box>
  )
}

await createApp(() => <App />)`

export function TerminalDemo() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-100px' }}
      transition={{ duration: 0.8 }}
      className="relative max-w-4xl mx-auto px-6 pb-24"
    >
      {/* Glow behind terminal */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[80%] h-[60%] bg-vex-accent/5 rounded-full blur-[80px]" />
      </div>

      <div className="relative rounded-2xl overflow-hidden border border-vex-border bg-vex-surface shadow-2xl shadow-black/50">
        {/* Title bar */}
        <div className="flex items-center gap-2 px-4 py-3 bg-vex-card border-b border-vex-border">
          <div className="flex gap-1.5">
            <span className="w-3 h-3 rounded-full bg-[#ff5f57]" />
            <span className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
            <span className="w-3 h-3 rounded-full bg-[#28c840]" />
          </div>
          <span className="ml-3 text-xs font-mono text-vex-muted">kitty — bun run app.tsx</span>
        </div>

        {/* Code content */}
        <div className="p-6 overflow-x-auto">
          <pre className="text-[13px] leading-relaxed font-mono">
            <code>
              {code.split('\n').map((line, i) => (
                <div key={i} className="flex">
                  <span className="select-none w-8 text-right pr-4 text-vex-muted/40 text-xs">{i + 1}</span>
                  <span className="text-vex-text">
                    {colorize(line)}
                  </span>
                </div>
              ))}
            </code>
          </pre>
        </div>
      </div>
    </motion.section>
  )
}

function colorize(line: string) {
  return line
    .replace(/(import|from|function|return|const|await)/g, '<kw>$1</kw>')
    .replace(/(".*?")/g, '<str>$1</str>')
    .replace(/(\{|\}|\(|\))/g, '<br>$1</br>')
    .split(/(<kw>|<\/kw>|<str>|<\/str>|<br>|<\/br>)/)
    .reduce((acc: any[], part, i, arr) => {
      if (part === '<kw>') {
        acc.push(<span key={i} className="text-vex-purple">{arr[i + 1]}</span>)
        arr[i + 1] = ''
      } else if (part === '<str>') {
        acc.push(<span key={i} className="text-vex-accent">{arr[i + 1]}</span>)
        arr[i + 1] = ''
      } else if (part === '<br>') {
        acc.push(<span key={i} className="text-vex-muted">{arr[i + 1]}</span>)
        arr[i + 1] = ''
      } else if (!part.startsWith('</') && part !== '') {
        acc.push(<span key={i}>{part}</span>)
      }
      return acc
    }, [])
}
