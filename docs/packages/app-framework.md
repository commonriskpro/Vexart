# Application Framework, Router & Developer CLI

The `@vexart/app` package sits at Tier 1 of the Vexart architecture. It provides the application lifecycle engine (`createApp`, `mountApp`), a file-system router with nested layout inheritance, specificity scoring, a high-performance Tailwind-compatible `className` compiler, canonical `<Box>` and `<Text>` primitives, app configuration helpers (`defineConfig`), and the unified `"vexart"` barrel import.

---

## 1. Application Lifecycle & Runtime Model

Applications boot through `createApp` (standard CLI applications) or `mountApp` (embedded or headless environments).

### 1.1 `createApp`
`createApp` is the primary entry point for terminal applications. It abstracts terminal initialization, signal interception, and event teardown:

```tsx
import { createApp, Box, Text } from "vexart"

const app = await createApp(() => (
  <Box className="w-full h-full bg-background items-center justify-center">
    <Text className="text-xl font-bold text-foreground">Welcome to Vexart</Text>
  </Box>
), {
  quit: ["ctrl+c", "q"], // Key combinations that trigger shutdown
  onReady: (ctx) => {
    console.log("Terminal viewport initialized:", ctx.terminal.size)
  },
})
```

#### Lifecycle Responsibilities
- **Terminal Initialization**: Automatically queries terminal capabilities, sets raw mode, hides the hardware cursor, captures resize events, and switches to the alternate screen buffer.
- **Signal Trapping**: Coordinates OS signals (`SIGINT`, `SIGTERM`, `SIGHUP`) via `ProcessSignalHub`, executing an orderly teardown before process exit.
- **Input Dispatch**: Feeds ANSI sequences to the parser and routes keyboard/mouse events into the active render loop.

### 1.2 `mountApp`
For custom CLI shells, testing harnesses, or multi-terminal contexts, `mountApp` mounts a component tree asynchronously to a terminal instance:
```typescript
export async function mountApp(
  component: () => JSX.Element,
  options?: MountAppOptions
): Promise<MountHandle>
```

### 1.3 Terminal Context & `useAppTerminal`
The runtime injects a reactive `TerminalContext`. Components access the managed terminal via `useAppTerminal()`:
```tsx
import { useAppTerminal, useTerminalDimensions, Box, Text } from "vexart"

export function StatusHeader() {
  const terminal = useAppTerminal()
  // Note: terminal.size is a static snapshot ({ cols, rows, width, height }).
  // For dynamic reactivity on resize, pass terminal to useTerminalDimensions():
  const dims = useTerminalDimensions(terminal)

  return (
    <Box className="w-full h-6 px-4 bg-card justify-between items-center">
      <Text className="text-xs text-muted-foreground">Columns: {dims.columns()}</Text>
      <Text className="text-xs text-muted-foreground">Rows: {dims.rows()}</Text>
    </Box>
  )
}
```

---

## 2. File-System Router & Layout Engine

The Vexart file-system router provides dynamic client-side navigation within the terminal.

### 2.1 File Conventions
Route manifests are structured in a project routes directory:
- `page.tsx`: The primary route view rendered when the route pattern matches.
- `layout.tsx`: Wrapping layout containing `<RouteOutlet />` for nested child views. Layouts re-render across routes of differing paths unless cached via `keepAlive: true`.
- `loading.tsx`: Fallback view displayed during asynchronous page resolution.
- `error.tsx`: Localized error boundary rendered when a route resolution or synchronous render throws.
- `not-found.tsx`: Global fallback view displayed when no route matches the active path.

### 2.2 Route Specificity Scoring (`scoreRoute`)
When evaluating routes, `createAppRouter` ranks candidates using strict specificity scoring:
1. **Static Segments** (`/dashboard/settings`): **Score 4** per segment. Highest priority.
2. **Dynamic Segments** (`/users/[id]`): **Score 1** per segment. Matches arbitrary single tokens.
3. **Catch-All Segments** (`/docs/[...slug]`): **Score 0** per segment. Matches remaining multi-segment paths.

### 2.3 Nested Layout Composition & `<RouteOutlet>`
When navigating between nested routes (e.g. `/settings/security` $\to$ `/settings/billing`), the outer layout (`SettingsLayout`) remains mounted. Only the child inside `<RouteOutlet />` swaps:

```tsx
<RootLayout>
  <SettingsLayout>
    <RouteOutlet /> {/* Swaps SecurityPage <-> BillingPage */}
  </SettingsLayout>
</RootLayout>
```

#### Reactive Route Disposal & Layout Rebuilding
- **Default Behavior**: When navigating between distinct route paths, the active root is disposed and layouts are reconstructed. Navigating to a new route immediately invokes `dispose()` on the departing page, triggering all `onCleanup` callbacks and freeing memory.
- **Opt-In `keepAlive: true`**: High-complexity dashboard views can declare `keepAlive: true` in `AppRouteDefinition` to cache their state in a bounded 3-page LRU pool, preserving scroll offsets and layout state upon return.
- **Reactive Route Parameters**: When the same route path updates dynamic parameters (e.g. `/user/1` $\to$ `/user/2`), the active page and layout remain mounted while `match().params` updates reactively.

### 2.4 Programmatic Navigation (`useRouter`)
Components access router controls via the `useRouter()` hook:
```typescript
const router = useRouter()

// Programmatic transitions
router.navigate("/dashboard")
router.replace("/login")
router.back()
router.forward()

// Reactive path and parameters via current() signal
console.log(router.current().path)
console.log(router.current().params.userId)
```
*(Note: `pathname()`, `params()`, and `query()` do not exist; inspect state via `router.current().path` and `router.current().params`).*

### 2.5 Route Discovery & Manifest Generation
- `discoverAppRoutes(options?: RouteManifestOptions)`: Scans the filesystem and compiles route metadata. Options include `{ root?: string, appDir?: string }`.
- `writeRouteManifestModule(manifest: FileSystemRouteManifest, options?: WriteRouteManifestOptions)`: Generates a type-safe TypeScript manifest module (`manifest.ts`). Options include `{ outFile?: string }`.
- `routeFilePathToRoutePath(file: string, options?: RouteManifestOptions)`: Resolves a route path string from a file path.

---

## 3. `className` Tailwind Utility Compiler

Vexart features a high-performance utility class compiler in `packages/app/src/styles/class-name.ts`, converting familiar Tailwind class strings into engine layout and styling props.

### 3.1 Supported Utility Subsets
- **Flexbox Layout**:
  - Direction: `flex-row`, `flex-col`, `flex-row-reverse`, `flex-col-reverse`
  - Alignment: `items-start`, `items-center`, `items-end`, `items-stretch`
  - Justification: `justify-start`, `justify-center`, `justify-end`, `justify-between`, `justify-around`
  - Spacing & Gap: `gap-1`, `gap-2`, `gap-4`, `gap-x-*`, `gap-y-*`
- **Sizing & Dimensions**:
  - Width/Height: `w-full`, `h-full`, `w-screen`, `h-screen`, `w-auto`, `w-1/2`, `w-12`, `h-32`
  - Min/Max: `min-w-0`, `max-w-xl`, `min-h-full`, `max-h-screen`
- **Padding & Margins**:
  - `p-1` through `p-10`, `px-*`, `py-*`, `pt-*`, `pr-*`, `pb-*`, `pl-*`
  - `m-1` through `m-10`, `mx-*`, `my-*`, `mt-*`, `mr-*`, `mb-*`, `ml-*`
- **Borders & Radii**:
  - Corner Radii: `rounded-none`, `rounded-sm`, `rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-full`
  - Border Width: `border`, `border-2`, `border-t`, `border-r`, `border-b`, `border-l`
- **OLED Semantic Color Tokens**:
  - Backgrounds: `bg-background`, `bg-card`, `bg-popover`, `bg-primary`, `bg-secondary`, `bg-muted`, `bg-destructive`
  - Text: `text-foreground`, `text-primary-foreground`, `text-muted-foreground`, `text-destructive`
  - Borders: `border-border`, `border-input`
- **Typography**:
  - Font Sizes: `text-xs`, `text-sm`, `text-base`, `text-lg`, `text-xl`, `text-2xl`, `text-3xl`, `text-4xl`
  - Font Weights: `font-normal`, `font-medium`, `font-semibold`, `font-bold`
  - Alignment: `text-left`, `text-center`, `text-right`

### 3.2 Cache & Theme Version Invalidation
`resolveClassName()` caches compiled style results in a `Map<string, ClassNameResolveResult>` that is invalidated on each `themeVersion()` signal advance via `clearClassNameCache()`.
- When `setTheme()` changes active theme colors, the engine increments `themeVersion()`.
- The compiler monitors `themeVersion`: whenever the version advances, `clearClassNameCache()` is executed automatically.
- Next-frame class resolutions fetch fresh OLED tokens without requiring manual component unmounting.

### 3.3 Pre-Compiled Styles with `createStyles`
For static, performance-critical components, `createStyles` registers style object maps (`Record<string, VexartStyleProps>`) at module initialization and returns class identifier strings:
```typescript
import { createStyles } from "vexart"

const s = createStyles({
  card: { padding: 24, backgroundColor: "#171717", cornerRadius: 14 },
  title: { fontSize: 20, fontWeight: 700, color: "#fafafa" },
})

<Box className={s.card}>
  <Text className={s.title}>Dashboard</Text>
</Box>
```

### 3.4 Reactive Class Removal (`preserveRemovedProps`)
When conditional class bindings change (e.g. `className={isActive() ? "bg-primary" : "bg-card"}`), the reconciler uses `preserveRemovedProps`. If a previously active property is absent in the newly compiled class object, it is explicitly set to `undefined`, guaranteeing clean visual resets.

---

## 4. Canonical App Primitives (`<Box>` and `<Text>`)

`@vexart/app` exports `<Box>` and `<Text>`:
- Wraps the engine intrinsics `<box>` and `<text>`.
- Adds native `className` prop translation via `resolveClassName()`.
- Merges inline props over utility classes (`style` and explicit props take precedence over `className`).

```tsx
import { Box, Text } from "vexart"

export function Card() {
  return (
    <Box className="p-4 rounded-lg bg-card border border-border">
      <Text className="text-base font-semibold text-card-foreground">
        Card Title
      </Text>
    </Box>
  )
}
```

> **ARCHITECTURAL WARNING — DELETED PRIMITIVES**:
> `<Span>`, `<RichText>`, and `<WrapRow>` **do not exist**. Any imports from `@vexart/primitives` or references to these elements are obsolete and must be rewritten using `<box>`, `<text>`, `<Box>`, or `<Text>`.

---

## 5. Application Configuration (`defineConfig`)

Projects configure runtime behavior using a `vexart.config.ts` file:

```typescript
import { defineConfig, CLASS_NAME_UNKNOWN_BEHAVIOR } from "vexart"

export default defineConfig({
  app: {
    name: "Terminal Monitor",
    defaultRoute: "/dashboard",
  },
  theme: {
    preset: "void",
  },
  styles: {
    className: true,
    unknownClass: CLASS_NAME_UNKNOWN_BEHAVIOR.WARN, // "warn" | "ignore" | "error"
  },
  terminal: {
    minColumns: 80,
    minRows: 24,
  },
})
```

Configuration schemas are validated and merged via `mergeConfig()`.

---

## 6. Unified Barrel Export Resolution Rules

The root `"vexart"` package barrel (`packages/app/src/barrel.ts`) unifies all tiers while resolving naming collisions:

1. **`Box` and `Text`**: Exported from `@vexart/app` (enabling `className` compiler support).
2. **`Button` vs `VoidButton`**: `Button` is exported from `@vexart/headless` (unstyled primitive requiring `renderButton`). For the themed Void Design System button, use `VoidButton` from `@vexart/styled`.
3. **`ToggleSwitch`**: The headless `Switch` primitive is exported as `ToggleSwitch` to prevent collision with SolidJS's `<Switch>` control flow.
4. **`useRouter`**: Exported from `@vexart/app` (canonical file-system application router).
