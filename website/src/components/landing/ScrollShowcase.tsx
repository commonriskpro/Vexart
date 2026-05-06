'use client'
import { useRef } from 'react'
import { motion, useScroll, useTransform, useMotionValueEvent } from 'framer-motion'
import { useState } from 'react'

const showcaseSteps = [
  {
    title: 'Anti-aliased Corners',
    description: 'SDF-rendered rounded rectangles. Smooth at any radius, any resolution. No jagged pixels — not ASCII box-drawing.',
    code: 'cornerRadius={32}',
    visual: {
      borderRadius: '32px',
      background: 'linear-gradient(135deg, #16163a 0%, #1a1a2e 100%)',
      border: '2px solid rgba(86, 212, 200, 0.25)',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
    },
    accent: '#56d4c8',
  },
  {
    title: 'Drop Shadows',
    description: 'Real Gaussian blur shadows. Multi-shadow support. Not gray characters — actual depth on the GPU.',
    code: 'shadow={{ x: 0, y: 12, blur: 40, color: 0x56d4c860 }}',
    visual: {
      borderRadius: '16px',
      background: 'linear-gradient(145deg, #1e1e38 0%, #14142a 100%)',
      boxShadow: '0 12px 48px rgba(86, 212, 200, 0.35), 0 4px 16px rgba(86, 212, 200, 0.2), 0 24px 60px rgba(0,0,0,0.5)',
    },
    accent: '#56d4c8',
  },
  {
    title: 'Gradients',
    description: 'Linear and radial gradients with angle control. Multi-stop supported. GPU-rendered at 60fps.',
    code: 'gradient={{ type: "linear", from: 0xa78bfaff, to: 0x56d4c8ff }}',
    visual: {
      borderRadius: '16px',
      background: 'linear-gradient(135deg, #a78bfa 0%, #56d4c8 50%, #34d399 100%)',
      boxShadow: '0 4px 24px rgba(86, 212, 200, 0.2)',
    },
    accent: '#60a5fa',
  },
  {
    title: 'Backdrop Blur',
    description: 'Real glassmorphism. Blur the content behind any element. Plus brightness, contrast, saturate, and more.',
    code: 'backdropBlur={12}',
    visual: {
      borderRadius: '16px',
      background: 'rgba(20, 20, 40, 0.4)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      boxShadow: '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)',
      border: '1px solid rgba(255,255,255,0.12)',
    },
    accent: '#a78bfa',
  },
  {
    title: 'Outer Glow',
    description: 'Neon-style glow effects with configurable radius and intensity. Makes UI elements pop off the screen.',
    code: 'glow={{ radius: 24, color: 0xf472b6ff, intensity: 60 }}',
    visual: {
      borderRadius: '16px',
      background: 'linear-gradient(135deg, #1e1028 0%, #14142a 100%)',
      boxShadow: '0 0 20px rgba(244, 114, 182, 0.5), 0 0 60px rgba(244, 114, 182, 0.25), 0 0 120px rgba(244, 114, 182, 0.1), inset 0 0 30px rgba(244, 114, 182, 0.05)',
      border: '1px solid rgba(244, 114, 182, 0.2)',
    },
    accent: '#f472b6',
  },
  {
    title: 'Transforms',
    description: 'Full matrix composition — rotate, scale, skew, translate. Compositor-animated at 60fps without layout recalc.',
    code: 'transform={{ rotate: -6, scale: 1.1 }}',
    visual: {
      borderRadius: '16px',
      background: 'linear-gradient(160deg, #2a1a0a 0%, #1a1a2e 100%)',
      boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 4px 16px rgba(251, 191, 36, 0.15)',
      transform: 'rotate(-6deg) scale(1.1)',
      border: '1px solid rgba(251, 191, 36, 0.15)',
    },
    accent: '#fbbf24',
  },
]

export function ScrollShowcase() {
  const containerRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  })

  const [activeStep, setActiveStep] = useState(0)

  useMotionValueEvent(scrollYProgress, 'change', (value) => {
    const step = Math.min(
      showcaseSteps.length - 1,
      Math.floor(value * showcaseSteps.length)
    )
    setActiveStep(step)
  })

  const currentStep = showcaseSteps[activeStep]

  return (
    <section ref={containerRef} className="relative" style={{ height: `${showcaseSteps.length * 100}vh` }}>
      {/* Section header */}
      <div className="sticky top-0 h-screen flex items-center justify-center overflow-hidden">
        <div className="w-full max-w-6xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">

          {/* Left: Text content */}
          <div className="space-y-6">
            <motion.div
              key={activeStep + '-badge'}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4 }}
            >
              <span
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-mono font-medium border"
                style={{
                  borderColor: `${currentStep.accent}30`,
                  color: currentStep.accent,
                  background: `${currentStep.accent}08`,
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: currentStep.accent }} />
                Effect {activeStep + 1}/{showcaseSteps.length}
              </span>
            </motion.div>

            <motion.h3
              key={activeStep + '-title'}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.05 }}
              className="text-3xl sm:text-4xl font-bold text-vex-white tracking-tight"
            >
              {currentStep.title}
            </motion.h3>

            <motion.p
              key={activeStep + '-desc'}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="text-base text-vex-muted leading-relaxed max-w-md"
            >
              {currentStep.description}
            </motion.p>

            <motion.div
              key={activeStep + '-code'}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.15 }}
              className="inline-block px-4 py-2.5 rounded-lg bg-[#0a0a12] border border-vex-border/50 font-mono text-[12px]"
            >
              <span className="text-vex-muted">{'<box '}</span>
              <span style={{ color: currentStep.accent }}>{currentStep.code}</span>
              <span className="text-vex-muted">{' />'}</span>
            </motion.div>

            {/* Progress dots */}
            <div className="flex gap-2 pt-4">
              {showcaseSteps.map((_, i) => (
                <div
                  key={i}
                  className="h-1 rounded-full transition-all duration-300"
                  style={{
                    width: i === activeStep ? '24px' : '8px',
                    background: i === activeStep ? currentStep.accent : '#2a2a35',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Right: Visual preview */}
          <div className="flex items-center justify-center">
            <div className="relative">
              {/* Background glow */}
              <motion.div
                key={activeStep + '-glow'}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6 }}
                className="absolute inset-0 rounded-[32px] blur-[80px] opacity-15 -z-10 scale-150"
                style={{ background: `radial-gradient(circle, ${currentStep.accent} 0%, transparent 70%)` }}
              />

              {/* Backdrop blur needs visible content behind it to work */}
              {currentStep.code === 'backdropBlur={12}' && (
                <div className="absolute inset-0 overflow-hidden rounded-2xl">
                  <div className="absolute top-4 left-6 w-28 h-28 rounded-full bg-vex-accent/50" />
                  <div className="absolute bottom-6 right-8 w-20 h-20 rounded-full bg-vex-purple/50" />
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-36 h-12 rounded-lg bg-vex-pink/40 rotate-12" />
                  <div className="absolute top-8 right-12 w-16 h-16 rounded-lg bg-vex-orange/40 -rotate-6" />
                  <div className="absolute bottom-4 left-12 text-vex-accent/60 font-mono text-xs">content behind</div>
                </div>
              )}

              {/* The card preview */}
              <motion.div
                key={activeStep + '-visual'}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, type: 'spring', stiffness: 200 }}
                className="relative w-[280px] h-[180px] sm:w-[320px] sm:h-[200px] flex items-center justify-center overflow-hidden"
                style={currentStep.visual as React.CSSProperties}
              >
                <div className="text-center px-6">
                  <div className="text-white font-semibold text-lg mb-1">Vexart</div>
                  <div className="text-white/50 text-xs font-mono">{currentStep.code.split('=')[0]}</div>
                </div>
              </motion.div>
            </div>
          </div>
        </div>

        {/* Scroll hint */}
        <motion.div
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 text-vex-muted/40"
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <span className="text-[10px] font-mono">scroll</span>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 6 L8 10 L12 6" strokeLinecap="round" />
          </svg>
        </motion.div>
      </div>
    </section>
  )
}
