import { onCleanup } from "solid-js"
import { createScrollHandle, releaseScrollHandle } from "@vexart/engine"

export function useScrollHandle(scrollId: string) {
  const handle = createScrollHandle(scrollId)
  onCleanup(() => releaseScrollHandle(scrollId))
  return handle
}
