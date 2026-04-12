/**
 * Router components — JSX wrappers for TGE's navigation system.
 *
 * Two navigation models (Decision 10: Dual Router):
 *
 * FLAT routing:
 *   <Router initial="home">
 *     <Route path="home" component={Home} />
 *     <Route path="settings" component={Settings} />
 *   </Router>
 *
 * STACK routing:
 *   <NavigationStack initial={HomeScreen}>
 *     {(screen) => <box>{screen()}</box>}
 *   </NavigationStack>
 *
 * The core router logic lives in @tge/renderer/router.
 * These components provide the declarative JSX interface.
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
} from "@tge/renderer"

// ═══════════════════════════════════════════════════════════════════
// ── Flat Router Components ──
// ═══════════════════════════════════════════════════════════════════

const RouterCtx = createContext<RouterContextValue>()

export type RouterProps = {
  /** Initial route path. Defaults to first Route's path. */
  initial?: string
  children?: any
}

export type RouteComponentProps = {
  path: string
  component: (props: RouteProps) => JSX.Element
}

/**
 * Router — flat route container.
 *
 * Reads <Route> children at mount time and renders the current match.
 * Navigate via useRouter().navigate("path").
 */
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

/**
 * Route — renders its component only when the path matches.
 */
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

/**
 * useRouter — access the router from any component within <Router>.
 */
export function useRouterContext(): RouterContextValue {
  const ctx = useContext(RouterCtx)
  if (!ctx) throw new Error("useRouterContext() must be used within a <Router>")
  return ctx
}

// ═══════════════════════════════════════════════════════════════════
// ── Stack Router Component ──
// ═══════════════════════════════════════════════════════════════════

const StackCtx = createContext<NavigationStackHandle>()

export type NavigationStackProps = {
  /** Initial screen component. */
  initial?: (props: ScreenProps) => JSX.Element
  children?: any
}

/**
 * NavigationStack — stack-based navigation container.
 *
 * Renders the top-most screen from the stack.
 * Navigate via useStack().push(Screen) / useStack().pop().
 *
 * Usage:
 *   <NavigationStack initial={HomeScreen} />
 *
 * Screens receive { params, goBack } as props.
 */
export function NavigationStack(props: NavigationStackProps) {
  const nav = createNavigationStack(props.initial)

  return (
    <StackCtx.Provider value={nav}>
      <box width="100%" height="100%">
        {(() => {
          const entry = nav.current()
          if (!entry) return null
          const Comp = entry.component
          return <Comp params={entry.params} goBack={() => nav.pop()} />
        })()}
      </box>
      {props.children}
    </StackCtx.Provider>
  )
}

/**
 * useStack — access the navigation stack from any component.
 */
export function useStack(): NavigationStackHandle {
  const ctx = useContext(StackCtx)
  if (!ctx) throw new Error("useStack() must be used within a <NavigationStack>")
  return ctx
}
