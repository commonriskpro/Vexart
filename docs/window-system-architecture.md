# Window System Architecture

The windowing layer is a planned higher-level package for Vexart applications that need draggable, resizable, z-ordered panels. It is not part of the v0.9 core release surface unless explicitly promoted into `@vexart/headless` or `@vexart/styled`.

## Target package

```tsx
import { createWindowManager, Desktop } from "@vexart/windowing"
```

Until that package exists, applications should compose the public primitives and hooks directly:

```tsx
import { useDrag } from "@vexart/engine"

function FloatingPanel() {
  const drag = useDrag({ axis: "both" })

  return (
    <box
      {...drag.props}
      floating="root"
      layer
      zIndex={100}
      width={420}
      height={260}
      backgroundColor={0x1a1a2eff}
      cornerRadius={12}
    />
  )
}
```

## Architecture direction

- Window state belongs in a headless manager.
- Rendering belongs in styled/window frame components.
- Movement uses `floating="root"`, `floatOffset`, `zIndex`, `layer`, and `useDrag`.
- Focus uses the existing focus ring and `pushFocusScope()` for modal windows.
- The Rust retained layout and compositor paths own geometry, hit-testing, and presentation.

## v0.9 status

Windowing is documentation-only for v0.9. It must not be documented as shipped until the package exists, has public API snapshots, and has examples/tests.
