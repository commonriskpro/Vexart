# Vexart LLM Code Map

**Target Audience**: Autonomous AI Agents, LLM Subagents, Code Generation Engines, Human Contributors  
**Purpose**: Deterministic $O(1)$ task-to-module routing table. **This is an operational navigation index, NOT an architectural specification.**  
**Invariant**: No exploratory directory crawls, no broad searches (`grep`, `find`, `rg`). Look up the task, start at the specified entry point, traverse in exact order, and run the focused verification command.

---

## 1. Mandatory Reading Order

When initializing context or embarking on an autonomous task, follow this exact sequence:

1. **`AGENTS.md`**: Operating constraints, Non-Solo Invariant (for orchestrators), strict Sub-Agent Star Topology, and Architectural Circuit Breakers (Stop & Ask).
2. **`docs/ARCHITECTURE.md`**: Core architectural philosophy, DEC-014 ownership boundaries (TS scene graph vs. Rust WGPU runtime), and 4-tier layering.
3. **`docs/AI-REFERENCE.md`**: Authoritative technical manual for JSX intrinsics, CSS Grid/Flexbox properties, WGPU shader pipelines, and Kitty presentation flags.
4. **`docs/API-POLICY.md`**: Strict public vs. internal symbol boundaries, SemVer rules, and stability tiers.
5. **`docs/llm-code-map.md`** *(This document)*: Direct $O(1)$ routing table for immediate, targeted execution.

---

## 2. System Architecture & Boundaries Snapshot

```
JSX (SolidJS universal reconciler factory)
  │  No Virtual DOM; components execute ONCE as reactive setup factories.
  ▼
TypeScript Scene Graph (Retained TGENode Tree)
  │  Fine-grained Solid signals mutate node properties directly in place.
  ▼
Flexily Zero-Alloc Layout Engine (packages/internal-flexily)
  │  Synchronized via flex-sync.ts (flex-sync-style, flex-sync-grid, flex-sync-text).
  │  Computes subpixel layout coordinates (Flexbox + CSS Grid) via typed arrays.
  ▼
Render Graph Construction & Traversal (packages/engine/src/loop)
  │  Single DFS traversal (pipeline-traverse, pipeline-clip, pipeline-transform, pipeline-damage).
  │  Compiles layout bounds, MSDF text, and effects into 7 RenderGraphOp kinds.
  ▼
FFI Boundary (bun:ffi — ARM64 limit: ≤ 8 scalar arguments)
  │  gpu-renderer-backend (gpu-context, gpu-target-manager, gpu-op-packer, gpu-text-encoder, gpu-layer-compositor).
  │  Encodes binary GeometryStream and flat contiguous Float32/Uint8Array buffers.
  ▼
Rust/WGPU Native Rendering Boundary (native/libvexart)
  │  native/libvexart/src/lib.rs (180 SLOC crate root) & C-ABI ffi/ (composite, paint, font, kitty, resource, context).
  │  21 hardware-accelerated WGSL pipelines: anti-aliased rects, multi-shadows,
  │  outer glows, linear/radial gradients, MSDF vector text, and backdrop blurs.
  ▼
Kitty Presentation Protocol & POSIX SHM
     Direct TTY: Application Program Command (APC) sequences (\x1b_G...\x1b\\) via kitty/transport.rs (direct_transport.rs, frame_cache.rs).
     tmux (3.4+): DCS passthrough (\x1bPtmux;...\x1b\\) + U+10EEEE placeholders over POSIX SHM
     (native/libvexart/src/kitty/placeholder.rs, placeholder_grid.rs, placeholder_apc.rs; kitty/shm.rs, shm_posix.rs, shm_ring.rs).
```

### Inviolable Domain Ownership (DEC-014)
- **TypeScript Domain Owns**: Universal Solid reconciler, scene graph hierarchy (`TGENode`), component lifecycle, event dispatch, focus/hit-testing, Flexily layout calculation, render graph construction, and canvas 2D CPU rasterization.
- **Rust Domain Owns**: WGPU device/queue management, VRAM texture allocations, WGSL shader compilation, paint passes, multi-pass Gaussian blur (*backdrop-filter*), Kitty graphics protocol encoding, and POSIX Shared Memory (`shm_open`).

---

## 3. Comprehensive Task-to-Module Routing Table

| Task / Concern | Start here (Entry Point) | Then inspect (Traversal Order) | Focused proof (Verification) |
|---|---|---|---|
| **Box props & styles**<br>*(borders, padding, glow, shadow, radii, colors)* | `packages/engine/src/ffi/node-types.ts`<br>(`TGEProps`, `InteractiveStyleProps`) | 1. `packages/engine/src/ffi/node.ts` (property setters)<br>2. `packages/engine/src/loop/pipeline-traverse.ts` (`resolveProps`)<br>3. `packages/engine/src/ffi/render-graph.ts` (`RenderGraphOp`) | `export PATH="$HOME/.bun/bin:$PATH"; bun run test packages/engine/src/reconciler/node.test.ts` |
| **Flexbox layout & sizing**<br>*(flex-grow, shrink, basis, auto margins, wrap)* | `packages/internal-flexily/src/layout-zero.ts`<br>(`calculateLayout`) | 1. `packages/internal-flexily/src/node-zero.ts` (`NodeZero` facade)<br>2. `packages/internal-flexily/src/node-zero-style.ts` & `node-zero-tree.ts`<br>3. `packages/engine/src/ffi/flex-sync.ts`, `flex-sync-style.ts` & `flex-sync-text.ts` (scene-to-flex sync)<br>4. `packages/engine/src/loop/layout-adapter.ts` (retained roots) | `export PATH="$HOME/.bun/bin:$PATH"; bun run test packages/internal-flexily/` |
| **CSS Grid layout**<br>*(grid tracks, fr sizing, minmax, auto-fill, alignment)* | `packages/internal-flexily/src/grid/grid-layout.ts`<br>(`layoutGrid`) | 1. `packages/internal-flexily/src/grid/grid-available-space.ts`<br>2. `packages/internal-flexily/src/grid/grid-item-size.ts`<br>3. `packages/internal-flexily/src/grid/grid-alignment.ts`<br>4. `packages/engine/src/ffi/flex-sync-grid.ts` (scene-to-grid sync)<br>5. `packages/engine/src/ffi/node-layout-grid.test.ts` | `export PATH="$HOME/.bun/bin:$PATH"; bun run test packages/internal-flexily/src/grid/` |
| **Native WGPU paint & shaders**<br>*(WGSL shaders, vertex buffers, pipelines)* | `native/libvexart/src/paint/pipelines/mod.rs`<br>(`PipelineRegistry`) | 1. `packages/engine/src/ffi/gpu-op-packer.ts` (TS binary geometry stream packer)<br>2. `native/libvexart/src/paint/shaders/` (`shape_rect.wgsl`, `shadow.wgsl`)<br>3. `native/libvexart/src/paint/mod.rs` (`PaintContext` & dispatchers)<br>4. `native/libvexart/src/paint/instances.rs` (geometry packing)<br>5. `native/libvexart/src/ffi/paint.rs` (`vexart_paint_submit_geometry`, `vexart_paint_flush_batch`) | `cd native/libvexart && cargo test paint::` |
| **Visual effects & Glassmorphism**<br>*(blur, backdrop-filter, masks, shadows)* | `packages/engine/src/ffi/render-graph.ts`<br>(`BackdropRenderMetadata`, `EffectRenderOp`) | 1. `packages/engine/src/ffi/gpu-composite-ops.ts` (FFI buffers) & `packages/engine/src/loop/effect-hash.ts`<br>2. `packages/engine/src/ffi/gpu-renderer-backend.ts` (`gpu-target-manager.ts`, `gpu-layer-compositor.ts`, `gpu-op-packer.ts`)<br>3. `native/libvexart/src/paint/shaders/backdrop_blur.wgsl`<br>4. `native/libvexart/src/composite/mod.rs` & `native/libvexart/src/composite/` (`effects.rs`, `image_layer.rs`, `copy.rs`, `target_ops.rs`)<br>5. `native/libvexart/src/ffi/composite.rs` (`vexart_composite_create_target`, `vexart_composite_apply_backdrop`) | `export PATH="$HOME/.bun/bin:$PATH"; bun run test packages/engine/src/ffi/render-graph.test.ts` |
| **Kitty graphics & SHM transport**<br>*(APC escapes, POSIX SHM, tmux DCS)* | `packages/engine/src/output/kitty.ts` &<br>`packages/engine/src/ffi/tmux-shm-presentation.ts` | 1. `packages/engine/src/ffi/tmux-shm-lease.ts`, `tmux-shm-apc.ts`, `tmux-shm-client.ts`<br>2. `native/libvexart/src/kitty/transport.rs` (`direct_transport.rs`, `frame_cache.rs` for TTY emission)<br>3. `native/libvexart/src/kitty/shm.rs` (`shm_posix.rs`, `shm_ring.rs` for POSIX `shm_open` pool)<br>4. `native/libvexart/src/kitty/placeholder.rs` (`placeholder_grid.rs`, `placeholder_apc.rs` for U+10EEEE cells)<br>5. `native/libvexart/src/ffi/kitty.rs` (`vexart_kitty_transport_init`, `vexart_kitty_shm_create`, `vexart_kitty_emit_frame`)<br>6. `packages/engine/src/terminal/tmux.ts` (pane detection) | `export PATH="$HOME/.bun/bin:$PATH"; bun run test packages/engine/src/ffi/tmux-shm-presentation.test.ts` |
| **Render loop & dirty regions**<br>*(frame scheduler, damage rects, VSync)* | `packages/engine/src/loop/loop.ts`<br>(`RenderLoop`) | 1. `packages/engine/src/loop/composite.ts` (`composite-damage.ts`, `composite-schedule.ts` for frame composition & scheduling)<br>2. `packages/engine/src/loop/pipeline-traverse.ts` (`pipeline-clip.ts`, `pipeline-transform.ts`, `pipeline-damage.ts`)<br>3. `packages/engine/src/loop/pipeline-damage.ts` & `packages/engine/src/ffi/damage.ts` (damage accumulation)<br>4. `packages/engine/src/loop/paint.ts` (`paint-layer.ts`, `paint-regional.ts` for layer flushing & regional damage painting) | `export PATH="$HOME/.bun/bin:$PATH"; bun run test packages/engine/src/ffi/damage.test.ts` |
| **Text rendering & Vector fonts**<br>*(MSDF glyph atlas, font metrics, wrapping)* | `packages/engine/src/ffi/msdf-font.ts` &<br>`packages/engine/src/ffi/text-layout.ts` | 1. `packages/engine/src/ffi/gpu-text-encoder.ts` (MSDF glyph batching & matrix layout)<br>2. `packages/engine/src/ffi/flex-sync-text.ts` (text intrinsic measurements)<br>3. `native/libvexart/src/font/msdf_atlas.rs` (atlas loader)<br>4. `native/libvexart/src/paint/shaders/msdf_text.wgsl`<br>5. `native/libvexart/src/lib.rs` & `native/libvexart/src/ffi/font.rs` (`vexart_font_load_atlas`, `vexart_font_render_text`, `vexart_font_measure`)<br>6. `packages/internal-atlas-gen/` (offline font tool) | `export PATH="$HOME/.bun/bin:$PATH"; bun run test packages/engine/src/ffi/text-layout.test.ts` |
| **Solid Universal Reconciler**<br>*(createElement, insertNode, focus, hit-test)* | `packages/engine/src/reconciler/reconciler.ts`<br>(`createRenderer` factory) | 1. `packages/engine/src/ffi/node.ts` (`TGENode` hierarchy)<br>2. `packages/engine/src/reconciler/focus.ts` (focus tree & traps)<br>3. `packages/engine/src/reconciler/hit-test.ts` (transform-aware pick)<br>4. `packages/engine/src/public.ts` (exported surface) | `export PATH="$HOME/.bun/bin:$PATH"; bun run test packages/engine/src/reconciler/` |
| **Headless interaction primitives**<br>*(inputs, textarea, markdown, buttons)* | `packages/headless/src/index.ts`<br>(barrel entrypoint) | 1. `packages/headless/src/inputs/input.tsx` & `textarea.tsx`<br>2. `packages/headless/src/inputs/button.tsx`<br>3. `packages/headless/src/display/markdown.tsx`<br>4. `packages/headless/src/containers/scroll-view.tsx` | `export PATH="$HOME/.bun/bin:$PATH"; bun run test packages/headless/` |
| **Styled Void theme & tokens**<br>*(dark semantic palette, void design tokens)* | `packages/styled/src/tokens/tokens.ts`<br>(`voidTheme` semantic palette) | 1. `packages/styled/src/tokens/index.ts`<br>2. `packages/styled/src/components/` (pre-styled components)<br>3. `packages/styled/src/index.ts` (theme getters & variants) | `export PATH="$HOME/.bun/bin:$PATH"; bun run showcase` |
| **App router & navigation**<br>*(nested routes, route manifests, className)* | `packages/app/src/router/router.tsx`<br>(`Router`, `RouteOutlet`) | 1. `packages/app/src/styles/class-name.ts` (Tailwind utility subset)<br>2. `packages/app/src/index.ts` (`createApp`, `mountApp`)<br>3. `packages/vexart/src/index.ts` (unified barrel export) | `export PATH="$HOME/.bun/bin:$PATH"; bun run test packages/app/src/router/` |
| **Packaging & Native compilation**<br>*(distribution bundling, FFI cdylib build)* | `scripts/build-dist.ts` &<br>`package.json` | 1. `native/libvexart/Cargo.toml` (`cdylib` configuration)<br>2. `.github/workflows/build-native.yml` (CI matrix)<br>3. `docs/API-POLICY.md` (public export audits) | `export PATH="$HOME/.bun/bin:$PATH"; bun run typecheck` |

---

## 4. Agent Operational Rules & Anti-Patterns

### Strict Rules for Autonomous Subagents
1. **Never Crawl the Codebase**: If you need to know how borders, shadows, or text rendering work, do not run recursive directory searches. Go to the row in the table above and jump directly to the designated entry point in $O(1)$.
2. **Respect the DEC-014 Boundary**: Never attempt to calculate layout, manage component reactivity, or store scene nodes in Rust. Never attempt to compile WGSL shaders, allocate raw GPU textures, or issue POSIX `shm_open` calls from TypeScript.
3. **Execute Batched Changesets**: Make all related, cohesive edits across your assigned files in a single unified pass. Do not enter micro-edit loops (1 edit $\to$ 1 verify $\to$ 1 edit).
4. **Always Test with the Browser Condition**: When executing TypeScript tests via Bun, always include `--conditions=browser --preload ./solid-plugin.ts` (encapsulated in `bun run test`) to ensure the SolidJS JSX runtime reconciles correctly.
5. **Zero Ad-Hoc Hotfixes**: Never insert magic timeouts (`setTimeout(..., 50)`), hardcoded caps, or empty catch blocks. Fix every defect at its architectural root cause.
