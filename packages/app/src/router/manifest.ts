import { existsSync, mkdirSync } from "node:fs"
import { basename, dirname, join, relative } from "node:path"

/** @public */
export const ROUTE_FILE_KIND = {
  PAGE: "page",
  LAYOUT: "layout",
  LOADING: "loading",
  ERROR: "error",
  NOT_FOUND: "not-found",
} as const

/** @public */
export type RouteFileKind = (typeof ROUTE_FILE_KIND)[keyof typeof ROUTE_FILE_KIND]

/** @public */
export type RouteManifestOptions = {
  root?: string
  appDir?: string
}

/** @public */
export type FileSystemRouteFile = {
  path: string
  routePath: string
  kind: RouteFileKind
}

/** @public */
export type FileSystemRoute = {
  path: string
  file: string
  layouts: string[]
  loading?: string
  error?: string
  notFound?: string
}

/** @public */
export type FileSystemRouteManifest = {
  root: string
  appDir: string
  routes: FileSystemRoute[]
  layouts: FileSystemRouteFile[]
  files: FileSystemRouteFile[]
}

/** @public */
export type WriteRouteManifestOptions = RouteManifestOptions & {
  outFile?: string
}

const ROUTE_FILE_NAMES: Record<string, RouteFileKind> = {
  "page.tsx": ROUTE_FILE_KIND.PAGE,
  "page.ts": ROUTE_FILE_KIND.PAGE,
  "page.jsx": ROUTE_FILE_KIND.PAGE,
  "page.js": ROUTE_FILE_KIND.PAGE,
  "layout.tsx": ROUTE_FILE_KIND.LAYOUT,
  "layout.ts": ROUTE_FILE_KIND.LAYOUT,
  "layout.jsx": ROUTE_FILE_KIND.LAYOUT,
  "layout.js": ROUTE_FILE_KIND.LAYOUT,
  "loading.tsx": ROUTE_FILE_KIND.LOADING,
  "loading.ts": ROUTE_FILE_KIND.LOADING,
  "loading.jsx": ROUTE_FILE_KIND.LOADING,
  "loading.js": ROUTE_FILE_KIND.LOADING,
  "error.tsx": ROUTE_FILE_KIND.ERROR,
  "error.ts": ROUTE_FILE_KIND.ERROR,
  "error.jsx": ROUTE_FILE_KIND.ERROR,
  "error.js": ROUTE_FILE_KIND.ERROR,
  "not-found.tsx": ROUTE_FILE_KIND.NOT_FOUND,
  "not-found.ts": ROUTE_FILE_KIND.NOT_FOUND,
  "not-found.jsx": ROUTE_FILE_KIND.NOT_FOUND,
  "not-found.js": ROUTE_FILE_KIND.NOT_FOUND,
}

function normalizeSlashes(path: string) {
  return path.replace(/\\/g, "/")
}

function appRelativePath(path: string, appDir: string) {
  return normalizeSlashes(path).replace(new RegExp(`^${appDir}/?`), "")
}

function routePathForDir(dir: string) {
  const segments = normalizeSlashes(dir)
    .split("/")
    .filter(Boolean)
    .filter((segment) => !segment.startsWith("(") || !segment.endsWith(")"))
    .filter((segment) => !segment.startsWith("_"))
  if (segments.length === 0) return "/"
  return `/${segments.join("/")}`
}

function isPrivateRouteFile(file: string, appDir: string) {
  const relativeFile = appRelativePath(file, appDir)
  return relativeFile.split("/").some((segment) => segment.startsWith("_"))
}

function kindForFile(file: string) {
  return ROUTE_FILE_NAMES[basename(file)]
}

function ancestorDirs(dir: string) {
  const normalized = normalizeSlashes(dir)
  if (normalized === "." || normalized === "") return [""]
  const parts = normalized.split("/").filter(Boolean)
  return parts.map((_, index) => parts.slice(0, parts.length - index).join("/")).concat("")
}

function isAncestorDir(parent: string, child: string) {
  if (parent === "") return true
  return child === parent || child.startsWith(`${parent}/`)
}

function routePathForFile(file: string, appDir: string) {
  const relativeFile = appRelativePath(file, appDir)
  const dir = dirname(relativeFile) === "." ? "" : dirname(relativeFile)
  return routePathForDir(dir)
}

function nearestFile(files: FileSystemRouteFile[], kind: RouteFileKind, pageFile: string, appDir: string) {
  const dir = dirname(appRelativePath(pageFile, appDir))
  const dirs = ancestorDirs(dir === "." ? "" : dir)
  return dirs
    .map((candidate) => files.find((file) => file.kind === kind && dirname(appRelativePath(file.path, appDir)) === candidate))
    .find(Boolean)?.path
}

/** @public */
export function routeFilePathToRoutePath(file: string, options: RouteManifestOptions = {}) {
  return routePathForFile(file, options.appDir ?? "app")
}

/** @public */
export async function discoverAppRoutes(options: RouteManifestOptions = {}): Promise<FileSystemRouteManifest> {
  const root = options.root ?? process.cwd()
  const appDir = options.appDir ?? "app"
  const appPath = join(root, appDir)
  if (!existsSync(appPath)) return { root, appDir, routes: [], layouts: [], files: [] }

  const entries = await Promise.all(["ts", "tsx", "js", "jsx"].map((extension) => Array.fromAsync(new Bun.Glob(`**/*.${extension}`).scan({ cwd: appPath }))))
  const files = entries
    .flat()
    .map((entry) => normalizeSlashes(`${appDir}/${entry}`))
    .filter((file) => !isPrivateRouteFile(file, appDir))
    .map((file) => ({ path: file, routePath: routePathForFile(file, appDir), kind: kindForFile(file) }))
    .filter((file): file is FileSystemRouteFile => Boolean(file.kind))
    .sort((a, b) => a.path.localeCompare(b.path))

  const layouts = files.filter((file) => file.kind === ROUTE_FILE_KIND.LAYOUT)
  const pages = files.filter((file) => file.kind === ROUTE_FILE_KIND.PAGE)
  const routes = pages.map((page) => {
    const pageDir = dirname(appRelativePath(page.path, appDir))
    const normalizedPageDir = pageDir === "." ? "" : pageDir
    const routeLayouts = layouts
      .filter((layout) => isAncestorDir(dirname(appRelativePath(layout.path, appDir)) === "." ? "" : dirname(appRelativePath(layout.path, appDir)), normalizedPageDir))
      .sort((a, b) => appRelativePath(a.path, appDir).split("/").length - appRelativePath(b.path, appDir).split("/").length)
      .map((layout) => layout.path)

    return {
      path: page.routePath,
      file: page.path,
      layouts: routeLayouts,
      loading: nearestFile(files, ROUTE_FILE_KIND.LOADING, page.path, appDir),
      error: nearestFile(files, ROUTE_FILE_KIND.ERROR, page.path, appDir),
      notFound: nearestFile(files, ROUTE_FILE_KIND.NOT_FOUND, page.path, appDir),
    }
  }).sort((a, b) => a.path.localeCompare(b.path))

  return { root, appDir, routes, layouts, files }
}

function importPath(fromFile: string, targetFile: string) {
  const rel = normalizeSlashes(relative(dirname(fromFile), targetFile))
  return rel.startsWith(".") ? rel : `./${rel}`
}

function identifierFor(prefix: string, index: number) {
  return `${prefix}${index}`
}

/** @public */
export async function writeRouteManifestModule(options: WriteRouteManifestOptions = {}): Promise<FileSystemRouteManifest> {
  const manifest = await discoverAppRoutes(options)
  const outFile = join(manifest.root, options.outFile ?? ".vexart/routes.ts")
  mkdirSync(dirname(outFile), { recursive: true })

  const imports = new Map<string, string>()
  const importFor = (file: string, prefix: string) => {
    const previous = imports.get(file)
    if (previous) return previous
    const id = identifierFor(prefix, imports.size)
    imports.set(file, id)
    return id
  }

  const routeObjects = manifest.routes.map((route) => {
    const component = importFor(route.file, "Page")
    const layouts = route.layouts.map((layout) => importFor(layout, "Layout"))
    const loading = route.loading ? importFor(route.loading, "Loading") : undefined
    const error = route.error ? importFor(route.error, "ErrorRoute") : undefined
    const notFound = route.notFound ? importFor(route.notFound, "NotFound") : undefined
    const lines = [
      `    path: ${JSON.stringify(route.path)},`,
      `    component: ${component},`,
    ]
    if (layouts.length > 0) lines.push(`    layouts: [${layouts.join(", ")}],`)
    if (loading) lines.push(`    loading: ${loading},`)
    if (error) lines.push(`    error: ${error},`)
    if (notFound) lines.push(`    notFound: ${notFound},`)
    return `  {\n${lines.join("\n")}\n  }`
  })
  const rootNotFound = manifest.files.find((file) => file.kind === ROUTE_FILE_KIND.NOT_FOUND && file.routePath === "/")
  if (rootNotFound) {
    routeObjects.push(`  {\n    path: "/[...notFound]",\n    component: ${importFor(rootNotFound.path, "NotFound")},\n  }`)
  }

  const importLines = Array.from(imports.entries()).map((entry) => {
    const targetFile = join(manifest.root, entry[0])
    return `import ${entry[1]} from ${JSON.stringify(importPath(outFile, targetFile))}`
  })
  const content = [
    "// Generated by @vexart/app. Do not edit by hand.",
    "import type { AppRouteDefinition } from \"@vexart/app\"",
    ...importLines,
    "",
    "export const routes: AppRouteDefinition[] = [",
    routeObjects.join(",\n"),
    "]",
    "",
  ].join("\n")

  await Bun.write(outFile, content)
  return manifest
}
