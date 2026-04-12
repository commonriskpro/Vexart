/**
 * Animation primitives for TGE.
 *
 * createTransition — tween a numeric value with duration + easing
 * createSpring     — animate a numeric value with spring physics
 *
 * Both return a SolidJS-compatible accessor (readable signal).
 * Both auto-tick via the render loop and call markDirty() each frame.
 *
 * Adaptive FPS: while any animation is active, the loop should run at
 * 60fps instead of 30fps. Use `hasActiveAnimations()` to check.
 */

import { createSignal } from "solid-js"
import { markDirty } from "./dirty"

// ── Active Animation Registry ──

let activeCount = 0

/** Returns true if any animation is currently running. Used for adaptive FPS. */
export function hasActiveAnimations(): boolean {
  return activeCount > 0
}

function registerAnimation() { activeCount++ }
function unregisterAnimation() { activeCount = Math.max(0, activeCount - 1) }

// ── Easing Functions ──

export type EasingFn = (t: number) => number

export const easing = {
  linear: (t: number) => t,
  easeIn: (t: number) => t * t,
  easeOut: (t: number) => 1 - (1 - t) * (1 - t),
  easeInOut: (t: number) => t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2,
  easeInCubic: (t: number) => t * t * t,
  easeOutCubic: (t: number) => 1 - (1 - t) ** 3,
  easeInOutCubic: (t: number) => t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2,
  easeInQuart: (t: number) => t * t * t * t,
  easeOutQuart: (t: number) => 1 - (1 - t) ** 4,
  easeInOutQuart: (t: number) => t < 0.5 ? 8 * t * t * t * t : 1 - (-2 * t + 2) ** 4 / 2,
  easeOutBack: (t: number) => { const c = 1.70158 + 1; return 1 + c * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2 },
  easeOutElastic: (t: number) => {
    if (t === 0 || t === 1) return t
    return 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI / 3)) + 1
  },
  /** Custom cubic bezier: cubicBezier(x1, y1, x2, y2) → easing function */
  cubicBezier: (x1: number, y1: number, x2: number, y2: number): EasingFn => {
    // Newton's method approximation for cubic bezier
    return (t: number) => {
      let guess = t
      for (let i = 0; i < 8; i++) {
        const x = bezierPoint(guess, x1, x2) - t
        if (Math.abs(x) < 0.001) break
        const dx = bezierSlope(guess, x1, x2)
        if (Math.abs(dx) < 0.0001) break
        guess -= x / dx
      }
      return bezierPoint(guess, y1, y2)
    }
  },
} as const

function bezierPoint(t: number, p1: number, p2: number): number {
  const it = 1 - t
  return 3 * it * it * t * p1 + 3 * it * t * t * p2 + t * t * t
}

function bezierSlope(t: number, p1: number, p2: number): number {
  const it = 1 - t
  return 3 * it * it * p1 + 6 * it * t * (p2 - p1) + 3 * t * t * (1 - p2)
}

// ── createTransition ──

export type TransitionConfig = {
  duration?: number       // ms, default 300
  easing?: EasingFn       // default easeInOut
  delay?: number          // ms, default 0
}

/**
 * Animate a numeric value with tween interpolation.
 *
 * Returns [currentValue, setTarget]:
 *   - currentValue() reads the interpolated value (reactive)
 *   - setTarget(n) starts animating toward n
 *
 * ```tsx
 * const [x, setX] = createTransition(0, { duration: 300 })
 * setX(100) // animates from 0 to 100 over 300ms
 * <box width={x()} />
 * ```
 */
export function createTransition(
  initial: number,
  config?: TransitionConfig,
): [() => number, (target: number) => void] {
  const duration = config?.duration ?? 300
  const ease = config?.easing ?? easing.easeInOut
  const delay = config?.delay ?? 0

  const [value, setValue] = createSignal(initial)

  let from = initial
  let to = initial
  let startTime = 0
  let animating = false
  let timer: ReturnType<typeof setTimeout> | null = null

  function tick() {
    if (!animating) return

    const elapsed = performance.now() - startTime
    if (elapsed >= duration) {
      // Animation complete
      setValue(to)
      from = to
      animating = false
      unregisterAnimation()
      return
    }

    const t = ease(elapsed / duration)
    setValue(from + (to - from) * t)
    markDirty()

    // Schedule next tick — use setTimeout(0) to run on next event loop iteration.
    // The render loop will pick up the dirty flag and repaint.
    timer = setTimeout(tick, 0)
  }

  function setTarget(target: number) {
    if (target === to && animating) return
    if (target === value() && !animating) return

    from = value()
    to = target
    startTime = performance.now() + delay

    if (!animating) {
      animating = true
      registerAnimation()
    }
    if (timer) clearTimeout(timer)

    if (delay > 0) {
      timer = setTimeout(tick, delay)
    } else {
      tick()
    }
  }

  return [value, setTarget]
}

// ── createSpring ──

export type SpringConfig = {
  stiffness?: number      // default 170 (like react-spring "default")
  damping?: number        // default 26
  mass?: number           // default 1
  precision?: number      // velocity threshold to stop, default 0.01
}

/**
 * Animate a numeric value with spring physics.
 *
 * Returns [currentValue, setTarget]:
 *   - currentValue() reads the spring-animated value (reactive)
 *   - setTarget(n) starts spring animation toward n
 *
 * ```tsx
 * const [scale, setScale] = createSpring(1, { stiffness: 300, damping: 20 })
 * setScale(1.2) // spring toward 1.2
 * <box width={Math.round(100 * scale())} />
 * ```
 */
export function createSpring(
  initial: number,
  config?: SpringConfig,
): [() => number, (target: number) => void] {
  const stiffness = config?.stiffness ?? 170
  const damping = config?.damping ?? 26
  const mass = config?.mass ?? 1
  const precision = config?.precision ?? 0.01

  const [value, setValue] = createSignal(initial)

  let current = initial
  let target = initial
  let velocity = 0
  let animating = false
  let lastTime = 0
  let timer: ReturnType<typeof setTimeout> | null = null

  function tick() {
    if (!animating) return

    const now = performance.now()
    // Cap dt to avoid spiral of death on lag spikes
    const dt = Math.min((now - lastTime) / 1000, 0.064)
    lastTime = now

    // Spring physics: F = -k(x - target) - d*v
    const displacement = current - target
    const springForce = -stiffness * displacement
    const dampingForce = -damping * velocity
    const acceleration = (springForce + dampingForce) / mass

    velocity += acceleration * dt
    current += velocity * dt

    // Check if settled
    if (Math.abs(velocity) < precision && Math.abs(current - target) < precision) {
      current = target
      velocity = 0
      setValue(current)
      animating = false
      unregisterAnimation()
      return
    }

    setValue(current)
    markDirty()
    timer = setTimeout(tick, 0)
  }

  function setTarget(t: number) {
    if (t === target && animating) return
    target = t
    lastTime = performance.now()

    if (!animating) {
      animating = true
      registerAnimation()
      tick()
    }
  }

  return [value, setTarget]
}
