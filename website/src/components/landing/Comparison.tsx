'use client'
import { motion } from 'framer-motion'

const rows = [
  { feature: 'Rendering', legacy: 'ASCII character grids', vexart: 'GPU pixels (WGPU)' },
  { feature: 'Corners', legacy: '╭──╮ box drawing', vexart: 'SDF anti-aliased' },
  { feature: 'Shadows', legacy: 'Gray characters', vexart: 'Real Gaussian blur' },
  { feature: 'Gradients', legacy: 'None or limited', vexart: 'Linear + Radial' },
  { feature: 'Blur', legacy: 'Impossible', vexart: 'Backdrop filters' },
  { feature: 'Text', legacy: 'Monospace cells only', vexart: 'MSDF (sharp at any size)' },
  { feature: 'Performance', legacy: 'CPU character writes', vexart: 'GPU (Metal/Vulkan/DX12)' },
  { feature: 'Reactivity', legacy: 'Full re-render', vexart: 'SolidJS fine-grained signals' },
]

export function Comparison() {
  return (
    <section className="py-24 px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="text-center mb-12"
      >
        <h2 className="text-3xl sm:text-4xl font-bold text-vex-white">
          Not your grandfather's TUI
        </h2>
        <p className="mt-4 text-vex-muted text-lg">
          Cell-based frameworks vs GPU-accelerated pixels.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.7, delay: 0.1 }}
        className="max-w-3xl mx-auto rounded-2xl border border-vex-border overflow-hidden bg-vex-card/30"
      >
        <div className="grid grid-cols-3 gap-px bg-vex-border">
          {/* Header */}
          <div className="bg-vex-card px-5 py-3 text-xs font-semibold text-vex-muted uppercase tracking-wider">Feature</div>
          <div className="bg-vex-card px-5 py-3 text-xs font-semibold text-vex-muted uppercase tracking-wider">Cell-based TUIs</div>
          <div className="bg-vex-card px-5 py-3 text-xs font-semibold text-vex-accent uppercase tracking-wider">Vexart</div>

          {/* Rows */}
          {rows.map((row) => (
            <>
              <div key={`${row.feature}-f`} className="bg-vex-surface px-5 py-3 text-sm font-medium text-vex-text">{row.feature}</div>
              <div key={`${row.feature}-l`} className="bg-vex-surface px-5 py-3 text-sm text-vex-muted">{row.legacy}</div>
              <div key={`${row.feature}-v`} className="bg-vex-surface px-5 py-3 text-sm text-vex-accent font-medium">{row.vexart}</div>
            </>
          ))}
        </div>
      </motion.div>
    </section>
  )
}
