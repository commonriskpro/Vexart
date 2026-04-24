# Distribution And Packaging

This document defines how Vexart is packaged for the v0.9 developer preview.

## Deliverable

Vexart ships as an npm tarball produced by:

```bash
bun run build:dist
cd dist
bun pack
```

## Package Contents

The distributable includes:

- JavaScript entrypoints for `engine`, `components`, and `styled`
- `.d.ts` type declarations
- `jsx-runtime.d.ts`
- `solid-plugin.ts`
- native binaries under `vendor/`
- tree-sitter worker/assets

## License Metadata

- Root workspace `package.json` uses `SEE LICENSE IN LICENSE`
- Built tarball `package.json` uses `SEE LICENSE IN LICENSE.md`
- `/LICENSE` is the source-of-truth license text for the repository

## Build Verification Checklist

Run before a preview release:

```bash
bun run typecheck
bun test
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

After `bun pack`:

```bash
bun add ../vexart/dist/*.tgz
```

Smoke test with:

- `bun run example`
- `bun run showcase`

## Deferred Items

These are intentionally deferred beyond this packaging baseline:

- signed binaries
- package provenance/attestations
- automated multi-platform release publishing
