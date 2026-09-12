# Distribution And Packaging

This document defines how Vexart is packaged for the v0.9 developer preview.

## Deliverable

Vexart ships as an npm tarball produced by the repository's pack workflow:

```bash
bun run pack
```

This runs `bun run build:dist`, then executes `bun pm pack --ignore-scripts`
inside `dist/`.

## Package Contents

The distributable uses a two-tier API:

```text
dist/
├── vexart.js / vexart.d.ts     — unified barrel (app + styled + headless + engine hooks)
├── engine.js / engine.d.ts     — full engine (power users, library authors)
├── jsx-runtime.d.ts            — JSX intrinsic elements
├── solid-plugin.ts             — Babel JSX transform helper
├── tree-sitter/                — grammar .wasm + .scm + worker
├── package.json                — optionalDependencies: platform-native packages
└── platform/
    └── darwin-arm64/           — @vexart-native/darwin-arm64 (libvexart.dylib)
```

### Native binary distribution

Native binaries are distributed as separate platform packages following the
esbuild/SWC pattern. The main `vexart` package declares them as
`optionalDependencies` — npm/bun installs only the matching platform:

| Package | Platform | Binary |
|---|---|---|
| `@vexart-native/darwin-arm64` | macOS Apple Silicon | `libvexart.dylib` |
| `@vexart-native/linux-x64` | Linux x86_64 | `libvexart.so` |
| `@vexart-native/linux-arm64` | Linux ARM64 | `libvexart.so` |

`bun run build:dist` emits the native package for the host running the command;
the local macOS Apple Silicon artifact is therefore `darwin-arm64`. The planned
GitHub Actions native build workflow defines a matrix for these three targets
and publishes them on a tagged release; its CI execution was not validated in this session.
Future targets outside that matrix include:

- `@vexart-native/darwin-x64` — macOS Intel
- `@vexart-native/win32-x64` — Windows (v1.0)

Publishing order for the **beta preview** is platform package first, then main
package. These commands are instructions only and were not run as part of this
verification. The block shows the locally built `darwin-arm64` package; the
tagged CI workflow publishes every matrix package before the main package:

```bash
(cd dist/platform/darwin-arm64 && npm publish --access public --tag beta)
(cd dist && npm publish --access public --tag beta)
```

### Two-tier import model

```tsx
// 90% of developers — app development
import { createApp, Box, Text, Button, colors, createSignal } from "vexart"

// Power users — custom renderers, low-level control
import { createRenderLoop, useFocus, setRendererBackend } from "vexart/engine"
```

The unified barrel (`"vexart"`) re-exports everything from `@vexart/app`,
`@vexart/styled`, and `@vexart/headless`, plus user-facing
engine hooks (animation, data, input). SolidJS control flow and reactivity
primitives (`createSignal`, `For`, `Show`, etc.) are also re-exported so
consumers do not need a separate `solid-js` import for basics.

Collision resolution:
- `Box`/`Text`: app versions win (className support)
- `Button`: styled version wins (themed)
- `useRouter`: app version wins (app-level router)
- `Switch`: SolidJS control flow wins; headless toggle is `ToggleSwitch`

## License Metadata

- Root workspace `package.json` uses `SEE LICENSE IN LICENSE`
- Built tarball `package.json` uses `SEE LICENSE IN LICENSE` and includes `LICENSE`
- `/LICENSE` is the source-of-truth license text for the repository

## Build Verification Checklist

Run before a preview release:

```bash
bun run typecheck
bun run test
bun run api:update
bun run test:visual
bun run perf:check
bun run perf:frame-orchestrator
bun run build:dist
```

## Preview Release Checklist

- Docs site builds successfully
- API snapshots are clean
- 40-scene visual suite passes
- Perf checks pass within threshold
- Dist tarball builds successfully
- License links and contact email are correct

## Local Consumer Test

After `bun run pack`:

```bash
bun add ../vexart/dist/*.tgz
```

Smoke test with:

- `bun run showcase`

## Deferred Items

These are intentionally deferred beyond this packaging baseline:

- signed binaries
- package provenance/attestations
- additional native targets outside the current CI matrix
