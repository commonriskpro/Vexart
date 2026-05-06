'use client'
import { motion } from 'framer-motion'

export function CTA() {
  return (
    <section className="relative py-24 px-6">
      {/* Background glow */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[500px] h-[300px] bg-vex-accent/6 rounded-full blur-[100px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.7 }}
        className="relative max-w-2xl mx-auto text-center"
      >
        <h2 className="text-3xl sm:text-4xl font-bold text-vex-white mb-4">
          Ready to build something{' '}
          <span className="bg-gradient-to-r from-vex-accent to-vex-purple bg-clip-text text-transparent">
            beautiful
          </span>
          ?
        </h2>
        <p className="text-vex-muted text-lg mb-8">
          Get started in under 2 minutes. One install, one command, real pixels.
        </p>

        {/* Install command */}
        <div className="inline-flex items-center gap-3 px-5 py-3 rounded-xl bg-vex-surface border border-vex-border font-mono text-sm mb-8">
          <span className="text-vex-muted">$</span>
          <span className="text-vex-text">bun add vexart</span>
          <button
            onClick={() => navigator.clipboard?.writeText('bun add vexart')}
            className="ml-2 text-vex-muted hover:text-vex-accent transition-colors"
            title="Copy"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
        </div>

        <div className="flex flex-wrap gap-4 justify-center">
          <a
            href="/guides/installation/"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-vex-accent text-vex-bg font-semibold text-sm transition-all duration-200 hover:shadow-[0_0_24px_rgba(86,212,200,0.3)] hover:-translate-y-0.5"
          >
            Read the Docs
          </a>
          <a
            href="/guides/examples/"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-vex-border text-vex-text font-medium text-sm transition-all duration-200 hover:border-vex-accent/50 hover:text-vex-accent"
          >
            Browse Examples
          </a>
        </div>
      </motion.div>

      {/* Footer */}
      <div className="mt-24 text-center text-xs text-vex-muted">
        <p>Source-available. Free for personal use and revenue under $1M USD.</p>
        <p className="mt-1">
          <a href="/reference/licensing/" className="hover:text-vex-accent transition-colors">License details</a>
          {' · '}
          <a href="https://github.com/commonriskpro/Vexart" className="hover:text-vex-accent transition-colors">GitHub</a>
        </p>
      </div>
    </section>
  )
}
