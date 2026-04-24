---
layout: ../../layouts/DocsLayout.astro
title: Architecture Overview
description: Simplified runtime and package architecture.
---

# Architecture Overview

At a high level:

- TypeScript owns JSX ergonomics, hooks, public API, and fallback shell.
- Rust owns normal rendering behavior, frame strategy, resources, and terminal presentation.

Public package layering:

```txt
@vexart/styled
  ↓
@vexart/headless
  ↓
@vexart/primitives
  ↓
@vexart/engine
```

Deep reference:

- [`docs/ARCHITECTURE.md`](../../../docs/ARCHITECTURE.md)
