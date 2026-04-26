/**
 * WrapRow — flexWrap workaround for Flexily.
 *
 * Flexily doesn't support flexWrap natively. This component simulates it
 * by measuring children and splitting them into rows that fit within
 * the available width.
 *
 * Uses a simple greedy algorithm: add items to the current row until
 * the next item would overflow, then start a new row.
 *
 * Usage:
 *   <WrapRow width={300} itemWidth={80} gap={4}>
 *     <For each={tags}>{(tag) =>
 *       <Box width={80}><Text>{tag}</Text></Box>
 *     }</For>
 *   </WrapRow>
 */

import type { JSX } from "solid-js"

/** @public */
export type WrapRowProps = {
  /** Total available width. */
  width: number
  /** Width of each item (assumed uniform). For variable widths, set to the max. */
  itemWidth: number
  /** Gap between items. Default: 0. */
  gap?: number
  /** Gap between rows. Default: same as gap. */
  rowGap?: number
  /** Children elements to wrap. */
  children?: JSX.Element
}

/** @public */
export function WrapRow(props: WrapRowProps) {
  const gap = () => props.gap ?? 0
  const rowGap = () => props.rowGap ?? gap()
  const itemsPerRow = () => Math.max(1, Math.floor((props.width + gap()) / (props.itemWidth + gap())))

  // Split children array into rows
  const rows = () => {
    const children = Array.isArray(props.children) ? props.children : [props.children]
    const flat = children.flat().filter(Boolean)
    const result: JSX.Element[][] = []
    const perRow = itemsPerRow()
    for (let i = 0; i < flat.length; i += perRow) {
      result.push(flat.slice(i, i + perRow))
    }
    return result
  }

  return (
    <box direction="column" gap={rowGap()} width={props.width}>
      {rows().map((row) => (
        <box direction="row" gap={gap()} width="100%">
          {row}
        </box>
      ))}
    </box>
  )
}
