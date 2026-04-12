/**
 * Table — styled data table using Void design tokens.
 *
 * Built on top of the headless @tge/components Table.
 * Provides ALL visual rendering via render props.
 *
 * Usage:
 *   <VoidTable
 *     columns={[
 *       { key: "name", header: "Name", width: 160 },
 *       { key: "email", header: "Email", width: "grow" },
 *     ]}
 *     data={users()}
 *     selectedRow={idx()}
 *     onSelectedRowChange={setIdx}
 *   />
 */

import { Table } from "@tge/components"
import type { TableColumn, TableCellContext } from "@tge/components"
import type { JSX } from "solid-js"
import { radius, space, font, weight, shadows } from "./tokens"
import { themeColors } from "./theme"

export type VoidTableProps = {
  columns: TableColumn[]
  data: Record<string, any>[]
  selectedRow?: number
  onSelectedRowChange?: (index: number) => void
  onRowSelect?: (index: number, row: Record<string, any>) => void
  showHeader?: boolean
  striped?: boolean
  disabled?: boolean
  focusId?: string
}

export function VoidTable(props: VoidTableProps) {
  const striped = () => props.striped ?? true

  return (
    <Table
      columns={props.columns}
      data={props.data}
      selectedRow={props.selectedRow}
      onSelectedRowChange={props.onSelectedRowChange}
      onRowSelect={props.onRowSelect}
      showHeader={props.showHeader}
      disabled={props.disabled}
      focusId={props.focusId}
      renderHeader={(col: TableColumn) => (
        <box padding={space[1]} paddingX={space[2]}>
          <text color={themeColors.mutedForeground} fontSize={font.xs} fontWeight={weight.semibold}>
            {col.header}
          </text>
        </box>
      )}
      renderCell={(value: any, col: TableColumn, rowIndex: number, ctx: TableCellContext) => (
        <box padding={space[1]} paddingX={space[2]}>
          <text
            color={ctx.selected ? themeColors.primary : themeColors.foreground}
            fontSize={font.sm}
          >
            {value != null ? String(value) : ""}
          </text>
        </box>
      )}
      renderRow={(children: JSX.Element, rowIndex: number, ctx: TableCellContext) => {
        const isEven = rowIndex % 2 === 0
        const bg = ctx.selected
          ? themeColors.accent
          : striped() && !isEven
            ? themeColors.secondary
            : themeColors.card
        return (
          <box direction="row" backgroundColor={bg} borderBottom={1} borderColor={themeColors.border}>
            {children}
          </box>
        )
      }}
      renderTable={(children: JSX.Element) => (
        <box
          direction="column"
          cornerRadius={radius.md}
          borderColor={themeColors.border}
          borderWidth={1}
        >
          {children}
        </box>
      )}
    />
  )
}
