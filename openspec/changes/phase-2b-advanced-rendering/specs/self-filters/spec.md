# self-filters Specification

## Purpose

`filter` prop on elements providing blur, brightness, contrast, saturate, grayscale, invert, sepia, and hue-rotate. Reuses the backdrop-filter shader pipeline with the source bound to the element's own paint output.

**PRD trace**: `docs/PRD.md §763-766` (self filters), `docs/PRD.md §12 DEC-008`.
**ARCHITECTURE trace**: `docs/ARCHITECTURE.md §4.1` (`paint/pipelines/filter.rs`, `paint/shaders/self_filter.wgsl`).

## Requirements

### REQ-2B-401: Filter prop on TGEProps

`TGEProps` SHALL include a `filter` prop of type `FilterConfig | undefined`. `FilterConfig` supports: `blur` (px), `brightness` (0-200, 100=unchanged), `contrast` (0-200), `saturate` (0-200), `grayscale` (0-100), `invert` (0-100), `sepia` (0-100), `hueRotate` (0-360 degrees). Multiple filters MAY be combined in a single config object.

#### Scenario: Single blur filter

- GIVEN an element with `filter={{ blur: 4 }}`
- WHEN the element is rendered
- THEN the element's content appears with a Gaussian blur of radius 4px

#### Scenario: Multiple combined filters

- GIVEN an element with `filter={{ blur: 2, brightness: 150, saturate: 50 }}`
- WHEN rendered
- THEN the element's content has blur, increased brightness, and reduced saturation applied

#### Scenario: No filter (default)

- GIVEN an element without the `filter` prop
- WHEN rendered
- THEN no filter processing occurs (zero overhead)

### REQ-2B-402: Self-bound source rendering

The self-filter pipeline SHALL render the element to an isolated GPU target first, then apply the filter shader with that target as the source texture. This reuses `paint/pipelines/backdrop.rs` shader infrastructure but binds the element's own paint output instead of the backdrop.

#### Scenario: Isolated target for filtered element

- GIVEN an element with `filter={{ blur: 8 }}`
- WHEN paint processes the element
- THEN the element is first rendered to an isolated temp target
- AND the blur filter is applied to that temp target
- AND the result is composited onto the parent layer

#### Scenario: Filter does not affect siblings

- GIVEN element A has `filter={{ brightness: 200 }}` and sibling element B has no filter
- WHEN rendered
- THEN only element A appears brighter; element B is unaffected

### REQ-2B-403: Shader pipeline — self_filter.wgsl

`paint/shaders/self_filter.wgsl` SHALL implement the same filter chain as `backdrop_filter.wgsl` (blur, brightness, contrast, saturate, grayscale, invert, sepia, hue-rotate) but reads from a caller-provided source texture rather than sampling the backdrop.

#### Scenario: All filter types supported

- GIVEN seven test elements each with one filter type
- WHEN rendered
- THEN each filter produces the expected visual effect (golden test)

### REQ-2B-404: Filter with other effects

An element with `filter` AND `shadow`, `glow`, or `gradient` SHALL apply effects in order: paint element content → apply shadow/glow → apply gradient → apply self-filter. Blur + color filters compose cleanly; blur + transform requires isolated layer (automatic promotion).

#### Scenario: Filter with shadow

- GIVEN an element with `shadow={{ x: 0, y: 4, blur: 12 }}` and `filter={{ brightness: 150 }}`
- WHEN rendered
- THEN the shadow is painted first, then the brightness filter applies to the entire element including shadow

#### Scenario: Filter promotes to own layer

- GIVEN an element with `filter={{ blur: 4 }}` but no explicit `layer={true}`
- WHEN the layer assignment phase runs
- THEN the element is automatically promoted to its own compositing layer

### REQ-2B-405: Integration with hover/active/focus styles

`hoverStyle`, `activeStyle`, and `focusStyle` MAY include `filter`. When the interactive state activates, the filter transitions to the style's filter value.

#### Scenario: Hover filter transition

- GIVEN an element with `hoverStyle={{ filter: { brightness: 120 } }}`
- WHEN the cursor enters the element
- THEN the element's brightness increases to 120
