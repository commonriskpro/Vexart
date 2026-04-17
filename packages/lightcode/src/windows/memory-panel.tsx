/**
 * MemoryPanel window kind.
 *
 * Displays a key-value inspector with optional reference list.
 * Matches the "Memory" panel from the Lightcode mock.
 */

import type { Accessor } from "solid-js"
import { For } from "solid-js"
import { colors, space, radius } from "../tokens"
import { Rule, InspectorRow, PanelSection } from "../primitives"
import type { WindowKindDef } from "../window-registry"

export type MemoryEntry = {
  key: string
  value: string
  warm?: boolean
}

export type MemoryReference = {
  kind: "fn" | "var" | "type"
  name: string
  file: string
  line: number
}

export type MemoryPanelState = {
  title: string
  entries: MemoryEntry[]
  references?: MemoryReference[]
}

const KIND_GLYPH: Record<MemoryReference["kind"], string> = {
  fn:   "ƒ",
  var:  "v",
  type: "T",
}

export const memoryPanelKind: WindowKindDef<MemoryPanelState> = {
  kind: "memory-panel",
  defaultTitle: (state) => state.title,
  defaultSize: { width: 280, height: 260 },
  minSize:     { width: 200, height: 160 },

  render(_windowId, state: Accessor<MemoryPanelState>, _update) {
    return (
      <box width="grow" height="grow" direction="column" gap={space[2]}>

        {/* Key-value entries */}
        <PanelSection padded>
          <For each={state().entries}>{(entry) => (
            <InspectorRow
              label={entry.key}
              value={entry.value}
              tone={entry.warm ? "warm" : "default"}
            />
          )}</For>
        </PanelSection>

        {/* References section */}
        {state().references && state().references!.length > 0 ? (
          <box direction="column" gap={space[1]}>
            <box direction="row" alignY="center" gap={space[1]}>
              <text color={colors.textDim} fontSize={9}>References</text>
              <box width="grow" />
              <text color={colors.textMute} fontSize={9}>—</text>
            </box>
            <Rule />
            <For each={state().references}>{(ref) => (
              <box
                direction="row"
                gap={space[2]}
                alignY="center"
                paddingY={2}
              >
                <box
                  width={14}
                  height={14}
                  alignX="center"
                  alignY="center"
                  backgroundColor={colors.chip}
                  borderColor={colors.panelBorder}
                  borderWidth={1}
                  cornerRadius={radius.sm}
                >
                  <text color={colors.textDim} fontSize={8}>{KIND_GLYPH[ref.kind]}</text>
                </box>
                <text color={colors.textSoft} fontSize={9}>{ref.name}</text>
                <box width="grow" />
                <text color={colors.textMute} fontSize={8}>{ref.file}</text>
                <text color={colors.textMute} fontSize={8}>{String(ref.line)}</text>
              </box>
            )}</For>
          </box>
        ) : null}

      </box>
    )
  },
}
