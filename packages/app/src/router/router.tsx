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

/** @public */
export function normalizePath(path: string) {
  const [pathname] = path.split("?")
  const normalized = `/${pathname.split("/").filter(Boolean).join("/")}`
  return normalized === "//" ? "/" : normalized
}

type CompiledRoute = {
  route: AppRouteDefinition
  score: number
  parts: string[]
  hasCatchAll: boolean
  catchAllParam?: string
}

function compileRoutes(routes: AppRouteDefinition[]): CompiledRoute[] {
  return routes
    .map((route) => {
      const parts = splitPath(route.path)
      return {
        route,
        score: parts.reduce((s, p) => {
          if (p.startsWith("[...") && p.endsWith("]")) return s
          return s + (p.startsWith("[") && p.endsWith("]") ? 1 : 4)
        }, 0),
        parts,
        hasCatchAll: parts.some((p) => p.startsWith("[...") && p.endsWith("]")),
        catchAllParam: parts.find((p) => p.startsWith("[..."))?.slice(4, -1),
      }
    })
    .sort((a, b) => b.score - a.score)
}

const _compiledCache = new WeakMap<AppRouteDefinition[], CompiledRoute[]>()

function getCompiled(routes: AppRouteDefinition[]): CompiledRoute[] {
  let compiled = _compiledCache.get(routes)
  if (!compiled) {
    compiled = compileRoutes(routes)
    _compiledCache.set(routes, compiled)
  }
  return compiled
}

/** @public */
export function matchRoute(routes: AppRouteDefinition[], path: string): AppRouteMatch | null {
  const targetParts = splitPath(path)
  const compiledRoutes = getCompiled(routes)
  for (const compiled of compiledRoutes) {
    const { route, parts: routeParts, hasCatchAll } = compiled
    if (!hasCatchAll && routeParts.length !== targetParts.length) continue
    const params: RouteParams = {}
    let matched = true
    for (let index = 0; index < routeParts.length; index++) {
      const routePart = routeParts[index]
      const targetPart = targetParts[index]
      if (routePart.startsWith("[...") && routePart.endsWith("]")) {
        params[compiled.catchAllParam ?? routePart.slice(4, -1)] = targetParts.slice(index).map(decodeURIComponent).join("/")
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

type ActiveLayoutLevel = {
  layout: RouteLayoutComponent
  setParams: (p: RouteParams) => void
  setChild: (el: JSX.Element) => void
  element: JSX.Element
  dispose: () => void
}

type ActiveLeaf = {
  setParams: (p: RouteParams) => void
  element: JSX.Element
  dispose: () => void
  hasError: boolean
}

type ActiveRootState = {
  key: string
  element: JSX.Element
  layouts: RouteLayoutComponent[]
  levels: ActiveLayoutLevel[]
  leaf: ActiveLeaf
  setParams: (p: RouteParams) => void
  dispose: () => void
  isKeepAlive: boolean
}

function createLeaf(route: AppRouteDefinition, initialParams: RouteParams): ActiveLeaf {
  let setParamsFn!: (p: RouteParams) => void
  let renderedElement: JSX.Element = null
  let hasError = false
  const dispose = createRoot((disposeFn) => {
    const [params, setParams] = createSignal(initialParams)
    setParamsFn = setParams
    try {
      renderedElement = createComponent(route.component, {
        get params() { return params() },
      })
    } catch (error) {
      const ErrorComponent = route.error
      if (ErrorComponent) {
        hasError = true
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
  return {
    element: renderedElement,
    setParams: setParamsFn,
    dispose,
    hasError,
  }
}

function createLayoutLevel(
  layout: RouteLayoutComponent,
  childEl: JSX.Element,
  initialParams: RouteParams
): ActiveLayoutLevel {
  let setParamsFn!: (p: RouteParams) => void
  let setChildFn!: (el: JSX.Element) => void
  let element: JSX.Element = null
  const dispose = createRoot((disposeFn) => {
    const [params, setParams] = createSignal(initialParams)
    const [child, setChild] = createSignal(childEl)
    setParamsFn = setParams
    setChildFn = setChild
    element = createComponent(layout, {
      get children() { return child() },
      get params() { return params() },
    })
    return disposeFn
  })
  return {
    layout,
    element,
    setParams: setParamsFn,
    setChild: setChildFn,
    dispose,
  }
}

function disposeActiveRoot(root: ActiveRootState) {
  root.leaf.dispose()
  for (let i = root.levels.length - 1; i >= 0; i--) {
    root.levels[i].dispose()
  }
}

function setParamsActiveRoot(root: ActiveRootState, params: RouteParams) {
  for (const level of root.levels) {
    level.setParams(params)
  }
  root.leaf.setParams(params)
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

  let activeRoot: ActiveRootState | null = null

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

    if (activeRoot && activeRoot.isKeepAlive) {
      deactivateActiveRoot()
    }

    // Check if new route is in keepAliveCache:
    const cached = keepAliveCache.get(routeKey)
    if (cached && match.route.keepAlive) {
      deactivateActiveRoot()
      cached.lastAccessed = nextTimestamp()
      cached.setParams(match.params)
      keepAliveCache.delete(routeKey)
      activeRoot = {
        key: routeKey,
        element: cached.element,
        layouts: match.route.layouts ?? [],
        levels: [],
        leaf: { element: cached.element, setParams: cached.setParams, dispose: cached.dispose, hasError: false },
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

    let sharedDepth = 0
    const currentLayouts = activeRoot?.layouts ?? []
    const nextLayouts = match.route.layouts ?? []
    if (activeRoot && !match.route.keepAlive) {
      while (
        sharedDepth < currentLayouts.length &&
        sharedDepth < nextLayouts.length &&
        currentLayouts[sharedDepth] === nextLayouts[sharedDepth]
      ) {
        sharedDepth++
      }
    }

    if (sharedDepth > 0 && activeRoot) {
      const leaf = createLeaf(match.route, match.params)
      if (leaf.hasError) {
        deactivateActiveRoot()
        activeRoot = {
          key: routeKey,
          element: leaf.element,
          layouts: [],
          levels: [],
          leaf,
          setParams: leaf.setParams,
          dispose: leaf.dispose,
          isKeepAlive: false,
        }
        return activeRoot.element
      }

      activeRoot.leaf.dispose()
      for (let i = activeRoot.levels.length - 1; i >= sharedDepth; i--) {
        activeRoot.levels[i].dispose()
      }
      const retainedLevels = activeRoot.levels.slice(0, sharedDepth)

      let currentChild = leaf.element
      const newLevels: ActiveLayoutLevel[] = []
      try {
        for (let i = nextLayouts.length - 1; i >= sharedDepth; i--) {
          const level = createLayoutLevel(nextLayouts[i], currentChild, match.params)
          newLevels.unshift(level)
          currentChild = level.element
        }
      } catch (error) {
        leaf.dispose()
        for (const lvl of newLevels) lvl.dispose()
        for (const lvl of retainedLevels) lvl.dispose()
        activeRoot = null
        const ErrorComponent = match.route.error
        if (ErrorComponent) {
          const errorLeaf = createLeaf(match.route, match.params)
          activeRoot = {
            key: routeKey,
            element: errorLeaf.element,
            layouts: [],
            levels: [],
            leaf: errorLeaf,
            setParams: errorLeaf.setParams,
            dispose: errorLeaf.dispose,
            isKeepAlive: false,
          }
          return activeRoot.element
        }
        throw error
      }

      retainedLevels[sharedDepth - 1].setChild(currentChild)

      for (let i = 0; i < sharedDepth; i++) {
        retainedLevels[i].setParams(match.params)
      }

      const allLevels = [...retainedLevels, ...newLevels]
      activeRoot = {
        key: routeKey,
        element: retainedLevels[0].element,
        layouts: nextLayouts,
        levels: allLevels,
        leaf,
        setParams: (p) => setParamsActiveRoot(activeRoot!, p),
        dispose: () => disposeActiveRoot(activeRoot!),
        isKeepAlive: false,
      }
      return activeRoot.element
    }

    // sharedDepth === 0: full dispose + recreate
    deactivateActiveRoot()

    const leaf = createLeaf(match.route, match.params)
    if (leaf.hasError || nextLayouts.length === 0) {
      activeRoot = {
        key: routeKey,
        element: leaf.element,
        layouts: leaf.hasError ? [] : nextLayouts,
        levels: [],
        leaf,
        setParams: leaf.setParams,
        dispose: leaf.dispose,
        isKeepAlive: !leaf.hasError && !!match.route.keepAlive,
      }
      return activeRoot.element
    }

    let currentChild = leaf.element
    const levels: ActiveLayoutLevel[] = []
    try {
      for (let i = nextLayouts.length - 1; i >= 0; i--) {
        const level = createLayoutLevel(nextLayouts[i], currentChild, match.params)
        levels.unshift(level)
        currentChild = level.element
      }
    } catch (error) {
      leaf.dispose()
      for (const lvl of levels) lvl.dispose()
      const ErrorComponent = match.route.error
      if (ErrorComponent) {
        const errorLeaf = createLeaf(match.route, match.params)
        activeRoot = {
          key: routeKey,
          element: errorLeaf.element,
          layouts: [],
          levels: [],
          leaf: errorLeaf,
          setParams: errorLeaf.setParams,
          dispose: errorLeaf.dispose,
          isKeepAlive: false,
        }
        return activeRoot.element
      }
      throw error
    }

    activeRoot = {
      key: routeKey,
      element: levels[0].element,
      layouts: nextLayouts,
      levels,
      leaf,
      setParams: (p) => setParamsActiveRoot(activeRoot!, p),
      dispose: () => disposeActiveRoot(activeRoot!),
      isKeepAlive: !!match.route.keepAlive,
    }
    return activeRoot.element
  }
}
