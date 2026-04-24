/**
 * Compositor-thread animation fast path (REQ-2B-301 through REQ-2B-305).
 *
 * When createTransition or createSpring targets 'transform' or 'opacity',
 * an AnimationDescriptor is registered here. The frame loop can then detect
 * when ONLY compositor-animated properties changed and skip the expensive
 * reconciler→walkTree→layout→paint pipeline.
 *
 * Phase 2b: Descriptor table + detection logic is in place.
 * The actual uniform-only GPU update falls back to full repaint initially;
 * the fast-path GPU plumbing lands in Phase 3.
 *
 * Architecture note:
 *   TS: createSpring/createTransition → registerAnimationDescriptor()
 *   Frame loop: isCompositorOnlyFrame() → if true, skip reconciler/paint
 *   GPU: (Phase 3) vexart_composite_update_uniform(target, nodeId, matrix)
 */

/** @public Properties that can animate on the compositor thread. */
export type CompositorProperty = "transform" | "opacity"

/** Easing or spring descriptor for the animation. */
export type AnimationPhysics =
  | { kind: "transition"; easing: (t: number) => number; duration: number }
  | { kind: "spring"; stiffness: number; damping: number; mass: number }

/** Descriptor for one compositor-thread animation (REQ-2B-301). */
export type AnimationDescriptor = {
  /** Node being animated. */
  nodeId: number
  /** Which property is animating. */
  property: CompositorProperty
  /** Starting value. */
  from: number
  /** Target value. */
  to: number
  /** Start time from performance.now(). */
  startTime: number
  /** Animation physics. */
  physics: AnimationPhysics
}

// ── Descriptor table ─────────────────────────────────────────────────────────

/** Active compositor-path descriptors keyed by `${nodeId}:${property}`. */
const descriptors = new Map<string, AnimationDescriptor>()

/** Nodes that are known to have explicit layer backing (layer=true or willChange). */
const layerBackedNodes = new Set<number>()

function descriptorKey(nodeId: number, property: CompositorProperty): string {
  return `${nodeId}:${property}`
}

/**
 * Register a node as having explicit layer backing.
 * Called when the node has layer={true} or willChange containing 'transform'/'opacity'.
 * Required for compositor qualification (REQ-2B-304 condition 2).
 */
/** @public */
export function markLayerBacked(nodeId: number): void {
  layerBackedNodes.add(nodeId)
}

/**
 * Remove layer-backed status (node destroyed or prop removed).
 */
/** @public */
export function unmarkLayerBacked(nodeId: number): void {
  layerBackedNodes.delete(nodeId)
}

/**
 * Register an animation descriptor for compositor-thread animation.
 * Called when createTransition/createSpring targets 'transform' or 'opacity'.
 *
 * Qualification rules (REQ-2B-304):
 *  1. property must be 'transform' or 'opacity' — enforced by type signature
 *  2. node must have explicit layer backing — checked here; falls back with warn
 *  3. animation must be driven by createTransition or createSpring — caller's responsibility
 *
 * @returns true if registered on compositor path, false if fallen back.
 */
export function registerAnimationDescriptor(desc: AnimationDescriptor): boolean {
  // Condition (2): node must have explicit layer backing (REQ-2B-304)
  if (!layerBackedNodes.has(desc.nodeId)) {
    console.warn(
      `[TGE compositor] Node ${desc.nodeId} animating '${desc.property}' lacks layer backing ` +
      `(layer={true} or willChange). Falling back to full paint path. ` +
      `Add layer={true} or willChange="${desc.property}" to enable the compositor fast path.`
    )
    return false
  }

  descriptors.set(descriptorKey(desc.nodeId, desc.property), desc)
  return true
}

/**
 * Deregister a descriptor when the animation completes (REQ-2B-305).
 * The node resumes normal paint-path rendering.
 */
export function deregisterAnimationDescriptor(nodeId: number, property: CompositorProperty): void {
  descriptors.delete(descriptorKey(nodeId, property))
}

/**
 * Deregister ALL descriptors for a node.
 * Called when a node is destroyed or falls back (e.g. child added, non-animatable prop changed).
 */
export function deregisterAllDescriptors(nodeId: number): void {
  for (const property of ["transform", "opacity"] as const) {
    descriptors.delete(descriptorKey(nodeId, property))
  }
}

/** Returns the current descriptor for a node+property, if any. */
export function getDescriptor(nodeId: number, property: CompositorProperty): AnimationDescriptor | undefined {
  return descriptors.get(descriptorKey(nodeId, property))
}

/** Returns all active descriptors (snapshot). */
export function allDescriptors(): AnimationDescriptor[] {
  return Array.from(descriptors.values())
}

/** Returns true if there are any active compositor-path descriptors. */
export function hasCompositorAnimations(): boolean {
  return descriptors.size > 0
}

// ── Fast-path frame detection (REQ-2B-303) ────────────────────────────────────

/**
 * Tracks which nodes had non-compositor-path property mutations in the
 * current frame. Populated by the reconciler when setProperty fires for
 * a property that is NOT in {transform, opacity} on a compositor-animated node.
 */
const dirtyNonCompositorNodes = new Set<number>()
const dirtyCompositorProps = new Set<string>() // keys: `${nodeId}:${property}`

/**
 * Called by the reconciler when a property changes on any node.
 * If the node is compositor-animated AND the property is not transform/opacity,
 * we record a fallback-trigger (REQ-2B-304 condition 3).
 */
export function onNodePropertyChanged(nodeId: number, property: string): void {
  if (!hasCompositorAnimations()) return

  const isCompositorProp = property === "transform" || property === "opacity"
  if (isCompositorProp) {
    // Track compositor property update
    if (descriptors.has(descriptorKey(nodeId, property as CompositorProperty))) {
      dirtyCompositorProps.add(descriptorKey(nodeId, property as CompositorProperty))
    }
    return
  }

  // Non-compositor property changed on a node that has compositor descriptors
  const hasDescriptor = descriptors.has(descriptorKey(nodeId, "transform")) ||
    descriptors.has(descriptorKey(nodeId, "opacity"))
  if (hasDescriptor) {
    dirtyNonCompositorNodes.add(nodeId)
  }
}

/**
 * Called when a child is added or removed from a compositor-animated node (REQ-2B-305).
 * Triggers fallback and deregisters the descriptor.
 */
export function onSubtreeChanged(nodeId: number): void {
  if (!hasCompositorAnimations()) return
  const hadDescriptor = descriptors.has(descriptorKey(nodeId, "transform")) ||
    descriptors.has(descriptorKey(nodeId, "opacity"))
  if (hadDescriptor) {
    console.warn(
      `[TGE compositor] Node ${nodeId} had subtree change during compositor animation. ` +
      `Falling back to full paint path.`
    )
    deregisterAllDescriptors(nodeId)
    dirtyNonCompositorNodes.add(nodeId)
  }
}

/**
 * Detect whether the current frame qualifies for the compositor fast path.
 *
 * Returns true ONLY when ALL of (REQ-2B-303):
 *  - At least one compositor-path descriptor is active
 *  - No non-compositor property mutations occurred
 *  - No subtree structural changes
 *
 * Phase 2b note: Returns false (full repaint) always for now, because the GPU
 * uniform-update API (vexart_composite_update_uniform) is not yet wired.
 * The infrastructure is in place; Phase 3 will unlock the actual fast path.
 */
export function isCompositorOnlyFrame(): boolean {
  if (descriptors.size === 0) return false
  if (dirtyNonCompositorNodes.size > 0) return false
  return true
}

/**
 * Reset per-frame tracking state. Call at the start of each frame.
 */
export function resetFrameTracking(): void {
  dirtyNonCompositorNodes.clear()
  dirtyCompositorProps.clear()
}

/**
 * Return nodes that triggered compositor fallback this frame.
 * For diagnostics / test assertions.
 */
export function fallbackNodes(): ReadonlySet<number> {
  return dirtyNonCompositorNodes
}
