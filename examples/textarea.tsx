/**
 * Vexart Textarea Demo — multiline text editor component.
 *
 * Demonstrates:
 *   - Multi-line editing with Up/Down/PgUp/PgDown
 *   - Enter inserts newline, Ctrl+Enter submits
 *   - Shift+arrows for selection
 *   - Multi-line paste (Ctrl+V / bracketed paste)
 *   - TextareaHandle ref API (programmatic control)
 *   - Home/End per line, Ctrl+Home/End for buffer
 *
 * Controls:
 *   - Tab: switch focus between textarea and buttons
 *   - Enter: new line in textarea
 *   - Ctrl+Enter: submit (logged to footer)
 *   - Esc: quit
 *
 * Run:  bun run demo14 (requires Ghostty WITHOUT tmux)
 * Requires: bun install && cargo build
 */

import { createSignal } from "solid-js"
import { useTerminalDimensions } from "@vexart/engine"
import { createApp, useAppTerminal } from "@vexart/app"
import { Textarea, Button } from "@vexart/headless"
import type { TextareaHandle } from "@vexart/headless"

function App() {
  const [code, setCode] = createSignal("Hello Vexart!\nThis is a multiline textarea.\n\nTry typing, arrows, Home/End, PgUp/PgDown.\nShift+arrows to select.\nCtrl+Enter to submit.")
  const [status, setStatus] = createSignal("Ready — Tab to focus, type to edit")
  let textareaRef: TextareaHandle | undefined
  const terminal = useAppTerminal()
  const dims = useTerminalDimensions(terminal)

  return (
    <box direction="column" width={dims.width()} height={dims.height()} backgroundColor="#0a0a14" padding={20} gap={12}>
      {/* Header */}
      <box direction="column" gap={4}>
        <text color="#e0e0e0" fontSize={14}>Textarea Demo (demo14)</text>
        <text color="#888888" fontSize={14}>{status()}</text>
      </box>

      {/* Textarea */}
      <Textarea
        ref={(h: TextareaHandle) => { textareaRef = h }}
        value={code()}
        onChange={(v) => {
          setCode(v)
          if (textareaRef) {
            setStatus(`Row ${textareaRef.cursorRow + 1}, Col ${textareaRef.cursorCol + 1} | ${v.split("\n").length} lines`)
          }
        }}
        onSubmit={(v) => {
          setStatus(`Submitted! ${v.split("\n").length} lines, ${v.length} chars`)
        }}
        onCursorChange={(row, col) => {
          setStatus(`Row ${row + 1}, Col ${col + 1} | ${code().split("\n").length} lines`)
        }}
        width={600}
        height={300}
        placeholder="Start typing..."
      />

      {/* Action buttons */}
      <box direction="row" gap={10}>
        <Button
          onPress={() => {
            textareaRef?.clear()
            setStatus("Cleared!")
          }}
          renderButton={(ctx) => (
            <box padding={6} paddingX={12} cornerRadius={4}
              backgroundColor={ctx.pressed ? "#333" : "#222"}
              borderColor={ctx.focused ? "#4488cc" : "#555"} borderWidth={1}>
              <text color="#ccc" fontSize={14}>Clear</text>
            </box>
          )}
        />
        <Button
          onPress={() => {
            textareaRef?.gotoBufferEnd()
            setStatus("Jumped to buffer end")
          }}
          renderButton={(ctx) => (
            <box padding={6} paddingX={12} cornerRadius={4}
              backgroundColor={ctx.pressed ? "#333" : "#222"}
              borderColor={ctx.focused ? "#4488cc" : "#555"} borderWidth={1}>
              <text color="#ccc" fontSize={14}>Go to End</text>
            </box>
          )}
        />
        <Button
          onPress={() => {
            textareaRef?.insertText("\n--- inserted ---\n")
            setStatus("Text inserted!")
          }}
          renderButton={(ctx) => (
            <box padding={6} paddingX={12} cornerRadius={4}
              backgroundColor={ctx.pressed ? "#333" : "#222"}
              borderColor={ctx.focused ? "#4488cc" : "#555"} borderWidth={1}>
              <text color="#ccc" fontSize={14}>Insert Text</text>
            </box>
          )}
        />
      </box>

      {/* Footer */}
      <text color="#555555" fontSize={14}>Tab=focus  Esc=quit  Enter=newline  Ctrl+Enter=submit</text>
    </box>
  )
}

await createApp(() => <App />, {
  quit: ["escape", "ctrl+c"],
  mount: {
    experimental: {
    },
  },
})
