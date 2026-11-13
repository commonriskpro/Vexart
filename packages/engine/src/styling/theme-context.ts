/**
 * Styling and theme epoch context.
 *
 * Provides mutable global state for class name resolution and theme invalidation epoch.
 */

import type { TGEProps } from "../ffi/node-types"

/** @public */
export type ClassNameResolver = (className: string) => Partial<TGEProps>

let globalClassNameResolver: ClassNameResolver | null = null

export function setClassNameResolver(resolver: ClassNameResolver | null): void {
  globalClassNameResolver = resolver
}

export function getClassNameResolver(): ClassNameResolver | null {
  return globalClassNameResolver
}

let currentThemeEpoch = 0

export function bumpThemeEpoch(): void {
  currentThemeEpoch++
}

export function getThemeEpoch(): number {
  return currentThemeEpoch
}
