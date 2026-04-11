/**
 * Tabs — tab switcher for TGE.
 *
 * Focus-aware tab headers with Left/Right navigation.
 * Only the active panel's children are rendered.
 *
 * CONTROLLED component — parent owns activeTab state.
 *
 * Architecture:
 *   <Tabs> renders a row of tab headers + the active panel.
 *   Tab headers are Box elements with reactive styling.
 *   Children are passed as an array of { label, content } items.
 *
 * Usage:
 *   const [tab, setTab] = createSignal(0)
 *   <Tabs
 *     activeTab={tab()}
 *     onTabChange={setTab}
 *     tabs={[
 *       { label: "Info",     content: () => <Text>Info panel</Text> },
 *       { label: "Settings", content: () => <Text>Settings panel</Text> },
 *     ]}
 *   />
 */

import type { JSX } from "solid-js"
import { useFocus } from "@tge/renderer"
import {
  surface,
  accent,
  text as textTokens,
  border,
  radius,
  spacing,
} from "@tge/tokens"

export type TabItem = {
  /** Tab header label. */
  label: string
  /** Panel content — render function (lazy). */
  content: () => JSX.Element
}

export type TabsProps = {
  /** Currently active tab index. */
  activeTab: number

  /** Called when the user switches tabs. */
  onTabChange?: (index: number) => void

  /** Tab definitions. */
  tabs: TabItem[]

  /** Accent color for the active tab. Default: accent.thread. */
  color?: number

  /** Focus ID override. */
  focusId?: string
}

export function Tabs(props: TabsProps) {
  const color = () => props.color ?? accent.thread
  const count = () => props.tabs.length

  const { focused } = useFocus({
    id: props.focusId,
    onKeyDown(e) {
      if (e.key === "left") {
        const prev = (props.activeTab - 1 + count()) % count()
        props.onTabChange?.(prev)
      } else if (e.key === "right") {
        const next = (props.activeTab + 1) % count()
        props.onTabChange?.(next)
      }
    },
  })

  const activeContent = () => {
    const tab = props.tabs[props.activeTab]
    return tab ? tab.content() : null
  }

  return (
    <box direction="column" gap={0}>
      {/* Tab header row */}
      <box
        direction="row"
        gap={0}
        borderColor={focused() ? color() : border.subtle}
        borderWidth={focused() ? 2 : 1}
        cornerRadius={0}
      >
        {props.tabs.map((tab, i) => (
          <box
            backgroundColor={
              props.activeTab === i ? surface.card : surface.panel
            }
            padding={spacing.md}
            paddingX={spacing.lg}
            borderColor={
              props.activeTab === i ? color() : 0x00000000
            }
            borderWidth={props.activeTab === i ? 1 : 0}
          >
            <text
              color={
                props.activeTab === i ? color() : textTokens.muted
              }
              fontSize={14}
            >
              {tab.label}
            </text>
          </box>
        ))}
      </box>

      {/* Active panel */}
      <box
        backgroundColor={surface.card}
        padding={spacing.lg}
        borderColor={border.subtle}
        borderWidth={1}
      >
        {activeContent()}
      </box>
    </box>
  )
}
