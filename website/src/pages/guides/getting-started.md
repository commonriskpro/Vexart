---
layout: ../../layouts/DocsLayout.astro
title: Getting Started
description: Install Vexart, build the native library, and run your first app.
---

# Getting Started

Vexart requires:

- Bun `>= 1.1.0`
- Rust stable
- a Kitty-compatible terminal (`kitty`, `ghostty`, `wezterm`)

## Install

```bash
git clone https://github.com/commonriskpro/Vexart.git
cd Vexart
bun install
cargo build --release
```

## Run your first example

```bash
bun run example
```

## Runtime behavior

- retained/native is the default on SHM-capable Kitty terminals
- `VEXART_RETAINED=0` forces the emergency compatibility path

The deeper handwritten guide still lives in [`docs/getting-started.md`](../../../docs/getting-started.md).
