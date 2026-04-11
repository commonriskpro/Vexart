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
| Design tokens / theming           | ✅ Ready      | `@tge/tokens` Void Black palette                             |
| Kitty graphics protocol           | ✅ Ready      | Direct, placeholder, halfblock backends                      |
| Terminal lifecycle                | ✅ Ready      | Raw mode, alt screen, mouse, Kitty keyboard                  |
| Input parsing                     | ✅ Ready      | Keyboard, mouse SGR, focus, paste                            |
| SDF primitives                    | ✅ Ready      | Rounded rects, circles, lines, bezier, blur, glow, gradients |
| Layer compositing                 | ✅ Ready      | Per-component layers with z-index                            |

---

## Gaps — Verified Status & Implementation Plan

> Last audited: 2026-04-11 against commit 432cbc6

### 🔴 CRITICAL (Blocks migration entirely)

#### 1. `<textarea>` — Multiline Text Editor

**Status: ~15% — Single-line `<Input>` exists, NO multiline editor**

**What EXISTS:**
- `packages/components/src/input.tsx` (353 lines) — single-line input with cursor, selection (selStart/selEnd), paste handling, onChange/onSubmit, focus integration, cursor blink
- `packages/renderer/src/text-layout.ts` — multi-line word wrapping via `@chenglou/pretext`, `measureForClay()`, `layoutText()`
- `packages/renderer/src/focus.ts` — `useFocus()`, `setFocus()`, Tab cycling, `onKeyDown` dispatch
- `packages/renderer/src/dirty.ts` — global `markDirty()`

**What's MISSING:**
- [ ] No `<textarea>` component — no file, no JSX intrinsic registered in `jsx.d.ts`
- [ ] No multi-line editing — `<Input>` flattens newlines on paste (line 269: `.replace(/\n/g, " ")`)
- [ ] No 2D cursor (row/col) — current cursor is 1D character index
- [ ] No Up/Down/PgUp/PgDown navigation
- [ ] No line-array text buffer model
- [ ] No extmarks system (Gap 5 dependency)
- [ ] No syntax highlighting integration (Gap 3 dependency)
- [ ] No visual cursor with row tracking (`.visualCursor.offset`, `.visualCursor.visualRow`)
- [ ] No programmatic API: `.setText()`, `.insertText()`, `.clear()`, `.getTextRange()`
- [ ] No ref system — reconciler does not support refs at all
- [ ] No per-node `.getLayoutNode().markDirty()` — `markDirty()` is global only

**Implementation plan:**
1. **Ref system first** (Gap 8) — textarea needs imperative ref access
2. **Line buffer model** — `string[]` with row/col cursor, insert/delete/split operations
3. **2D cursor navigation** — Up/Down/Home/End/PgUp/PgDown + word movement
4. **Multi-line selection** — extend Input's 1D selection to 2D ranges
5. **Paste handling** — accept multi-line paste, insert into buffer
6. **Visual cursor** — row-aware cursor rendering with blink
7. **Imperative API** — `.setText()`, `.insertText()`, `.clear()`, `.getTextRange()` via ref
8. **Integration** — onChange/onSubmit/onPaste callbacks, layout dirty on content change

**Effort:** Large (3-5 days). This is a mini text editor.
**Depends on:** Gap 8 (Refs), benefits from Gap 3 (Syntax) and Gap 5 (Extmarks)

---

#### 2. `<scrollbox>` — Programmatic Scroll Control

**Status: ~50% — Mouse wheel scrolling works, NO programmatic API**

**What EXISTS:**
- `packages/components/src/scroll-view.tsx` (78 lines) — declarative ScrollView with `scrollX`/`scrollY`/`scrollSpeed` props
- `packages/renderer/src/loop.ts` — `feedScroll(dx, dy)`, `feedPointer(x, y, down)`, `scrollDeltaX/Y` accumulators, `scrollSpeedCap`, SCISSOR clipping (`pushScissor/popScissor/clipToScissor`)
- `packages/renderer/src/clay.ts` — `tge_clay_get_scroll_offset`, `tge_clay_update_scroll`, `tge_clay_configure_clip`, `getScrollOffset()`, `updateScroll(dx, dy, dt)`
- `examples/scroll.tsx` — working mouse wheel scroll demo

**What's MISSING:**
- [ ] No `.scrollTo(position)` — no programmatic scroll API exposed to components
- [ ] No `.scrollBy(amount)` — scroll only via mouse wheel input in `mount()`
- [ ] No `.scrollHeight` — total content height not exposed from Clay
- [ ] No `.height` / `.y` — viewport dimensions and current offset not exposed
- [ ] No `.getChildren()` — TGENode.children exists internally but not exposed via refs
- [ ] No scroll acceleration (`MacOSScrollAccel`) — only `scrollSpeedCap` (simple clamp)
- [ ] No scrollbar rendering — zero scrollbar code anywhere

**Implementation plan:**
1. **Ref system** (Gap 8) — need ref handle for scroll containers
2. **ScrollHandle type** — expose `scrollTo()`, `scrollBy()`, `scrollHeight`, `height`, `y` by reading/writing Clay's internal scroll state
3. **Programmatic scroll** — `scrollTo()` writes directly to Clay scroll offset, `scrollBy()` adds delta
4. **Layout geometry exposure** — read Clay layout results and store `scrollHeight`/`height`/`y` on the handle
5. **Scrollbar component** — visual indicator painted as an overlay in the scroll layer, auto-hide, drag support
6. **Scroll acceleration** — momentum/easing curve (optional, can be phase 2)

**Effort:** Medium (2-3 days)
**Depends on:** Gap 8 (Refs)

---

#### 3. Tree-sitter / Syntax Highlighting

**Status: 0% — Zero code exists**

**What EXISTS:** Nothing. No tree-sitter dependency, no parser, no per-token coloring. The Zig `tge_draw_text` takes a SINGLE color for the entire string. The RichInlineItem type in text-layout.ts supports multiple items per line but isn't wired to syntax tokens.

**What's MISSING:**
- [ ] No tree-sitter WASM integration
- [ ] No language grammar loading (`.scm` files)
- [ ] No `SyntaxStyle` class or `SyntaxStyle.fromTheme(rules)`
- [ ] No `syntaxStyle` prop on `<text>` or `<textarea>`
- [ ] No `addDefaultParsers()` function
- [ ] No parser worker for async parsing
- [ ] No per-token coloring in text rendering — Zig renders single-color strings
- [ ] No named style lookups (`getStyleId()`)
- [ ] No bold/italic font variants — only one font atlas (SF Mono 14px regular)

**Implementation plan:**
1. **Per-token text rendering** — modify Zig `tge_draw_text` to accept color array per character, OR render each token as a separate `drawText` call with different colors (simpler, start here)
2. **tree-sitter WASM** — add `web-tree-sitter` dependency, load grammars for common languages (TS, JS, Python, Rust, Go, etc.)
3. **SyntaxStyle** — theme-to-token-color mapping, `fromTheme(rules)` factory
4. **syntaxStyle prop** — wire into `<text>` and future `<textarea>`, pass token ranges + colors to paint bridge
5. **Parser worker** — offload parsing to worker thread for non-blocking UI
6. **Font variants** — register bold/italic font atlases via `registerFont()` (infrastructure exists)

**Effort:** Large (5-7 days)
**Depends on:** Nothing (can start independently). Gap 4 (Markdown) depends on THIS.

---

#### 4. Markdown Rendering

**Status: 0% — Zero code exists**

**What EXISTS:** Nothing. No markdown parser dependency, no heading/bold/italic/code/list rendering. `RichText`/`Span` components exist but don't support per-span coloring in a single paragraph flow yet.

**What's MISSING:**
- [ ] No markdown parser — no `marked`, `remark`, `micromark`, or any md library
- [ ] No `<text content={markdownString}>` prop for parsed markup
- [ ] No heading rendering (font size variation)
- [ ] No bold/italic text (single font atlas, no variants)
- [ ] No code block rendering (also blocked by Gap 3)
- [ ] No list rendering (bullets, numbers)
- [ ] No link rendering (URL detection, formatting)
- [ ] No horizontal rule, blockquote, table rendering

**Implementation plan:**
1. **Markdown parser** — add `micromark` or `mdast-util-from-markdown` (small, fast, extensible)
2. **MD-to-JSX transformer** — convert markdown AST → `<Box>`/`<Text>`/`<RichText>` component tree
3. **Heading styles** — different font sizes per heading level (requires multi-size font atlas support)
4. **Inline formatting** — bold/italic via RichText spans (requires font variants from Gap 3)
5. **Code blocks** — fenced blocks rendered with syntax highlighting (Gap 3 dependency)
6. **Lists** — bullet/number prefix + indented content boxes
7. **`<Markdown>` component** — `<Markdown content={string} syntaxStyle={style} />`

**Effort:** Large (4-6 days)
**Depends on:** Gap 3 (Syntax Highlighting) for code blocks, font variants for bold/italic

---

### 🟡 HIGH (Required for full functionality)

#### 5. Extmarks System

**Status: 0% — Zero code exists**

**What EXISTS:** Nothing. The word "extmark" only appears in this document.

**What's MISSING:**
- [ ] No `extmarks.registerType(name)` — type ID registration
- [ ] No `extmarks.create({ start, end, typeId, styleId, data })` — extmark creation
- [ ] No `extmarks.getAllForTypeId(typeId)` — query by type
- [ ] No `extmarks.clear()` — clear all extmarks
- [ ] No inline ghost text rendering (autocomplete overlay)

**Implementation plan:**
1. **ExtmarkManager class** — type registry + extmark CRUD backed by an interval tree for efficient range queries
2. **Wire into `<textarea>`** — textarea holds an ExtmarkManager, renders extmark ranges with designated styles
3. **Ghost text mode** — extmarks with `ghost: true` render as semi-transparent text after cursor position
4. **Style integration** — extmark styles map to colors/attributes via `SyntaxStyle` (Gap 3)

**Effort:** Medium (2-3 days)
**Depends on:** Gap 1 (Textarea) — extmarks attach to a text editor surface

---

#### 6. Selection System

**Status: ~25% — Component-local selection only, NO renderer-level API**

**What EXISTS:**
- `packages/components/src/input.tsx` — full local selection (selStart/selEnd, Shift+arrow, Ctrl+A, select all, visual highlight) but entirely self-contained in the component

**What's MISSING:**
- [ ] No `renderer.getSelection()` returning a global selection object
- [ ] No `.getSelectedText()` as a renderer method
- [ ] No `renderer.clearSelection()` as a renderer method
- [ ] No cross-component text selection (selecting across multiple renderables)

**Implementation plan:**
1. **SelectionManager** — global selection state: `anchor` (start node + offset) and `focus` (end node + offset)
2. **Mouse-based selection** — mousedown sets anchor, mousemove extends focus, mouseup finalizes
3. **getSelection() / getSelectedText() / clearSelection()** — public API on the renderer
4. **Visual feedback** — highlight selected ranges across multiple text nodes
5. **Integration with clipboard** (Gap 7) — selected text → OSC 52

**Effort:** Medium (2-3 days)
**Depends on:** Gap 8 (Refs) for node identification, Gap 7 (Clipboard) for copy

---

#### 7. Clipboard Write (OSC 52)

**Status: 0% — Zero code, but trivial to implement**

**What EXISTS:**
- `packages/terminal/src/caps.ts` — OSC 10/11 query infrastructure proves the pattern works
- `packages/input/src/parser.ts` — bracketed paste input parsing (read direction)
- `packages/terminal/src/lifecycle.ts` — enables/disables bracketed paste mode

**What's MISSING:**
- [ ] No `writeClipboard(text)` function
- [ ] No OSC 52 escape sequence output (`\x1b]52;c;${btoa(text)}\x07`)

**Implementation plan:**
1. **`writeClipboard(write, text)`** — in `packages/terminal/src/caps.ts` or new `clipboard.ts`
2. **Base64 encode** — `btoa(text)` or `Buffer.from(text).toString("base64")`
3. **Terminal capability check** — some terminals don't support OSC 52, detect and fallback
4. **Export from `@tge/terminal`** — `terminal.writeClipboard(text)`

**Effort:** Small (~2 hours)
**Depends on:** Nothing

---

#### 8. Renderable Refs API

**Status: ~20% — Building blocks exist but fragmented, NO unified API**

**What EXISTS:**
- `packages/renderer/src/node.ts` — `TGENode` has `parent`, `children[]`, `kind`, `props`, `text`
- `packages/renderer/src/reconciler.ts` — `getParentNode()`, `getFirstChild()`, `getNextSibling()`
- `packages/renderer/src/focus.ts` — `useFocus()` returns `FocusHandle` with `focused()` signal and `focus()` method, `focusedId` signal
- `packages/renderer/src/index.ts` — `useFocus`, `setFocus` exported

**What's MISSING:**
- [ ] No `ref` prop on JSX elements — reconciler doesn't support refs
- [ ] No `blur()` method — only `focus()` exists on FocusHandle
- [ ] No computed layout on nodes — `.height`, `.y`, `.x`, `.width` don't exist (Clay computes and discards)
- [ ] No `.id` property on TGENode
- [ ] No `.isDestroyed` lifecycle flag
- [ ] No `renderer.currentFocusedRenderable` — `focusedId` is internal string, not a renderable object
- [ ] No `renderer.root` exposed to user code — `loop.root` is internal

**Implementation plan:**
1. **Ref callback in reconciler** — when `setProp(node, "ref", callback)` is called, invoke `callback(handle)` with a `NodeHandle`
2. **NodeHandle type** — wraps TGENode with public API: `focus()`, `blur()`, `getChildren()`, `parent`, `id`
3. **Layout geometry storage** — after Clay layout pass, write computed `x/y/width/height` back onto TGENode (or a parallel Map<nodeId, LayoutRect>)
4. **Lifecycle tracking** — set `isDestroyed = true` when removeChild is called
5. **Renderer API object** — expose `renderer.root`, `renderer.currentFocusedRenderable`, `renderer.requestRender()`

**Effort:** Medium (2-3 days)
**Depends on:** Nothing — this is a FOUNDATION that Gaps 1, 2, 5, 6 all need. **BUILD THIS FIRST.**

---

#### 9. Suspend/Resume

**Status: ~40% — Primitives exist, NOT wired together**

**What EXISTS:**
- `packages/terminal/src/lifecycle.ts` — `enter()` (raw mode, alt screen, mouse, cursor hide, keyboard protocol) and `leave()` (reverses everything), both idempotent
- `packages/renderer/src/loop.ts` — `loop.stop()` (pause interval) and `loop.start()` (resume interval)
- `packages/renderer/src/dirty.ts` — `markDirty()`, `markAllDirty()`
- `packages/terminal/src/lifecycle.ts` — `installExitHandlers()` for crash recovery

**What's MISSING:**
- [ ] No `renderer.suspend()` — needs to: stop loop, call `leave()`, disconnect input
- [ ] No `renderer.resume()` — needs to: call `enter()`, reconnect input, `markAllDirty()`, force full repaint, restart loop
- [ ] No `SIGTSTP`/`SIGCONT` signal handling (Ctrl+Z)
- [ ] No `renderer.currentRenderBuffer.clear()` — buffers are internal to loop

**Implementation plan:**
1. **`suspend()` on render loop** — `loop.stop()` → `leave(stdin, write, caps, state)` → disconnect input parsing
2. **`resume()` on render loop** — `enter(stdin, write, caps)` → reconnect input → clear all pixel buffers → `markAllDirty()` → `loop.start()`
3. **SIGTSTP/SIGCONT** — `process.on("SIGTSTP", suspend)` / `process.on("SIGCONT", resume)`
4. **Expose on mount return** — `const { cleanup, suspend, resume } = mount(App, terminal)`

**Effort:** Small-Medium (1 day)
**Depends on:** Nothing

---

### 🟠 MEDIUM

#### 10. Plugin Slot System

**Status: 0% — Zero code exists**

**What EXISTS:** Nothing. "slot", "plugin", "registry" only appear in unrelated internal systems (layer compositing, focus ring, font registry, Babel preload plugin).

**What's MISSING:**
- [ ] No `createSlot()` function
- [ ] No `createSolidSlotRegistry()` function
- [ ] No `SolidPlugin` type
- [ ] No `TuiPluginApi` interface
- [ ] No named slot rendering, no plugin registration mechanism

**Implementation plan:**
1. **`createSlot(name)`** — returns a SolidJS component that renders whatever is registered for that slot name
2. **`createSlotRegistry()`** — Map<slotName, Component[]>, with `register(name, Component)` and `unregister()`
3. **`TgePluginApi`** — exposes renderer, terminal, slot registry to plugins
4. **Plugin type** — `{ name, setup(api: TgePluginApi) }`, registered via `mount(App, terminal, { plugins: [...] })`

**Effort:** Medium (2 days)
**Depends on:** Renderer API object from Gap 8

---

#### 11. Portal

**Status: 0% — Zero code exists (NOTE: SolidJS universal does NOT ship Portal)**

**What EXISTS:** SolidJS re-exports include `For`, `Show`, `Switch`, `Match`, `Index`, `ErrorBoundary` — but NOT `Portal`. `Portal` lives in `solid-js/web` (DOM-specific), NOT in `solid-js/universal`.

**⚠️ Correction:** MIGRATION-ANALYSIS previously stated "SolidJS supports this natively" — this is WRONG for the universal renderer. A custom Portal implementation is required.

**What's MISSING:**
- [ ] No `Portal` component
- [ ] No mechanism to render children outside normal TGENode tree
- [ ] No alternate render targets or secondary roots

**Implementation plan:**
1. **`Portal` component** — creates a secondary TGENode subtree attached directly to the root, bypassing normal tree hierarchy
2. **Z-index management** — portal content renders at a high z-index (overlay layer)
3. **Cleanup** — portal disposes its subtree when unmounted
4. **Usage:** `<Portal><Dialog>Are you sure?</Dialog></Portal>`

**Effort:** Small-Medium (1 day)
**Depends on:** Nothing (can implement independently)

---

### 🟢 LOW

#### 12. Terminal Title

**Status: ~80% — Working escape sequence proven, NO formal API**

**What EXISTS:**
- `examples/phase1.ts` line 26: `term.rawWrite(\`\x1b]2;${info}\x07\`)` — proves OSC 2 works

**What's MISSING:**
- [ ] No `setTerminalTitle(title)` formal API function
- [ ] Not on Terminal type, not on renderer

**Implementation plan:**
1. **Add `setTitle(title: string)` to Terminal type** — `this.rawWrite(\`\x1b]2;${title}\x07\`)`
2. **Export from `@tge/terminal`**

**Effort:** Trivial (~30 minutes)
**Depends on:** Nothing

---

#### 13. Debug Overlay/Console

**Status: ~5% — File logger exists, NO visual overlay**

**What EXISTS:**
- `packages/renderer/src/loop.ts` lines 51-54 — file logger to `/tmp/tge-layers.log`
- `packages/renderer/src/layers.ts` — `dirtyCount()`, `layerCount()` stats functions

**What's MISSING:**
- [ ] No `toggleDebugOverlay()` function
- [ ] No `console.toggle()` method
- [ ] No visual debug overlay (wireframes, layout bounds, FPS counter)
- [ ] No in-terminal log viewer
- [ ] No interactive node inspector

**Implementation plan:**
1. **FPS counter overlay** — track frame times, render as text in top-right corner
2. **Layout bounds overlay** — optional wireframe borders around every Clay element
3. **Node inspector** — tree view of TGENode hierarchy with props (accessible via hotkey)
4. **Console** — in-terminal scrollable log viewer (requires Gap 2 ScrollView)
5. **Toggle hotkey** — `Ctrl+Shift+D` toggles debug mode

**Effort:** Medium (2-3 days)
**Depends on:** Gap 2 (ScrollView) for console, Gap 8 (Refs) for inspector

---

### Implementation Order (Critical Path)

```
Phase 0 — Foundations (UNBLOCKS EVERYTHING)
├── Gap 12: Terminal Title ................ 30 min   ← trivial, do first
├── Gap 7:  Clipboard (OSC 52) ........... 2 hours  ← trivial, do first
├── Gap 8:  Renderable Refs API .......... 2-3 days ← FOUNDATION for gaps 1,2,5,6
└── Gap 9:  Suspend/Resume ............... 1 day    ← wire existing primitives

Phase 1 — Core Interactive (ENABLES MIGRATION START)
├── Gap 2:  ScrollBox Programmatic ....... 2-3 days ← needs Gap 8
├── Gap 1:  Textarea ..................... 3-5 days ← needs Gap 8
├── Gap 11: Portal ....................... 1 day    ← independent
└── Gap 6:  Selection System ............. 2-3 days ← needs Gap 8

Phase 2 — Rich Content (ENABLES FULL AI RESPONSES)
├── Gap 3:  Tree-sitter / Syntax ......... 5-7 days ← independent, longest item
├── Gap 4:  Markdown Rendering ........... 4-6 days ← needs Gap 3
└── Gap 5:  Extmarks .................... 2-3 days ← needs Gap 1

Phase 3 — Polish
├── Gap 10: Plugin Slots ................. 2 days   ← needs Gap 8
└── Gap 13: Debug Overlay ................ 2-3 days ← needs Gaps 2, 8

TOTAL ESTIMATE: ~30-40 days of focused work
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
| Critical gaps                 | 4 (textarea, scrollbox programmatic, tree-sitter, markdown)         |
| High gaps                     | 5 (extmarks, selection, clipboard, renderable refs, suspend/resume) |
| Medium gaps                   | 2 (plugin slots, portal)                                            |
| Low gaps                      | 2 (terminal title, debug overlay)                                   |
| Cross-compilation targets     | 8 (6 required, 2 optional musl)                                     |
| **Estimated total effort**    | **~30-40 days focused work across 4 phases**                        |
| **Foundation blocker**        | **Gap 8 (Refs) — must be built first, unblocks 6 other gaps**       |
| **Longest single item**       | **Gap 3 (Tree-sitter) — 5-7 days, independent, start early**        |
| Publishing strategy           | Claude Code-style: single minified bundle + precompiled vendor/     |

### Existing Component Inventory (10 components)

| Component    | File                   | Interactive | Status    |
| ------------ | ---------------------- | ----------- | --------- |
| Box          | components/box.tsx     | No          | ✅ Ready  |
| Text         | components/text.tsx    | No          | ✅ Ready  |
| RichText     | components/rich-text.tsx | No        | ⚠️ Limited (no per-span color in paragraph flow) |
| ScrollView   | components/scroll-view.tsx | No      | ⚠️ Mouse wheel only, no programmatic API |
| Button       | components/button.tsx  | Yes         | ✅ Ready  |
| Checkbox     | components/checkbox.tsx | Yes        | ✅ Ready  |
| Tabs         | components/tabs.tsx    | Yes         | ✅ Ready  |
| List         | components/list.tsx    | Yes         | ✅ Ready  |
| ProgressBar  | components/progress-bar.tsx | No     | ✅ Ready  |
| Input        | components/input.tsx   | Yes         | ✅ Ready (single-line only) |
