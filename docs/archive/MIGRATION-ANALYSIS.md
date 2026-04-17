# VEXART → LightCode Migration Analysis

## Overview

Analysis of what's required to replace `@opentui/core` + `@opentui/solid` with VEXART (TGE) as the rendering engine for LightCode.

**Current stack:** LightCode uses `@opentui/core@0.1.96` + `@opentui/solid@0.1.96` consumed via npm. Opentui ships precompiled native binaries per platform (darwin-arm64, darwin-x64, linux-arm64, linux-x64, win32-arm64, win32-x64) with Yoga layout, tree-sitter, and image processing baked in.

**Target stack:** VEXART — pixel-native terminal rendering engine with SolidJS universal renderer, Clay layout (C FFI), SDF paint primitives (Zig FFI), and Kitty/placeholder/halfblock output backends.

---

## Opentui API Surface Used by LightCode

### Imports from `@opentui/core` (27 symbols, 35 files)

| Symbol                | Files | Purpose                               |
| --------------------- | ----- | ------------------------------------- |
| `RGBA`                | 9     | Color type for theming                |
| `TextAttributes`      | 14    | Bitflag enum: `BOLD`, `STRIKETHROUGH` |
| `BoxRenderable`       | 3     | Ref type for `<box>` elements         |
| `TextareaRenderable`  | 7     | Ref type for `<textarea>` elements    |
| `ScrollBoxRenderable` | 3     | Ref type for `<scrollbox>` elements   |
| `InputRenderable`     | 1     | Ref type for `<input>` elements       |
| `Renderable`          | 2     | Base renderable type                  |
| `ParsedKey`           | 5     | Keyboard event type                   |
| `KeyEvent`            | 1     | Keyboard event for textarea           |
| `MouseEvent`          | 1     | Mouse event type                      |
| `PasteEvent`          | 1     | Paste event type                      |
| `KeyBinding`          | 1     | Keybinding definition for textarea    |
| `MouseButton`         | 2     | Enum: `.RIGHT` for context menus      |
| `CliRenderer`         | 1     | Renderer class type                   |
| `CliRendererConfig`   | 1     | Config type for renderer creation     |
| `CliRenderEvents`     | 1     | Event enum: `.THEME_MODE`             |
| `createCliRenderer`   | 1     | Factory function                      |
| `addDefaultParsers`   | 1     | Registers markdown/syntax parsers     |
| `decodePasteBytes`    | 1     | Decodes paste event bytes             |
| `SyntaxStyle`         | 1     | Syntax highlighting: `.fromTheme()`   |
| `TerminalColors`      | 1     | Terminal color scheme type            |
| `MacOSScrollAccel`    | 1     | macOS scroll acceleration             |
| `ScrollAcceleration`  | 1     | Scroll acceleration interface         |
| `ColorInput`          | 1     | Generic color input type              |
| `t`                   | 1     | Text markup helper                    |
| `dim`                 | 1     | Text markup helper                    |
| `fg`                  | 1     | Text markup helper                    |

### Imports from `@opentui/solid` (10 symbols, 24 files)

| Symbol                    | Files | Purpose                          |
| ------------------------- | ----- | -------------------------------- |
| `useKeyboard`             | 13    | Keyboard event handling hook     |
| `useRenderer`             | 8     | Access CliRenderer instance      |
| `useTerminalDimensions`   | 7     | Reactive terminal width/height   |
| `JSX`                     | 4     | JSX type namespace               |
| `render`                  | 1     | Mount SolidJS tree into renderer |
| `TimeToFirstDraw`         | 1     | Performance measurement          |
| `Portal`                  | 1     | Render outside normal tree       |
| `createSlot`              | 1     | Plugin slot component            |
| `createSolidSlotRegistry` | 1     | Plugin slot registry             |
| `SolidPlugin`             | 1     | Plugin type for slots            |

### JSX Intrinsic Elements

| Element       | Files | Key Props                                                                                                         |
| ------------- | ----- | ----------------------------------------------------------------------------------------------------------------- |
| `<box>`       | 34    | flexDirection, flexGrow, gap, padding, margin, backgroundColor, visible, id, ref, onMouse\*                       |
| `<text>`      | 31    | fg, bg, attributes, content (markdown), syntaxStyle, wrapMode, selectable                                         |
| `<span>`      | 19    | style={{ fg, bg, bold, attributes }}                                                                              |
| `<b>`         | 10    | Bold text shorthand                                                                                               |
| `<textarea>`  | 5     | placeholder, textColor, cursorColor, syntaxStyle, keyBindings, onKeyDown, onContentChange, onSubmit, onPaste, ref |
| `<scrollbox>` | 6     | height, scrollAcceleration, scrollbarOptions, ref                                                                 |
| `<input>`     | 1     | onInput, placeholder, ref                                                                                         |

### Renderable Ref APIs

#### TextareaRenderable (7 files — MOST COMPLEX)

- `.focus()`, `.blur()`, `.setText()`, `.insertText()`, `.clear()`
- `.plainText`, `.cursorOffset`, `.cursorColor`, `.visualCursor`
- `.gotoBufferEnd()`, `.gotoLineEnd()`, `.getTextRange()`
- `.getLayoutNode()` → `.markDirty()`
- `.extmarks` → `.registerType()`, `.create()`, `.getAllForTypeId()`, `.clear()`
- `.traits`, `.isDestroyed`, `.height`, `.focused`

#### ScrollBoxRenderable (3 files)

- `.scrollBy()`, `.scrollTo()`, `.scrollHeight`, `.height`, `.y`
- `.getChildren()`, `.isDestroyed`

#### BoxRenderable (3 files)

- `.parent`, `.getChildren()`, `.y`, `.height`, `.id`, `.focus()`, `.isDestroyed`

### Renderer API (via `useRenderer()`, 8 files)

- `getSelection()` → `getSelectedText()`, `clearSelection()`
- `requestRender()`, `currentFocusedRenderable`
- `setTerminalTitle()`, `suspend()`, `resume()`, `destroy()`
- `root`, `toggleDebugOverlay()`, `console.toggle()`
- `themeMode`, `clearPaletteCache()`, `setBackgroundColor()`
- `on(event, handler)`, `off(event, handler)`
- `currentRenderBuffer.clear()`

---

## What VEXART Already Covers

| Capability                        | VEXART Status | Notes                                                        |
| --------------------------------- | ------------- | ------------------------------------------------------------ |
| `<box>` flexbox layout            | ✅ Ready      | Clay layout engine                                           |
| `<text>` rendering                | ✅ Ready      | Pixel-native with SDF                                        |
| Mouse events (click, hover, move) | ✅ Ready      | Clay hit-testing + `useMouse()`                              |
| Keyboard handling                 | ✅ Ready      | `useKeyboard()`, `useFocus()`                                |
| Terminal dimensions               | ✅ Ready      | `terminal.size` (cols, rows, pixels)                         |
| Dark/light mode detection         | ✅ Ready      | `terminal.isDark`, `bgColor`, `fgColor`                      |
| SolidJS integration               | ✅ Ready      | Universal renderer with JSX                                  |
| `<input>` single-line             | ✅ Ready      | Cursor, selection, paste support                             |
| Scroll containers                 | ⚠️ Partial    | `ScrollView` exists but NO programmatic control              |
| Design tokens / theming           | ✅ Ready      | `@tge/void` design tokens and Void Black palette             |
| Kitty graphics protocol           | ✅ Ready      | Direct, placeholder, halfblock backends                      |
| Terminal lifecycle                | ✅ Ready      | Raw mode, alt screen, mouse, Kitty keyboard                  |
| Input parsing                     | ✅ Ready      | Keyboard, mouse SGR, focus, paste                            |
| SDF primitives                    | ✅ Ready      | Rounded rects, circles, lines, bezier, blur, glow, gradients |
| Layer compositing                 | ✅ Ready      | Per-component layers with z-index                            |

---

## Gaps — Verified Status & Implementation Plan

> Last audited: 2026-04-11 against commit 6f4df62
> **ALL 13 GAPS IMPLEMENTED** — 155 tests, 0 fail

### 🔴 CRITICAL — ALL COMPLETED

#### 1. `<textarea>` — Multiline Text Editor ✅

**Implemented:** `packages/components/src/textarea.tsx` (500+ lines)
- Line buffer model with 2D cursor (row/col) + sticky column
- Up/Down/PgUp/PgDown/Home/End navigation, Shift+arrow selection
- Multi-line paste (preserves newlines), Enter=newline, Ctrl+Enter=submit
- `TextareaHandle` ref API: setText, insertText, clear, getTextRange, gotoBufferEnd, gotoLineEnd, focus
- Visual cursor splits line at cursor column for correct positioning
- **Demo14:** `examples/textarea.tsx`

---

#### 2. `<scrollbox>` — Programmatic Scroll Control ✅

**Implemented:** `packages/renderer/src/scroll.ts` + `packages/components/src/scroll-view.tsx` updated
- 3 new Clay FFI functions: `tge_clay_get_scroll_container_data`, `tge_clay_set_scroll_position`, `tge_clay_get_element_data`
- `ScrollHandle`: scrollTo, scrollBy, scrollIntoView, scrollY/contentHeight/viewportHeight
- ScrollView accepts `ref` callback returning ScrollHandle with stable Clay ID
- **Demo13:** `examples/scroll-programmatic.tsx`

---

#### 3. Tree-sitter / Syntax Highlighting ✅

**Implemented:** `packages/renderer/src/tree-sitter/` (7 files + bundled assets)
- `web-tree-sitter` 0.26.8 WASM in Bun Worker thread (`parser.worker.ts`)
- `TreeSitterClient`: async `highlightOnce()`, singleton, `addDefaultParsers()`
- `SyntaxStyle`: `fromTheme`/`fromSimple`, dot-notation fallback, `getStyleId`
- `highlightsToTokens`: boundary-sweep algorithm → per-line `Token[][]`
- Built-in themes: ONE_DARK, KANAGAWA
- Bundled grammars: TypeScript, JavaScript, Markdown, Markdown Inline
- `<Code>` component: async highlight, line numbers, per-token `<text>` coloring
- **Demo15:** `examples/syntax.tsx`

---

#### 4. Markdown Rendering ✅

**Implemented:** `packages/components/src/markdown.tsx`
- `marked` 18.0 Lexer tokenizes markdown into structured tokens
- `<Markdown>` component renders: headings (h1-h6 with font size), paragraphs, fenced code blocks (with tree-sitter via `<Code>`), bullet/numbered lists, blockquotes (with border), tables (header + rows), horizontal rules, inline formatting
- `resolveLanguage()` maps info strings (ts, js, py, etc.) to filetypes
- **Demo16:** `examples/markdown.tsx`

---

### 🟡 HIGH — ALL COMPLETED

#### 5. Extmarks System ✅

**Implemented:** `packages/renderer/src/extmarks.ts` (190 lines) + 13 tests
- `ExtmarkManager`: registerType, create/remove/get, getAllForTypeId, getInRange, getGhostTexts
- `adjustForEdit()`: shifts marks on insert/delete, removes collapsed non-ghost marks
- Ghost text support (start === end, `ghost: true`, survives edit collapse)
- clear/clearType for bulk removal, sorted insertion by start position

---

#### 6. Selection System ✅

**Implemented:** `packages/renderer/src/selection.ts`
- `TextSelection` type with text, sourceId, start, end
- `getSelection()`, `getSelectedText()`, `setSelection()`, `clearSelection()`
- Reactive SolidJS signals, reset on mount destroy

---

#### 7. Clipboard Write (OSC 52) ✅

**Implemented:** `packages/terminal/src/index.ts` — `terminal.writeClipboard(text)`
- Base64 encodes text via `Buffer.from(text, "utf-8").toString("base64")`
- Outputs `\x1b]52;c;${encoded}\x07`

---

#### 8. Renderable Refs API ✅

**Implemented:** `packages/renderer/src/handle.ts` + `packages/renderer/src/node.ts` updated
- `NodeHandle`: id, kind, layout (live), isDestroyed, focus/blur, isFocused, children, parent
- Reconciler intercepts `ref` prop in `setProperty`, creates handle via WeakMap cache
- TGENode extended: auto-increment `id`, `destroyed` flag, `layout: LayoutRect`
- Layout writeback: RECT/TEXT commands write geometry back to nodes after Clay layout
- `focusedId` exported for renderer-level focus tracking
- 14 tests (node lifecycle + handle)

---

#### 9. Suspend/Resume ✅

**Implemented:** Terminal + RenderLoop + MountHandle
- `terminal.suspend()` / `terminal.resume()` — leave/enter lifecycle
- `loop.suspend()` / `loop.resume()` / `loop.suspended()` — stop/start + full repaint
- `mount()` returns `MountHandle` with suspend/resume/suspended/destroy
- Input events ignored during suspend

---

### 🟠 MEDIUM — ALL COMPLETED

#### 10. Plugin Slot System ✅

**Implemented:** `packages/renderer/src/plugins.ts`
- `createSlotRegistry()`: reactive slot registry with register/unregister, version signal
- `createSlot(name, registry)`: creates component that renders slot contents
- `TgePlugin` / `TgePluginApi` types for plugin setup lifecycle

---

#### 11. Portal ✅

**Implemented:** `packages/components/src/portal.tsx`
- Custom TGE implementation (SolidJS universal does NOT include Portal)
- Wraps children in `<box layer>` for full-screen overlay compositing
- For modals, dialogs, tooltips

---

### 🟢 LOW — ALL COMPLETED

#### 12. Terminal Title ✅

**Implemented:** `packages/terminal/src/index.ts` — `terminal.setTitle(title)`
- OSC 2 escape sequence: `\x1b]2;${title}\x07`

---

#### 13. Debug Overlay ✅

**Implemented:** `packages/renderer/src/debug.ts`
- `toggleDebug()` / `setDebug(enabled)` / `isDebugEnabled()`
- `debugFrameStart()` returns finish callback for frame timing
- `debugUpdateStats()` accepts layer/dirty/node/command counts
- `debugState` reactive object + `debugStatsLine()` for overlay text
- FPS tracking via rolling 1-second timestamp window

---

### Implementation Order — COMPLETED

```
Phase 0 — Foundations ✅ (commit f71563b)
├── Gap 12: Terminal Title ✅
├── Gap 7:  Clipboard (OSC 52) ✅
├── Gap 8:  Renderable Refs API ✅
└── Gap 9:  Suspend/Resume ✅

Phase 1 — Core Interactive ✅ (commits f71563b, 51cb49e)
├── Gap 2:  ScrollBox Programmatic ✅
├── Gap 1:  Textarea ✅
├── Gap 11: Portal ✅
└── Gap 6:  Selection System ✅

Phase 2 — Rich Content ✅ (commits dbb1fda, 4c99392)
├── Gap 3:  Tree-sitter / Syntax ✅
├── Gap 4:  Markdown Rendering ✅
└── Gap 5:  Extmarks ✅

Phase 3 — Polish ✅ (commit 6f4df62)
├── Gap 10: Plugin Slots ✅
└── Gap 13: Debug Overlay ✅

TOTAL: 155 tests, 0 fail | 4 new demos (13-16)
```

---

## Build Pipeline & Publishing Strategy

### Reference: How Claude Code ships closed-source on npm

Claude Code (`@anthropic-ai/claude-code`) publishes a single npm package with:

```
cli.js                  ← 13MB single-file bundle, minified (all TS compiled + inlined)
vendor/
  ripgrep/
    arm64-darwin/rg     ← precompiled native binary
    x64-linux/rg
    ...
  audio-capture/
    arm64-darwin/audio-capture.node
    ...
package.json            ← dependencies: {}, optionalDeps for sharp per-platform
```

Key traits:
- **Single `.js` bundle** — all TypeScript compiled and bundled into ONE file via esbuild/rollup, then minified. Source is effectively unreadable.
- **Zero runtime dependencies** — `"dependencies": {}`. Everything is inlined in the bundle.
- **Native binaries in `vendor/`** — precompiled for every platform, shipped inside the package itself.
- **No build step for consumers** — `npm install` and it works.

### TGE publishing strategy (same approach)

**Package:** `tge` (single npm package, closed-source)

```
tge.js                    ← single-file bundle (all @tge/* packages compiled + minified)
tge.d.ts                  ← public API type declarations only
solid-plugin.js           ← babel preload, bundled
vendor/
  tge/
    arm64-darwin/libtge.dylib
    x64-darwin/libtge.dylib
    arm64-linux/libtge.so
    x64-linux/libtge.so
    arm64-win32/tge.dll
    x64-win32/tge.dll
  clay/
    arm64-darwin/libclay.dylib
    x64-darwin/libclay.dylib
    arm64-linux/libclay.so
    x64-linux/libclay.so
    arm64-win32/clay.dll
    x64-win32/clay.dll
package.json
README.md
LICENSE.md
```

**`package.json`:**
```json
{
  "name": "tge",
  "version": "0.0.1",
  "type": "module",
  "main": "tge.js",
  "types": "tge.d.ts",
  "license": "SEE LICENSE IN LICENSE.md",
  "files": ["tge.js", "tge.d.ts", "solid-plugin.js", "vendor/"],
  "dependencies": {}
}
```

### Build pipeline

#### 1. Bundle TypeScript → single `.js`

Use esbuild to bundle all `@tge/*` packages into one file:

```bash
esbuild packages/renderer/src/index.ts \
  --bundle \
  --format=esm \
  --platform=node \
  --target=esnext \
  --minify \
  --external:bun:ffi \
  --external:solid-js \
  --external:@babel/core \
  --external:babel-preset-solid \
  --outfile=dist/tge.js
```

- `bun:ffi` stays external (runtime-provided)
- `solid-js` stays external (peer dep, consumer installs it)
- Babel stays external (dev dep for JSX transform)
- Everything else (all `@tge/*` internal packages) gets inlined

#### 2. Generate type declarations

```bash
tsc --declaration --emitDeclarationOnly --outDir dist/types
# Then bundle declarations into a single tge.d.ts with dts-bundle-generator or api-extractor
```

Only the PUBLIC API types ship. Internal implementation types stay hidden.

#### 3. Cross-compile native libs

**Zig** (cross-compilation is a first-class feature):
```bash
# macOS ARM64
zig build -Doptimize=ReleaseFast -Dtarget=aarch64-macos
# macOS x64
zig build -Doptimize=ReleaseFast -Dtarget=x86_64-macos
# Linux ARM64
zig build -Doptimize=ReleaseFast -Dtarget=aarch64-linux-gnu
# Linux x64
zig build -Doptimize=ReleaseFast -Dtarget=x86_64-linux-gnu
```

**Clay** (C, compiled with zig cc for cross-compilation):
```bash
# macOS ARM64
zig cc -shared -O2 -target aarch64-macos -DCLAY_IMPLEMENTATION vendor/clay_wrapper.c -o dist/vendor/clay/arm64-darwin/libclay.dylib
# Linux x64
zig cc -shared -O2 -target x86_64-linux-gnu -DCLAY_IMPLEMENTATION vendor/clay_wrapper.c -o dist/vendor/clay/x64-linux/libclay.so
```

#### 4. FFI path resolution (must update)

Current FFI resolution searches relative to monorepo:
```ts
// BEFORE — breaks when consumed as npm package
resolve(import.meta.dir, "../../../zig/zig-out/lib", name)
```

Must resolve relative to the installed package:
```ts
// AFTER — works from node_modules/tge/vendor/
const arch = process.arch === "arm64" ? "arm64" : "x64"
const platform = { darwin: "darwin", linux: "linux", win32: "win32" }[process.platform]
resolve(import.meta.dir, `vendor/tge/${arch}-${platform}`, name)
```

#### 5. CI (GitHub Actions)

```yaml
# .github/workflows/publish.yml
jobs:
  build:
    strategy:
      matrix:
        include:
          - os: macos-14        # ARM64
            target: arm64-darwin
          - os: macos-13        # x64
            target: x64-darwin
          - os: ubuntu-latest   # x64
            target: x64-linux
          - os: ubuntu-24.04-arm # ARM64
            target: arm64-linux
    steps:
      - uses: goto-bus-stop/setup-zig@v2
      - run: zig build -Doptimize=ReleaseFast
      - run: # compile Clay
      - uses: actions/upload-artifact@v4

  publish:
    needs: build
    steps:
      - # Download all platform artifacts
      - # Bundle TS with esbuild
      - # Assemble dist/ with vendor/ dirs
      - run: npm publish
```

### Phases

| Phase | What                              | Result                                      |
| ----- | --------------------------------- | ------------------------------------------- |
| 1     | Bundle + minify TS, darwin-arm64  | `bun add tge` works on YOUR machine         |
| 2     | Add darwin-x64 + linux-x64       | Works on most dev machines + Linux servers   |
| 3     | CI pipeline, all 6 targets       | Full cross-platform, automated publish       |
| 4     | Windows targets (optional)        | win32 support                               |

### Consumer usage

```bash
bun add tge solid-js
```

**`bunfig.toml`:**
```toml
preload = ["tge/solid-plugin.js"]
```

**`app.tsx`:**
```tsx
import { mount, useKeyboard } from "tge"
import { createTerminal } from "tge/terminal"

function App() {
  return <box backgroundColor="#16213e" cornerRadius={12} padding={16}>
    <text color="#e0e0e0" fontSize={16}>Hello TGE</text>
  </box>
}

const terminal = await createTerminal()
mount(() => <App />, terminal)
```

---

## Integration Strategy

### Approach: Gradual Migration with npm-published TGE

1. **Publish TGE to npm** (closed-source, single bundle + precompiled binaries) — Phase 1: darwin-arm64 only
2. Replace renderer base first (Clay layout instead of Yoga) in LightCode
3. Migrate simple components (`<box>`, `<text>`, `<span>`)
4. Build textarea/scrollbox in TGE as they're needed
5. Last: syntax highlighting + markdown
6. **Pros:** Incremental progress, TGE is a standalone package, can ship intermediate states
7. **Cons:** Long period of mixed code until all gaps are resolved

---

## Summary

| Metric                        | Value                                                               |
| ----------------------------- | ------------------------------------------------------------------- |
| Total opentui symbols used    | 37 unique                                                           |
| Total files importing opentui | ~50                                                                 |
| JSX elements to replace       | 7 (`box`, `text`, `span`, `b`, `textarea`, `scrollbox`, `input`)    |
| **All 13 gaps**               | **✅ IMPLEMENTED**                                                  |
| Tests                         | 155 pass, 0 fail                                                    |
| New demos                     | demo13 (scroll), demo14 (textarea), demo15 (syntax), demo16 (md)   |
| Cross-compilation targets     | 8 (6 required, 2 optional musl)                                     |
| Publishing strategy           | Claude Code-style: single minified bundle + precompiled vendor/     |
| **Next step**                 | **npm publishing pipeline (Phase 1: darwin-arm64 bundle)**          |

### Component Inventory (15 components)

| Component    | File                        | Interactive | Status    |
| ------------ | --------------------------- | ----------- | --------- |
| Box          | components/box.tsx          | No          | ✅ Ready  |
| Text         | components/text.tsx         | No          | ✅ Ready  |
| RichText     | components/rich-text.tsx    | No          | ✅ Ready  |
| ScrollView   | components/scroll-view.tsx  | Yes         | ✅ Ready (programmatic scroll via ScrollHandle) |
| Button       | components/button.tsx       | Yes         | ✅ Ready  |
| Checkbox     | components/checkbox.tsx     | Yes         | ✅ Ready  |
| Tabs         | components/tabs.tsx         | Yes         | ✅ Ready  |
| List         | components/list.tsx         | Yes         | ✅ Ready  |
| ProgressBar  | components/progress-bar.tsx | No          | ✅ Ready  |
| Input        | components/input.tsx        | Yes         | ✅ Ready (single-line) |
| **Textarea** | components/textarea.tsx     | Yes         | ✅ **NEW** (multiline, 2D cursor, ref API) |
| **Code**     | components/code.tsx         | No          | ✅ **NEW** (tree-sitter syntax highlighting) |
| **Markdown** | components/markdown.tsx     | No          | ✅ **NEW** (headings, code, lists, tables) |
| **Portal**   | components/portal.tsx       | No          | ✅ **NEW** (overlay rendering) |

### Renderer Systems

| System          | File                        | Status |
| --------------- | --------------------------- | ------ |
| Ref handles     | renderer/handle.ts          | ✅ NodeHandle with layout, focus, tree traversal |
| Scroll          | renderer/scroll.ts          | ✅ ScrollHandle with scrollTo/scrollBy |
| Selection       | renderer/selection.ts       | ✅ Global text selection state |
| Extmarks        | renderer/extmarks.ts        | ✅ Type registry, CRUD, ghost text, edit adjustment |
| Syntax          | renderer/tree-sitter/       | ✅ WASM worker, SyntaxStyle, tokenizer |
| Plugins         | renderer/plugins.ts         | ✅ Slot registry, createSlot |
| Debug           | renderer/debug.ts           | ✅ FPS, frame stats, toggle |
| Suspend/Resume  | renderer/loop.ts + index.ts | ✅ MountHandle with suspend/resume |
