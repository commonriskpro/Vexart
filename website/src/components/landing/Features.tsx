'use client'
import { motion } from 'framer-motion'

const features = [
  {
    title: 'GPU Pixels, Not Characters',
    description: 'Real WGPU rendering through Metal and Vulkan. Anti-aliased corners, drop shadows, gaussian blur, gradients — all at 60fps.',
    icon: '◆',
    color: 'from-vex-accent to-teal-400',
  },
  {
    title: 'JSX + SolidJS Reactivity',
    description: 'Write components like React. Fine-grained signals update individual properties — no VDOM diffing, no re-renders.',
    icon: '⚡',
    color: 'from-vex-purple to-indigo-400',
  },
  {
    title: 'Headless + Styled Architecture',
    description: '26 behavior-first components with render props. Layer the Void theme, or build your own pixel-perfect UI.',
    icon: '◎',
    color: 'from-vex-pink to-rose-400',
  },
  {
    title: 'Native Rust Performance',
    description: 'Single libvexart binary handles paint, composite, and Kitty encoding. Zero bytes cross the FFI boundary for presentation.',
    icon: '⚙',
    color: 'from-vex-orange to-amber-400',
  },
  {
    title: 'Backdrop Blur & Glassmorphism',
    description: 'Real backdrop filters — blur, brightness, contrast, saturate, grayscale, invert, sepia, hue-rotate. CSS-parity in the terminal.',
    icon: '◇',
    color: 'from-sky-400 to-blue-500',
  },
  {
    title: 'MSDF Text Rendering',
    description: 'Multi-channel signed distance field fonts. Sharp at any size from 8px to 72px with a single texture atlas.',
    icon: 'A',
    color: 'from-emerald-400 to-green-500',
  },
]

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
}

const item = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6 } },
}

export function Features() {
  return (
    <section className="relative py-24 px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="text-center mb-16"
      >
        <h2 className="text-3xl sm:text-4xl font-bold text-vex-white">
          Everything you need to build{' '}
          <span className="text-vex-accent">beautiful</span> terminal apps
        </h2>
        <p className="mt-4 text-vex-muted text-lg max-w-2xl mx-auto">
          The visual power of the modern web, running natively in your terminal.
        </p>
      </motion.div>

      <motion.div
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '-50px' }}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-6xl mx-auto"
      >
        {features.map((feature) => (
          <motion.div
            key={feature.title}
            variants={item}
            whileHover={{ y: -4, transition: { duration: 0.2 } }}
            className="group relative p-6 rounded-2xl border border-vex-border bg-vex-card/50 backdrop-blur-sm transition-colors duration-300 hover:border-vex-accent/30 hover:bg-vex-card"
          >
            {/* Hover glow */}
            <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-vex-accent/5 to-transparent" />
            </div>

            <div className={`relative inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br ${feature.color} text-white font-bold text-lg mb-4`}>
              {feature.icon}
            </div>
            <h3 className="relative text-base font-semibold text-vex-white mb-2">
              {feature.title}
            </h3>
            <p className="relative text-sm text-vex-muted leading-relaxed">
              {feature.description}
            </p>
          </motion.div>
        ))}
      </motion.div>
    </section>
  )
}
