# TGE GPU-First Renderer Design

## Goal

Definir la arquitectura completa para llevar TGE a un modelo **GPU-first real**:

1. mantener JSX / TGENode / Clay / input intactos,
2. mover la mayor parte posible del `paint` a GPU,
3. cruzar a bytes CPU-visibles **una sola vez y lo más tarde posible**,
4. preservar fallback CPU mientras la migración se completa,
5. evitar seguir abriendo micro-caminos inconexos.

Este documento reemplaza la idea de “optimizar sólo canvas” como dirección principal.

---

## Executive summary

La evidencia actual ya es suficiente para cambiar de estrategia:

- el canvas/graph de Lightcode ya demostró que puede beneficiarse de WGPU,
- el cuello restante de stage 5 está principalmente en el paint CPU de panels/chrome,
- Kitty **no** acepta texturas GPU nativas, así que el objetivo correcto es:

> mantener todo el frame posible en GPU, y hacer un único cruce a RGBA al final.

### Decisión

TGE debe evolucionar desde:

```txt
Clay RenderCommands
  → paintCommand() CPU
    → Layer buffers CPU
      → Kitty upload
```

hacia:

```txt
Clay RenderCommands + Canvas commands
  → GPU scene collector
    → GPU layer targets
      → GPU compositing
        → single late readback RGBA
          → Kitty raw transmit / layer upload
```

---

## Current state (verified)

## What already exists

- WGPU native bridge functional for offscreen rendering.
- Hybrid WGPU canvas backend for `CanvasContext`.
- Raw Kitty output path:
  - `kitty.transmitRaw()`
  - `kitty.transmitRawAt()`
  - `LayerComposer.renderLayerRaw()`
- Lightcode WGPU harness separated from CPU baseline.

## What is still CPU-only

The heavy renderer path in `packages/renderer/src/loop.ts -> paintCommand()` still handles on CPU:

- generic `RECTANGLE`
- `BORDER`
- box gradients
- glow/shadow for generic boxes
- backdrop filters
- rounded rect masking
- generic text paint for UI
- image fit/mask path for generic `<img>`
- subtree transform fallback paths

## Measured reality

Stage 5 frame breakdown showed:

- layout is not the bottleneck,
- Kitty I/O is not the main gap,
- the dominant cost is still `paint`,
- the canvas backend alone does not explain the total GPU-frame paint cost,
- the remaining hotspot is the chrome/panel renderer path.

---

## Non-negotiable design principles

1. **GPU-first, not GPU-only overnight**
   - CPU fallback stays alive until feature parity is proven.

2. **One late crossing**
   - The frame should stay on GPU until the last possible point.

3. **Same scene graph, different painter**
   - No rewrite of JSX, Clay, focus, input, or layout.

4. **Effect fidelity matters**
   - Do not claim GPU support unless it visually matches enough to replace the CPU path.

5. **Layer semantics stay stable**
   - Existing layer boundaries, z-order, clipping, floating, and partial repaint rules remain authoritative.

6. **Render graph before heroics**
   - We need a clean GPU render graph, not random per-primitive escape hatches.

---

## Architectural target

## Renderer pipeline target

```txt
Solid JSX
  → TGENode tree
    → Clay layout
      → RenderCommands / CanvasCommands
        → RenderGraph builder
          → GPU painter (box/canvas/image/text/effects)
            → GPU layer targets
              → GPU layer compositor
                → late RGBA readback
                  → Kitty raw transmit
```

## New major building blocks

### 1. `RenderGraphBuilder`

New stage between Clay output and actual paint.

Responsibilities:

- consume `RenderCommand[]`
- consume queued metadata (`effectsQueue`, `imageQueue`, `canvasQueue`, text metadata)
- build typed GPU-friendly draw ops grouped by layer
- preserve order, z, clipping, floating, viewport semantics

This is the critical seam. Today `paintCommand()` mixes:

- command interpretation,
- effect resolution,
- raster paint,
- compositing.

That is exactly the wrong place for a GPU-first future.

### 2. `GpuPainterBackend`

Generalized GPU painter for more than canvas.

Responsibilities:

- paint generic renderer ops, not just canvas ops
- own GPU targets per layer
- expose timings for:
  - encode
  - draw
  - readback
  - total

### 3. `GpuLayerComposer`

Layer-aware compositor that works with GPU-rendered layer results.

Responsibilities:

- keep one GPU target per dirty layer or one global target with subregions,
- composite layers in GPU order,
- decide whether to:
  - upload layer-by-layer to Kitty, or
  - flatten everything and upload one final image.

### 4. `OutputBridgeLateReadback`

Single CPU crossing boundary.

Responsibilities:

- read back final RGBA only when needed,
- prefer raw path:
  - `transmitRawAt()`
  - `renderLayerRaw()`
- eventually support dirty-region raw patching where it actually helps.

---

## Render op model

We need to stop thinking in ad-hoc CPU paint branches and move to a typed render-op graph.

## Top-level op families

### A. Box/UI ops

- `fillRect`
- `roundedRect`
- `roundedRectCorners`
- `strokeRect`
- `strokeRectCorners`
- `linearGradientRect`
- `radialGradientRect`
- `imageRect`
- `textSprite`

### B. Effect ops

- `dropShadow`
- `multiShadow`
- `outerGlow`
- `backdropBlur`
- `backdropFilters`
- `opacityComposite`

### C. Scene/canvas ops

- existing `CanvasContext` family
- `rect`
- `circle`
- `polygon`
- `bezier`
- `image`
- `gradient`
- `glow`
- `text`

### D. Composite ops

- `pushScissor`
- `popScissor`
- `pushLayer`
- `popLayer`
- `subtreeTransform`

---

## Layer strategy

## Important design rule

There are two valid GPU-first strategies. We need both in the design, but only one default.

### Strategy 1 — per-layer GPU targets

Each TGE layer boundary renders into its own GPU target.

Pros:

- aligns with existing `LayerComposer`
- preserves dirty-layer semantics
- easier incremental migration

Cons:

- multiple targets / readbacks possible
- still somewhat tied to current layer model

### Strategy 2 — single GPU frame target + logical layers

Render all layers into one final GPU frame in z-order, with layer metadata only for invalidation.

Pros:

- closest to real GPU-first architecture
- one final readback
- less intermediate materialization

Cons:

- more refactor in damage/layer logic
- harder to adopt incrementally

## Decision

Use **Strategy 1 as migration path**, but architect the op model so it can converge into Strategy 2 later.

That means:

- render graph is layer-aware,
- painter API accepts explicit layer targets,
- compositor can later switch to flatten-on-GPU without changing JSX/Clay.

---

## Output strategy

Kitty is not GPU-native.

Therefore the correct end-state is:

```txt
GPU render
  → GPU composite
    → one final late readback
      → raw Kitty upload
```

## Output modes we should support

### Mode A — layered raw upload

Use when dirty-layer economics clearly win.

```txt
GPU layer target
  → readback dirty layer only
    → renderLayerRaw()
```

### Mode B — final frame raw upload

Use when many layers are dirty or compositing complexity dominates.

```txt
GPU final frame target
  → one readback
    → transmitRawAt()
```

## Decision

Keep both available.

The engine should choose based on:

- number of dirty layers,
- total dirty pixel area,
- whether regions overlap heavily,
- whether the frame is effectively “full repaint”.

---

## Text strategy

Text is always where people get sloppy. No.

We need an explicit two-step plan.

### Phase T1 — text as cached raster sprites

- reuse existing font/text raster path
- cache glyph/text runs to GPU textures
- place them as textured quads

Pros:

- fastest path to GPU-first renderer coverage
- consistent enough with existing text
- no full GPU text shaping project

Cons:

- not a pure native GPU text engine
- cache invalidation / atlas management needed

### Phase T2 — glyph atlas driven GPU text

- promote from text-run sprites to glyph-atlas rendering
- preserve layout/text shaping on CPU
- move actual composition fully to GPU

## Decision

Use **T1 first**, then T2 only if text becomes the next bottleneck.

---

## Effects strategy

## Effects to move first

These are the most valuable for Lightcode and generic panels:

1. rounded rect fill/stroke
2. linear/radial gradients
3. glow
4. shadow
5. image quads
6. text sprite quads

## Effects to defer

These are expensive and architecturally trickier:

1. backdrop blur
2. backdrop brightness/contrast/saturate/etc.
3. subtree transform post-pass
4. arbitrary affine transforms for generic UI trees

## Why defer them

Because they imply:

- sampling from already-rendered content,
- dependency ordering between passes,
- intermediate textures,
- more complex invalidation.

They belong in the GPU render graph, but NOT in the first engine cut.

---

## Advanced effects update — retained GPU backdrop direction

The current evidence is now strong enough to make a more specific decision for advanced effects.

### Decision

For backdrop blur / backdrop filters, TGE should **not** continue optimizing the current CPU bridge path as the long-term solution.

The correct direction is:

```txt
render background content
  → materialize/reuse backdrop source surface
    → run backdrop filter pass in GPU
      → composite filtered result into destination target
```

This is effectively a **retained-surface GPU backdrop model**.

### Why this is the right call

This matches the lessons from production renderers:

- **Chromium RenderingNG**
  - separates `transform`, `clip`, `effect`, and `scroll` state,
  - introduces intermediate render passes only when visual effects require them.
- **Flutter BackdropFilter**
  - requires tight clipping,
  - allows shared backdrop keys to collapse repeated backdrop work.
- **Skia ImageFilters**
  - models filters as an explicit DAG with `input`, `compose`, `crop`, `merge`, `matrix transform`.
- **WebRender**
  - treats effect work as render tasks / passes with dependencies, not ad-hoc fallback branches.

### Consequence for TGE

Backdrop is no longer just an `effect` to "support somehow".

It needs:

- explicit backdrop source identity,
- explicit crop/sample/output bounds,
- explicit GPU pass ordering,
- retained source surfaces that can be reused when the sampled background did not change.

This is the first serious step from Etapa 3 into compositor territory, but it is still implementable incrementally.

---

## Minimal property-state model for advanced effects

We do **not** need full Chromium property trees immediately.

But we do need a lightweight equivalent for advanced effects.

### Required state families

- `transformState`
- `clipState`
- `effectState`
- `backdropSource`

### Why

Backdrop correctness and reuse depend on these questions:

1. what content is behind this node?
2. in which coordinate space is that content sampled?
3. what clip limits the effect region?
4. when can a previously materialized backdrop source be reused?

If we keep baking all of this into one flat paint branch, invalidation and correctness will remain fragile.

### Practical first cut

Each advanced render op should carry or reference:

- `transformStateId`
- `clipStateId`
- `effectStateId`
- `backdropSourceKey?`

This is enough to start grouping, invalidating, and reusing backdrop sources without redesigning the entire renderer.

---

## Backdrop effect model

### Required metadata per backdrop op

Each backdrop blur / filter op should have explicit geometry and identity:

- `backdropSourceKey`
- `inputBounds`
- `sampleBounds`
- `outputBounds`
- `clipBounds`
- `filterKind`
- `filterParams`
- `blendMode?`

### Bounds semantics

- `inputBounds`
  - the logical bounds of the element requesting backdrop
- `sampleBounds`
  - the expanded source region needed for the filter kernel
  - for blur, this is larger than the visible output region
- `outputBounds`
  - the pixels that will actually be written back into the destination
- `clipBounds`
  - the hard clip restricting visible results

This is mandatory. Tight clipping and exact crop regions are one of the main performance lessons from Flutter and Skia.

---

## Retained backdrop surface model

### New GPU-side cache family

The GPU backend should introduce a dedicated backdrop cache, conceptually:

```ts
type BackdropSurfaceKey = string

type BackdropSurfaceRecord = {
  key: BackdropSurfaceKey
  sourceHandle: WgpuCanvasImageHandle | WgpuCanvasTargetHandle
  bounds: { x: number; y: number; width: number; height: number }
  generation: number
  dirty: boolean
}
```

The exact handle shape may change, but the semantics matter:

- stable identity,
- source region bounds,
- invalidation generation,
- reuse when background is unchanged.

### Reuse rule

If the backdrop source key and relevant sampled content have not changed, the source surface should be reused rather than recaptured.

### Important warning

Overlapping backdrop consumers must not be incorrectly coalesced.

Shared keys are only valid when they truly sample the same background input under compatible bounds / clip assumptions.

---

## GPU pass graph for retained backdrop

### First practical pass model

The initial retained-backdrop implementation does not need a full final compositor rewrite.

But it **does** need a pass graph for advanced effects:

1. render ordinary content into the current GPU target
2. materialize or reuse a backdrop source surface
3. run the backdrop filter pass from that source region
4. composite the filtered region into the destination target
5. continue with later UI ops

### Why this matters

This moves backdrop from:

- `flush → CPU sync → fallback paint → restart GPU layer`

to:

- `GPU dependency pass with explicit source + explicit composite`

That is the architectural shift we actually need.

---

## Bridge / ABI evolution

The current canvas ABI is too narrow for the full renderer path.

We need a broader ABI family.

## Proposed ABI v2 direction

### Resource lifecycle

- `context_create / destroy`
- `target_create / destroy`
- `image_create / update / destroy`
- `text_texture_create / destroy` (optional; may reuse image)

### Layer lifecycle

- `layer_begin(target, clear, scissor?)`
- `draw_*_batch(...)`
- `layer_end(target)`

### Draw batches

- `draw_rect_batch`
- `draw_rounded_rect_batch`
- `draw_border_batch`
- `draw_gradient_batch`
- `draw_image_batch`
- `draw_textured_quad_batch`
- `draw_glow_batch`
- `draw_shadow_batch`
- `draw_canvas_scene_batch`

### Composite / output

- `composite_layers(target, layer_handles...)`
- `readback_full_rgba(...)`
- `readback_region_rgba(...)`

### Advanced effect / retained-surface operations

- `copy_target_region_to_image(target, rect) -> image_handle`
- `copy_target_region_to_target(src_target, dst_target, src_rect, dst_rect)` (optional)
- `filter_backdrop_blur(target, source_image, sample_rect, output_rect, clip_rect, params...)`
- `filter_backdrop_color(target, source_image, sample_rect, output_rect, clip_rect, params...)`
- `composite_image_region(target, image_handle, src_rect, dst_rect, blend_mode, opacity)`

The exact ABI names may differ, but the missing capability is clear: the bridge must support **sampling an already-rendered GPU region as an explicit source for later effect passes**.

## ABI rules

- caller-owned arrays only
- no callbacks in v2
- opaque handles
- all timings explicit
- errors recoverable to CPU path

---

## Renderer integration plan

## New module layout

### `packages/renderer/src/render-graph.ts`

- converts Clay commands + queues into render ops
- canonical source of truth for GPU/CPU painter inputs

### `packages/renderer/src/gpu-renderer-backend.ts`

- generalized GPU painter backend for renderer layers
- may internally reuse the current WGPU bridge implementation

### `packages/renderer/src/gpu-layer-strategy.ts`

- chooses between:
  - layered upload
  - final-frame upload
  - partial region paths

### `packages/renderer/src/gpu-text-cache.ts`

- caches rasterized text sprites or glyph atlases

### `packages/renderer/src/cpu-renderer-backend.ts`

- adapter over existing `paintCommand()` path
- keeps fallback behavior intact

---

## Migration phases

## Phase G0 — design freeze

- write this design
- freeze architecture vocabulary
- stop adding isolated one-off GPU paths unless they fit this model

## Phase G1 — render graph extraction

- extract command interpretation out of `paintCommand()`
- build a typed render graph that both CPU and GPU backends can consume

### Success condition

- CPU still renders identically,
- `paintCommand()` becomes a backend implementation detail, not the orchestration brain.

## Phase G2 — GPU box foundation

Port to GPU:

- rect / rounded rect / border
- gradients
- image quads
- text sprites

### Success condition

- generic floating panels can render mostly through GPU.

## Phase G3 — GPU effects

Port:

- glow
- shadow

### Success condition

- `ShaderPanel` look can be reproduced without CPU temp-buffer blur path for common cases.

## Phase G4 — GPU compositor

- choose layered GPU targets vs flattened GPU frame dynamically
- wire raw Kitty output path as default for GPU frames

### Success condition

- one late readback in common full-frame cases,
- fewer CPU materializations overall.

## Phase G5 — advanced effects

- backdrop blur/filters via retained source surfaces
- subtree transform graph
- partial-region readback only where it actually wins

### Success condition

- visual parity with current premium effects path,
- no CPU readback/fallback in the normal backdrop path,
- backdrop source reuse exists for stable sampled backgrounds.

## Phase G6 — heuristics / default policy

- define when GPU-first becomes default
- keep CPU fallback for unsupported terminals or bridge failures

---

## What we should NOT do

1. Do not rewrite Clay.
2. Do not chase “GPU direct to Kitty” mythology.
3. Do not keep stacking ad-hoc WGPU exceptions in `paintCommand()`.
4. Do not mix command interpretation and raster logic forever.
5. Do not drop CPU fallback before generic box/effects parity is real.

---

## Risk matrix

## Risk: visual mismatch

Rounded corners, text edges, glows, and shadows may not match CPU exactly.

Mitigation:

- dedicated smokes per primitive/effect,
- A/B screenshot harnesses,
- staged enablement by feature family.

## Risk: readback still dominates

Even after more GPU work, readback can still hurt.

Mitigation:

- layer vs final-frame output heuristics,
- raw upload paths,
- measure every stage separately.

## Risk: bridge complexity explodes

Mitigation:

- typed batched ops only,
- no callback ABI,
- keep Bun side responsible for graph building.

## Risk: text becomes a tar pit

Mitigation:

- sprite/glyph caching first,
- defer full GPU text engine.

---

## Success criteria

This GPU-first initiative is considered successful when all of these are true:

1. Stage 5 Lightcode paint cost drops materially versus the current CPU-heavy panel path.
2. The majority of stage 5 visual commands are rendered through GPU, not just the graph canvas.
3. The main GPU path performs a single late readback in the common case.
4. CPU fallback still works when the bridge is unavailable.
5. The renderer architecture is cleaner than before, not more tangled.

---

## Recommendation

Proceed with a **renderer-wide GPU-first migration**, not more isolated canvas-only optimization.

---

## Browser comparison — why browsers feel fluid

Modern browsers feel fluid NOT just because they "use GPU", but because they avoid redoing work.

### Browser pipeline

```txt
React/DOM updates
  → Style recalculation
  → Layout
  → Display list
  → Raster (tiles/layers)
  → GPU compositor
  → Present to swapchain
```

### TGE current pipeline

```txt
JSX / TGENode
  → Clay layout
  → RenderCommands
  → RenderGraphOp
  → CPU renderer backend / partial GPU backend
  → PixelBuffer / WGPU target
  → readback / terminal upload
  → Kitty
```

### TGE target pipeline

```txt
JSX / TGENode
  → Clay layout
  → RenderGraphOp
  → GPU-first renderer backend general
  → GPU layer composition
  → single late readback
  → Kitty raw output
```

### Key lessons from browsers

1. **Layout is CPU and that is fine**
   - Browsers still do layout on CPU.
   - Our measurements already show Clay/layout is not the main bottleneck.

2. **Fluidity comes from recomposition, not repainting everything**
   - Browsers keep retained layers, tiles, glyph caches, image caches.
   - TGE still repaints/re-mixes too much of the frame.

3. **GPU helps when the pipeline stays continuous**
   - Browsers keep content GPU-side until presentation.
   - TGE still mixes GPU batches, CPU fallback, and readbacks too often.

4. **The real goal is not 'GPU direct to Kitty'**
   - Kitty still wants bytes, not native GPU textures.
   - The correct goal is: **keep the frame GPU-side as long as possible, then cross once late**.

---

## What still prevents browser-like fluidity in TGE

### Already in place

- declarative tree
- separate layout stage
- explicit render graph
- GPU canvas path
- initial GPU renderer backend for generic UI
- layer strategy hooks
- raw Kitty output path

### Still missing

1. **Less interleaved CPU fallback**
   - Unsupported ops still break GPU continuity.

2. **More retained rendering for chrome/panels**
   - Panels still repaint too much.

3. **More continuous GPU composition**
   - We still pay too many passes/readbacks for mixed frames.

4. **Better output economics**
   - Need better choice between layered raw vs final-frame raw.

5. **Better frame pacing**
   - Average ms matters, but consistency matters too.

---

## Fluency roadmap — order of attack

### Highest ROI

1. **Reduce interleaved fallback in generic UI renderer**
   - More `effect` support in GPU.
   - Fewer CPU/GPU boundary breaks.

2. **Improve retained rendering for heavy panels**
   - Avoid repainting stable chrome/editor surfaces unnecessarily.

3. **Move toward more continuous GPU composition**
   - Fewer partial readbacks.
   - Larger contiguous GPU batches/layers.

### Medium ROI

4. **Improve raw output heuristics**
   - Choose layered vs final-frame raw more intelligently.

5. **Advance effect coverage carefully**
   - Especially effect families that reduce expensive CPU panel paint.

### Later / advanced

6. **Backdrop and transform parity on GPU**
   - Necessary for full visual parity, but not the first fluency win.

---

## Practical success condition for 'fluid enough'

TGE will feel meaningfully more browser-like when these are true together:

- most stage-5 chrome/panel paint is GPU-side,
- fallback no longer fragments the frame constantly,
- frame output usually crosses CPU/GPU only once late,
- heavy panels behave more like retained layers than full repaints,
- frame pacing stabilizes instead of spiking from mixed-path orchestration.

## First implementation cut

The first serious implementation wave should be:

1. extract render graph from `paintCommand()`
2. GPU support for generic boxes:
   - rounded rect
   - border
   - gradient
   - image
   - text sprite
3. keep existing canvas WGPU path, but fold it into the same render graph model
4. wire raw output paths for late upload

That is the shortest route toward the end state we actually want.
