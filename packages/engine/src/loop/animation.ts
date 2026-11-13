import { batch, createSignal, getOwner, onCleanup } from "solid-js"
import { deregisterAnimationDescriptor, registerAnimationDescriptor, type CompositorProperty } from "../animation/compositor-path"
import { markDirty } from "../reconciler/dirty"

type AnimationDriver = (now: number) => boolean // returns true if continues, false if finished
const activeDrivers = new Set<AnimationDriver>()

let activeCount = 0
let loopDriving = false
let fallbackTimer: ReturnType<typeof setTimeout> | null = null

/** @public */
export function hasActiveAnimations(): boolean {
  return activeDrivers.size > 0 || activeCount > 0
}

/** @public */
export function resetActiveAnimations(): void {
  activeDrivers.clear()
  if (fallbackTimer !== null) {
    clearTimeout(fallbackTimer)
    fallbackTimer = null
  }
  activeCount = 0
}

function registerAnimation() { activeCount++ }
function unregisterAnimation() { activeCount = Math.max(0, activeCount - 1) }

export function stepActiveAnimations(now: number = performance.now()): boolean {
  if (activeDrivers.size === 0) return false
  batch(() => {
    for (const driver of Array.from(activeDrivers)) {
      const stillActive = driver(now)
      if (!stillActive) {
        activeDrivers.delete(driver)
      }
    }
  })
  if (activeDrivers.size === 0 && fallbackTimer !== null) {
    clearTimeout(fallbackTimer)
    fallbackTimer = null
  }
  return activeDrivers.size > 0
}

export function setLoopAnimationDriver(active: boolean): void {
  loopDriving = active
  if (active && fallbackTimer) {
    clearTimeout(fallbackTimer)
    fallbackTimer = null
  }
}

function ensureAnimationStepScheduled() {
  if (loopDriving) return
  if (fallbackTimer === null && activeDrivers.size > 0) {
    fallbackTimer = setTimeout(() => {
      fallbackTimer = null
      const hasMore = stepActiveAnimations(performance.now())
      if (hasMore && !loopDriving) {
        ensureAnimationStepScheduled()
      }
    }, 16)
  }
}

/** @public */
export type EasingFn = (t: number) => number

/** @public */
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
  cubicBezier: (x1: number, y1: number, x2: number, y2: number): EasingFn => {
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

/** @public */
export type TransitionConfig = {
  duration?: number
  easing?: EasingFn
  delay?: number
  compositor?: {
    nodeId: number
    property: CompositorProperty
  }
}

/** @public */
export type AnimationAccessor = (() => number) & {
  stop: () => void
  cancel: () => void
}

/** @public */
export type AnimationSignal = [
  AnimationAccessor,
  (target: number) => void,
  () => void
] & {
  stop: () => void
  cancel: () => void
}

/** @public */
export function createTransition(initial: number, config?: TransitionConfig): AnimationSignal {
  const duration = config?.duration ?? 300
  const ease = config?.easing ?? easing.easeInOut
  const delay = config?.delay ?? 0
  const [value, setValue] = createSignal(initial)
  let from = initial
  let to = initial
  let startTime = 0
  let animating = false

  function syncDescriptor() {
    const compositor = config?.compositor
    if (!compositor || !animating) return
    registerAnimationDescriptor({
      nodeId: compositor.nodeId,
      property: compositor.property,
      from,
      to,
      startTime,
      physics: { kind: "transition", easing: ease, duration },
    })
  }

  function stop() {
    if (animating) {
      animating = false
      activeDrivers.delete(driver)
      if (activeDrivers.size === 0 && fallbackTimer !== null) {
        clearTimeout(fallbackTimer)
        fallbackTimer = null
      }
      const compositor = config?.compositor
      if (compositor) deregisterAnimationDescriptor(compositor.nodeId, compositor.property)
      unregisterAnimation()
    }
  }

  if (getOwner()) {
    onCleanup(stop)
  }

  const driver: AnimationDriver = (now: number): boolean => {
    if (!animating) return false
    if (now < startTime) return true
    const elapsed = now - startTime
    if (elapsed >= duration) {
      setValue(to)
      from = to
      animating = false
      const compositor = config?.compositor
      if (compositor) deregisterAnimationDescriptor(compositor.nodeId, compositor.property)
      unregisterAnimation()
      return false
    }
    const t = ease(elapsed / duration)
    setValue(from + (to - from) * t)
    markDirty()
    return true
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
      activeDrivers.add(driver)
    }
    syncDescriptor()
    markDirty()
    ensureAnimationStepScheduled()
  }

  const accessor = Object.assign(value, { stop, cancel: stop })
  const result = [accessor, setTarget, stop] as unknown as AnimationSignal
  result.stop = stop
  result.cancel = stop
  return result
}

/** @public */
export type SpringConfig = {
  stiffness?: number
  damping?: number
  mass?: number
  precision?: number
  compositor?: {
    nodeId: number
    property: CompositorProperty
  }
}

/** @public */
export function createSpring(initial: number, config?: SpringConfig): AnimationSignal {
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

  function syncDescriptor() {
    const compositor = config?.compositor
    if (!compositor || !animating) return
    registerAnimationDescriptor({
      nodeId: compositor.nodeId,
      property: compositor.property,
      from: current,
      to: target,
      startTime: lastTime,
      physics: { kind: "spring", stiffness, damping, mass },
    })
  }

  function stop() {
    if (animating) {
      animating = false
      activeDrivers.delete(driver)
      if (activeDrivers.size === 0 && fallbackTimer !== null) {
        clearTimeout(fallbackTimer)
        fallbackTimer = null
      }
      const compositor = config?.compositor
      if (compositor) deregisterAnimationDescriptor(compositor.nodeId, compositor.property)
      unregisterAnimation()
    }
  }

  if (getOwner()) {
    onCleanup(stop)
  }

  const driver: AnimationDriver = (now: number): boolean => {
    if (!animating) return false
    const dt = Math.min((now - lastTime) / 1000, 0.064)
    lastTime = now
    const displacement = current - target
    const springForce = -stiffness * displacement
    const dampingForce = -damping * velocity
    const acceleration = (springForce + dampingForce) / mass
    velocity += acceleration * dt
    current += velocity * dt
    if (Math.abs(velocity) < precision && Math.abs(current - target) < precision) {
      current = target
      velocity = 0
      setValue(current)
      animating = false
      const compositor = config?.compositor
      if (compositor) deregisterAnimationDescriptor(compositor.nodeId, compositor.property)
      unregisterAnimation()
      return false
    }
    setValue(current)
    markDirty()
    return true
  }

  function setTarget(t: number) {
    if (t === target && animating) return
    target = t
    lastTime = performance.now()
    if (!animating) {
      animating = true
      registerAnimation()
      activeDrivers.add(driver)
    }
    syncDescriptor()
    markDirty()
    ensureAnimationStepScheduled()
  }

  const accessor = Object.assign(value, { stop, cancel: stop })
  const result = [accessor, setTarget, stop] as unknown as AnimationSignal
  result.stop = stop
  result.cancel = stop
  return result
}
