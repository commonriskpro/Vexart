# Application Framework, Router & Tooling

The `@vexart/app` package provides the application runtime, file-system router, nested layout system, Tailwind-compatible `className` compiler, and developer CLI. It also exposes the root `vexart` unified barrel import.

---

## 1. Application Runtime Model

Applications initialize through `createApp` or `mountApp`:

```tsx
import { createApp, Box, Text } from "vexart"

const app = await createApp(() => (
  <Box className="w-full h-full bg-background items-center justify-center">
    <Text className="text-xl font-bold text-foreground">Hello, Vexart!</Text>
  </Box>
), {
  quit: ["ctrl+c", "q"], // Key combinations that trigger graceful shutdown
  onReady: (ctx) => console.log("Terminal ready:", ctx.terminal.size),
})
```

### Lifecycle & Terminal Context
- **Terminal Setup**: `createApp` automatically detects terminal capabilities, sets raw mode, captures resize events, hides the hardware cursor, and activates alternate screen buffers.
- **`TerminalContext` & `useAppTerminal()`**: Exposes the reactive terminal handle and live dimensions to child components:
  ```tsx
  const terminal = useAppTerminal()
  console.log(terminal.size.width, terminal.size.height)
  ```
- **Signal Cleanup**: Intercepts `SIGINT`, `SIGTERM`, and configured quit keys (`ctrl+c` by default), gracefully cleaning up GPU textures, unlinking POSIX shared memory segments, and restoring original terminal attributes before process exit.

---

## 2. File-System Router

The Vexart router supports file-system routing conventions with automatic route discovery, nested layout composition, and focus restoration.

### File Conventions
Within a routes directory:
- `page.tsx`: The primary route view rendered when path matches.
- `layout.tsx`: Persistent wrapping layout containing `<RouteOutlet />` for child views. Layouts persist across child navigations without unmounting.
- `loading.tsx`: Discovered automatically in the route manifest (`manifest.ts`). Note that `RouteOutlet` does not automatically inject Suspense boundaries; consumer components or custom layouts must explicitly bind `loading.tsx` inside SolidJS `<Suspense fallback={<Loading />}>`.
- `error.tsx`: Catches synchronous render errors during route resolution in `RouteOutlet`'s internal `try / catch` block, rendering `ErrorComponent({ error, params })` as a localized error fallback.
- `not-found.tsx`: Fallback view displayed when no matching route is found.

### Route Patterns & Specificity
- **Route Groups (`(group)`)**: Parentheses create logical folder groupings without affecting the URL route path (e.g. `routes/(dashboard)/settings/page.tsx` matches `/settings`).
- **Dynamic Parameters (`[param]`)**: Matches dynamic path segments and passes them to `useRouter().params.param`.
- **Catch-All Segments (`[...catchAll]`)**: Matches any number of remaining path segments as an array.
- **Specificity Scoring**: Route matching sorts candidates by specificity:
  1. Static segments (`/users/profile`) - Highest priority
  2. Dynamic segments (`/users/[id]`)
  3. Catch-all segments (`/users/[...slug]`) - Lowest priority

### Nested Layout Composition & RouteOutlet
When navigating to `/settings/security`, the router nests components:
```tsx
<RootLayout>
  <SettingsLayout>
    <SecurityPage />
  </SettingsLayout>
</RootLayout>
```
Child components are rendered at `<RouteOutlet />` insertion points.

### Focus Restoration (`ROUTE_FOCUS_ID`)
Navigating between routes automatically resets or restores keyboard focus to the first focusable element of the incoming page, ensuring smooth keyboard navigation across page boundaries.

---

## 3. Primitives & Invariant Rules

### `Box` & `Text` Wrapper Primitives
The framework provides `<Box>` and `<Text>`:
- Wrap `@vexart/engine` intrinsics (`<box>` and `<text>`).
- Add support for the `className` utility prop.
- Forward ref handles and native layout events.

### Removed Primitives Invariant
> **CRITICAL INVARIANT**: Historical `@vexart/primitives` layout helpers (`Span`, `RichText`, `WrapRow`) **do not exist** in modern Vexart. Do not import or use `Span`, `RichText`, or `WrapRow`. Use `<box>` and `<text>` intrinsics directly.

---

## 4. `className` Compiler

The `className` compiler translates utility class strings into engine layout and styling props.

### Tailwind Utility Parsing
Supports common Tailwind CSS utilities:
- Layout: `flex`, `flex-row`, `flex-col`, `items-center`, `justify-between`, `w-full`, `h-full`, `p-4`, `m-2`, `gap-2`
- Geometry: `rounded-md`, `rounded-full`, `border`, `border-2`
- Typography: `text-sm`, `text-lg`, `font-bold`, `text-center`
- Colors: Semantic token mapping (`bg-background`, `text-foreground`, `border-border`, `bg-primary`)

### Custom Classes with `createStyles`
Create reusable composite style definitions:
```typescript
const buttonStyles = createStyles({
  base: "px-4 py-2 rounded-md items-center justify-center",
  primary: "bg-primary text-primary-foreground",
})
```

### Compiler Caching & Diagnostics
- **LRU / Cache Map**: Parsed class string results are cached in memory. Steady-state frames execute zero string allocations.
- **Diagnostics (`CLASS_NAME_UNKNOWN_BEHAVIOR`)**: Configures compiler behavior when encountering unparseable classes:
  - `"ignore"`: Silently ignores unknown classes.
  - `"warn"`: Prints diagnostic warning to terminal/log.
  - `"error"`: Throws compilation error.
- **Override Precedence**: Explicit direct props always override classes:
  ```tsx
  <Box className="bg-card" backgroundColor="#ff0000" />
  // Renders with backgroundColor="#ff0000"
  ```

---

## 5. CLI Toolchain

The Vexart CLI provides developer workflows:

- `vexart create [project-name]`: Scaffolds a new Vexart project with TypeScript, SolidJS JSX templates, and recommended defaults.
- `vexart dev`: Starts the application in development mode with live watch and hot reload.
- `vexart build`: Compiles production TypeScript bundle and validates native dependencies.
- `vexart routes`: Scans the application `app/` directory via `discoverAppRoutes` and prints a formatted two-column table of resolved route paths alongside their source file locations (e.g. `${route.path.padEnd(24)} ${route.file}`), or `"No app routes found. Expected files like app/page.tsx."` if empty.
- `vexart doctor`: Validates development environment prerequisites, outputting checks for Bun runtime version, `package.json` existence, `app/` directory existence, `TERM` and `TERM_PROGRAM` environment strings, and a Kitty-compatible graphics capability hint (identifying Ghostty, WezTerm, Kitty).

---

## 6. Unified `vexart` Barrel & Collision Resolutions

Application developers import all required APIs directly from `"vexart"` (`packages/app/src/barrel.ts`).

### Collision Resolution Rules
When multiple packages export identically named symbols, the barrel enforces clear resolution rules:

1. **`Box` and `Text`**: `@vexart/app` wins. Provides `className` compiler support while forwarding engine intrinsic props.
2. **`Button` and `ButtonProps`**: `@vexart/styled` wins. Provides themed components with Void design tokens. Unstyled headless `Button` remains available from `@vexart/headless` or `vexart/engine`.
3. **`Switch`**: Headless unstyled switch is renamed to **`ToggleSwitch`** to prevent name collision with SolidJS control flow `<Switch>`.
4. **`useRouter`**: `@vexart/app` wins. Exposes the app-level file-system router. The low-level headless router is exported from `vexart/engine`.
