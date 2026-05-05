/**
 * Vexart unified public API — type declarations.
 * Matches packages/app/src/barrel.ts runtime exports.
 *
 * Consumer import: import { ... } from "vxrt"
 */

import type { JSX } from "solid-js"

// ── Re-export sub-modules ──

export * from "./components"
export * from "./void"
export * from "./engine"

// ── SolidJS re-exports ──
// barrel.ts line 370: export { createSignal, createEffect, ... } from "solid-js"

export { createSignal, createEffect, createMemo, createContext, useContext, onCleanup, onMount, batch, untrack } from "solid-js"

// ── App lifecycle ──

import type { Terminal, MountHandle, MountOptions } from "./engine"

export interface CreateAppOptions {
  quit?: string[]
  mount?: MountOptions
  onReady?: (ctx: AppContext) => void
  onError?: (error: Error) => void
}

export interface AppContext {
  terminal: Terminal
  handle: MountHandle
  destroy: () => void
}

export declare function createApp(
  component: () => JSX.Element,
  options?: CreateAppOptions,
): Promise<AppContext>

export interface MountAppOptions {
  terminal?: Terminal
  mount?: MountOptions
}

export declare function mountApp(
  component: () => JSX.Element,
  options?: MountAppOptions,
): Promise<MountHandle>

export declare function useAppTerminal(): Terminal

export interface PageProps {
  children?: JSX.Element
  [key: string]: any
}

export declare function Page(props: PageProps): JSX.Element

// ── CLI ──

export interface CliResult {
  code: number
  output: string
}

export declare function runCli(argv?: string[]): Promise<CliResult>

// ── Config ──

export type ClassNameUnknownBehavior = "ignore" | "warn" | "error"

export interface VexartAppConfigApp {
  name?: string
  defaultRoute?: string
}

export interface VexartAppConfigTheme {
  preset?: "void" | string
}

export interface VexartAppConfigStyles {
  className?: boolean
  unknownClass?: ClassNameUnknownBehavior
}

export interface VexartAppConfigTerminal {
  minColumns?: number
  minRows?: number
}

export interface VexartAppConfig {
  app?: VexartAppConfigApp
  theme?: VexartAppConfigTheme
  styles?: VexartAppConfigStyles
  terminal?: VexartAppConfigTerminal
}

export declare function defineConfig(config: VexartAppConfig): VexartAppConfig
export declare function mergeConfig(config?: VexartAppConfig): Required<VexartAppConfig>

// ── className system ──

export declare const CLASS_NAME_UNKNOWN_BEHAVIOR: {
  readonly IGNORE: "ignore"
  readonly WARN: "warn"
  readonly ERROR: "error"
}

export interface ClassNameDiagnostic {
  className: string
  reason: string
  suggestion?: string
}

export interface ClassNameResolveOptions {
  unknownClass?: ClassNameUnknownBehavior
  onDiagnostic?: (diagnostic: ClassNameDiagnostic) => void
}

export interface ClassNameResolveResult {
  props: Record<string, any>
  diagnostics: ClassNameDiagnostic[]
}

export declare function resolveClassName(
  className: string | undefined | null,
  options?: ClassNameResolveOptions,
): ClassNameResolveResult

export declare function mergeClassNameProps<T extends Record<string, unknown>>(
  props: T,
  className?: string | null,
): T & Record<string, any>

export interface ClassNameProps {
  className?: string
  children?: JSX.Element
}

export type AppBoxProps = Record<string, any> & ClassNameProps
export type AppTextProps = Record<string, any> & ClassNameProps

// ── App router ──

export type RouteParams = Record<string, string>

export interface NavigationOptions {
  replace?: boolean
  focusId?: string | null
}

export type RouteComponent = (props: { params: RouteParams }) => JSX.Element

export type RouteLayoutComponent = (props: {
  children: JSX.Element
  params: RouteParams
}) => JSX.Element

export type RouteErrorComponent = (props: {
  error: unknown
  params: RouteParams
}) => JSX.Element

export interface AppRouteDefinition {
  path: string
  component: RouteComponent
  layouts?: RouteLayoutComponent[]
  loading?: RouteComponent
  error?: RouteErrorComponent
  notFound?: RouteComponent
  focusId?: string | null
}

export interface AppRouteMatch {
  route: AppRouteDefinition
  params: RouteParams
}

export interface AppRouterState {
  path: string
  params: RouteParams
}

export type AppRouterFocusRestorer = (
  focusId: string,
  state: AppRouterState,
) => void

export interface CreateAppRouterOptions {
  defaultFocusId?: string | null
  restoreFocus?: boolean
  onFocus?: AppRouterFocusRestorer
}

export interface AppRouter {
  current: () => AppRouterState
  history: () => AppRouterState[]
  match: () => AppRouteMatch | null
  push: (path: string, options?: NavigationOptions) => void
  replace: (path: string, options?: NavigationOptions) => void
  navigate: (path: string, options?: NavigationOptions) => void
  back: () => boolean
  forward: () => boolean
}

export type AppRouterContextValue = AppRouter

export interface AppRouterProviderProps {
  router: AppRouter
  children?: JSX.Element
}

export interface RouteOutletProps {
  router?: AppRouter
  notFound?: RouteComponent
}

export declare const ROUTE_FOCUS_ID: "vexart-route-root"

export declare function normalizePath(path: string): string
export declare function matchRoute(routes: AppRouteDefinition[], path: string): AppRouteMatch | null
export declare function createAppRouter(
  routes: AppRouteDefinition[],
  initialPath?: string,
  options?: CreateAppRouterOptions,
): AppRouter
export declare function RouterProvider(props: AppRouterProviderProps): JSX.Element
// Note: useRouter is already exported from engine.d.ts (headless router).
// The app-level useRouter from barrel.ts overrides it.
export declare function RouteOutlet(props: RouteOutletProps): () => JSX.Element | null

// ── Route manifest ──

export declare const ROUTE_FILE_KIND: {
  readonly PAGE: "page"
  readonly LAYOUT: "layout"
  readonly LOADING: "loading"
  readonly ERROR: "error"
  readonly NOT_FOUND: "not-found"
}

export type RouteFileKind = "page" | "layout" | "loading" | "error" | "not-found"

export interface RouteManifestOptions {
  root?: string
  appDir?: string
}

export interface FileSystemRouteFile {
  path: string
  routePath: string
  kind: RouteFileKind
}

export interface FileSystemRoute {
  path: string
  file: string
  layouts: string[]
  loading?: string
  error?: string
  notFound?: string
}

export interface FileSystemRouteManifest {
  root: string
  appDir: string
  routes: FileSystemRoute[]
  layouts: FileSystemRouteFile[]
  files: FileSystemRouteFile[]
}

export interface WriteRouteManifestOptions extends RouteManifestOptions {
  outFile?: string
}

export declare function routeFilePathToRoutePath(file: string, options?: RouteManifestOptions): string
export declare function discoverAppRoutes(options?: RouteManifestOptions): Promise<FileSystemRouteManifest>
export declare function writeRouteManifestModule(options?: WriteRouteManifestOptions): Promise<FileSystemRouteManifest>
