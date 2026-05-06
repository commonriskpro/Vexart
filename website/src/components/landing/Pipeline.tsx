'use client'
import { motion } from 'framer-motion'

const stages = [
  { label: 'JSX', sublabel: 'SolidJS', icon: '{ }', color: '#a78bfa' },
  { label: 'Layout', sublabel: 'Flexily', icon: '⊞', color: '#60a5fa' },
  { label: 'Paint', sublabel: 'WGPU', icon: '▣', color: '#56d4c8' },
  { label: 'Composite', sublabel: 'Layers', icon: '◫', color: '#34d399' },
  { label: 'Encode', sublabel: 'Kitty', icon: '⎙', color: '#fbbf24' },
  { label: 'Terminal', sublabel: 'Pixels', icon: '◉', color: '#f472b6' },
]

export function Pipeline() {
  return (
    <section className="py-32 px-6 relative">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="text-center mb-16"
      >
        <h2 className="text-3xl sm:text-4xl font-bold text-vex-white tracking-tight">
          From JSX to pixels in{' '}
          <span className="font-mono text-vex-accent">&lt;5ms</span>
        </h2>
        <p className="mt-3 text-vex-muted text-base max-w-lg mx-auto">
          Six pipeline stages. TypeScript owns the top three. Rust owns the bottom three.
        </p>
      </motion.div>

      {/* Pipeline visualization */}
      <div className="max-w-4xl mx-auto relative">
        {/* Connection line */}
        <div className="absolute top-1/2 left-[10%] right-[10%] h-px bg-gradient-to-r from-transparent via-vex-border to-transparent -translate-y-1/2 hidden sm:block" />

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {stages.map((stage, i) => (
            <motion.div
              key={stage.label}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="relative group"
            >
              <div className="flex flex-col items-center gap-3 p-4 rounded-xl border border-vex-border/50 bg-vex-card/30 backdrop-blur-sm transition-all duration-300 group-hover:border-[color:var(--stage-color)]/30 group-hover:shadow-[0_0_20px_var(--glow)]"
                style={{
                  '--stage-color': stage.color,
                  '--glow': `${stage.color}15`,
                } as React.CSSProperties}
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-lg font-mono"
                  style={{ background: `${stage.color}15`, color: stage.color }}
                >
                  {stage.icon}
                </div>
                <div className="text-center">
                  <div className="text-sm font-semibold text-vex-white">{stage.label}</div>
                  <div className="text-[10px] text-vex-muted mt-0.5">{stage.sublabel}</div>
                </div>
              </div>

              {/* Arrow between stages */}
              {i < stages.length - 1 && (
                <div className="hidden lg:block absolute top-1/2 -right-2 -translate-y-1/2 text-vex-border z-10">
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
                    <path d="M0 0 L8 4 L0 8 Z" />
                  </svg>
                </div>
              )}
            </motion.div>
          ))}
        </div>

        {/* TS / Rust boundary */}
        <div className="mt-6 flex justify-center gap-8 text-[10px] font-mono">
          <span className="text-vex-purple/60">← TypeScript</span>
          <span className="text-vex-border">|</span>
          <span className="text-vex-accent/60">Rust →</span>
        </div>
      </div>
    </section>
  )
}
