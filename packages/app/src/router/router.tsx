import { createContext, createComponent, createRoot, createSignal, onCleanup, useContext } from "solid-js"
import type { JSX } from "solid-js"
import { setFocus } from "@vexart/engine"

/** @public */
export const ROUTE_FOCUS_ID = "vexart-route-root"

/** @public */
export type RouteParams = Record<string, string>

/** @public */
export type NavigationOptions = {
  replace?: boolean
  focusId?: string | null
}

/** @public */
export type RouteComponent = (props: { params: RouteParams }) => JSX.Element

/** @public */
export type RouteLayoutComponent = (props: { children: JSX.Element; params: RouteParams }) => JSX.Element

/** @public */
export type RouteErrorComponent = (props: { error: unknown; params: RouteParams }) => JSX.Element

/** @public */
export type AppRouteDefinition = {
  path: string
  component: RouteComponent
  layouts?: RouteLayoutComponent[]
  loading?: RouteComponent
  error?: RouteErrorComponent
  notFound?: RouteComponent
  focusId?: string | null
  keepAlive?: boolean
}

/** @public */
export type AppRouteMatch = {
  route: AppRouteDefinition
  params: RouteParams
}

/** @public */
export type AppRouterState = {
  path: string
  params: RouteParams
}

type InternalRouterState = AppRouterState & {
  focusId?: string | null
}

/** @public */
export type AppRouterFocusRestorer = (focusId: string, state: AppRouterState) => void

/** @public */
export type CreateAppRouterOptions = {
  defaultFocusId?: string | null
  restoreFocus?: boolean
  onFocus?: AppRouterFocusRestorer
}

/** @public */
export type AppRouter = {
  current: () => AppRouterState
  history: () => AppRouterState[]
  match: () => AppRouteMatch | null
  push: (path: string, options?: NavigationOptions) => void
  replace: (path: string, options?: NavigationOptions) => void
  navigate: (path: string, options?: NavigationOptions) => void
  back: () => boolean
  forward: () => boolean
}

/** @public */
export type AppRouterContextValue = AppRouter

/** @public */
export type AppRouterProviderProps = {
  router: AppRouter
  children?: JSX.Element
}

/** @public */
export type RouteOutletProps = {
  router?: AppRouter
  notFound?: RouteComponent
}

const RouterContext = createContext<AppRouterContextValue>()

function publicState(state: InternalRouterState): AppRouterState {
  return { path: state.path, params: state.params }
}

function splitPath(path: string) {
  return normalizePath(path).split("/").filter(Boolean)
}

function routeScore(route: AppRouteDefinition) {
  return splitPath(route.path).reduce((score, part) => {
    if (part.startsWith("[...") && part.endsWith("]")) return score
    return score + (part.startsWith("[") && part.endsWith("]") ? 1 : 4)
  }, 0)
}

/** @public */
export function normalizePath(path: string) {
  const [pathname] = path.split("?")
  const normalized = `/${pathname.split("/").filter(Boolean).join("/")}`
  return normalized === "//" ? "/" : normalized
}

/** @public */
export function matchRoute(routes: AppRouteDefinition[], path: string): AppRouteMatch | null {
  const targetParts = splitPath(path)
  const ordered = routes.slice().sort((a, b) => routeScore(b) - routeScore(a))
  for (const route of ordered) {
    const routeParts = splitPath(route.path)
    const hasCatchAll = routeParts.some((part) => part.startsWith("[...") && part.endsWith("]"))
    if (!hasCatchAll && routeParts.length !== targetParts.length) continue
    const params: RouteParams = {}
    let matched = true
    for (let index = 0; index < routeParts.length; index++) {
      const routePart = routeParts[index]
      const targetPart = targetParts[index]
      if (routePart.startsWith("[...") && routePart.endsWith("]")) {
        params[routePart.slice(4, -1)] = targetParts.slice(index).map(decodeURIComponent).join("/")
        break
      }
      if (routePart.startsWith("[") && routePart.endsWith("]")) {
        if (targetPart === undefined) { matched = false; break }
        params[routePart.slice(1, -1)] = decodeURIComponent(targetPart)
        continue
      }
      if (routePart !== targetPart) {
        matched = false
        break
      }
    }
    if (matched) return { route, params }
  }
  return null
}

/** @public */
export function createAppRouter(routes: AppRouteDefinition[], initialPath = "/", options: CreateAppRouterOptions = {}): AppRouter {
  const initialMatch = matchRoute(routes, initialPath)
  const initial = {
    path: normalizePath(initialPath),
    params: initialMatch?.params ?? {},
    focusId: initialMatch?.route.focusId ?? options.defaultFocusId ?? ROUTE_FOCUS_ID,
  }
  const [history, setHistory] = createSignal<InternalRouterState[]>([initial])
  const [cursor, setCursor] = createSignal(0)
  const entry = () => history()[cursor()] ?? initial
  const current = () => publicState(entry())
  const match = () => matchRoute(routes, entry().path)

  function restoreFocus(state: InternalRouterState) {
    if (options.restoreFocus === false) return
    const focusId = state.focusId ?? options.defaultFocusId ?? ROUTE_FOCUS_ID
    if (!focusId) return
    queueMicrotask(() => {
      if (options.onFocus) {
        options.onFocus(focusId, publicState(state))
        return
      }
      setFocus(focusId)
    })
  }

  function navigate(path: string, options: NavigationOptions = {}) {
    const nextPath = normalizePath(path)
    const matched = matchRoute(routes, nextPath)
    const next = {
      path: nextPath,
      params: matched?.params ?? {},
      focusId: options.focusId ?? matched?.route.focusId ?? undefined,
    }
    if (options.replace) {
      setHistory((prev) => prev.map((entry, index) => index === cursor() ? next : entry))
      restoreFocus(next)
      return
    }
    setHistory((prev) => [...prev.slice(0, cursor() + 1), next])
    setCursor((value) => value + 1)
    restoreFocus(next)
  }

  function back() {
    if (cursor() <= 0) return false
    const nextCursor = cursor() - 1
    setCursor(nextCursor)
    const next = history()[nextCursor]
    if (next) restoreFocus(next)
    return true
  }

  function forward() {
    if (cursor() >= history().length - 1) return false
    const nextCursor = cursor() + 1
    setCursor(nextCursor)
    const next = history()[nextCursor]
    if (next) restoreFocus(next)
    return true
  }

  return {
    current,
    history: () => history().map(publicState),
    match,
    push: (path, options) => navigate(path, options),
    replace: (path, options) => navigate(path, { ...options, replace: true }),
    navigate,
    back,
    forward,
  }
}

/** @public */
export function RouterProvider(props: AppRouterProviderProps) {
  return <RouterContext.Provider value={props.router}>{props.children}</RouterContext.Provider>
}

/** @public */
export function useRouter() {
  const router = useContext(RouterContext)
  if (!router) throw new Error("useRouter() must be used within <RouterProvider>")
  return router
}

/** @public */
export function RouteOutlet(props: RouteOutletProps): () => JSX.Element {
  const contextRouter = props.router ?? useRouter()

  const keepAliveCache = new Map<
    string,
    {
      key: string
      element: JSX.Element
      setParams: (p: RouteParams) => void
      dispose: () => void
      lastAccessed: number
    }
  >()

  let activeRoot: {
    key: string
    element: JSX.Element
    setParams: (p: RouteParams) => void
    dispose: () => void
    isKeepAlive: boolean
  } | null = null

  let lastTime = 0
  function nextTimestamp() {
    const now = Date.now()
    lastTime = now > lastTime ? now : lastTime + 1
    return lastTime
  }

  function deactivateActiveRoot() {
    if (!activeRoot) return
    if (activeRoot.isKeepAlive) {
      keepAliveCache.set(activeRoot.key, {
        key: activeRoot.key,
        element: activeRoot.element,
        setParams: activeRoot.setParams,
        dispose: activeRoot.dispose,
        lastAccessed: nextTimestamp(),
      })
      while (keepAliveCache.size > 3) {
        const oldest = [...keepAliveCache.values()].sort((a, b) => a.lastAccessed - b.lastAccessed)[0]
        if (oldest) {
          oldest.dispose()
          keepAliveCache.delete(oldest.key)
        } else {
          break
        }
      }
    } else {
      activeRoot.dispose()
    }
    activeRoot = null
  }

  onCleanup(() => {
    if (activeRoot) {
      activeRoot.dispose()
      activeRoot = null
    }
    for (const entry of keepAliveCache.values()) {
      entry.dispose()
    }
    keepAliveCache.clear()
  })

  // match() is a derived signal — reading it inside this returned function
  // makes SolidJS track it reactively. When router.push() updates the
  // underlying history/cursor signals, this re-evaluates automatically.
  return () => {
    const match = contextRouter.match()
    if (!match) {
      deactivateActiveRoot()
      const NotFound = props.notFound
      return NotFound ? createComponent(NotFound, { params: {} }) : null
    }

    const routeKey = match.route.path
    if (activeRoot && activeRoot.key === routeKey) {
      // Same route, dynamic parameters changed (e.g. /item/1 -> /item/2)
      activeRoot.setParams(match.params)
      return activeRoot.element
    }

    // Different route:
    deactivateActiveRoot()

    // Check if new route is in keepAliveCache:
    const cached = keepAliveCache.get(routeKey)
    if (cached && match.route.keepAlive) {
      cached.lastAccessed = nextTimestamp()
      cached.setParams(match.params)
      keepAliveCache.delete(routeKey)
      activeRoot = {
        key: routeKey,
        element: cached.element,
        setParams: cached.setParams,
        dispose: cached.dispose,
        isKeepAlive: true,
      }
      return activeRoot.element
    }

    if (cached) {
      cached.dispose()
      keepAliveCache.delete(routeKey)
    }

    // Create isolated reactive root with createRoot:
    let renderedElement: JSX.Element = null
    let setParamsFn!: (p: RouteParams) => void
    const dispose = createRoot((disposeFn) => {
      const [params, setParams] = createSignal(match.params)
      setParamsFn = setParams

      const Component = match.route.component
      try {
        let element = createComponent(Component, {
          get params() { return params() },
        })
        const layouts = match.route.layouts ?? []
        for (const Layout of layouts.slice().reverse()) {
          element = createComponent(Layout, {
            get children() { return element },
            get params() { return params() },
          })
        }
        renderedElement = element
      } catch (error) {
        const ErrorComponent = match.route.error
        if (ErrorComponent) {
          renderedElement = createComponent(ErrorComponent, {
            error,
            get params() { return params() },
          })
        } else {
          throw error
        }
      }
      return disposeFn
    })

    activeRoot = {
      key: routeKey,
      element: renderedElement,
      setParams: setParamsFn,
      dispose,
      isKeepAlive: !!match.route.keepAlive,
    }
    return activeRoot.element
  }
}
