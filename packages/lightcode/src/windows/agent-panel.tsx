/**
 * AgentPanel window kind.
 *
 * Shows an agent's current task, status, and log entries.
 * Matches the "Agent / Running" panel from the Lightcode mock.
 */

import type { Accessor } from "solid-js"
import { For } from "solid-js"
import { colors, space, radius } from "../tokens"
import { Rule, Chip } from "../primitives"
import type { WindowKindDef } from "../window-registry"

export type AgentLogEntry = {
  level: "info" | "success" | "warn" | "error"
  message: string
}

export type AgentPanelState = {
  agentName: string
  status: "running" | "idle" | "error" | "done"
  task?: string
  source?: string
  model?: string
  logs: AgentLogEntry[]
}

const STATUS_COLOR: Record<AgentPanelState["status"], number> = {
  running: 0x56d4a8ff,
  idle:    0x888888ff,
  error:   0xff5555ff,
  done:    0x6ab0f5ff,
}

const LOG_COLOR: Record<AgentLogEntry["level"], number> = {
  info:    0xa0a0a0ff,
  success: 0x56d4a8ff,
  warn:    0xf3bf6bff,
  error:   0xff5555ff,
}

const LOG_GLYPH: Record<AgentLogEntry["level"], string> = {
  info:    "·",
  success: "✓",
  warn:    "!",
  error:   "✕",
}

export const agentPanelKind: WindowKindDef<AgentPanelState> = {
  kind: "agent-panel",
  defaultTitle: (state) => `Agent · ${state.agentName}`,
  defaultSize: { width: 320, height: 240 },
  minSize:     { width: 220, height: 160 },

  render(_windowId, state: Accessor<AgentPanelState>, _update) {
    return (
      <box width="grow" height="grow" direction="column" gap={space[2]}>

        {/* Status row */}
        <box direction="row" gap={space[2]} alignY="center">
          <box
            width={8} height={8}
            cornerRadius={4}
            backgroundColor={STATUS_COLOR[state().status]}
          />
          <text color={STATUS_COLOR[state().status]} fontSize={10}>
            {state().status.charAt(0).toUpperCase() + state().status.slice(1)}
          </text>
          {state().task ? (
            <box
              direction="row"
              gap={space[1]}
              paddingX={space[1]}
              paddingY={2}
              backgroundColor={0xf3bf6b10}
              borderColor={colors.panelBorderWarm}
              borderWidth={1}
              cornerRadius={radius.sm}
            >
              <text color={colors.textDim} fontSize={8}>Task</text>
              <text color={colors.warm} fontSize={9}>{state().task}</text>
            </box>
          ) : null}
        </box>

        {/* Meta row */}
        {(state().source || state().model) ? (
          <box direction="row" gap={space[2]} alignY="center">
            {state().source ? (
              <box direction="row" gap={4} alignY="center">
                <text color={colors.textMute} fontSize={8}>Sources</text>
                <Chip label={state().source!} />
              </box>
            ) : null}
            {state().model ? (
              <box direction="row" gap={4} alignY="center">
                <text color={colors.textMute} fontSize={8}>Model</text>
                <Chip label={state().model!} />
              </box>
            ) : null}
          </box>
        ) : null}

        <Rule />

        {/* Log entries */}
        <box direction="column" gap={2}>
          <For each={state().logs}>{(entry) => (
            <box direction="row" gap={space[1]} alignY="center">
              <text color={LOG_COLOR[entry.level]} fontSize={9}>
                {LOG_GLYPH[entry.level]}
              </text>
              <text color={LOG_COLOR[entry.level] === LOG_COLOR.info ? colors.textSoft : LOG_COLOR[entry.level]} fontSize={9}>
                {entry.message}
              </text>
            </box>
          )}</For>
        </box>

      </box>
    )
  },
}
