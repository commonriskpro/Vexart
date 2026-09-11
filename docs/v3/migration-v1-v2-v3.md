# Migration, Evolution & Architectural Matrix (v1 → v2 → v3)

This document tracks the technical evolution of the Vexart architecture across Versions 1, 2, and 3. It catalogs purged legacy artifacts, provides an itemized comparison matrix, clarifies corrected API contracts, and documents known architectural limitations in the current codebase.

---

## 1. Itemized Architecture Evolution Matrix

| Architectural Dimension | Version 1 (Pre-PRD / TGE) | Version 2 (PRD Consolidation) | Version 3 (Ground-Truth Current) |
| :--- | :--- | :--- | :--- |
| **Scene Graph Ownership** | Experimental Rust-retained scene graph (DEC-012). | Hybrid transition; TS retained tree with legacy Rust hooks. | **TypeScript-retained scene graph (DEC-014)**. Reconciler, tree walk, and reactive mutations stay in TS for 4.8× faster p95 performance. |
| **Layout Engine** | Native Clay (C) and Taffy (Rust) FFI bindings. | Pure JS Flexily layout engine (Flexbox only). | **Flexily Flexbox + CSS Grid** with subpixel precision, template areas, `minmax()`, `fr` fractions, dense packing, and **atomic writeback validation**. |
| **Native Render Pipelines** | 14 basic 2D quads and curves. | 18 pipelines (added initial blur and gradients). | **All 21 GPU pipelines (`cmd_kind` 0..=20)**, adding Conic Gradients, Backdrop Blur/Filter, Image Masks, MSDF Vector Text, Self-Filters, and Analytic Shadows. |
| **FFI Export Count** | ~30 ad-hoc C ABI exports. | 56 claimed functions (incomplete audit). | **Exactly 62 verified C FFI exports** (`#[no_mangle] extern "C" fn vexart_*`). |
| **Vertex Buffer Strategy** | Reallocated per batch on every frame (severe VRAM thrashing). | Dynamic buffer with basic high-water mark. | **2 MB Base Ring Buffer** with steady-state zero allocations, elastic doubling, and **120-frame decay cooldown**. |
| **Terminal Transports** | Direct stdout ANSI writeback. | Kitty Direct Base64 + experimental POSIX SHM. | **Direct Base64 (4096B zlib) + SHM Ring Buffer + Tmux Unicode Placeholder (`U+10EEEE` + combining marks via DCS passthrough)**. |
| **Primitives Architecture** | Fragmented across `@vexart/primitives` (`Span`, `RichText`, `WrapRow`). | Deprecation announced; partial imports persisted. | **`@vexart/primitives` completely deleted**. Canonical `<Box>` and `<Text>` in `@vexart/app` wrapping engine intrinsics `<box>` and `<text>`. |
| **Reactive Theming** | Full scene graph remount on theme swap. | Reactive signal tokens (`themeColors`). | **Fine-grained getter architecture (`Object.defineProperties`)** with zero-remount swapping, plus `themeVersion` LRU cache invalidation in `className`. |
| **Input Cursor Model** | Text mutation inserting `"│"` at 2Hz (horizontal jitter at 60 FPS). | Cell-based TTY cursor toggle. | **Subpixel Cursor Quad Overlay** positioned via text metrics with zero text mutations and zero idle layout passes. |
| **Developer Tooling** | Manual test scripts. | MCP DevTools with 6 basic tools. | **MCP DevTools Server with 11 tools** (`vexart_status`, `vexart_launch`, `vexart_screenshot`, `vexart_send_key`, `vexart_send_text`, `vexart_click`, `vexart_drag`, `vexart_scroll`, `vexart_get_text`, `vexart_stop`, `vexart_resize`). |

---

## 2. Catalog of Purged Legacy Artifacts

The following packages, components, and functions were permanently removed from the repository:

### 2.1 Deleted Packages
- **`@vexart/primitives`**: Deleted. All layout helpers were migrated or replaced by `@vexart/app` canonical components.
- **Zig / C / Clay / Taffy Bindings**: All experimental C, C++, and Zig bridge layers were deleted (DEC-004).

### 2.2 Deleted UI Components
- **`<Span>`**: Deleted. Use `<text>` intrinsics or nested `<text>` spans inside a parent `<text>`.
- **`<RichText>`**: Deleted. Compose styled text spans using `<text>` with individual color and weight props.
- **`<WrapRow>`**: Deleted. Use `<box flexDirection="row" flexWrap="wrap">` or `<Box className="flex-row flex-wrap">`.
- **`<Accordion>`**: Not implemented. Build collapsible sections with `Tabs` or compound `Button` + `<box>`.

### 2.3 Obsolete FFI Functions
- **`vexart_composite_merge`**: Replaced by granular layer composition and the native layer registry (`vexart_layer_upsert`, `vexart_layer_present_dirty`).
- **Rust Scene Graph FFI (`vexart_scene_*`)**: Deprecated and purged when DEC-014 established the permanent TypeScript scene graph ownership boundary.

---

## 3. Corrected API Signatures & Contract Specifications

Version 3 corrects several signatures that were misdocumented in earlier specifications:

### 3.1 Pointer Drag Hook (`useDrag`)
```typescript
// Verified Ground-Truth Signature:
export function useDrag(opts: DragOptions): DragState

export type DragOptions = {
  onDragStart?: (evt: NodeMouseEvent) => boolean | void
  onDrag: (evt: NodeMouseEvent) => void
  onDragEnd?: (evt: NodeMouseEvent) => void
  disabled?: () => boolean
  interaction?: InteractionBinding
}

export type DragState = {
  dragging: () => boolean
  dragProps: {
    ref: (handle: NodeHandle) => void
    onMouseDown: (evt: NodeMouseEvent) => void
    onMouseMove: (evt: NodeMouseEvent) => void
    onMouseUp: (evt: NodeMouseEvent) => void
  }
}
```

### 3.2 Hover Hook (`useHover`)
```typescript
// Verified Ground-Truth Signature:
export function useHover(opts?: HoverOptions): HoverState

export type HoverOptions = {
  onEnter?: () => void
  onLeave?: () => void
  delay?: number        // Entry delay in milliseconds
  leaveDelay?: number   // Exit delay in milliseconds
  disabled?: () => boolean
}

export type HoverState = {
  hovered: () => boolean
  hoverProps: {
    onMouseOver: (evt: NodeMouseEvent) => void
    onMouseOut: (evt: NodeMouseEvent) => void
  }
}
```

### 3.3 MCP DevTools Tool Inventory
`vexart_get_text` is the registered tool in `packages/internal-devtools/src/server.ts`, taking `{ name: string }` and returning the terminal text content (for reading logs and errors from the running demo window). Furthermore, all mouse tools (`vexart_click`, `vexart_drag`, `vexart_scroll`) take coordinates in **terminal cells (column, row)**, not screen pixels.

---

## 4. Identified Architectural Limitations & Blockers

A rigorous audit of the current codebase identifies two structural architectural constraints that future versions must resolve:

### 4.1 Native Process Singleton Coupling (`SHARED_PAINT` & `_lib`)
- **Limitation**: `native/libvexart/src/lib.rs` maintains static process-wide singletons (`SHARED_PAINT`, `SHARED_RESOURCE`, `SHARED_LAYER_REGISTRY`). Similarly, `@vexart/engine` caches a single `_lib` reference in `vexart-bridge.ts`.
- **Architectural Consequence**: While Vexart supports multiple virtual terminal contexts within a single process for testing, all contexts share the same underlying WGPU device, pipeline cache, and layer registry. True multi-window isolation or running independent GPU contexts requires refactoring `PaintContext` into an explicitly allocated handle (`*mut PaintContext`) passed across every FFI invocation.

### 4.2 Unified Barrel Collision (`Button` Shadowing)
- **Limitation**: The root `"vexart"` barrel re-exports `<Button>` from `@vexart/styled` (themed component).
- **Architectural Consequence**: Developers who import `{ Button } from "vexart"` receive the Void styled button with predefined theme borders, paddings, and colors. To use the unstyled primitive, developers must explicitly import `{ Button as HeadlessButton } from "@vexart/headless"`.
