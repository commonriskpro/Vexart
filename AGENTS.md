# Vexart — GPU-Accelerated Terminal UI Engine

## Authoritative documents

Vexart's source of truth lives in three master documents under `docs/`. When their
guidance conflicts with anything described below, **the master documents win**.

- [`docs/PRD.md`](docs/PRD.md) — product requirements, phased roadmap, decision log.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — target layered package structure and
  native boundary.
- [`docs/API-POLICY.md`](docs/API-POLICY.md) — public vs. internal API rules.

Every change is executed through the SDD workflow under `openspec/` (see
`openspec/README.md`). Legacy pre-PRD documents (`TGE-*`, `MIGRATION-ANALYSIS.md`,
`docs.md`) and superseded companion PRDs have been deleted. See git history for
originals if needed.

## What is Vexart

Vexart is a pixel-native, GPU-accelerated terminal UI engine. Developers write JSX
with SolidJS reconciliation; Vexart renders browser-quality UI in the terminal with
anti-aliased corners, shadows (single + multi), gradients (linear + radial), glow
effects, backdrop blur (glassmorphism), image/canvas support, retained layers, and
per-corner radius.

## Architecture

```
JSX (SolidJS createRenderer)
  → TypeScript scene graph + reactivity (Solid reconciler)
    → TypeScript walk-tree + Flexily layout + render graph + event dispatch
      → Rust libvexart (WGPU paint pipelines + text + image/canvas resources)
        → Rust composite + Kitty encoding + SHM/file/direct transport
          → Terminal
```

Current ownership boundary (DEC-014): TypeScript owns scene graph, reactivity,
walk-tree, layout (Flexily), render graph construction, event dispatch, interaction,
focus, and hit-testing. Rust owns WGPU paint pipelines, compositing, Kitty encoding,
SHM/file/direct transport, image assets, canvas display lists, GPU resources, and
native readback/presentation.

The Rust-retained/native scene graph path is historical only. The active model is a
TypeScript-owned scene graph with a Rust/WGPU native rendering boundary.

## Modules

| Package | Purpose | Status |
| ------- | ------- | ------ |
| `@vexart/engine` | SolidJS reconciler, render loop, hooks, FFI bridge to `libvexart`, terminal lifecycle, input parsing, focus, hit-testing, output transport | ✅ Active |
| `@vexart/primitives` | Primitive JSX wrappers and intrinsic element helpers: `Box`, `Text`, `RichText`, `Span`, `WrapRow`; JSX intrinsic elements include `<box>`, `<text>`, `<image>`, `<canvas>` | ✅ Active |
| `@vexart/headless` | 28 headless components: logic, keyboard/mouse interaction, accessibility contracts, no styling | ✅ Active |
| `@vexart/styled` | Themed components and void theme tokens — dark, shadcn-inspired design system | ✅ Active |
| `@vexart/app` | App framework: router, route manifest helpers, className mapper, app mounting, CLI helpers | ✅ Active |
| `@vexart/internal-atlas-gen` | Internal font atlas generator | ✅ Internal |
| `@vexart/internal-devtools` | Internal MCP devtools server | ✅ Internal |

## Key Dependencies

- **Flexily** — Pure JavaScript layout engine with a Yoga-compatible API and zero
  dependencies. Used from `packages/engine/src/loop/layout-adapter.ts`.
- **SolidJS** (`solid-js/universal`) — `createRenderer` for JSX reconciliation; no VDOM.
- **Rust/WGPU** (`native/libvexart`) — Single native `cdylib` (`libvexart`) for GPU paint
  pipelines, compositing, Kitty encoding, transport, image assets, canvas display lists,
  and GPU resource management.
- **Pretext** (`@chenglou/pretext`) — Text measurement/layout support.
- **Bun** — Runtime, package manager, tests, TypeScript execution, and `bun:ffi` native bridge.

## Current Build Shape

1. **TypeScript front-end**: SolidJS reconciler creates a retained TS node tree.
2. **Layout**: `walkTree` builds a Flexily tree and computes pixel layout in TS.
3. **Render graph**: TS converts layout + resolved props into render graph queues.
4. **Native rendering**: `@vexart/engine` calls `libvexart` via `bun:ffi`.
5. **Presentation**: Rust/WGPU paints and composites targets, then emits Kitty frames,
   layers, or dirty regions through direct/file/SHM transport.

## Style Guide

### General

- Prefer single-word variable names.
- Use `const` over `let`.
- Prefer early returns over `else`.
- Avoid `try/catch` where possible.
- Avoid `any` type.
- Prefer functional array methods over loops when it stays readable.
- Use Bun APIs when possible.

### TypeScript

- Prefer type inference over explicit annotations.
- Avoid destructuring unless it clearly improves readability.
- Avoid mocks in tests — test real implementations.
- Public APIs are explicit named exports; avoid broad `export *` from public surfaces.
- Keep package boundaries aligned with `docs/API-POLICY.md`.

### Rust

- Native boundary lives under `native/libvexart`.
- FFI exports are `#[no_mangle] extern "C"` functions prefixed with `vexart_`.
- Wrap FFI bodies in panic guards and return error codes, not panics, across the boundary.
- Keep packed-buffer FFI patterns where needed to satisfy ARM64 parameter limits.

## Commands

- `bun install` — install dependencies.
- `bun typecheck` — TypeScript type check (`tsc --noEmit`).
- `bun test` — run TypeScript tests.
- `cd native/libvexart && cargo test` — run Rust tests.
- `cd native/libvexart && cargo build --release` — build the Rust native library.
- `bun --conditions=browser run examples/hello.tsx` — run the hello example.
- `bun run showcase` — run comprehensive feature showcase (7 tabs).
- `bun run build:dist` — build npm distribution.

## Visual Effects (Rust/WGPU → JSX)

Visual effects are exposed as JSX props, converted into TypeScript render graph ops,
and executed by the Rust/WGPU native rendering backend through `libvexart`.

| Effect | Prop | Example |
| ------ | ---- | ------- |
| Drop shadow | `shadow={{ x, y, blur, color }}` | `shadow={{ x: 0, y: 4, blur: 12, color: 0x00000060 }}` |
| Multi-shadow | `shadow={[...]}` | Array of shadow objects, painted in order |
| Outer glow | `glow={{ radius, color, intensity? }}` | `glow={{ radius: 20, color: 0x56d4c8ff, intensity: 60 }}` |
| Linear gradient | `gradient={{ type: "linear", from, to, angle? }}` | `gradient={{ type: "linear", from: 0x1a1a2eff, to: 0x0a0a0fff, angle: 90 }}` |
| Radial gradient | `gradient={{ type: "radial", from, to }}` | `gradient={{ type: "radial", from: 0x56d4c8ff, to: 0x00000000 }}` |
| Backdrop blur | `backdropBlur={radius}` | `backdropBlur={12}` — blurs content behind element |
| Backdrop brightness | `backdropBrightness={150}` | `backdropBrightness={150}` — 0=black, 100=unchanged, 200=2x |
| Backdrop contrast | `backdropContrast={120}` | `backdropContrast={120}` — 0=grey, 100=unchanged, 200=high |
| Backdrop saturate | `backdropSaturate={0}` | `backdropSaturate={0}` — 0=grayscale, 100=unchanged |
| Backdrop grayscale | `backdropGrayscale={100}` | `backdropGrayscale={100}` — 0=unchanged, 100=full grayscale |
| Backdrop invert | `backdropInvert={100}` | `backdropInvert={100}` — 0=unchanged, 100=full invert |
| Backdrop sepia | `backdropSepia={50}` | `backdropSepia={50}` — 0=unchanged, 100=full sepia |
| Backdrop hue-rotate | `backdropHueRotate={180}` | `backdropHueRotate={180}` — 0-360 degrees |
| Element opacity | `opacity={0.5}` | `opacity={0.5}` — 0.0-1.0, multiplies alpha of entire element |
| Per-corner radius | `cornerRadii={{ tl, tr, br, bl }}` | `cornerRadii={{ tl: 20, tr: 20, br: 0, bl: 0 }}` |
| Uniform radius | `cornerRadius={n}` / `borderRadius={n}` | `cornerRadius={16}` |
| Self filter | `filter={{ blur, brightness, contrast }}` | `filter={{ blur: 4, brightness: 120 }}` |
| Transform | `transform={{ translateX, rotate, scale }}` | `transform={{ rotate: 8, scale: 1.05 }}` |

### Interactive states

Declarative hover/active/focus styles — no manual signal boilerplate needed:

```tsx
<box
  focusable
  backgroundColor={0x1e1e2eff}
  hoverStyle={{ backgroundColor: 0x2a2a3eff }}
  activeStyle={{ backgroundColor: 0x3a3a4eff }}
  focusStyle={{ borderColor: 0x4488ccff, borderWidth: 2 }}
  onPress={() => save()}
/>
```

Props available in `hoverStyle`/`activeStyle`/`focusStyle`: `backgroundColor`,
`borderColor`, `borderWidth`, `cornerRadius`, `borderRadius`, `shadow`, `boxShadow`,
`glow`, `gradient`, `backdropBlur`, `backdropBrightness`, `backdropContrast`,
`backdropSaturate`, `backdropGrayscale`, `backdropInvert`, `backdropSepia`,
`backdropHueRotate`, `opacity`, `filter`.

### Event bubbling

`onPress` events bubble up the parent node chain like DOM click events. If a child
node does not have `onPress`, the event walks up to the nearest ancestor that does.
Each handler receives a `PressEvent`:

```tsx
// Parent handles click even though child has no onPress
<box focusable onPress={() => handleAction()}>
  <Button>Click me</Button>
</box>

// Child stops propagation — parent never fires
<box onPress={() => closePanel()}>
  <box onPress={(e) => { e?.stopPropagation(); doAction() }}>
    <text>Click me (parent won't fire)</text>
  </box>
</box>
```

### Per-node mouse events

Low-level mouse callbacks dispatch directly to the target node (no bubbling). Each
receives a `NodeMouseEvent`:

```tsx
<box
  onMouseDown={(e) => { startDrag(e); setPointerCapture(nodeId) }}
  onMouseMove={(e) => updateDrag(e)}
  onMouseUp={(e) => endDrag(e)}
/>
```

`NodeMouseEvent`: `{ x, y, nodeX, nodeY, width, height }` — `x/y` are absolute
pixels; `nodeX/nodeY` are relative to the node's layout origin. `width/height` are
the node's layout dimensions, useful for ratio calculations like slider position.

### Interaction props (headless components)

Headless components provide interaction props in their render context. Spread them on
the root element for automatic mouse+keyboard support:

| Component | Context Prop | Value | Purpose |
| --------- | ------------ | ----- | ------- |
| Button | `ctx.buttonProps` | `{ focusable, onPress }` | Click + Enter/Space |
| Checkbox | `ctx.toggleProps` | `{ focusable, onPress }` | Click to toggle |
| Switch | `ctx.toggleProps` | `{ focusable, onPress }` | Click to toggle |
| RadioGroup | `ctx.optionProps` | `{ onPress }` | Click to select option |
| Tabs | `ctx.tabProps` | `{ onPress }` | Click to switch tab |
| List | `ctx.itemProps` | `{ onPress }` | Click to select item |
| Table | `ctx.rowProps` | `{ onPress }` | Click to select row |
| VirtualList | N/A (container-level) | Container handles hover/click internally | Mouse hover + click selection |
| Dialog.Overlay | `onClick` prop | wired to `onPress` | Click overlay to close |

```tsx
import { Button } from "@vexart/headless"

<Button
  onPress={() => save()}
  renderButton={(ctx) => (
    <box {...ctx.buttonProps} padding={8} cornerRadius={6}>
      <text>Save</text>
    </box>
  )}
/>
```

### Pointer capture

Like `Element.setPointerCapture()` in the DOM. When a node captures the pointer, ALL
mouse events route to it regardless of cursor position — essential for drag interactions.

```typescript
import { setPointerCapture, releasePointerCapture } from "@vexart/engine"

setPointerCapture(nodeId)     // Lock — all mouse events go to this node
releasePointerCapture(nodeId) // Unlock — auto-released on button up
```

### Hit-area expansion

Interactive elements have a minimum hit-area of one terminal cell (`cellW × cellH`,
typically 7×13px). This is like mobile's 44px minimum touch target — ensures small
elements (for example, a 12px slider track) are clickable. Only affects hit-testing,
NOT visual rendering.

### Architecture note

```
JSX prop
  → reconciler setProperty / node prop resolution (pre-parse color/sizing/effects once)
    → loop walkTree reads resolved values and Flexily layout output
      → render graph queues
        → vexart_* FFI calls into libvexart (Rust/WGPU)
```

```
onPress event flow (high-level, bubbles):
  mouse click → updateInteractiveStates detects release-while-hovered
    → create PressEvent → walk parent chain:
      → each node: set focus if focusable → call onPress(event) if present
      → stop if event.propagationStopped or reached root

onMouse* event flow (low-level, per-node):
  mouse input → feedPointer (fractional cell→pixel, edge queuing)
    → updateInteractiveStates hit-tests all interactive nodes:
      → onMouseOver/onMouseOut on hover enter/leave
      → onMouseDown/onMouseUp on button press/release edges
      → onMouseMove while hovered (or captured)
      → pointer capture overrides hit-test (captured node always receives events)
```

Effects are painted before the rect (shadow/glow) or instead of a solid fill
(gradient). Backdrop filters read the content behind the element, process it in a
native target/image path, and composite the result without corrupting neighboring pixels.

### Scissor clipping (scroll containers)

All paint primitives respect the active scissor (scroll container bounds):

- Flat rects and rounded rects are clipped to the active scroll viewport.
- Borders and per-corner radius masks respect the active scissor.
- Text is clipped to scroll bounds.
- Backdrop blur/filters clip their sampled region before applying.
- Shadows and glow clip their composite region.

### Interactive nodes auto-RECT

Any node with `onPress`, `focusable`, `hoverStyle`, `activeStyle`, `focusStyle`, or
mouse callbacks automatically gets a near-transparent RECT placeholder (`0x00000001`).
This ensures the node enters hit-testing without requiring explicit `backgroundColor`.
Developers do not need to add a background for interactive elements to be clickable.

### Border space reservation

If `focusStyle`, `hoverStyle`, or `activeStyle` define `borderWidth`, the engine
reserves that space in Flexily with a transparent border when inactive. This prevents
layout jitter when interactive styles activate — equivalent to CSS outline-like behavior.

### Click re-layout (instant feedback)

When a click is dispatched (`onPress` or focus change), the engine re-runs walkTree +
layout in the same frame. This eliminates the visual delay that would otherwise occur
because layout was computed before the click callback mutated the tree.

### Scroll container hit-testing

Nodes fully outside their scroll container ancestor viewport are skipped during
hit-testing. This prevents off-screen items from receiving false hover/click events at
overlapping screen coordinates. The scroll container itself is NOT skipped.

## Layout defaults

- Default `<box>` direction is **column** (`TOP_TO_BOTTOM`) — terminal-native vertical flow.
- Use `direction="row"` explicitly for horizontal layout.
- Responsive: terminal resize triggers automatic re-layout via `onResize` → Flexily dimensions.
- `width`/`height` support fixed numbers, `"grow"`, `"fit"`, and percentage strings.

## Element Props — Complete reference (`TGEProps`, legacy type name)

The public TypeScript type is currently named `TGEProps` for compatibility, but it
describes Vexart element props.

### Layout

| Prop | Type | Default | Notes |
| ---- | ---- | ------- | ----- |
| `direction` | `"row" \| "column"` | `"column"` | Flex direction |
| `flexDirection` | `"row" \| "column"` | — | Alias for direction |
| `padding` | `number` | — | Uniform padding |
| `paddingX` / `paddingY` | `number` | — | Axis padding |
| `paddingLeft/Right/Top/Bottom` | `number` | — | Per-side padding |
| `margin` | `number` | — | Uniform margin |
| `marginX` / `marginY` | `number` | — | Axis margin |
| `marginLeft/Right/Top/Bottom` | `number` | — | Per-side margin |
| `gap` | `number` | — | Child gap |
| `alignX` | `"left" \| "right" \| "center" \| "space-between"` | `"left"` | Horizontal alignment |
| `alignY` | `"top" \| "bottom" \| "center" \| "space-between"` | `"top"` | Vertical alignment |
| `justifyContent` | same as alignX + `"flex-start" \| "flex-end"` | — | Alias for alignX |
| `alignItems` | same as alignY + `"flex-start" \| "flex-end"` | — | Alias for alignY |

### Sizing

| Prop | Type | Notes |
| ---- | ---- | ----- |
| `width` / `height` | `number \| string` | number=fixed, `"grow"`, `"fit"`, `"100%"` |
| `flexGrow` | `number` | Makes width behave as grow for compatibility |
| `flexShrink` | `number` | Accepted for compatibility |
| `minWidth` / `maxWidth` | `number` | Constraints |
| `minHeight` / `maxHeight` | `number` | Constraints |

### Visual

| Prop | Type | Notes |
| ---- | ---- | ----- |
| `backgroundColor` | `string \| number` | `"#ff0000"` or `0xff0000ff` |
| `cornerRadius` | `number` | Uniform radius |
| `borderRadius` | `number` | CSS-friendly alias for cornerRadius |
| `cornerRadii` | `{ tl, tr, br, bl }` | Per-corner radius |
| `borderColor` | `string \| number` | — |
| `borderWidth` | `number` | Uniform border |
| `borderLeft/Right/Top/Bottom` | `number` | Per-side border |
| `borderBetweenChildren` | `number` | Between children |
| `opacity` | `number` | 0.0-1.0, element-level opacity |
| `style` | `Partial<TGEProps>` | CSS-style prop merged under direct props |

### Effects

| Prop | Type | Notes |
| ---- | ---- | ----- |
| `shadow` | `object \| array` | Drop shadow(s) |
| `boxShadow` | same as `shadow` | CSS-friendly alias |
| `glow` | `{ radius, color, intensity? }` | Outer glow |
| `gradient` | linear or radial config | Gradient fill |
| `backdropBlur` | `number` | Glassmorphism |
| `filter` | `{ blur?, brightness?, contrast?, saturate?, grayscale?, invert?, sepia?, hueRotate? }` | Self-filter for element output |
| `hoverStyle` | partial visual props | Merged on hover |
| `activeStyle` | partial visual props | Merged on active |
| `focusStyle` | partial visual props | Merged on focus |

### Interaction

| Prop | Type | Notes |
| ---- | ---- | ----- |
| `focusable` | `boolean` | Auto-register in focus system (like HTML `tabindex="0"`) |
| `onPress` | `(event?: PressEvent) => void` | Fires on mouse click + Enter/Space when focused. Events bubble up parent chain; call `event.stopPropagation()` to stop. |
| `onKeyDown` | `(event: any) => void` | Keyboard events when focused |
| `interactionMode` | `"none" \| "drag"` | Engine-managed hint for interaction/compositor policies |
| `onMouseDown` | `(event: NodeMouseEvent) => void` | Per-node mouse button pressed |
| `onMouseUp` | `(event: NodeMouseEvent) => void` | Per-node mouse button released |
| `onMouseMove` | `(event: NodeMouseEvent) => void` | Per-node pointer move while hovered or captured |
| `onMouseOver` | `(event: NodeMouseEvent) => void` | Pointer entered node bounds |
| `onMouseOut` | `(event: NodeMouseEvent) => void` | Pointer left node bounds |

### Backdrop Filters

| Prop | Type | Notes |
| ---- | ---- | ----- |
| `backdropBrightness` | `number` | 0=black, 100=unchanged, 200=2x bright |
| `backdropContrast` | `number` | 0=grey, 100=unchanged, 200=high contrast |
| `backdropSaturate` | `number` | 0=grayscale, 100=unchanged, 200=hyper |
| `backdropGrayscale` | `number` | 0=unchanged, 100=full grayscale |
| `backdropInvert` | `number` | 0=unchanged, 100=fully inverted |
| `backdropSepia` | `number` | 0=unchanged, 100=full sepia |
| `backdropHueRotate` | `number` | 0-360 degrees |

### Compositing & Scroll

| Prop | Type | Notes |
| ---- | ---- | ----- |
| `layer` | `boolean` | Own compositing layer |
| `willChange` | `string \| string[]` | Pre-promote hints: `"transform"`, `"opacity"`, `"filter"`, `"scroll"` |
| `contain` | `"none" \| "layout" \| "paint" \| "strict"` | Layout/paint containment hint |
| `scrollX` / `scrollY` | `boolean` | Scroll clipping |
| `scrollSpeed` | `number` | Scroll tick speed |
| `scrollId` | `string` | Stable ID for programmatic scroll |

### Floating

| Prop | Type | Notes |
| ---- | ---- | ----- |
| `floating` | `"parent" \| "root" \| { attachTo }` | Positioning mode |
| `floatOffset` | `{ x, y }` | Offset from attach |
| `zIndex` | `number` | Z-order |
| `floatAttach` | `{ element?, parent? }` | Attach points (0-8 grid) |
| `pointerPassthrough` | `boolean` | Pass-through clicks |
| `viewportClip` | `boolean` | Browser-like viewport clipping for floating layers |

### Transform

| Prop | Type | Notes |
| ---- | ---- | ----- |
| `transform` | object | `translateX/Y`, `rotate`, `scale`, `scaleX/Y`, `skewX/Y`, `perspective`, `rotateX/Y` |
| `transformOrigin` | `"center" \| "top-left" \| "top-right" \| "bottom-left" \| "bottom-right" \| { x, y }` | Transform origin |

### Image and Canvas

| Prop | Type | Notes |
| ---- | ---- | ----- |
| `src` | `string` | Image file path or URL for `<image>`/`<img>` intrinsic |
| `objectFit` | `"contain" \| "cover" \| "fill" \| "none"` | Image fit mode |
| `onDraw` | `(ctx: CanvasContext) => void` | Imperative draw callback for `<canvas>` |
| `drawCacheKey` | `string \| number` | Optional cache key for static canvas draw lists |
| `viewport` | `{ x, y, zoom }` | Canvas pan/zoom viewport |

### Text

| Prop | Type | Notes |
| ---- | ---- | ----- |
| `color` | `string \| number` | Text color |
| `fontSize` | `number` | Font size (px) |
| `fontId` | `number` | Runtime font atlas ID |
| `lineHeight` | `number` | Line height |
| `wordBreak` | `"normal" \| "keep-all"` | — |
| `whiteSpace` | `"normal" \| "pre-wrap"` | — |
| `fontFamily` | `string` | — |
| `fontWeight` | `number` | 400/500/600/700 |
| `fontStyle` | `"normal" \| "italic"` | — |

## Rust FFI exports (`libvexart`)

The native boundary is bound in `packages/engine/src/ffi/vexart-bridge.ts` and
implemented under `native/libvexart/src`. Export names are prefixed with `vexart_`.

| Function | Purpose |
| -------- | ------- |
| `vexart_version` | Return bridge/native ABI version |
| `vexart_context_create` | Create native context handle |
| `vexart_context_destroy` | Destroy native context handle |
| `vexart_context_resize` | Resize context-dependent resources |
| `vexart_paint_dispatch` | Execute packed paint graph into a target |
| `vexart_paint_upload_image` | Upload RGBA image bytes to a GPU image handle |
| `vexart_paint_remove_image` | Release a GPU image handle |
| `vexart_composite_target_create` | Create offscreen composite target |
| `vexart_composite_target_destroy` | Destroy composite target |
| `vexart_composite_target_begin_layer` | Begin layer rendering on target |
| `vexart_composite_target_end_layer` | End layer rendering and submit GPU work |
| `vexart_composite_render_image_layer` | Composite image onto target with z-order |
| `vexart_composite_render_image_transform_layer` | Composite transformed image layer |
| `vexart_composite_update_uniform` | Update transform/opacity uniform for retained target composition |
| `vexart_composite_copy_region_to_image` | Copy target region into a GPU image handle |
| `vexart_composite_image_filter_backdrop` | Apply backdrop blur/filter chain to image |
| `vexart_composite_image_mask_rounded_rect` | Apply rounded-rect mask to image |
| `vexart_composite_merge` | Merge packed composite plan to final target |
| `vexart_composite_readback_rgba` | Read back full target as RGBA |
| `vexart_composite_readback_region_rgba` | Read back target region as RGBA |
| `vexart_text_load_atlas` | Load MSDF atlas PNG + metrics into GPU memory |
| `vexart_text_dispatch` | Dispatch packed MSDF glyph instances |
| `vexart_text_measure` | Measure text with loaded atlas metrics |
| `vexart_kitty_emit_frame` | Emit full Kitty frame |
| `vexart_kitty_set_transport` | Select direct/file/SHM Kitty transport mode |
| `vexart_kitty_shm_prepare` | Prepare POSIX SHM payload |
| `vexart_kitty_shm_release` | Release POSIX SHM handle |
| `vexart_kitty_emit_frame_with_stats` | Emit full frame with native presentation stats |
| `vexart_kitty_emit_layer` | Emit raw RGBA layer natively |
| `vexart_kitty_emit_layer_target` | Emit GPU target as positioned Kitty layer |
| `vexart_kitty_emit_region` | Emit dirty region patch from RGBA bytes |
| `vexart_kitty_emit_region_target` | Emit dirty region patch from GPU target |
| `vexart_kitty_delete_layer` | Delete retained Kitty image/layer |
| `vexart_layer_upsert` | Upsert native layer record by stable key |
| `vexart_layer_mark_dirty` | Mark native layer dirty |
| `vexart_layer_reuse` | Reuse clean native layer in a frame |
| `vexart_layer_remove` | Remove native layer |
| `vexart_layer_clear` | Clear all native layer records |
| `vexart_layer_present_dirty` | Mark dirty layer presented and return terminal image ID |
| `vexart_resource_get_stats` | Read ResourceManager stats as JSON |
| `vexart_resource_set_budget` | Set ResourceManager memory budget |
| `vexart_image_asset_register` | Register/update native image asset |
| `vexart_image_asset_touch` | Touch native image asset for lifetime/resource tracking |
| `vexart_image_asset_release` | Release native image asset |
| `vexart_canvas_display_list_update` | Register/update native canvas display list |
| `vexart_canvas_display_list_touch` | Touch native canvas display list |
| `vexart_canvas_display_list_release` | Release native canvas display list |
| `vexart_get_last_error_length` | Return last native error buffer length |
| `vexart_copy_last_error` | Copy last native error into caller buffer |

FFI calls use Bun's `bun:ffi`; packed buffers are used where needed to keep ABI calls
portable and ARM64-safe.

## `@vexart/engine` exports

### Core

- `createRenderLoop`, `mount`, `createTerminal`

### Renderer backend / native bridge

- `setRendererBackend`, `getRendererBackend`, `getRendererBackendName`
- `createGpuRendererBackend`, `getGpuRendererBackendCacheStats`
- `createGpuFrameComposer`, `chooseGpuLayerStrategy`
- `VEXART_SYMBOLS`, `EXPECTED_BRIDGE_VERSION`, `openVexartLibrary`, `closeVexartLibrary`
- `vexartVersion`, `assertBridgeVersion`, `vexartGetLastError`
- `getRendererResourceStats`

### Reconciler (SolidJS)

- `createComponent`, `createElement`, `createTextNode`, `insertNode`, `insert`, `spread`,
  `setProp`, `mergeProps`, `effect`, `memo`, `use`, `solidRender`

### Control Flow

- `For`, `Show`, `Switch`, `Match`, `Index`, `ErrorBoundary`

### Input and interaction

- `useKeyboard`, `useMouse`, `useInput`, `onInput`, `dispatchInput`
- `useFocus`, `setFocus`, `focusedId`, `setFocusedId`, `pushFocusScope`, `resetFocus`
- `setPointerCapture`, `releasePointerCapture`
- `useDrag`, `useHover`

### Animation

- `createTransition`, `createSpring`, `easing`

### Context

- `createContext`, `useContext`

### Utilities

- `markDirty`, `isDirty`, `clearDirty`, `createHandle`, `createScrollHandle`,
  `releaseScrollHandle`, `resetScrollHandles`
- `registerFont`, `getFont`, `clearTextCache`, `getTextLayoutCacheStats`,
  `getFontAtlasCacheStats`
- `useTerminalDimensions`, `decodePasteBytes`
- `clearImageCache`, `getImageCacheStats`
- `CanvasContext`, `createParticleSystem`, `createLayerStore`

### Router and data

- `useQuery`, `useMutation`
- `createRouter`, `createNavigationStack`, `useRouter`

### Selection

- `getSelection`, `getSelectedText`, `setSelection`, `clearSelection`, `selectionSignal`,
  `resetSelection`

### Debug

- `toggleDebug`, `setDebug`, `isDebugEnabled`, `debugFrameStart`, `debugUpdateStats`,
  `debugState`, `debugStatsLine`, `debugDumpTree`, `debugDumpCulledNodes`

### Plugins

- `createSlotRegistry`, `createSlot`

### Syntax highlighting

- `ExtmarkManager`, `TreeSitterClient`, `getTreeSitterClient`, `addDefaultParsers`
- `SyntaxStyle`, `ONE_DARK`, `KANAGAWA`, `highlightsToTokens`

### Types

- `PressEvent` — `{ stopPropagation: () => void; readonly propagationStopped: boolean }`
- `NodeMouseEvent` — `{ x, y, nodeX, nodeY, width, height }`
- `DragOptions`, `DragProps`, `DragState` — `useDrag` hook types
- `HoverOptions`, `HoverProps`, `HoverState` — `useHover` hook types
- `RendererBackend*`, `RenderGraph*`, `ResourceStats`, `CanvasDrawCommand`, `Matrix3`,
  `DamageRect`, terminal/input/router/selection/debug types

### Classes and constants

- `RGBA` — `.fromHex()`, `.fromInts()`, `.fromValues()`, `.toU32()`, `.valueOf()`, `.toString()`
- `MouseButton` — `{ LEFT, MIDDLE, RIGHT, RELEASE, SCROLL_UP, SCROLL_DOWN }`
- `SIZING`, `DIRECTION`, `ALIGN_X`, `ALIGN_Y`

## `@vexart/primitives`

| Component | Props | Purpose |
| --------- | ----- | ------- |
| `Box` | `BoxProps` | Layout container wrapper around `<box>` |
| `Text` | `TextProps` | Text display wrapper around `<text>` |
| `RichText` | `RichTextProps` | Multi-span text |
| `Span` | `SpanProps` | Inline text span |
| `WrapRow` | `WrapRowProps` | Flex-wrap workaround |

JSX intrinsic elements include `<box>`, `<text>`, `<image>`/`<img>`, and `<canvas>`.

## `@vexart/headless` components

| Component | Props | Purpose |
| --------- | ----- | ------- |
| `Button` | `ButtonProps` | Interactive button (`ctx.buttonProps` for mouse+keyboard) |
| `Checkbox` | `CheckboxProps` | Toggle checkbox (`ctx.toggleProps` for mouse+keyboard) |
| `Combobox` | `ComboboxProps` | Autocomplete with filtering and option selection |
| `Input` | `InputProps` | Single-line text input |
| `RadioGroup` | `RadioGroupProps` | Radio option group (`ctx.optionProps` for click) |
| `Select`, `SelectTrigger`, `SelectContent`, `SelectItem` | select props | Dropdown select with keyboard nav + click selection |
| `Slider` | `SliderProps` | Numeric range input with click-to-position and drag |
| `Switch` | `SwitchProps` | Toggle switch (`ctx.toggleProps` for mouse+keyboard) |
| `Textarea` | `TextareaProps` | Multi-line editor (2D cursor, syntax, keybindings) |
| `Code` | `CodeProps` | Syntax-highlighted code block |
| `Markdown` | `MarkdownProps` | Markdown renderer (inline styling) |
| `ProgressBar` | `ProgressBarProps` | Progress indicator |
| `OverlayRoot` | `OverlayRootProps` | Overlay container root |
| `Portal` | `PortalProps` | Render at root/overlay level |
| `ScrollView` | `ScrollViewProps` | Scrollable container with visual scrollbar |
| `Tabs` | `TabsProps` | Tab switcher (`ctx.tabProps` for click) |
| `List` | `ListProps` | Scrollable list (`ctx.itemProps` for click) |
| `Table` | `TableProps` | Data table with row selection (`ctx.rowProps` for click) |
| `VirtualList` | `VirtualListProps` | Virtualized list with keyboard nav + mouse hover/click |
| `Dialog`, `DialogOverlay`, `DialogContent`, `DialogClose` | dialog props | Modal with focus trap + Escape |
| `Tooltip`, `Popover` | overlay props | Delayed tooltip and controlled popover panel |
| `Diff` | `DiffProps` | Unified diff viewer |
| `Router`, `Route`, `NavigationStack` | router props | Headless navigation primitives |
| `createToaster` | toaster options | Imperative toast notifications |
| `createForm` | form options | Form validation factory |

## `@vexart/styled` — Void design system (shadcn-compatible)

Import:

```typescript
import { Button, Card, Badge, colors, space } from "@vexart/styled"
```

### Tokens

```typescript
colors.background      // 0x141414ff — app background
colors.foreground      // 0xfafafaff — default text
colors.card            // 0x262626ff — elevated surfaces
colors.primary         // 0xe5e5e5ff — brand/actions
colors.secondary       // 0x333333ff — secondary actions
colors.muted           // 0x333333ff — subtle surfaces
colors.mutedForeground // 0xa3a3a3ff — low-emphasis text
colors.accent          // 0x333333ff — hover/focus
colors.destructive     // 0xdc2626ff — errors
colors.border          // 0xffffff1a — borders (white 10%)
colors.input           // 0xffffff26 — input borders (white 15%)
colors.ring            // 0x737373ff — focus rings

radius.sm/md/lg/xl/xxl/full      // 6/8/10/14/18/9999
space[1]..space[10]              // 4..40px
font.xs/sm/base/lg/xl/2xl/3xl/4xl // 10..36px
weight.normal/medium/semibold/bold // 400..700
shadows.sm/md/lg/xl              // preset shadow configs
glows                            // preset glow configs
```

### Theme

- `createTheme`, `darkTheme`, `lightTheme`, `themeColors`
- `setTheme`, `getTheme`, `ThemeProvider`, `useTheme`

### Components

| Component | Variants | Sizes |
| --------- | -------- | ----- |
| `Button` | default, secondary, outline, ghost, destructive | xs, sm, default, lg |
| `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`, `CardAction` | default, sm | — |
| `Badge` | default, secondary, outline, destructive | — |
| `Separator` | horizontal, vertical | — |
| `Avatar` | — | sm, default, lg |
| `Skeleton` | — | — |
| `VoidCheckbox` | — | — |
| `VoidCombobox` | — | — |
| `VoidDialog`, `VoidDialogTitle`, `VoidDialogDescription`, `VoidDialogFooter` | — | — |
| `VoidDropdownMenu`, `VoidDropdownMenuTrigger`, `VoidDropdownMenuContent`, `VoidDropdownMenuItem`, `VoidDropdownMenuSeparator`, `VoidDropdownMenuLabel` | — | — |
| `VoidInput` | — | — |
| `VoidPopover` | — | — |
| `VoidProgress` | — | — |
| `VoidRadioGroup` | — | — |
| `VoidSelect` | — | — |
| `VoidSlider` | — | — |
| `VoidSwitch` | — | — |
| `VoidTable` | — | — |
| `VoidTabs` | default variants | — |
| `VoidTooltip` | — | — |
| `createVoidToaster` | — | — |

### Typography

`H1`, `H2`, `H3`, `H4`, `P`, `Lead`, `Large`, `Small`, `Muted`

## `@vexart/app`

| Export | Purpose |
| ------ | ------- |
| `Page` | App page primitive |
| `Box`, `Text` | App-layer primitive wrappers with className support |
| `resolveClassName`, `mergeClassNameProps`, `CLASS_NAME_UNKNOWN_BEHAVIOR` | className mapper helpers |
| `createAppRouter`, `RouterProvider`, `RouteOutlet`, `useRouter` | App router runtime |
| `discoverAppRoutes`, `routeFilePathToRoutePath`, `writeRouteManifestModule` | File-route manifest helpers |
| `defineConfig`, `mergeConfig` | App config helpers |
| `mountApp` | App lifecycle/mount helper |
| `runCli` | CLI entry helper |

## npm package structure (dist/)

The distribution is built with `bun run build:dist`. Current public package naming is
`@vexart/*` in the monorepo; dist artifacts should reflect the Vexart package boundary
and include the single Rust native library.

```text
dist/
├── package.json
├── engine.js / engine.d.ts              — @vexart/engine bundle + types
├── primitives.js / primitives.d.ts      — @vexart/primitives bundle + types
├── headless.js / headless.d.ts          — @vexart/headless bundle + types
├── styled.js / styled.d.ts              — @vexart/styled bundle + types
├── app.js / app.d.ts                    — @vexart/app bundle + types
├── jsx-runtime.d.ts                     — JSX intrinsic elements
├── solid-plugin.ts                      — Solid JSX transform helper
├── native/
│   └── <platform>/libvexart.{dylib,so,dll}
├── tree-sitter/
│   ├── parser.worker.ts
│   └── assets/                          — .wasm grammars + .scm highlights
└── fonts/                               — generated atlas assets when packaged separately
```

### Expected exports map

```json
{
  ".": { "types": "./engine.d.ts", "default": "./engine.js" },
  "./engine": { "types": "./engine.d.ts", "default": "./engine.js" },
  "./primitives": { "types": "./primitives.d.ts", "default": "./primitives.js" },
  "./headless": { "types": "./headless.d.ts", "default": "./headless.js" },
  "./styled": { "types": "./styled.d.ts", "default": "./styled.js" },
  "./app": { "types": "./app.d.ts", "default": "./app.js" },
  "./jsx-runtime": { "types": "./jsx-runtime.d.ts" },
  "./solid-plugin": "./solid-plugin.ts",
  "./tree-sitter/parser.worker.ts": "./tree-sitter/parser.worker.ts"
}
```

## Reference

- SolidJS universal: https://github.com/solidjs/solid/tree/main/packages/solid/universal
- Flexily package: https://www.npmjs.com/package/flexily
- WGPU: https://wgpu.rs/
- Kitty graphics protocol: https://sw.kovidgoyal.net/kitty/graphics-protocol/
- Bun FFI: https://bun.sh/docs/api/ffi
