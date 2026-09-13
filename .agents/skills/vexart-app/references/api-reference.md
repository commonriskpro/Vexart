# Vexart Complete API Reference

All exports documented here are imported directly from the unified root package:
```tsx
import { ... } from "vexart"
```

---

## 1. Application Lifecycle & Runtime

### `createApp(rootComponent, options?)`
Creates, mounts, and runs an application in the current terminal window. Handles terminal raw mode, resize listening, mouse tracking, and process exit traps.

```tsx
const handle = await createApp(() => <App />, {
  quit: ["ctrl+c", "q"],
  title: "My Terminal App",
  mouse: true,
})
```

**Options (`CreateAppOptions`):**
- `quit?: string[]` — Key bindings to exit the app (default: `["ctrl+c"]`).
- `title?: string` — Terminal window title.
- `mouse?: boolean` — Enable mouse tracking (default: `true`).
- `targetFps?: number` — Frame rate cap (default: `60`).

### `mountApp(rootComponent, options?)`
Lower-level mounting returning an `AppContext` for programmatic unmounting and manual event loop management.

---

## 2. Intrinsic Primitives

These 4 primitives are the only native elements recognized by Vexart's SolidJS universal reconciler:

### `<box>`
The fundamental layout and rendering container.
- **Default Direction**: `direction="row"` (16:9 widescreen default).
- **Layout Props**:
  - `direction?: "row" | "column"`
  - `width?: number | string` (e.g. `300`, `"100%"`, `"grow"`, `"fit"`)
  - `height?: number | string` (e.g. `200`, `"100%"`, `"grow"`, `"fit"`)
  - `gap?: number` (gap between children)
  - `padding?: number`, `paddingLeft?`, `paddingRight?`, `paddingTop?`, `paddingBottom?`
  - `margin?: number`, `marginLeft?`, `marginRight?`, `marginTop?`, `marginBottom?`
  - `alignX?: "start" | "center" | "end" | "space-between" | "space-around"`
  - `alignY?: "start" | "center" | "end" | "stretch"`
- **Visual Props**:
  - `backgroundColor?: string` (hex, `rgba()`, or theme token e.g. `colors.background`)
  - `borderColor?: string`, `borderWidth?: number`
  - `cornerRadius?: number | [number, number, number, number]` (anti-aliased rounded corners)
  - `shadow?: ShadowConfig`, `glow?: GlowConfig`
  - `backdropBlur?: number` (glassmorphism blur)
- **Interactive Props**:
  - `focusable?: boolean`
  - `onPress?: (e: PressEvent) => void`
  - `onKeyDown?: (e: KeyEvent) => void`
  - `onHover?: (state: HoverState) => void`
  - `hoverStyle?: Partial<BoxProps>`
  - `focusStyle?: Partial<BoxProps>`

### `<text>`
Renders formatted, high-DPI text inside a `<box>`.
- `color?: string` (text fill color)
- `fontSize?: number` (font size in points/pixels)
- `fontWeight?: number | string` (e.g. `400`, `600`, `700`, `"bold"`)
- `fontFamily?: string`
- `lineHeight?: number`
- `textAlign?: "left" | "center" | "right"`

### `<img>`
Renders GPU-decoded images (PNG, JPEG, WebP) directly into the terminal scene graph.
- `src: string` (file path or data URI)
- `width?: number | string`, `height?: number | string`
- `fit?: "contain" | "cover" | "fill"`

### `<canvas>`
Allows 2D raster drawing uploaded directly to WGPU textures.
- `draw: (ctx: CanvasContext) => void`

---

## 3. Void Design System Components

### `<VoidButton>`
- `variant?: "primary" | "secondary" | "destructive" | "outline" | "ghost" | "link"`
- `size?: "default" | "sm" | "lg" | "icon"`
- `onPress?: (e: PressEvent) => void`
- `disabled?: boolean`
- `children?: JSX.Element`

### `<VoidInput>`
- `value: string`
- `onChange?: (val: string) => void`
- `onSubmit?: (val: string) => void`
- `placeholder?: string`
- `disabled?: boolean`
- `width?: number | string`

### `<VoidCard>`, `<VoidCardHeader>`, `<VoidCardTitle>`, `<VoidCardDescription>`, `<VoidCardContent>`, `<VoidCardFooter>`
Compound card composition for structured interfaces.

### `<VoidBadge>`
- `variant?: "default" | "secondary" | "outline" | "destructive"`
- `children?: JSX.Element`

### `<VoidTabs>`
- `activeTab: number`
- `onTabChange?: (index: number) => void`
- `tabs: { label: string, content: () => JSX.Element }[]`
- `variant?: "default" | "line"`

### `<VoidSelect>`
- `value?: string`
- `onChange?: (val: string) => void`
- `options: { label: string, value: string, disabled?: boolean }[]`
- `placeholder?: string`
- `disabled?: boolean`

### `<VoidDialog>`
Compound modal dialog with backdrop blur:
- `<VoidDialog onClose={() => ...}>`
- `<VoidDialog.Title>...</VoidDialog.Title>`
- `<VoidDialog.Description>...</VoidDialog.Description>`
- `<VoidDialog.Footer>...</VoidDialog.Footer>`

### `<VoidCheckbox>` & `<VoidSwitch>`
- `checked: boolean`
- `onChange?: (checked: boolean) => void`
- `disabled?: boolean`

### `<VoidSlider>`
- `value: number`
- `onChange?: (val: number) => void`
- `min?: number`, `max?: number`, `step?: number`

---

## 4. Typography Components

Pre-styled text wrappers:
- `<H1>` — 24px Bold heading
- `<H2>` — 20px SemiBold heading
- `<H3>` — 18px SemiBold heading
- `<H4>` — 16px Medium heading
- `<P>` — 14px Regular body text
- `<Lead>` — 16px Muted lead paragraph
- `<Small>` — 12px Fine print
- `<Muted>` — 14px Muted text
- `<Code>` — Monospace inline code badge

---

## 5. Hooks & Reactivity

### `useTerminalDimensions()`
Returns reactive accessors for the terminal size:
```tsx
const dims = useTerminalDimensions()
// dims.width() -> pixel width
// dims.height() -> pixel height
// dims.cols() -> character columns
// dims.rows() -> character rows
```

### `useFocus(options?)`
Manages keyboard focus for complex custom controls:
```tsx
const focus = useFocus({ id: "my-input" })
// focus.isFocused() -> boolean
// focus.focus() -> sets focus
// focus.blur() -> clears focus
```

### `useQuery(key, fetcher, options?)`
Declarative data fetching hook with automatic caching and error states:
```tsx
const query = useQuery(["users"], fetchUsers)
// query.data() -> T | undefined
// query.loading() -> boolean
// query.error() -> Error | undefined
// query.refetch() -> Promise<void>
```

### SolidJS Core Reactivity
Re-exported directly from `"vexart"`:
- `createSignal(initialValue)`
- `createMemo(computeFn)`
- `createEffect(effectFn)`
- `onMount(mountFn)`
- `onCleanup(cleanupFn)`
- `<Show when={condition} fallback={fallback}>...</Show>`
- `<For each={list}>{(item, index) => ...}</For>`
- `<Switch fallback={fallback}><Match when={...}>...</Match></Switch>`

