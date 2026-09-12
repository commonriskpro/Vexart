import { onCleanup } from "solid-js"
import { createScrollHandle } from "@vexart/engine"
import { releaseScrollHandle } from "@vexart/engine/internal"

export function useScrollHandle(scrollId: string) {
  const handle = createScrollHandle(scrollId)
  onCleanup(() => releaseScrollHandle(scrollId))
  return handle
}
