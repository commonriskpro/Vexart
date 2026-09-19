/**
 * Theme token resolver interface and global registry for @vexart/app.
 *
 * Allows styled packages (such as @vexart/styled) to inject semantic tokens,
 * typography scales, radii, shadows, and runtime theme versions into the
 * className compiler without coupling the framework directly to a specific design system.
 */

/** @public */
export interface ThemeTokenResolver {
  getColor?: (name: string) => string | number | undefined
  fontSizes?: Record<string, number>
  fontWeights?: Record<string, number>
  radii?: Record<string, number>
  shadows?: Record<string, unknown>
  glows?: Record<string, unknown>
  spacePx?: number
  getThemeVersion?: () => number
}

let currentResolver: ThemeTokenResolver | null = null

/**
 * Register the global theme token resolver for className resolution.
 * @public
 */
export function setThemeTokenResolver(resolver: ThemeTokenResolver | null): void {
  currentResolver = resolver
}

/**
 * Retrieve the currently registered theme token resolver, or null if none.
 * @public
 */
export function getThemeTokenResolver(): ThemeTokenResolver | null {
  return currentResolver
}
