# API Reference

Complete reference for every TGE package. Each package can be used independently.

---

## @tge/terminal

Terminal detection, capability probing, lifecycle management, and raw I/O.

### `createTerminal(opts?): Promise<Terminal>`

Main entry point. Detects the terminal emulator, probes capabilities, enters raw mode, enables mouse tracking, and returns a `Terminal` object.

```typescript
const terminal = await createTerminal()
// terminal is now in raw mode with mouse tracking enabled
```

**Options:**

```typescript
type TerminalOptions = {
  stdin?: ReadableStream      // Default: process.stdin
  stdout?: WritableStream     // Default: process.stdout
  skipProbe?: boolean         // Skip active capability probing
  skipColors?: boolean        // Skip color query
  probeTimeout?: number       // Probe timeout in ms (default: 1000)
}
```

**Returns: `Terminal`**

```typescript
type Terminal = {
  kind: TerminalKind          // Detected emulator (kitty, ghostty, wezterm, etc.)
  caps: Capabilities          // Resolved capabilities
  size: TerminalSize          // Current dimensions
  bgColor: number             // Background color (packed RGBA u32)
  fgColor: number             // Foreground color (packed RGBA u32)
  isDark: boolean             // Whether the terminal is dark-themed

  write(data: string): void          // Write string to stdout
  rawWrite(data: Uint8Array): void   // Write raw bytes to stdout
  writeBytes(data: Uint8Array): void // Alias for rawWrite

  beginSync(write: Function): void   // Begin synchronized output frame
  endSync(write: Function): void     // End synchronized output frame

  onResize(handler: ResizeHandler): () => void   // Subscribe to resize
  onData(handler: (data: Buffer) => void): () => void  // Subscribe to stdin

  destroy(): void             // Leave raw mode, restore terminal
}
```

### `TerminalSize`

```typescript
type TerminalSize = {
  cols: number          // Terminal columns
  rows: number          // Terminal rows
  pixelWidth: number    // Terminal width in pixels
  pixelHeight: number   // Terminal height in pixels
  cellWidth: number     // Single cell width in pixels
  cellHeight: number    // Single cell height in pixels
}
```

### `Capabilities`

```typescript
type Capabilities = {
  kittyGraphics: boolean     // Kitty graphics protocol support
  kittyPlaceholder: boolean  // Kitty Unicode placeholder support
  sixel: boolean             // Sixel graphics support
  truecolor: boolean         // 24-bit color support
  mouseTracking: boolean     // Mouse event support
  focusEvents: boolean       // Focus in/out events
  bracketedPaste: boolean    // Bracketed paste mode
  syncOutput: boolean        // Synchronized output mode
}
```

### Standalone Functions

```typescript
detect(): TerminalKind                      // Detect terminal emulator
inferCaps(kind: TerminalKind): Capabilities // Infer caps from environment
getSize(stdout): TerminalSize               // Get terminal dimensions
enter(write, rawWrite, caps): void          // Enter TGE mode manually
leave(write, rawWrite, caps): void          // Leave TGE mode manually
beginSync(write): void                      // Begin synchronized frame
endSync(write): void                        // End synchronized frame

// Tmux support
inTmux(): boolean                           // Detect tmux
parentTerminal(): TerminalKind              // Resolve parent terminal in tmux
passthroughSupported(): boolean             // Check tmux passthrough
createWriter(rawWrite): Function            // Create tmux-aware writer
wrapPassthrough(data: string): string       // Wrap in tmux passthrough
```

---

## @tge/input

Parse raw terminal bytes into semantic keyboard, mouse, focus, and paste events.

### `createParser(handler): InputParser`

Creates an input parser. Feed raw stdin bytes, get semantic events.

```typescript
import { createParser, type InputEvent } from "@tge/input"

const parser = createParser((event: InputEvent) => {
  if (event.type === "key") {
    console.log("Key:", event.key, "Mods:", event.mods)
  }
})

// Feed raw stdin data
process.stdin.on("data", (data) => parser.feed(data))

// Cleanup
parser.destroy()
```

### Event Types

```typescript
type InputEvent = KeyEvent | MouseEvent | FocusEvent | PasteEvent | ResizeEvent

type KeyEvent = {
  type: "key"
  key: string         // Key name: "a", "enter", "escape", "up", "f1", etc.
  char?: string       // Printable character (if applicable)
  mods: Modifiers     // { shift, ctrl, alt, meta }
}

type MouseEvent = {
  type: "mouse"
  x: number           // Column (0-based)
  y: number           // Row (0-based)
  button: number      // Button number
  action: MouseAction // "press" | "release" | "move" | "scroll"
  mods: Modifiers
}

type FocusEvent = {
  type: "focus"
  focused: boolean    // true = focus in, false = focus out
}

type PasteEvent = {
  type: "paste"
  text: string        // Pasted text content
}

type ResizeEvent = {
  type: "resize"
}

type Modifiers = {
  shift: boolean
  ctrl: boolean
  alt: boolean
  meta: boolean
}
```

### Standalone Functions

```typescript
parseKey(data: Buffer): KeyEvent | null      // Parse a single key sequence
parseMouse(data: Buffer): MouseEvent | null  // Parse a mouse event
decodeMods(n: number): Modifiers             // Decode modifier bitmask
```

### Constants

```typescript
const NO_MODS: Modifiers = { shift: false, ctrl: false, alt: false, meta: false }
```

---

## @tge/pixel

Pixel buffer management and SDF paint primitives. The paint functions call into Zig via `bun:ffi`.

### Buffer Management

```typescript
import { create, clear, clearRect, get, set, sub, resize, rgba, pack, alpha } from "@tge/pixel"

// Create a pixel buffer (RGBA, 4 bytes per pixel)
const buf = create(800, 600)

// Clear entire buffer (transparent black by default)
clear(buf)
clear(buf, 0x1a1a26ff)     // Clear with a color

// Clear a region
clearRect(buf, 10, 10, 100, 50)

// Read/write individual pixels
const color = get(buf, 50, 50)    // Returns packed RGBA u32
set(buf, 50, 50, 0xff0000ff)      // Set pixel to red

// Create a sub-buffer view (shares memory)
const region = sub(buf, 10, 10, 200, 100)

// Resize
const bigger = resize(buf, 1024, 768)

// Color utilities
const [r, g, b, a] = rgba(0x4fc4d4ff)    // Unpack u32 → [r, g, b, a]
const packed = pack(0x4f, 0xc4, 0xd4, 0xff)  // Pack → u32
const semiTransparent = alpha(0x4fc4d4ff, 0x80)  // Modify alpha
```

### `PixelBuffer` Type

```typescript
type PixelBuffer = {
  data: Uint8Array    // Raw RGBA pixel data
  width: number       // Buffer width in pixels
  height: number      // Buffer height in pixels
}
```

### Paint Primitives

All paint functions operate on a `PixelBuffer` and use SDF anti-aliasing. Colors are passed as individual `r, g, b, a` bytes (0–255).

```typescript
import { paint } from "@tge/pixel"

// Solid rectangle (no corner radius)
paint.fillRect(buf, x, y, width, height, r, g, b, a)

// Rounded rectangle (SDF anti-aliased corners)
paint.roundedRect(buf, x, y, width, height, r, g, b, a, cornerRadius)

// Stroked (outline) rounded rectangle
paint.strokeRect(buf, x, y, width, height, r, g, b, a, cornerRadius, strokeWidth)

// Filled ellipse (circle when rx === ry)
paint.filledCircle(buf, centerX, centerY, radiusX, radiusY, r, g, b, a)

// Stroked ellipse
paint.strokedCircle(buf, centerX, centerY, radiusX, radiusY, r, g, b, a, strokeWidth)

// Anti-aliased line
paint.line(buf, x0, y0, x1, y1, r, g, b, a, lineWidth)

// Quadratic Bezier curve
paint.bezier(buf, x0, y0, controlX, controlY, x1, y1, r, g, b, a, lineWidth)

// Box blur (3 passes ≈ Gaussian)
paint.blur(buf, x, y, width, height, blurRadius, passes?)

// Radial glow/halo
paint.halo(buf, centerX, centerY, radiusX, radiusY, r, g, b, a, intensity)

// Linear gradient fill
paint.linearGradient(buf, x, y, width, height, r0, g0, b0, a0, r1, g1, b1, a1, angleDegrees)

// Radial gradient fill
paint.radialGradient(buf, centerX, centerY, radius, r0, g0, b0, a0, r1, g1, b1, a1)

// Bitmap text rendering (SF Mono 14px embedded atlas)
paint.drawText(buf, x, y, text, r, g, b, a)

// Measure text width in pixels (no rendering)
const width = paint.measureText(text)
```

### Compositing

```typescript
import { over, withOpacity } from "@tge/pixel"

// Alpha composite src over dst at position (x, y)
over(dst, src, x, y)

// Apply uniform opacity to entire buffer
withOpacity(buf, 0.5)    // 50% opacity
```

### Dirty Tracking

```typescript
import { createTracker, type DirtyRect, type DirtyTracker } from "@tge/pixel"

const tracker = createTracker()
// tracker.mark(x, y, w, h)
// tracker.isDirty()
// tracker.reset()
// tracker.bounds()
```

---

## @tge/output

Convert pixel buffers to terminal output using the best available backend.

### `createComposer(write, rawWrite, caps): Composer`

Create an output composer. Automatically selects the best backend based on terminal capabilities.

```typescript
import { createComposer } from "@tge/output"

const composer = createComposer(term.write, term.rawWrite, term.caps)

// Render a pixel buffer to the terminal
composer.render(buf, col, row, cols, rows, cellWidth, cellHeight)

// Check selected backend
console.log(composer.backend)  // "kitty" | "placeholder" | "halfblock"

// Cleanup
composer.destroy()
```

### `createLayerComposer(...): LayerComposer`

Multi-image layer compositor for per-component dirty tracking. Each layer gets its own Kitty image — only dirty layers retransmit.

```typescript
import { createLayerComposer } from "@tge/output"
```

> This is used internally by `@tge/renderer`. For most use cases, the `layer` prop on `<Box>` is sufficient.

### Backend Selection

| Capabilities | Backend | How |
|-------------|---------|-----|
| `kittyGraphics: true` + direct terminal | `kitty` | Single image, direct placement |
| `kittyGraphics: true` + tmux | `placeholder` | Unicode placeholder characters |
| Neither | `halfblock` | Upper/lower half block characters (▀) |

---

## @tge/renderer

SolidJS reconciler + Clay layout engine integration. This is the bridge that turns JSX into pixels.

### `mount(component, terminal): () => void`

**The main entry point for JSX apps.** Creates the render loop, mounts the SolidJS component tree, connects keyboard/mouse input, and starts the 30fps render loop.

Returns a cleanup function.

```typescript
import { mount } from "@tge/renderer"
import { createTerminal } from "@tge/terminal"

function App() {
  return <Box><Text>Hello</Text></Box>
}

const terminal = await createTerminal()
const cleanup = mount(App, terminal)

// Later: cleanup() to unmount and restore terminal
```

### `createRenderLoop(terminal): RenderLoop`

Create the render loop manually for advanced use cases.

### `markDirty(): void`

Manually mark the render loop as dirty, triggering a repaint on the next frame.

### `useQuery(fetcher, options?)` and `useMutation(mutator, options?)`

Data fetching hooks. See [Hooks & Signals](hooks.md#usequery) for full API.

```typescript
import { useQuery, useMutation } from "@tge/renderer"
```

### `createTransition(signal, options?)` and `createSpring(signal, options?)`

Animation primitives. See [Hooks & Signals](hooks.md#createtransition) for full API.

```typescript
import { createTransition, createSpring } from "@tge/renderer"
```

### `PressEvent`

Event object passed to `onPress` handlers. Supports event bubbling with `stopPropagation()`.

```typescript
import type { PressEvent } from "@tge/renderer"

type PressEvent = {
  stopPropagation: () => void
  readonly propagationStopped: boolean
}

// Usage in onPress
<box onPress={(event) => {
  event?.stopPropagation()  // prevent bubbling to parent
  doAction()
}} />
```

`onPress` events bubble up the parent node chain like DOM click events. Call `stopPropagation()` to prevent the event from reaching ancestor handlers.

### `pushFocusScope(): () => void`

Create a focus trap (used by Dialog internally). Returns a cleanup function.

```typescript
import { pushFocusScope } from "@tge/renderer"
import { onCleanup } from "solid-js"

function Modal() {
  const pop = pushFocusScope()
  onCleanup(pop)
  return <>{/* only focusable elements here receive Tab */}</>
}
```

### `useFocus(opts?)`, `setFocus(id)`, `focusedId()`, `setFocusedId(id)`

Focus management. See [Hooks & Signals](hooks.md#usefocus) for full API.

### SolidJS Control Flow

Re-exported from SolidJS for convenience:

```typescript
import { For, Show, Switch, Match, Index, ErrorBoundary } from "@tge/renderer"

// Conditional rendering
<Show when={visible()}>
  <Box><Text>Visible!</Text></Box>
</Show>

// List rendering
<For each={items()}>
  {(item) => <Text>{item.name}</Text>}
</For>
```

### SolidJS Reconciler Primitives

These are re-exported for the Babel plugin. You generally don't call these directly:

```typescript
createComponent, createElement, createTextNode, insertNode,
insert, spread, setProp, mergeProps, effect, memo, use
```

---

## Zig FFI Exports (Low-Level)

The Zig shared library (`libtge.dylib` / `libtge.so`) exposes 30+ C-ABI functions. They're wrapped by `@tge/pixel`'s `paint` namespace — you don't need to call these directly unless building a custom renderer.

**ARM64 ABI safety:** All functions use ≤8 parameters. Extra params are packed into a shared `ArrayBuffer` (zero allocations per call).

| Export | Description |
|--------|-------------|
| `tge_fill_rect` | Solid rectangle fill (8 params — no packing needed) |
| `tge_rounded_rect` | SDF anti-aliased rounded rectangle |
| `tge_stroke_rect` | Stroked rounded rectangle |
| `tge_rounded_rect_corners` | Per-corner radius fill |
| `tge_stroke_rect_corners` | Per-corner radius stroke |
| `tge_filled_circle` | Filled ellipse |
| `tge_stroked_circle` | Stroked ellipse |
| `tge_line` | Anti-aliased line segment |
| `tge_bezier` | Quadratic Bezier curve |
| `tge_blur` | Multi-pass box blur (3-pass ≈ Gaussian) |
| `tge_inset_shadow` | Inset shadow (SDF-based, packed params) |
| `tge_halo` | Radial glow effect |
| `tge_linear_gradient` | Two-stop linear gradient fill |
| `tge_radial_gradient` | Two-stop radial gradient fill |
| `tge_linear_gradient_multi` | Multi-stop linear gradient (stops via pointer) |
| `tge_radial_gradient_multi` | Multi-stop radial gradient |
| `tge_conic_gradient` | Conic/angular gradient |
| `tge_gradient_stroke` | Gradient border stroke |
| `tge_filter_brightness` | Backdrop brightness filter |
| `tge_filter_contrast` | Backdrop contrast filter |
| `tge_filter_saturate` | Backdrop saturation filter |
| `tge_filter_grayscale` | Backdrop grayscale filter |
| `tge_filter_invert` | Backdrop color invert filter |
| `tge_filter_sepia` | Backdrop sepia filter |
| `tge_filter_hue_rotate` | Backdrop hue rotation filter |
| `tge_blend_mode` | CSS blend modes (16 modes: multiply, screen, overlay…) |
| `tge_draw_text` | Bitmap text rendering (built-in SF Mono atlas) |
| `tge_measure_text` | Text width measurement |
| `tge_load_font_atlas` | Load runtime font atlas (id 1-15) |
| `tge_draw_text_font` | Text with specific runtime font |
