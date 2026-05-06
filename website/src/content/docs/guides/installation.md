---
title: Installation
description: Install Vexart and build the native GPU library.
---

## From npm (consumers)

```bash
bun add vexart
```

Configure JSX transform in your Bun preload:

```ts
// preload.ts
import "vexart/solid-plugin"
```

Run with:
```bash
bun --preload=./preload.ts run app.tsx
```

## From source (contributors)

```bash
git clone https://github.com/commonriskpro/Vexart.git vexart
cd vexart
bun install
cd native/libvexart && cargo build --release && cd ../..
```

Verify:
```bash
bun run example    # Hello World app
bun run showcase   # Full feature showcase (7 tabs)
```

## Development Commands

| Command | Purpose |
|---------|---------|
| `bun install` | Install JS dependencies |
| `bun typecheck` | TypeScript type check |
| `bun test` | Run TS tests |
| `cd native/libvexart && cargo test` | Run Rust tests |
| `cd native/libvexart && cargo build --release` | Build native library |
| `bun run showcase` | Feature showcase |
| `bun run build:dist` | Build npm dist package |

## Verify Terminal Support

Vexart requires a Kitty-graphics-compatible terminal. On startup, it probes terminal capabilities and exits with a clear error if unsupported.

```bash
# Check if your terminal supports Kitty graphics:
printf '\e_Gi=31,s=1,v=1,a=q,t=d,f=24;AAAA\e\\\e[c'
```

If you see a response containing `OK`, your terminal is supported.
