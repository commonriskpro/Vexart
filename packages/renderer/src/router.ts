/**
 * Router — navigation system for TGE (Decision 10: Dual Router).
 *
 * Provides TWO navigation models sharing the same engine:
 *
 * 1. FLAT routing (React Router style) — for dashboards, settings:
 *      <Router>
 *        <Route path="home" component={Home} />
 *        <Route path="settings" component={Settings} />
 *      </Router>
 *      navigate("settings")
 *
 * 2. STACK routing (React Navigation style) — for wizards, drill-down:
 *      const stack = createNavigationStack()
 *      stack.push(SettingsScreen)
 *      stack.pop()
 *
 * Terminal apps are NOT URL-based. Instead, routes are string keys
 * and the history is an in-memory stack. No hash, no pathname.
 *
 * Both share: history tracking, focus save/restore (planned).
 */

import { createSignal, createContext, useContext } from "solid-js"
import type { JSX } from "solid-js"

// ══════════════════════════════════════════════════════════════════
// ── Shared engine ──
// ════════════════════════════════���═════════════════════════════════

export type NavigationEntry = {
  /** Route key (flat) or component ref (stack). */
  path: string
  /** Optional params passed during navigation. */
  params?: Record<string, any>
}

// ═════════════════════════════════════════��════════════════════════
// ── Flat Router ──
// ═���═══════════════════════���════════════════════════════════════════

export type RouteDefinition = {
  path: string
  component: (props: RouteProps) => JSX.Element
}

export type RouteProps = {
  params?: Record<string, any>
}

export type RouterContextValue = {
  /** Current route path. */
  current: () => string
  /** Navigate to a path. */
  navigate: (path: string, params?: Record<string, any>) => void
  /** Go back to previous route. Returns false if no history. */
  goBack: () => boolean
  /** Current route params. */
  params: () => Record<string, any> | undefined
  /** History stack (newest last). */
  history: () => NavigationEntry[]
}

const RouterContext = createContext<RouterContextValue>()

/**
 * useRouter — access the flat router from any component.
 * Must be used within a <Router> tree.
 */
export function useRouter(): RouterContextValue {
  const ctx = useContext(RouterContext)
  if (!ctx) throw new Error("useRouter() must be used within a <Router>")
  return ctx
}

export type RouterProps = {
  /** Initial route path. Defaults to the first <Route> path. */
  initial?: string
  children?: JSX.Element
}

export type FlatRouteProps = {
  path: string
  component: (props: RouteProps) => JSX.Element
}

/**
 * createRouter — creates a standalone router instance.
 *
 * Use this when you want router state without JSX:
 *   const router = createRouter("home")
 *   router.navigate("settings")
 *   router.current() // "settings"
 */
export function createRouter(initialPath: string) {
  const [history, setHistory] = createSignal<NavigationEntry[]>([
    { path: initialPath },
  ])

  const current = () => {
    const h = history()
    return h[h.length - 1].path
  }

  const params = () => {
    const h = history()
    return h[h.length - 1].params
  }

  function navigate(path: string, navParams?: Record<string, any>) {
    setHistory((prev) => [...prev, { path, params: navParams }])
  }

  function goBack(): boolean {
    const h = history()
    if (h.length <= 1) return false
    setHistory((prev) => prev.slice(0, -1))
    return true
  }

  return { current, navigate, goBack, params, history }
}

// ════════════���═════════════════════════════════���═══════════════════
// ── Stack Router ──
// ════════════════════════════════════════════════════════���═════════

export type ScreenEntry = {
  /** Unique key for this screen instance. */
  key: string
  /** The component to render. */
  component: (props: ScreenProps) => JSX.Element
  /** Params passed when pushed. */
  params?: Record<string, any>
}

export type ScreenProps = {
  params?: Record<string, any>
  /** Pop this screen off the stack. */
  goBack: () => void
}

export type NavigationStackHandle = {
  /** Push a new screen onto the stack. */
  push: (component: (props: ScreenProps) => JSX.Element, params?: Record<string, any>) => void
  /** Pop the top screen. Returns false if at root. */
  pop: () => boolean
  /** Alias for pop(). */
  goBack: () => boolean
  /** Replace the top screen. */
  replace: (component: (props: ScreenProps) => JSX.Element, params?: Record<string, any>) => void
  /** Reset to a single screen. */
  reset: (component: (props: ScreenProps) => JSX.Element, params?: Record<string, any>) => void
  /** Current stack depth. */
  depth: () => number
  /** Current top screen. */
  current: () => ScreenEntry | undefined
  /** Full stack (for advanced rendering — e.g., transitions). */
  stack: () => ScreenEntry[]
}

let stackKeyCounter = 0

/**
 * createNavigationStack — stack-based navigation for multi-screen flows.
 *
 * Usage:
 *   const nav = createNavigationStack(HomeScreen)
 *   nav.push(SettingsScreen, { tab: "general" })
 *   nav.goBack()
 */
export function createNavigationStack(
  initialComponent?: (props: ScreenProps) => JSX.Element,
): NavigationStackHandle {
  const [stack, setStack] = createSignal<ScreenEntry[]>(
    initialComponent
      ? [{ key: `screen-${stackKeyCounter++}`, component: initialComponent }]
      : [],
  )

  function push(
    component: (props: ScreenProps) => JSX.Element,
    params?: Record<string, any>,
  ) {
    setStack((prev) => [
      ...prev,
      { key: `screen-${stackKeyCounter++}`, component, params },
    ])
  }

  function pop(): boolean {
    const s = stack()
    if (s.length <= 1) return false
    setStack((prev) => prev.slice(0, -1))
    return true
  }

  function replace(
    component: (props: ScreenProps) => JSX.Element,
    params?: Record<string, any>,
  ) {
    setStack((prev) => {
      const next = prev.slice(0, -1)
      next.push({ key: `screen-${stackKeyCounter++}`, component, params })
      return next
    })
  }

  function reset(
    component: (props: ScreenProps) => JSX.Element,
    params?: Record<string, any>,
  ) {
    setStack([{ key: `screen-${stackKeyCounter++}`, component, params }])
  }

  const current = () => {
    const s = stack()
    return s.length > 0 ? s[s.length - 1] : undefined
  }

  const depth = () => stack().length

  return {
    push,
    pop,
    goBack: pop,
    replace,
    reset,
    depth,
    current,
    stack,
  }
}
