/**
 * Tabs — truly headless tab switcher.
 *
 * Handles focus, keyboard navigation, and active tab state while visuals are supplied by render props.
 *
 * @public
 */

import { createEffect, createSignal } from "solid-js"
import type { JSX } from "solid-js"
import { useFocus } from "@vexart/engine"

// ── Types ──

/** @public */
export type TabItem = {
  label: string
  content: () => JSX.Element
}

/** @public */
export type TabRenderContext = {
  active: boolean
  focused: boolean
  index: number
  /** Spread on the tab header element for click-to-switch. */
  tabProps: {
    onPress: () => void
  }
}

/** @public */
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

/** @public */
export function Tabs(props: TabsProps) {
  const count = () => props.tabs.length
  const [focusedTabIdx, setFocusedTabIdx] = createSignal(props.activeTab)

  createEffect(() => {
    setFocusedTabIdx(props.activeTab)
  })

  const { focused } = useFocus({
    id: props.focusId,
    onKeyDown(e) {
      const total = count()
      if (total === 0) return
      if (e.key === "left") {
        const next = (focusedTabIdx() - 1 + total) % total
        setFocusedTabIdx(next)
        props.onTabChange?.(next)
        return
      }
      if (e.key === "right") {
        const next = (focusedTabIdx() + 1) % total
        setFocusedTabIdx(next)
        props.onTabChange?.(next)
        return
      }
      if (e.key === "home") { setFocusedTabIdx(0); return }
      if (e.key === "end") { setFocusedTabIdx(total - 1); return }
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
        focused: focused() && focusedTabIdx() === i,
        index: i,
        tabProps: {
          onPress: () => { setFocusedTabIdx(i); props.onTabChange?.(i) },
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
