/**
 * Table — truly headless data table.
 *
 * Handles row selection and keyboard navigation while visuals are supplied by render props.
 *
 * @public
 */

import type { JSX } from "solid-js"
import { useFocus } from "@vexart/engine"

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

  const { focused } = useFocus({
    id: props.focusId,
    onKeyDown(e) {
      if (disabled()) return
      const rowCount = props.data.length
      if (rowCount === 0) return
      const current = props.selectedRow ?? -1

      if (e.key === "down" || e.key === "j") {
        props.onSelectedRowChange?.(Math.min(current + 1, rowCount - 1))
        return
      }
      if (e.key === "up" || e.key === "k") {
        props.onSelectedRowChange?.(Math.max(current - 1, 0))
        return
      }
      if (e.key === "enter") {
        if (current >= 0 && current < rowCount) {
          props.onRowSelect?.(current, props.data[current])
        }
        return
      }
    },
  })

  const colWidth = (col: TableColumn) => col.width ?? "grow"

  // ── Header ──

  function HeaderRow() {
    if (!showHeader()) return null
    return (
      <box direction="row">
        {props.columns.map((col) => (
          <box width={colWidth(col)}>
            {props.renderHeader!(col)}
          </box>
        ))}
      </box>
    )
  }

  // ── Data rows ──

  function DataRows() {
    return (
      <>
        {props.data.map((row, i) => {
          const ctx: TableCellContext = {
            selected: props.selectedRow === i,
            focused: focused(),
            rowIndex: i,
            rowProps: {
              onPress: () => {
                if (disabled()) return
                props.onSelectedRowChange?.(i)
                props.onRowSelect?.(i, row)
              },
            },
          }

          const cells = (
            <>
              {props.columns.map((col) => (
                <box width={colWidth(col)}>
                  {props.renderCell(row[col.key], col, i, ctx)}
                </box>
              ))}
            </>
          )

          return props.renderRow
            ? props.renderRow(cells, i, ctx)
            : <box direction="row">{cells}</box>
        })}
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
