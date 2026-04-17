/**
 * CodeEditor window kind.
 *
 * Full syntax-highlighted editor via <Textarea>.
 * State: filename + content + language + cursor position.
 */

import type { Accessor } from "solid-js"
import { Textarea } from "../../../components/src/textarea"
import { SyntaxStyle, KANAGAWA } from "@tge/renderer-solid"
import { colors } from "../tokens"

const KANAGAWA_STYLE = SyntaxStyle.fromTheme(KANAGAWA)
import type { WindowKindDef } from "../window-registry"

export type CodeEditorState = {
  filename: string
  content: string
  language: string
  cursorLine?: number
  cursorCol?: number
}

export const codeEditorKind: WindowKindDef<CodeEditorState> = {
  kind: "code-editor",
  defaultTitle: (state) => state.filename,
  defaultSize: { width: 520, height: 380 },
  minSize:     { width: 280, height: 200 },

  render(windowId, state: Accessor<CodeEditorState>, update) {
    return (
      <box width="grow" height="grow" direction="column">
        <Textarea
          value={state().content}
          onChange={(v) => update({ content: v })}
          language={state().language}
          syntaxStyle={KANAGAWA_STYLE}
          color={colors.text}
        />
      </box>
    )
  },
}
