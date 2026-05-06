---
title: Terminal Support
description: Supported terminals and transport modes.
---

## Supported Terminals

| Terminal | Protocol | Transport | Quality |
|----------|----------|-----------|---------|
| **Kitty** 0.41+ | Kitty graphics | Direct + SHM | Best |
| **Ghostty** | Kitty graphics | Direct | Best |
| **WezTerm** 2025.04+ | Kitty graphics | Direct | Best |

## Unsupported

| Terminal | Reason |
|----------|--------|
| tmux | No Kitty graphics passthrough |
| Alacritty | No Kitty graphics protocol |
| iTerm2 | Different image protocol (not supported) |
| Windows Terminal | No Kitty graphics |

Vexart exits with a clear error message on unsupported terminals.

## Transport Modes

Vexart's native Rust encoder selects the optimal transport:

| Mode | Method | Speed |
|------|--------|-------|
| **SHM** | POSIX shared memory | Fastest (zero-copy) |
| **File** | Temp file descriptor | Fast |
| **Direct** | Base64 inline | Universal fallback |

The transport manager automatically falls back if a mode fails.

## Kitty Graphics Protocol

Vexart uses the [Kitty graphics protocol](https://sw.kovidgoyal.net/kitty/graphics-protocol/) for pixel output. Key features used:

- Image placement with z-ordering
- Retained image layers (avoid re-upload)
- Dirty-region partial updates
- Unicode placeholder support
