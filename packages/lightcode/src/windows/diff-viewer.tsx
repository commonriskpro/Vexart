/**
 * DiffViewer window kind.
 *
 * Shows a unified diff between two versions of a file.
 * State: filename + old/new content + language.
 */

import type { Accessor } from "solid-js"
import { Diff } from "../../../components/src/diff"
import { colors, space } from "../tokens"
import type { WindowKindDef } from "../window-registry"

export type DiffViewerState = {
  filename: string
  /** Pre-computed unified diff string */
  diff: string
  language?: string
}

export const diffViewerKind: WindowKindDef<DiffViewerState> = {
  kind: "diff-viewer",
  defaultTitle: (state) => `Diff / ${state.filename}`,
  defaultSize: { width: 360, height: 280 },
  minSize:     { width: 240, height: 160 },

  render(_windowId, state: Accessor<DiffViewerState>, _update) {
    return (
      <box width="grow" height="grow" direction="column" gap={space[1]}>
        {/* Filename breadcrumb */}
        <box direction="row" alignY="center" gap={space[1]} paddingBottom={space[1]}>
          <text color={colors.textDim} fontSize={9}>↳</text>
          <text color={colors.textSoft} fontSize={10}>{state().filename}</text>
        </box>
        <Diff diff={state().diff} filetype={state().language} showLineNumbers />
      </box>
    )
  },
}
