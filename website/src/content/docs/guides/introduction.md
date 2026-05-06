---
title: Introduction
description: What is Vexart and why does it exist.
---

Vexart is a **pixel-native, GPU-accelerated terminal UI engine**. Developers write JSX with SolidJS reactivity; Vexart renders browser-quality UI in terminals that support the Kitty graphics protocol.

## The Problem

Terminal UIs are stuck in 1985. Developers building CLI tools face a choice:

- **Cell-based TUI frameworks** (Textual, Ratatui, Bubbletea, Ink): constrained by character grids. Rounded corners are ASCII art. Shadows are gray characters.
- **Electron apps**: beautiful but 200MB RAM, 3-5 second startup, alien to terminal workflows.

Modern terminals (Kitty, WezTerm, Ghostty) support pixel graphics. What's missing is an engine that turns JSX into GPU-accelerated output.

## The Solution

Vexart bridges JSX + SolidJS reactivity to a Rust-native GPU pipeline:

```
JSX (SolidJS createRenderer)
  → TypeScript scene graph + reactivity
    → Flexily layout (pure JS flexbox)
      → Rust/WGPU paint pipelines
        → Kitty graphics protocol → Terminal
```

The result:
- Pixel-perfect anti-aliased shapes using SDF primitives
- CSS-parity visual effects: shadows, gradients, glow, backdrop filters, transforms
- Reactive updates via SolidJS signals — no VDOM
- Adaptive render loop (8–60fps based on activity)
- Two-layer API: headless components (logic) + styled components (theme)

## Architecture

TypeScript owns the scene graph, reactivity, layout (Flexily), render graph, and event dispatch. Rust owns GPU paint, compositing, Kitty encoding, and terminal transport.

| Layer | Package | Purpose |
|-------|---------|---------|
| App | `@vexart/app` | Router, className mapper, CLI helpers |
| Styled | `@vexart/styled` | Themed components, design tokens |
| Headless | `@vexart/headless` | Logic-only components, keyboard/mouse |
| Primitives | `@vexart/primitives` | `Box`, `Text`, `RichText`, `Span`, `WrapRow` |
| Engine | `@vexart/engine` | Reconciler, render loop, FFI bridge, input, focus |
| Native | `libvexart` | Rust cdylib: WGPU + composite + Kitty encoder |

## Requirements

| Dependency | Version | Notes |
|------------|---------|-------|
| [Bun](https://bun.sh/) | ≥ 1.1.0 | Runtime + package manager |
| Rust toolchain | stable | For `cargo build --release` |
| Kitty-compatible terminal | — | Kitty, Ghostty, or WezTerm |

## Supported Terminals

| Terminal | Quality |
|----------|---------|
| **Kitty** 0.41+ | Best — SHM + direct transport |
| **Ghostty** | Best — direct transport |
| **WezTerm** 2025.04+ | Best — direct transport |
| tmux, Alacritty, iTerm2 | Unsupported — exits with clear error |
