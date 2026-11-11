import { getClassNameResolver } from "@vexart/engine/internal"
import type { TGEProps } from "@vexart/engine"

/**
 * Internal helper to resolve className overrides for VoidInput and VoidTextarea
 * which delegate to headless primitives via a theme object.
 *
 * @internal
 */
export function resolveClassOverrides(className?: string): Partial<TGEProps> {
  if (!className || typeof className !== "string") return {}
  const resolver = getClassNameResolver()
  if (!resolver) return {}
  return resolver(className) ?? {}
}
