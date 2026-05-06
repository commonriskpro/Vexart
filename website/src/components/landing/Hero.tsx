'use client'
import { motion, useMotionValue, useTransform, useSpring } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'

const codeLines = [
  { text: 'import { createApp, Box, Text } from "vexart"', delay: 0 },
  { text: '', delay: 400 },
  { text: 'await createApp(() => (', delay: 600 },
  { text: '  <Box', delay: 800 },
  { text: '    backgroundColor={0x0a0a0fff}', delay: 1000 },
  { text: '    cornerRadius={16}', delay: 1150 },
  { text: '    shadow={{ x: 0, y: 8, blur: 32, color: 0x56d4c840 }}', delay: 1350 },
  { text: '    backdropBlur={12}', delay: 1550 },
  { text: '    padding={24}', delay: 1700 },
  { text: '  >', delay: 1850 },
  { text: '    <Text fontSize={20} fontWeight={700} color={0xfafafaff}>', delay: 2000 },
  { text: '      Hello from the GPU', delay: 2200 },
  { text: '    </Text>', delay: 2400 },
  { text: '  </Box>', delay: 2500 },
  { text: '))', delay: 2600 },
]

function TypedCode() {
  const [visibleLines, setVisibleLines] = useState(0)

  useEffect(() => {
    const timers: NodeJS.Timeout[] = []
    codeLines.forEach((line, i) => {
      timers.push(setTimeout(() => setVisibleLines(i + 1), line.delay))
    })
    return () => timers.forEach(clearTimeout)
  }, [])

  return (
    <div className="font-mono text-[11px] sm:text-[13px] leading-relaxed">
      {codeLines.slice(0, visibleLines).map((line, i) => (
        <div key={i} className="flex">
          <span className="select-none w-6 text-right pr-3 text-[#3a3a50] text-[10px]">{i + 1}</span>
          <span>{colorize(line.text)}</span>
        </div>
      ))}
      {visibleLines < codeLines.length && (
        <div className="flex">
          <span className="w-6" />
          <span className="inline-block w-[7px] h-[16px] bg-vex-accent animate-pulse" />
        </div>
      )}
    </div>
  )
}

function RenderedPreview() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 2.8, duration: 0.6, ease: 'easeOut' }}
      className="flex items-center justify-center h-full"
    >
      {/* The "rendered" output — showing what Vexart produces */}
      <div className="relative">
        {/* Glow behind card */}
        <div className="absolute -inset-8 bg-vex-accent/10 rounded-3xl blur-[40px]" />

        {/* The card itself — mimics Vexart's actual render */}
        <div
          className="relative px-8 py-6 rounded-2xl border border-white/[0.06]"
          style={{
            background: 'linear-gradient(135deg, rgba(20,20,32,0.9) 0%, rgba(10,10,15,0.95) 100%)',
            boxShadow: '0 8px 32px rgba(86, 212, 200, 0.15), 0 2px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.03)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <div className="text-[20px] font-bold text-white tracking-tight">
            Hello from the GPU
          </div>
          <div className="mt-2 text-[13px] text-vex-muted">
            Anti-aliased · Shadows · Blur · 60fps
          </div>

          {/* Effect indicators */}
          <div className="mt-4 flex gap-2">
            {['cornerRadius', 'shadow', 'backdropBlur'].map(effect => (
              <span key={effect} className="px-2 py-0.5 rounded-md bg-vex-accent/10 text-vex-accent text-[10px] font-mono">
                {effect} ✓
              </span>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export function Hero() {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center px-6 pt-24 pb-8 overflow-hidden">
      {/* Animated background orbs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[15%] left-[20%] w-[400px] h-[400px] bg-vex-accent/[0.04] rounded-full blur-[100px] animate-[float_20s_ease-in-out_infinite]" />
        <div className="absolute bottom-[20%] right-[15%] w-[350px] h-[350px] bg-vex-purple/[0.04] rounded-full blur-[100px] animate-[float_25s_ease-in-out_infinite_reverse]" />
        <div className="absolute top-[60%] left-[50%] w-[250px] h-[250px] bg-vex-pink/[0.03] rounded-full blur-[80px] animate-[float_18s_ease-in-out_infinite_2s]" />
      </div>

      {/* Badge */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative mb-6"
      >
        <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-vex-accent/20 bg-vex-accent/[0.05] text-xs font-medium text-vex-accent">
          <span className="w-1.5 h-1.5 rounded-full bg-vex-accent animate-pulse" />
          v0.9.0-beta.19
        </span>
      </motion.div>

      {/* Headline */}
      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.1 }}
        className="text-center max-w-5xl mb-5"
      >
        <span className="block text-5xl sm:text-6xl lg:text-[4.5rem] font-bold tracking-[-0.04em] leading-[1.05]">
          <span className="text-vex-white">The first </span>
          <span className="relative inline-block">
            <span className="bg-gradient-to-r from-vex-accent via-teal-300 to-vex-purple bg-clip-text text-transparent">
              GPU engine
            </span>
            <span className="absolute -bottom-1 left-0 right-0 h-[3px] bg-gradient-to-r from-vex-accent/60 to-vex-purple/60 rounded-full blur-[2px]" />
          </span>
          <br />
          <span className="text-vex-white">for the terminal.</span>
        </span>
      </motion.h1>

      {/* Subtitle */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.3 }}
        className="text-center text-base sm:text-lg text-vex-muted max-w-xl leading-relaxed mb-10"
      >
        Write JSX. Vexart renders real pixels — anti-aliased, shadowed, blurred —
        directly to Kitty, Ghostty, and WezTerm. Not ASCII. Not cells. Pixels.
      </motion.p>

      {/* CTAs */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.5 }}
        className="flex flex-wrap gap-3 justify-center mb-16"
      >
        <a
          href="/guides/introduction/"
          className="group relative inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-vex-accent text-vex-bg font-semibold text-sm overflow-hidden transition-all duration-200 hover:-translate-y-0.5"
        >
          <span className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
          <span className="relative">Get Started</span>
          <svg className="relative w-4 h-4 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
        </a>
        <a
          href="https://github.com/commonriskpro/Vexart"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-vex-border/80 text-vex-text font-medium text-sm transition-all duration-200 hover:border-vex-accent/40 hover:text-vex-accent hover:-translate-y-0.5 hover:shadow-[0_0_20px_rgba(86,212,200,0.08)]"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
          GitHub
        </a>
      </motion.div>

      {/* Split terminal: Code → Rendered */}
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, delay: 0.7 }}
        className="relative w-full max-w-5xl"
      >
        {/* Glow */}
        <div className="absolute -inset-4 bg-gradient-to-b from-vex-accent/[0.06] to-transparent rounded-3xl blur-[40px] pointer-events-none" />

        <div className="relative grid grid-cols-1 lg:grid-cols-2 rounded-2xl overflow-hidden border border-vex-border/60 shadow-2xl shadow-black/60">
          {/* Left: Code */}
          <div className="bg-[#08080e] border-r border-vex-border/40">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-vex-border/40 bg-[#0c0c14]">
              <div className="flex gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]/80" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]/80" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]/80" />
              </div>
              <span className="ml-2 text-[10px] font-mono text-vex-muted/60">app.tsx</span>
            </div>
            <div className="p-4 h-[320px] overflow-hidden">
              <TypedCode />
            </div>
          </div>

          {/* Right: Rendered output */}
          <div className="bg-[#060609] relative">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-vex-border/40 bg-[#0c0c14]">
              <span className="text-[10px] font-mono text-vex-accent/60">● kitty output</span>
            </div>
            <div className="p-6 h-[320px]">
              <RenderedPreview />
            </div>

            {/* Scanline effect */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.015]" style={{
              backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)',
            }} />
          </div>
        </div>

        {/* Label */}
        <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] font-mono text-vex-muted/50 flex items-center gap-4">
          <span>JSX input</span>
          <svg className="w-4 h-4 text-vex-accent/40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
          <span>GPU pixels</span>
        </div>
      </motion.div>
    </section>
  )
}

function colorize(text: string): React.ReactNode {
  if (!text) return '\u00A0'

  const parts: React.ReactNode[] = []
  let remaining = text
  let key = 0

  const patterns: [RegExp, string][] = [
    [/^(import|from|await|function|return|const)\b/, 'text-vex-purple'],
    [/^(".*?")/, 'text-vex-accent'],
    [/^(\d+x[0-9a-f]+|0x[0-9a-f]+|\d+)/, 'text-vex-orange'],
    [/^(\/\/.*)/, 'text-vex-muted'],
    [/^(\w+)(?=\s*[=({:])/, 'text-sky-300'],
    [/^(<\/?\w+>?)/, 'text-vex-pink'],
    [/^([{}()[\]<>.,;:=])/, 'text-vex-muted/60'],
    [/^(\s+)/, ''],
    [/^([^\s"'`{}()[\]<>.,;:=]+)/, 'text-vex-text'],
  ]

  while (remaining.length > 0) {
    let matched = false
    for (const [pattern, className] of patterns) {
      const match = remaining.match(pattern)
      if (match) {
        parts.push(
          className
            ? <span key={key++} className={className}>{match[0]}</span>
            : <span key={key++}>{match[0]}</span>
        )
        remaining = remaining.slice(match[0].length)
        matched = true
        break
      }
    }
    if (!matched) {
      parts.push(<span key={key++}>{remaining[0]}</span>)
      remaining = remaining.slice(1)
    }
  }

  return <>{parts}</>
}
