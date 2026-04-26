/**
 * @vexart/app public API - explicit named exports.
 * NO `export *` - every export is intentional.
 */

// -- Runtime -----------------------------------------------------------------

export { Page } from "./runtime/page"
export type { PageProps } from "./runtime/page"

// -- Components --------------------------------------------------------------

export { Box, Text } from "./components/primitives"
export type { AppBoxProps, AppTextProps, ClassNameProps } from "./components/primitives"

// -- Styling -----------------------------------------------------------------

export {
  CLASS_NAME_UNKNOWN_BEHAVIOR,
  mergeClassNameProps,
  resolveClassName,
} from "./styles/class-name"
export type {
  ClassNameUnknownBehavior,
  ClassNameDiagnostic,
  ClassNameResolveOptions,
  ClassNameResolveResult,
  VexartStyleProps,
} from "./styles/class-name"

// -- Router ------------------------------------------------------------------

export {
  createAppRouter,
  matchRoute,
  normalizePath,
  ROUTE_FOCUS_ID,
  RouteOutlet,
  RouterProvider,
  useRouter,
} from "./router/router"
export type {
  AppRouteDefinition,
  AppRouteMatch,
  AppRouter,
  AppRouterContextValue,
  AppRouterFocusRestorer,
  AppRouterProviderProps,
  AppRouterState,
  CreateAppRouterOptions,
  NavigationOptions,
  RouteErrorComponent,
  RouteLayoutComponent,
  RouteOutletProps,
  RouteComponent,
  RouteParams,
} from "./router/router"

export {
  discoverAppRoutes,
  routeFilePathToRoutePath,
  ROUTE_FILE_KIND,
  writeRouteManifestModule,
} from "./router/manifest"
export type {
  FileSystemRoute,
  FileSystemRouteFile,
  FileSystemRouteManifest,
  RouteFileKind,
  RouteManifestOptions,
  WriteRouteManifestOptions,
} from "./router/manifest"

// -- Config ------------------------------------------------------------------

export { defineConfig, mergeConfig } from "./config/config"
export type {
  VexartAppConfig,
  VexartAppConfigApp,
  VexartAppConfigStyles,
  VexartAppConfigTerminal,
  VexartAppConfigTheme,
} from "./config/config"

// -- App Lifecycle ------------------------------------------------------------

export { createApp } from "./runtime/create-app"
export type { CreateAppOptions, AppContext } from "./runtime/create-app"
export { useAppTerminal } from "./runtime/terminal-context"
export { mountApp } from "./runtime/mount-app"
export type { MountAppOptions } from "./runtime/mount-app"

// -- CLI ---------------------------------------------------------------------

export { runCli } from "./cli/index"
export type { CliResult } from "./cli/index"
