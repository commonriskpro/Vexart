/**
 * Table — truly headless data table.
 *
 * Handles row selection and keyboard navigation while visuals are supplied by render props.
 *
 * @public
 */

import { For } from "solid-js"
import type { JSX } from "solid-js"
import { useFocus } from "@vexart/engine"
import { useListNavigation } from "./list-navigation"

// ── Types ──

/** @public */
export type TableColumn = {
  key: string
  header: string
  width?: number | "grow"
  align?: "left" | "center" | "right"
}

/** @public */
export type TableCellContext = {
  selected: boolean
  focused: boolean
  rowIndex: number
  /** Spread on the row element for click selection. */
  rowProps: {
    onPress: () => void
  }
}

/** @public */
export type TableProps = {
  columns: TableColumn[]
  data: Record<string, any>[]
  selectedRow?: number
  onSelectedRowChange?: (index: number) => void
  onRowSelect?: (index: number, row: Record<string, any>) => void
  showHeader?: boolean
  disabled?: boolean
  focusId?: string
  /** Render a header cell. If not provided, header is not rendered. */
  renderHeader?: (column: TableColumn) => JSX.Element
  /** Render a data cell. REQUIRED — no default visual. */
  renderCell: (value: any, column: TableColumn, rowIndex: number, ctx: TableCellContext) => JSX.Element
  /** Render a row container. Default: horizontal box. */
  renderRow?: (children: JSX.Element, rowIndex: number, ctx: TableCellContext) => JSX.Element
  /** Render the table container. Default: vertical box. */
  renderTable?: (children: JSX.Element) => JSX.Element
}

/** @public */
export function Table(props: TableProps) {
  const disabled = () => props.disabled ?? false
  const showHeader = () => props.showHeader !== false && !!props.renderHeader
  const count = () => props.data.length

  const nav = useListNavigation({
    count,
    selectedIndex: () => props.selectedRow ?? -1,
    onSelectedChange: (index) => {
      props.onSelectedRowChange?.(index)
    },
    onSelect: (index) => {
      if (index >= 0 && index < props.data.length) {
        props.onRowSelect?.(index, props.data[index])
      }
    },
    orientation: "vertical",
    vim: true,
  })

  const { focused } = useFocus({
    id: props.focusId,
    onKeyDown(e) {
      if (disabled()) return
      nav.onKeyDown(e)
    },
  })

  const colWidth = (col: TableColumn) => col.width ?? "grow"

  // ── Header ──

  function HeaderRow() {
    if (!showHeader()) return null
    return (
      <box direction="row">
        <For each={props.columns}>
          {(col) => (
            <box width={colWidth(col)}>
              {props.renderHeader!(col)}
            </box>
          )}
        </For>
      </box>
    )
  }

  // ── Data rows ──

  function DataRows() {
    return (
      <>
        <For each={props.data}>
          {(row, index) => {
            const ctx: TableCellContext = {
              get selected() { return props.selectedRow === index() },
              get focused() { return focused() },
              get rowIndex() { return index() },
              rowProps: {
                onPress: () => {
                  if (disabled()) return
                  props.onSelectedRowChange?.(index())
                  props.onRowSelect?.(index(), row)
                },
              },
            }
            const cells = (
              <>
                <For each={props.columns}>
                  {(col) => (
                    <box width={colWidth(col)}>
                      {props.renderCell(row[col.key], col, index(), ctx)}
                    </box>
                  )}
                </For>
              </>
            )

            return props.renderRow
              ? props.renderRow(cells, index(), ctx)
              : <box direction="row">{cells}</box>
          }}
        </For>
      </>
    )
  }

  const content = (
    <>
      <HeaderRow />
      <DataRows />
    </>
  )

  return props.renderTable
    ? <>{props.renderTable(content)}</>
    : <box direction="column">{content}</box>
}
