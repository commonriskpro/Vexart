/**
 * Tabs — truly headless tab switcher.
 *
 * CONTROLLED component — parent owns activeTab state.
 * Focus-aware with Left/Right arrow navigation.
 *
 * This is a BEHAVIOR-ONLY component. It provides:
 *   - Focus management (useFocus)
 *   - Keyboard navigation (Left/Right, wraps around)
 *   - Active tab tracking
 *   - Lazy content rendering
 *
 * ALL visual styling is the consumer's responsibility via render props.
 * Use @tge/void VoidTabs for a styled version.
 *
 * Usage:
 *   <Tabs
 *     activeTab={tab()}
 *     onTabChange={setTab}
 *     tabs={[
 *       { label: "Info", content: () => <text>Info panel</text> },
 *       { label: "Settings", content: () => <text>Settings panel</text> },
 *     ]}
 *     renderTab={(tab, ctx) => (
 *       <box backgroundColor={ctx.active ? "#334" : "#111"} padding={8}>
 *         <text color={ctx.active ? "#fff" : "#888"}>{tab.label}</text>
 *       </box>
 *     )}
 *   />
 */

import type { JSX } from "solid-js"
import { useFocus } from "@tge/renderer-solid"

// ── Types ──

export type TabItem = {
  label: string
  content: () => JSX.Element
}

export type TabRenderContext = {
  active: boolean
  focused: boolean
  index: number
  /** Spread on the tab header element for click-to-switch. */
  tabProps: {
    onPress: () => void
  }
}

export type TabsProps = {
  activeTab: number
  onTabChange?: (index: number) => void
  tabs: TabItem[]
  focusId?: string
  /** Render each tab header. REQUIRED — no default visual. */
  renderTab: (tab: TabItem, ctx: TabRenderContext) => JSX.Element
  /** Render the tab header bar container. Default: horizontal box. */
  renderTabBar?: (children: JSX.Element) => JSX.Element
  /** Render the active panel container. Default: just the content. */
  renderPanel?: (content: JSX.Element) => JSX.Element
  /** Render the entire tabs container. Default: vertical box. */
  renderContainer?: (tabBar: JSX.Element, panel: JSX.Element) => JSX.Element
}

export function Tabs(props: TabsProps) {
  const count = () => props.tabs.length

  const { focused } = useFocus({
    id: props.focusId,
    onKeyDown(e) {
      if (e.key === "left") {
        props.onTabChange?.((props.activeTab - 1 + count()) % count())
      } else if (e.key === "right") {
        props.onTabChange?.((props.activeTab + 1) % count())
      }
    },
  })

  const activeContent = () => {
    const tab = props.tabs[props.activeTab]
    return tab ? tab.content() : null
  }

  const tabHeaders = () =>
    props.tabs.map((tab, i) => {
      const ctx: TabRenderContext = {
        active: props.activeTab === i,
        focused: focused(),
        index: i,
        tabProps: {
          onPress: () => props.onTabChange?.(i),
        },
      }
      return props.renderTab(tab, ctx)
    })

  const tabBar = props.renderTabBar
    ? props.renderTabBar(<>{tabHeaders()}</>)
    : <box direction="row">{tabHeaders()}</box>

  const panel = props.renderPanel
    ? props.renderPanel(<>{activeContent()}</>)
    : <>{activeContent()}</>

  return props.renderContainer
    ? <>{props.renderContainer(tabBar, panel)}</>
    : <box direction="column">{tabBar}{panel}</box>
}
