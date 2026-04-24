---
layout: ../../layouts/DocsLayout.astro
title: Distribution & Packaging
description: Packaging workflow and release-readiness checks.
---

# Distribution & Packaging

Preview packages are built with:

```bash
bun run build:dist
cd dist
bun pack
```

Required verification:

```bash
bun run typecheck
bun test
bun run api:update
bun run test:visual
bun run perf:check
bun run perf:frame-orchestrator
```

Repository reference:

- [`docs/distribution-packaging.md`](../../../docs/distribution-packaging.md)
