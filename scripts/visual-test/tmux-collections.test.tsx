import { expect, test } from "bun:test"
import assert from "node:assert/strict"
import { createSignal } from "solid-js"
import { List, Table } from "@vexart/headless"
import { setFocus } from "@vexart/engine"
import {
  render,
  renderVariant,
  verify,
} from "./tmux-scenes/collections-interaction"
import { renderToBufferAfterInteractions } from "../../packages/engine/src/testing/render-to-buffer"

test("collections and interaction fixture passes offscreen presentation", async () => {
  // tmux-shm requires the synthetic receiver owned by tmux-parity.ts.  Keep
  // the Bun test offscreen; that parity harness covers both native routes.
  verify(await render())
})

test("collections oracle rejects omitted and disabled interactions", async () => {
  const variants = [
    { omitInteractions: true },
    { disableList: true },
    { disableTable: true },
    { disableVirtualKeyboard: true },
    { omitScroll: true },
  ]

  for (const variant of variants) {
    const frame = await renderVariant(variant)
    expect(() => verify(frame), JSON.stringify(variant)).toThrow()
  }
})

type ChildState = { value: () => number; bump: () => void }
type ChildSlot = { current: ChildState | null; mounts: number }
type RowSlot = { current: unknown; mounts: number }

function StatefulChild(props: { slots: ChildSlot[]; index: number }) {
  const [value, setValue] = createSignal(0)
  const state = { value, bump: () => setValue((current) => current + 1) }
  const slot = props.slots[props.index] ?? { current: null, mounts: 0 }
  props.slots[props.index] = slot
  slot.current = state
  slot.mounts++
  return <text>{String(value())}</text>
}

test("collection selection keeps row nodes and child state mounted", async () => {
  const listRows: RowSlot[] = []
  const tableRows: RowSlot[] = []
  const listStates: ChildSlot[] = []
  const tableStates: ChildSlot[] = []
  const [listSelected, setListSelected] = createSignal(0)
  const [tableSelected, setTableSelected] = createSignal(0)
  let interacted = false

  await renderToBufferAfterInteractions(
    () => (
      <box width={420} height={180} direction="row" gap={8}>
        <List
          items={["first", "second"]}
          selectedIndex={listSelected()}
          onSelectedChange={setListSelected}
          focusId="identity-list"
          renderItem={(item, ctx) => (
            <box
              ref={(handle) => {
                const slot = listRows[ctx.index] ?? { current: null, mounts: 0 }
                listRows[ctx.index] = slot
                slot.current = handle
                slot.mounts++
              }}
              height={40}
            >
              <text>{item}</text>
              <StatefulChild slots={listStates} index={ctx.index} />
            </box>
          )}
        />
        <Table
          columns={[{ key: "name", header: "Name", width: 140 }]}
          data={[{ name: "first" }, { name: "second" }]}
          selectedRow={tableSelected()}
          onSelectedRowChange={setTableSelected}
          focusId="identity-table"
          renderCell={(value) => <text>{String(value)}</text>}
          renderRow={(children, index) => (
            <box
              ref={(handle) => {
                const slot = tableRows[index] ?? { current: null, mounts: 0 }
                tableRows[index] = slot
                slot.current = handle
                slot.mounts++
              }}
              height={40}
            >
              {children}
              <StatefulChild slots={tableStates} index={index} />
            </box>
          )}
        />
      </box>
    ),
    420,
    180,
    async (helpers) => {
      if (interacted) return
      interacted = true
      const listRowSlot = listRows[0]
      const tableRowSlot = tableRows[0]
      const listStateSlot = listStates[0]
      const tableStateSlot = tableStates[0]
      assert.ok(listRowSlot?.current && tableRowSlot?.current && listStateSlot?.current && tableStateSlot?.current)
      const listRow = listRowSlot.current
      const tableRow = tableRowSlot.current
      const listState = listStateSlot.current
      const tableState = tableStateSlot.current
      listState.bump()
      tableState.bump()

      setFocus("identity-list")
      await helpers.keyPress("down")
      setFocus("identity-table")
      await helpers.keyPress("down")

      expect(listSelected()).toBe(1)
      expect(tableSelected()).toBe(1)
      expect(listRowSlot.current).toBe(listRow)
      expect(tableRowSlot.current).toBe(tableRow)
      expect(listRowSlot.mounts).toBe(1)
      expect(tableRowSlot.mounts).toBe(1)
      expect(listStateSlot.current).toBe(listState)
      expect(tableStateSlot.current).toBe(tableState)
      expect(listStateSlot.mounts).toBe(1)
      expect(tableStateSlot.mounts).toBe(1)
      expect(listState.value()).toBe(1)
      expect(tableState.value()).toBe(1)
    },
    3,
  )
})
