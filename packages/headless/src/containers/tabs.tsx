/**
 * Tabs — truly headless tab switcher.
 *
 * Handles focus, keyboard navigation, and active tab state while visuals are supplied by render props.
 *
 * @public
 */

import { createEffect, createSignal, untrack } from "solid-js"
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

  // Internal signal mirrors activeTab — guarantees reactivity even if
  // props.activeTab loses tracking through component layers.
  const [active, setActive] = createSignal(props.activeTab)
  const [focusedTabIdx, setFocusedTabIdx] = createSignal(props.activeTab)

  createEffect(() => {
    setActive(props.activeTab)
    setFocusedTabIdx(props.activeTab)
  })

  function switchTab(index: number) {
    setActive(index)
    setFocusedTabIdx(index)
    props.onTabChange?.(index)
  }

  const { focused } = useFocus({
    id: props.focusId,
    onKeyDown(e) {
      const total = count()
      if (total === 0) return
      if (e.key === "left") { switchTab((active() - 1 + total) % total); return }
      if (e.key === "right") { switchTab((active() + 1) % total); return }
      if (e.key === "home") { switchTab(0); return }
      if (e.key === "end") { switchTab(total - 1); return }
    },
  })

  // Keep the header and active panel as separate reactive regions. Focus moves
  // update only the tab headers; rebuilding the panel at the same time can
  // recursively remount interactive children while Solid is dispatching the
  // focus event (especially Lists and Markdown tables).
  const headerContent = () => {
    const current = active()
    const isFocused = focused()
    const focusedIndex = focusedTabIdx()
    return untrack(() => {
      const headers = props.tabs.map((tab, i) => {
        const ctx: TabRenderContext = {
          active: current === i,
          focused: isFocused && focusedIndex === i,
          index: i,
          tabProps: {
            onPress: () => switchTab(i),
          },
        }
        return props.renderTab(tab, ctx)
      })
      return <>{headers}</>
    })
  }

  const panelContent = () => {
    const current = active()
    return untrack(() => {
      const tab = props.tabs[current]
      const content = tab ? tab.content() : null
      return <>{content}</>
    })
  }

  const bar = props.renderTabBar
    ? props.renderTabBar(<>{headerContent}</>)
    : <box direction="row">{headerContent}</box>
  const panel = props.renderPanel
    ? props.renderPanel(<>{panelContent}</>)
    : <>{panelContent}</>

  return (
    <box direction="column" width="100%">
      {props.renderContainer
        ? props.renderContainer(bar, panel)
        : <box direction="column">{bar}{panel}</box>}
    </box>
  )
}
