/**
 * Router components — JSX wrappers for Vexart navigation.
 *
 * Supports both flat route maps and stack navigation.
 *
 * @public
 */

import { createContext, useContext } from "solid-js"
import type { JSX } from "solid-js"
import {
  createRouter,
  createNavigationStack,
  type RouterContextValue,
  type RouteProps,
  type ScreenProps,
  type NavigationStackHandle,
} from "@vexart/engine"

// ═══════════════════════════════════════════════════════════════════
// ── Flat Router Components ──
// ═══════════════════════════════════════════════════════════════════

const RouterCtx = createContext<RouterContextValue>()

/** @public */
export type RouterProps = {
  /** Initial route path. Defaults to first Route's path. */
  initial?: string
  children?: any
}

/** @public */
export type RouteComponentProps = {
  path: string
  component: (props: RouteProps) => JSX.Element
}

/** @public */
export function Router(props: RouterProps) {
  // Extract route definitions from children
  // Children are <Route> elements — they register themselves via context
  const routes: RouteComponentProps[] = []

  // Parse children to collect route defs
  function collectRoutes(children: any) {
    if (!children) return
    if (Array.isArray(children)) {
      children.forEach(collectRoutes)
      return
    }
    // Route components pass their definition via a special prop
    if (children && typeof children === "object" && children.__routeDef) {
      routes.push(children.__routeDef)
    }
  }

  // We'll use a different approach — Route components render themselves
  // only when they match the current path. The Router provides context.

  const initial = props.initial ?? "home"
  const router = createRouter(initial)

  const ctx: RouterContextValue = {
    current: router.current,
    navigate: router.navigate,
    goBack: router.goBack,
    params: router.params,
    history: router.history,
  }

  return (
    <RouterCtx.Provider value={ctx}>
      {props.children}
    </RouterCtx.Provider>
  )
}

/** @public */
export function Route(props: RouteComponentProps) {
  const ctx = useContext(RouterCtx)
  if (!ctx) throw new Error("<Route> must be used within a <Router>")

  return (
    <>
      {ctx.current() === props.path ? (
        <props.component params={ctx.params()} />
      ) : null}
    </>
  )
}

/** @public */
export function useRouterContext(): RouterContextValue {
  const ctx = useContext(RouterCtx)
  if (!ctx) throw new Error("useRouterContext() must be used within a <Router>")
  return ctx
}

// ═══════════════════════════════════════════════════════════════════
// ── Stack Router Component ──
// ═══════════════════════════════════════════════════════════════════

const StackCtx = createContext<NavigationStackHandle>()

/** @public */
export type NavigationStackProps = {
  /** Initial screen component. */
  initial?: (props: ScreenProps) => JSX.Element
  children?: any
}

/** @public */
export function NavigationStack(props: NavigationStackProps) {
  const nav = createNavigationStack(props.initial)

  return (
    <StackCtx.Provider value={nav}>
      <box width="100%" height="100%">
        {() => {
          const entry = nav.current()
          if (!entry) return null
          const Comp = entry.component
          return <Comp params={entry.params} goBack={() => nav.pop()} />
        }}
      </box>
      {props.children}
    </StackCtx.Provider>
  )
}

/** @public */
export function useStack(): NavigationStackHandle {
  const ctx = useContext(StackCtx)
  if (!ctx) throw new Error("useStack() must be used within a <NavigationStack>")
  return ctx
}
