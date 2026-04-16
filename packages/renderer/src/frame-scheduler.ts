export type InteractionKind = "pointer" | "scroll" | "key"

export type FrameSchedulerBoosts = {
  key: number
  scroll: number
  pointer: number
}

export function boostWindowFor(kind: InteractionKind, boosts: FrameSchedulerBoosts) {
  if (kind === "pointer") return boosts.pointer
  if (kind === "scroll") return boosts.scroll
  return boosts.key
}

export function hasRecentInteraction(now: number, interactionBoostUntilMs: number, capturedNodeId: number, pointerDown: boolean) {
  if (capturedNodeId !== 0 || pointerDown) return true
  return now < interactionBoostUntilMs
}
