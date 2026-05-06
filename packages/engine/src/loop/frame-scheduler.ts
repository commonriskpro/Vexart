/** @public */
export const INTERACTION_KIND = { POINTER: "pointer", SCROLL: "scroll", KEY: "key" } as const
/** @public */
export type InteractionKind = (typeof INTERACTION_KIND)[keyof typeof INTERACTION_KIND]

/** @public */
export type FrameSchedulerBoosts = {
  key: number
  scroll: number
  pointer: number
}

/** @public */
export function boostWindowFor(kind: InteractionKind, boosts: FrameSchedulerBoosts) {
  if (kind === "pointer") return boosts.pointer
  if (kind === "scroll") return boosts.scroll
  return boosts.key
}

/** @public */
export function hasRecentInteraction(now: number, interactionBoostUntilMs: number, capturedNodeId: number, pointerDown: boolean) {
  if (capturedNodeId !== 0 || pointerDown) return true
  return now < interactionBoostUntilMs
}
