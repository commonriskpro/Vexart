import { createSignal, createContext, useContext } from "solid-js"
import type { JSX } from "solid-js"

/** @public */
export type NavigationParams = Record<string, unknown>
/** @public */
export type NavigationEntry = { path: string; params?: NavigationParams }
/** @public */
export type RouteDefinition = { path: string; component: (props: RouteProps) => JSX.Element }
/** @public */
export type RouteProps = { params?: NavigationParams }

/** @public */
export type RouterContextValue = {
  current: () => string
  navigate: (path: string, params?: NavigationParams) => void
  goBack: () => boolean
  params: () => NavigationParams | undefined
  history: () => NavigationEntry[]
}

const RouterContext = createContext<RouterContextValue>()

/** @public */
export function useRouter(): RouterContextValue {
  const ctx = useContext(RouterContext)
  if (!ctx) throw new Error("useRouter() must be used within a <Router>")
  return ctx
}

/** @public */
export type RouterProps = { initial?: string; children?: JSX.Element }
/** @public */
export type FlatRouteProps = { path: string; component: (props: RouteProps) => JSX.Element }

/** @public */
export function createRouter(initialPath: string) {
  const [history, setHistory] = createSignal<NavigationEntry[]>([{ path: initialPath }])
  const current = () => history()[history().length - 1].path
  const params = () => history()[history().length - 1].params
  function navigate(path: string, navParams?: NavigationParams) { setHistory((prev) => [...prev, { path, params: navParams }]) }
  function goBack(): boolean {
    const h = history()
    if (h.length <= 1) return false
    setHistory((prev) => prev.slice(0, -1))
    return true
  }
  return { current, navigate, goBack, params, history }
}

/** @public */
export type ScreenEntry = { key: string; component: (props: ScreenProps) => JSX.Element; params?: NavigationParams }
/** @public */
export type ScreenProps = { params?: NavigationParams; goBack: () => void }
/** @public */
export type NavigationStackHandle = {
  push: (component: (props: ScreenProps) => JSX.Element, params?: NavigationParams) => void
  pop: () => boolean
  goBack: () => boolean
  replace: (component: (props: ScreenProps) => JSX.Element, params?: NavigationParams) => void
  reset: (component: (props: ScreenProps) => JSX.Element, params?: NavigationParams) => void
  depth: () => number
  current: () => ScreenEntry | undefined
  stack: () => ScreenEntry[]
}

let stackKeyCounter = 0

/** @public */
export function createNavigationStack(initialComponent?: (props: ScreenProps) => JSX.Element): NavigationStackHandle {
  const [stack, setStack] = createSignal<ScreenEntry[]>(initialComponent ? [{ key: `screen-${stackKeyCounter++}`, component: initialComponent }] : [])
  function push(component: (props: ScreenProps) => JSX.Element, params?: NavigationParams) {
    setStack((prev) => [...prev, { key: `screen-${stackKeyCounter++}`, component, params }])
  }
  function pop(): boolean {
    const s = stack()
    if (s.length <= 1) return false
    setStack((prev) => prev.slice(0, -1))
    return true
  }
  function replace(component: (props: ScreenProps) => JSX.Element, params?: NavigationParams) {
    setStack((prev) => {
      const next = prev.slice(0, -1)
      next.push({ key: `screen-${stackKeyCounter++}`, component, params })
      return next
    })
  }
  function reset(component: (props: ScreenProps) => JSX.Element, params?: NavigationParams) {
    setStack([{ key: `screen-${stackKeyCounter++}`, component, params }])
  }
  const current = () => { const s = stack(); return s.length > 0 ? s[s.length - 1] : undefined }
  const depth = () => stack().length
  return { push, pop, goBack: pop, replace, reset, depth, current, stack }
}
