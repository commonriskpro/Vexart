/**
 * VoidTabs — shadcn-compatible tab switcher using Void design tokens.
 *
 * Built on top of the headless @tge/components Tabs.
 * Variants: default (pill background), line (underline active indicator).
 *
 * Usage:
 *   <VoidTabs
 *     activeTab={tab()}
 *     onTabChange={setTab}
 *     tabs={[
 *       { label: "Overview", content: () => <text>Overview</text> },
 *       { label: "Settings", content: () => <text>Settings</text> },
 *     ]}
 *   />
 */

import { Tabs } from "@vexart/headless"
import type { TabItem, TabRenderContext } from "@vexart/headless"
import { radius, space, font, weight } from "../tokens/tokens"
import { themeColors } from "../theme/theme"

/** @public */
export type TabsVariant = "default" | "line"

/** @public */
export type VoidTabsProps = {
  activeTab: number
  onTabChange?: (index: number) => void
  tabs: TabItem[]
  variant?: TabsVariant
  focusId?: string
}

/** @public */
export function VoidTabs(props: VoidTabsProps) {
  const variant = () => props.variant ?? "default"

  return (
    <Tabs
      activeTab={props.activeTab}
      onTabChange={props.onTabChange}
      tabs={props.tabs}
      focusId={props.focusId}
      renderTab={(tab: TabItem, ctx: TabRenderContext) => (
        <box
          {...ctx.tabProps}
          direction="row"
          alignX="center"
          alignY="center"
          height={36}
          paddingLeft={space[3]}
          paddingRight={space[3]}
          cornerRadius={variant() === "default" ? radius.md : 0}
          backgroundColor={
            variant() === "default" && ctx.active
              ? themeColors.background
              : variant() === "line" && ctx.active
                ? themeColors.secondary
                : themeColors.transparent
          }
          borderBottom={variant() === "line" && ctx.active ? 2 : 0}
          borderColor={variant() === "line" && ctx.active ? themeColors.foreground : themeColors.transparent}
          hoverStyle={{
            backgroundColor: variant() === "default"
              ? ctx.active ? themeColors.background : themeColors.accent
              : ctx.active ? themeColors.secondary : themeColors.accent,
          }}
        >
          <text
            color={
              ctx.active ? themeColors.foreground : themeColors.mutedForeground
            }
            fontSize={font.sm}
            fontWeight={ctx.active ? weight.medium : weight.normal}
          >
            {tab.label}
          </text>
        </box>
      )}
      renderTabBar={(children) => (
        <box
          direction="row"
          backgroundColor={variant() === "default" ? themeColors.muted : themeColors.card}
          cornerRadius={variant() === "default" ? radius.lg : radius.md}
          padding={variant() === "default" ? space[0.5] : space[0.5]}
          borderBottom={variant() === "line" ? 1 : 0}
          borderColor={themeColors.border}
          gap={variant() === "line" ? space[1] : 0}
        >
          {children}
        </box>
      )}
      renderPanel={(content) => (
        <box paddingTop={space[4]}>
          {content}
        </box>
      )}
    />
  )
}
