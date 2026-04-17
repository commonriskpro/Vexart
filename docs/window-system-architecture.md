# Window System Architecture

TGE ships a complete windowing system in `@tge/windowing`. It supports movable, resizable, minimizable, maximizable windows with z-ordering, focus management, and modal blocking — built entirely on TGE's existing `floating`, `layer`, `useDrag`, and focus primitives.

---

## Mental Model

```
WindowManager      ← pure state machine (no JSX)
    ↓
Desktop            ← JSX root, provides context
    ↓
WindowHost         ← renders one window, connects to manager
    ↓
WindowFrame        ← visual shell (bg, border, shadow)
    ↓
WindowHeader       ← drag handle + title
WindowControls     ← minimize / maximize / close buttons
[your content]     ← inside the window
```

**WindowManager owns POSITION/SIZE/STATUS/Z-ORDER.**
Your app owns CONTENT STATE (what each window shows).

These are two separate concerns. The windowing system never touches content.

---

## Core Packages

### `createWindowManager(opts?)`

Creates the window manager — a pure state machine with no JSX.

```typescript
import { createWindowManager } from "@tge/windowing"

const manager = createWindowManager()
```

**API:**

```typescript
manager.openWindow(input: WindowOpenInput): void
manager.closeWindow(id: string): void
manager.focusWindow(id: string): void
manager.bringToFront(id: string): void
manager.moveWindow(id: string, patch: WindowPositionPatch): void
manager.resizeWindow(id: string, patch: WindowSizePatch): void
manager.minimizeWindow(id: string): void
manager.maximizeWindow(id: string, workspace: WindowBounds): void
manager.restoreWindow(id: string): void
manager.toggleMinimize(id: string): void
manager.toggleMaximize(id: string, workspace: WindowBounds): void
manager.getWindow(id: string): WindowDescriptor | undefined
manager.listWindows(): WindowDescriptor[]
manager.getState(): WindowManagerState
manager.subscribe(listener): () => void   // returns unsubscribe
```

### `WindowDescriptor`

The state object for a single window:

```typescript
type WindowDescriptor = {
  id: string
  kind: string              // app-defined type label
  title: string
  status: "normal" | "minimized" | "maximized"
  bounds: { x, y, width, height }
  restoreBounds?: WindowBounds
  zIndex: number
  focused: boolean
  modal: boolean
  keepAlive: boolean
  capabilities: {
    movable: boolean
    resizable: boolean
    minimizable: boolean
    maximizable: boolean
    closable: boolean
  }
  constraints: {
    minWidth?: number
    minHeight?: number
    maxWidth?: number
    maxHeight?: number
  }
}
```

### `<Desktop>`

Root container. Provides `WindowManagerContext` to all children. Renders all windows via `<For>`.

```tsx
import { Desktop } from "@tge/windowing"

<Desktop
  manager={manager}
  width={dims.width()}
  height={dims.height()}
  renderWindow={(win) => (
    <WindowHost
      windowId={win.id}
      renderContent={() => <MyWindowContent windowId={win.id} />}
      renderHeader={(w, ctx) => <MyHeader win={w} ctx={ctx} />}
    />
  )}
>
  {/* Background content (SceneCanvas, etc.) */}
</Desktop>
```

### `<WindowHost>`

Connects a window ID to the manager context. Handles minimized state.

```tsx
<WindowHost
  windowId="editor-1"
  renderContent={(win) => <CodeEditor />}
  renderHeader={(win, ctx) => <MyHeader win={win} ctx={ctx} />}
  renderMinimized={(win) => <MinimizedTab win={win} />}

  // Visual props (forwarded to WindowFrame)
  activeBackgroundColor={0x181a20ff}
  inactiveBackgroundColor={0x111318f4}
  activeBorderColor={0xffffff2a}
  inactiveBorderColor={0xffffff14}
  activeShadow={{ x: 0, y: 14, blur: 28, color: 0x00000034 }}
  cornerRadius={10}
  contentPadding={12}
/>
```

### `<WindowControls>`

Minimize / maximize / close buttons, wired to the manager automatically.

```tsx
<WindowControls
  windowId={win.id}
  showMinimize={true}    // default true
  showMaximize={true}    // default true
  showClose={true}       // default true
  buttonSize={18}
  gap={6}
/>
```

### `useWindowDrag(windowId, opts?)`

Hook used internally by `WindowFrame`. Powers window dragging.

```typescript
const drag = useWindowDrag(windowId, {
  disabled: () => someCondition,
  shouldStart: (event, win) => isInDragRegion(event),
})

// Use drag.dragHandleProps on the header element:
<box onMouseDown={drag.dragHandleProps.onMouseDown} ...>
  {title}
</box>
```

### `useWindowResize(windowId, opts?)`

Hook used internally by `WindowFrame`. Powers 8-direction resize.

```typescript
const resize = useWindowResize(windowId)

// Use resize.getHandleProps(edge) on resize handle elements.
// WindowResizeHandles renders all 8 handles automatically.
```

---

## Typical App Structure

```tsx
import { createWindowManager, Desktop, WindowHost, WindowControls } from "@tge/windowing"
import { createTerminal, mount, useTerminalDimensions } from "@tge/renderer-solid"

async function main() {
  const terminal = await createTerminal()
  const manager = createWindowManager()

  // Open initial windows
  manager.openWindow({
    id: "editor-1",
    kind: "code-editor",
    title: "main.ts",
    bounds: { x: 100, y: 80, width: 600, height: 400 },
  })

  function App() {
    const dims = useTerminalDimensions(terminal)

    return (
      <Desktop
        manager={manager}
        width={dims.width()}
        height={dims.height()}
        renderWindow={(win) => (
          <WindowHost
            windowId={win.id}
            activeBackgroundColor={0x1a1a2aff}
            activeBorderColor={0xffffff20}
            cornerRadius={10}
            contentPadding={12}
            renderHeader={(w, ctx) => (
              <box
                direction="row"
                alignY="center"
                paddingX={12}
                height={28}
                onMouseDown={ctx.dragHandleProps?.onMouseDown}
                onMouseMove={ctx.dragHandleProps?.onMouseMove}
                onMouseUp={ctx.dragHandleProps?.onMouseUp}
              >
                <text color={0xe0e0e0ff}>{w.title}</text>
                <box width="grow" />
                <WindowControls windowId={w.id} />
              </box>
            )}
            renderContent={() => <YourContent kind={win.kind} />}
          />
        )}
      >
        {/* Optional background */}
        <box width="grow" height="grow" backgroundColor={0x0a0a12ff} />
      </Desktop>
    )
  }

  mount(App, terminal)
}

main()
```

---

## Opening Windows Dynamically

```typescript
// From anywhere — a button press, a keyboard shortcut, an API response:
manager.openWindow({
  id: `editor-${Date.now()}`,
  kind: "code-editor",
  title: "new-file.ts",
  bounds: { x: 120, y: 100, width: 560, height: 380 },
  constraints: { minWidth: 280, minHeight: 200 },
  capabilities: { closable: true, minimizable: true, maximizable: true, movable: true, resizable: true },
})
```

---

## Persisting Window Layout

Subscribe to manager state changes and serialize:

```typescript
manager.subscribe((state) => {
  const layout = state.order.map(id => {
    const win = state.windowsById[id]
    if (!win) return null
    return { id: win.id, kind: win.kind, title: win.title, bounds: win.bounds, status: win.status }
  }).filter(Boolean)

  localStorage.setItem("window-layout", JSON.stringify(layout))
})
```

Restore on startup:

```typescript
const saved = JSON.parse(localStorage.getItem("window-layout") ?? "[]")
for (const w of saved) manager.openWindow(w)
```

---

## Architecture Notes

### Why separate WindowManager from JSX?

Pure state machine = testable, serializable, and accessible from outside the component tree. The manager can be mutated by hotkeys, IPC, or timers without being inside a SolidJS effect.

### How z-ordering works

Each `WindowDescriptor` has a `zIndex` (integer, starts at 100). `bringToFront` increments the global counter and assigns it. `WindowFrame` reads `win.zIndex` and passes it to the `floating="root"` box's `zIndex` prop — Clay and the layer compositor respect it.

### How drag connects to the manager

`useWindowDrag` uses TGE's `useDrag` hook internally. On each drag event, it calls `manager.moveWindow(id, nextPosition)` — which updates the state machine — which triggers the `subscribe` listener — which updates the SolidJS signal in `WindowManagerContext` — which causes `WindowFrame` to re-render with the new `floatOffset`.

This is one-way data flow: drag events → manager state → reactive signal → render.
