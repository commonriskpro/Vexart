# vexart

## 0.10.0

### Minor Changes

- a2162c9: Decouple Tree-sitter from engine via Highlighter inversion of control, adopt CSS Flexbox row layout default for 16:9 widescreen terminals, and enforce unified barrel imports.

### Patch Changes

- 7f1ded1: Establish first-class `packages/vexart` umbrella package and initialize automated Changesets release workflow.
- b08c92f: Add fallback WGPU adapter support for headless CI environments in native libvexart and streamline CI pipelines.
- Updated dependencies [a2162c9]
- Updated dependencies [b08c92f]
  - @vexart/engine@0.9.0
  - @vexart/headless@0.9.0
  - @vexart/styled@0.9.0
  - @vexart/app@0.9.0
