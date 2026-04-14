/**
 * Particle system for canvas-based effects.
 *
 * Designed for ambient backgrounds (stars, dust, fireflies, nebula particles).
 * NOT a physics engine — just simple position + velocity + lifetime with drift.
 *
 * Usage:
 *   const stars = createParticleSystem({ count: 200, ... })
 *
 *   <canvas onDraw={(ctx) => stars.draw(ctx)} />
 *
 *   // In a setInterval or animation loop:
 *   stars.tick(dt)
 *
 * Architecture:
 *   - Particles stored as flat typed arrays (SoA) for cache efficiency
 *   - tick() advances simulation: position += velocity, handles respawn
 *   - draw() emits circle/glow commands to CanvasContext (no allocations)
 *   - Respawn reuses dead particles in-place (no GC pressure)
 */

import type { CanvasContext } from "./canvas"

// ── Configuration ──

export type ParticleConfig = {
  /** Number of particles. */
  count: number
  /** World-space bounds for spawning. */
  bounds: { x: number; y: number; w: number; h: number }
  /** Min/max radius in pixels. */
  radius?: { min: number; max: number }
  /** Min/max velocity (pixels per second). */
  speed?: { min: number; max: number }
  /** Base color (packed RGBA u32). Alpha varies per particle. */
  color?: number
  /** Min/max alpha (0-255). */
  alpha?: { min: number; max: number }
  /** Min/max lifetime in seconds (0 = immortal). */
  lifetime?: { min: number; max: number }
  /** Enable glow effect on particles. */
  glow?: boolean
  /** Glow radius multiplier (default 3). */
  glowRadius?: number
  /** Glow intensity (0-100, default 40). */
  glowIntensity?: number
  /** Enable twinkle (alpha oscillation). */
  twinkle?: boolean
  /** Twinkle speed multiplier (default 1). */
  twinkleSpeed?: number
  /** Drift direction bias { dx, dy } in pixels/sec. */
  drift?: { dx: number; dy: number }
}

// ── Particle System ──

export type ParticleSystem = {
  /** Advance simulation by dt seconds. */
  tick: (dt: number) => void
  /** Draw particles to a CanvasContext. */
  draw: (ctx: CanvasContext) => void
  /** Reset all particles (re-randomize). */
  reset: () => void
  /** Current particle count. */
  count: number
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

export function createParticleSystem(config: ParticleConfig): ParticleSystem {
  const n = config.count
  const bounds = config.bounds
  const rMin = config.radius?.min ?? 1
  const rMax = config.radius?.max ?? 3
  const sMin = config.speed?.min ?? 0
  const sMax = config.speed?.max ?? 10
  const baseColor = config.color ?? 0xffffffff
  const aMin = config.alpha?.min ?? 40
  const aMax = config.alpha?.max ?? 200
  const ltMin = config.lifetime?.min ?? 0
  const ltMax = config.lifetime?.max ?? 0
  const immortal = ltMin === 0 && ltMax === 0
  const useGlow = config.glow ?? false
  const glowR = config.glowRadius ?? 3
  const glowI = config.glowIntensity ?? 40
  const useTwinkle = config.twinkle ?? false
  const twinkleSpd = config.twinkleSpeed ?? 1
  const driftDx = config.drift?.dx ?? 0
  const driftDy = config.drift?.dy ?? 0

  // Extract base RGB (strip alpha, we vary alpha per particle)
  const baseR = (baseColor >>> 24) & 0xff
  const baseG = (baseColor >>> 16) & 0xff
  const baseB = (baseColor >>> 8) & 0xff

  // SoA layout — flat arrays for cache efficiency
  const x = new Float32Array(n)
  const y = new Float32Array(n)
  const vx = new Float32Array(n)
  const vy = new Float32Array(n)
  const radius = new Float32Array(n)
  const alpha = new Uint8Array(n)
  const baseAlpha = new Uint8Array(n) // original alpha (for twinkle)
  const age = new Float32Array(n)     // seconds alive
  const lifetime = new Float32Array(n) // max lifetime (0 = immortal)
  const phase = new Float32Array(n)   // twinkle phase offset

  function spawn(i: number) {
    x[i] = rand(bounds.x, bounds.x + bounds.w)
    y[i] = rand(bounds.y, bounds.y + bounds.h)
    const angle = Math.random() * Math.PI * 2
    const speed = rand(sMin, sMax)
    vx[i] = Math.cos(angle) * speed + driftDx
    vy[i] = Math.sin(angle) * speed + driftDy
    radius[i] = rand(rMin, rMax)
    const a = Math.round(rand(aMin, aMax))
    alpha[i] = a
    baseAlpha[i] = a
    age[i] = 0
    lifetime[i] = immortal ? 0 : rand(ltMin, ltMax)
    phase[i] = Math.random() * Math.PI * 2
  }

  // Initialize all particles
  for (let i = 0; i < n; i++) spawn(i)

  function tick(dt: number) {
    for (let i = 0; i < n; i++) {
      x[i] += vx[i] * dt
      y[i] += vy[i] * dt
      age[i] += dt

      // Wrap around bounds
      if (x[i] < bounds.x) x[i] += bounds.w
      else if (x[i] > bounds.x + bounds.w) x[i] -= bounds.w
      if (y[i] < bounds.y) y[i] += bounds.h
      else if (y[i] > bounds.y + bounds.h) y[i] -= bounds.h

      // Lifetime respawn
      if (!immortal && lifetime[i] > 0 && age[i] >= lifetime[i]) {
        spawn(i)
      }

      // Twinkle — sinusoidal alpha oscillation
      if (useTwinkle) {
        const t = age[i] * twinkleSpd * 2 + phase[i]
        const osc = (Math.sin(t) + 1) * 0.5 // 0..1
        alpha[i] = Math.round(baseAlpha[i] * (0.3 + 0.7 * osc))
      }

      // Fade out near end of lifetime
      if (!immortal && lifetime[i] > 0) {
        const remaining = lifetime[i] - age[i]
        const fadeWindow = lifetime[i] * 0.3
        if (remaining < fadeWindow && remaining > 0) {
          const fade = remaining / fadeWindow
          alpha[i] = Math.round(alpha[i] * fade)
        }
      }
    }
  }

  function draw(ctx: CanvasContext) {
    for (let i = 0; i < n; i++) {
      const a = alpha[i]
      if (a === 0) continue
      const r = radius[i]
      const color = ((baseR << 24) | (baseG << 16) | (baseB << 8) | a) >>> 0

      // Glow first (behind particle)
      if (useGlow && a > 30) {
        const glowColor = ((baseR << 24) | (baseG << 16) | (baseB << 8) | Math.round(a * 0.4)) >>> 0
        ctx.glow(x[i], y[i], r * glowR, r * glowR, glowColor, glowI)
      }

      // Particle dot
      ctx.circle(x[i], y[i], r, { fill: color })
    }
  }

  function reset() {
    for (let i = 0; i < n; i++) spawn(i)
  }

  return { tick, draw, reset, count: n }
}
