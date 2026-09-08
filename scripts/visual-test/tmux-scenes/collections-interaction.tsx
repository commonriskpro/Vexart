/**
 * Interactive collections parity scene.
 *
 * The scene mounts the public styled collection components and drives their
 * real callbacks before capturing the final frame.  It deliberately checks
 * content geometry (selected rows, virtualized rows, and clipped scroll
 * content), not only status markers.
 */

import assert from "node:assert/strict"
import { createSignal, type JSX } from "solid-js"
import type { ScrollHandle } from "@vexart/headless"
import { setFocus } from "@vexart/engine"
import { VoidList, VoidScrollView, VoidTable, VoidTabs, VoidVirtualList } from "@vexart/styled"
import {
  renderToBufferAfterInteractions,
  type RenderLoopInteractionHelpers,
  type RenderToBufferOptions,
  type RenderToBufferResult,
} from "../../../packages/engine/src/testing/render-to-buffer"

export const width = 1120
export const height = 720

const ROOT = [8, 11, 22] as const
const PANEL = [17, 24, 39] as const
const LIST_CARD = [23, 23, 23] as const
const ACCENT = [38, 38, 38] as const
const VIRTUAL_SELECTED = [21, 94, 117] as const
const VIRTUAL_ROW = [30, 41, 59] as const
const SCROLL_EVEN = [30, 41, 59] as const
const SCROLL_ODD = [51, 65, 85] as const
const ITEM_HEIGHT = 24

const LIST_ITEMS = ["Workspace", "Pipelines", "Alerts", "Deployments", "Settings"]
const TABLE_COLUMNS = [
  { key: "name", header: "Service", width: 150 },
  { key: "status", header: "Status", width: 140 },
  { key: "latency", header: "Latency", width: 110 },
]
const TABLE_DATA = [
  { name: "API", status: "Healthy", latency: "31ms" },
  { name: "Queue", status: "Degraded", latency: "82ms" },
  { name: "Cache", status: "Healthy", latency: "12ms" },
  { name: "Worker", status: "Healthy", latency: "24ms" },
]
const VIRTUAL_ITEMS = Array.from({ length: 40 }, (_, index) => `Worker ${index + 1}`)

/** Test-only switches used to prove the oracle is not vacuous. */
export type CollectionsSceneVariant = {
  omitInteractions?: boolean
  disableList?: boolean
  disableTable?: boolean
  disableVirtualKeyboard?: boolean
  omitScroll?: boolean
}

type CollectionsProbe = {
  activeTab: () => number
  listSelected: () => number
  tableSelected: () => number
  virtualSelected: () => number
  setScrollTop: (value: number) => void
  tabEvents: number[]
  listSelections: number[]
  tableSelections: number[]
  virtualSelections: number[]
}

type CollectionsPanelProbe = Omit<CollectionsProbe, "activeTab" | "tabEvents">

type AppProps = {
  variant: CollectionsSceneVariant
  onReady: (probe: CollectionsProbe) => void
  scrollHandle: { current: ScrollHandle | null }
}

function Section(props: { title: string; width: number; height: number; children?: JSX.Element }) {
  return (
    <box
      width={props.width}
      height={props.height}
      direction="column"
      gap={8}
      padding={10}
      backgroundColor={0x111827ff}
      borderColor={0x334155ff}
      borderWidth={1}
      cornerRadius={8}
    >
      <text color={0xe2e8f0ff} fontSize={14}>{props.title}</text>
      {props.children}
    </box>
  )
}

function StatusLine(props: { label: string; value: () => string }) {
  return (
    <box height={18} direction="row" gap={8}>
      <text color={0x94a3b8ff} fontSize={11}>{props.label}</text>
      <text color={0xf8fafcff} fontSize={11}>{props.value()}</text>
    </box>
  )
}

function CollectionsPanel(props: {
  variant: CollectionsSceneVariant
  onReady: (probe: CollectionsPanelProbe) => void
  scrollHandle: { current: ScrollHandle | null }
}) {
  const [listSelected, setListSelected] = createSignal(0)
  const [tableSelected, setTableSelected] = createSignal(0)
  const [virtualSelected, setVirtualSelected] = createSignal(0)
  const [listChangeCount, setListChangeCount] = createSignal(0)
  const [tableChangeCount, setTableChangeCount] = createSignal(0)
  const [scrollTop, setScrollTop] = createSignal(0)
  const listSelections: number[] = []
  const tableSelections: number[] = []
  const virtualSelections: number[] = []

  const listChange = (index: number) => {
    setListChangeCount((count) => count + 1)
    setListSelected(index)
  }
  const tableChange = (index: number) => {
    setTableChangeCount((count) => count + 1)
    setTableSelected(index)
  }
  const tableSelect = (index: number) => tableSelections.push(index)
  const virtualSelect = (index: number) => {
    virtualSelections.push(index)
    setVirtualSelected(index)
  }

  props.onReady({
    listSelected,
    tableSelected,
    virtualSelected,
    setScrollTop,
    listSelections,
    tableSelections,
    virtualSelections,
  })

  return (
    <box width={1080} height={570} direction="column" gap={10}>
      <box width={1080} height={205} direction="row" gap={10}>
        <Section title="List · keyboard selection" width={300} height={205}>
          <VoidList
            items={LIST_ITEMS}
            selectedIndex={listSelected()}
            onSelectedChange={listChange}
            onSelect={(index) => listSelections.push(index)}
            disabled={props.variant.disableList}
            focusId="collections-list"
            width={278}
            height={165}
          />
        </Section>
        <Section title="Table · row selection" width={440} height={205}>
          <VoidTable
            columns={TABLE_COLUMNS}
            data={TABLE_DATA}
            selectedRow={tableSelected()}
            onSelectedRowChange={tableChange}
            onRowSelect={(index) => tableSelect(index)}
            striped={false}
            disabled={props.variant.disableTable}
            focusId="collections-table"
          />
        </Section>
        <Section title="Tab callback" width={320} height={205}>
          <text color={0x94a3b8ff} fontSize={12}>Tabs mounted above; right arrow activates Collections.</text>
          <StatusLine label="List callback" value={() => String(listChangeCount())} />
          <StatusLine label="Table callback" value={() => String(tableChangeCount())} />
          <StatusLine label="Visible rows" value={() => `${VIRTUAL_ITEMS.length} source items`} />
        </Section>
      </box>

      <box width={1080} height={250} direction="row" gap={10}>
        <Section title="VirtualList · page down" width={530} height={250}>
          <VoidVirtualList
            items={VIRTUAL_ITEMS}
            itemHeight={ITEM_HEIGHT}
            height={194}
            width={508}
            overscan={1}
            selectedIndex={virtualSelected()}
            onSelect={virtualSelect}
            keyboard={!props.variant.disableVirtualKeyboard}
            focusId="collections-virtual"
            renderItem={(item, index, ctx) => (
              <box
                width="100%"
                height={ITEM_HEIGHT}
                paddingLeft={10}
                alignY="center"
                backgroundColor={ctx.selected || ctx.highlighted ? 0x155e75ff : index % 2 === 0 ? 0x1e293bff : 0x0f172aff}
              >
                <text color={0xf8fafcff} fontSize={12}>{item}</text>
              </box>
            )}
          />
        </Section>
        <Section title="ScrollView · clipped rows" width={530} height={250}>
          <VoidScrollView
            ref={(handle) => { props.scrollHandle.current = handle }}
            width={508}
            height={194}
            scrollY
            scrollSpeed={1}
            showScrollbar
            padding={6}
            gap={2}
          >
            {Array.from({ length: 18 }, (_, index) => (
              <box
                width="100%"
                height={ITEM_HEIGHT}
                backgroundColor={index % 2 === 0 ? 0x1e293bff : 0x334155ff}
                paddingLeft={8}
                alignY="center"
              >
                <text color={0xf8fafcff} fontSize={12}>{`Log row ${index + 1}`}</text>
              </box>
            ))}
          </VoidScrollView>
        </Section>
      </box>

      <box width={1080} height={82} direction="row" gap={16} padding={8} backgroundColor={0x0f172aff} cornerRadius={8}>
        <StatusLine label="List selected" value={() => LIST_ITEMS[listSelected()]} />
        <StatusLine label="Table selected" value={() => TABLE_DATA[tableSelected()].name} />
        <StatusLine label="Virtual selected" value={() => VIRTUAL_ITEMS[virtualSelected()]} />
        <StatusLine label="Scroll top" value={() => String(scrollTop())} />
      </box>
    </box>
  )
}

function App(props: AppProps) {
  const [activeTab, setActiveTab] = createSignal(0)
  const tabEvents: number[] = []

  const updateProbe = (next: CollectionsPanelProbe) => {
    props.onReady({ ...next, activeTab, tabEvents })
  }

  const collectionContent = () => (
    <CollectionsPanel variant={props.variant} onReady={updateProbe} scrollHandle={props.scrollHandle} />
  )

  return (
    <box width={width} height={height} backgroundColor={0x080b16ff} direction="column" gap={10} padding={20}>
      <text color={0xfcd34dff} fontSize={22}>Collections and interaction parity</text>
      <text color={0x94a3b8ff} fontSize={12}>Public VoidTabs, VoidList, VoidTable, VoidVirtualList, and VoidScrollView</text>
      <box width={1080} height={600}>
      <VoidTabs
          activeTab={activeTab()}
          onTabChange={(index) => { tabEvents.push(index); setActiveTab(index) }}
          focusId="collections-tabs"
          tabs={[
            {
              label: "Overview",
              content: () => (
                <box width={1080} height={570} padding={20} backgroundColor={0x111827ff} cornerRadius={8}>
                  <text color={0xe2e8f0ff} fontSize={16}>Activate the Collections tab to mount the interactive fixtures.</text>
                </box>
              ),
            },
            { label: "Collections", content: collectionContent },
          ]}
        />
      </box>
    </box>
  )
}

async function driveInteractions(
  helpers: RenderLoopInteractionHelpers,
  variant: CollectionsSceneVariant,
  probe: CollectionsProbe,
  scrollHandle: { current: ScrollHandle | null },
) {
  setFocus("collections-list")
  await helpers.keyPress("down")
  await helpers.clickAt(110, 252)
  await helpers.keyPress("up")
  await helpers.keyPress("enter")
  if (!variant.disableList) {
    assert.equal(probe.listSelected(), 1, "list selection callback did not update state")
    assert.deepEqual(probe.listSelections, [2, 1], "list mouse and keyboard callbacks did not run")
  }

  setFocus("collections-table")
  await helpers.keyPress("down")
  await helpers.clickAt(400, 255)
  await helpers.keyPress("up")
  await helpers.keyPress("enter")
  if (!variant.disableTable) {
    assert.equal(probe.tableSelected(), 1, "table selection callback did not update state")
    assert.deepEqual(probe.tableSelections, [2, 1], "table mouse and keyboard callbacks did not run")
  }

  setFocus("collections-virtual")
  await helpers.keyPress("pagedown")
  await helpers.keyPress("enter")
  if (!variant.disableVirtualKeyboard) {
    assert.equal(probe.virtualSelected(), 9, "virtual list page-down selection did not update state")
    assert.deepEqual(probe.virtualSelections, [9], "virtual list select callback did not run")
  }

  if (!variant.omitScroll) {
    const handle = scrollHandle.current
    assert.ok(handle, "scroll handle ref was not mounted")
    assert.ok(handle.contentHeight > handle.viewportHeight, "scroll content did not exceed its viewport")
    handle.scrollTo(-120)
    await helpers.frame()
    assert.ok(handle.scrollTop > 0, "scroll handle did not move")
    probe.setScrollTop(handle.scrollTop)
    await helpers.frame()
  }
}

export function render(options?: RenderToBufferOptions) {
  return renderVariant({}, options)
}

export function renderVariant(variant: CollectionsSceneVariant, options?: RenderToBufferOptions) {
  let probe: CollectionsProbe | null = null
  const scrollHandle: { current: ScrollHandle | null } = { current: null }
  let didInteract = false

  const frame = renderToBufferAfterInteractions(
    () => <App variant={variant} onReady={(next) => { probe = next }} scrollHandle={scrollHandle} />,
    width,
    height,
    async (helpers) => {
      if (didInteract) {
        await helpers.frame()
        return
      }
      didInteract = true
      if (variant.omitInteractions) return
      await helpers.keyPress("right")
      assert.ok(probe, "collection probe was not mounted after tab activation")
      assert.equal(probe!.tabEvents.at(-1), 1, "tab change callback did not run")
      await driveInteractions(helpers, variant, probe!, scrollHandle)
    },
    3,
    options,
  )
  return frame
}

function pixel(frame: RenderToBufferResult, x: number, y: number) {
  const index = (y * frame.width + x) * 4
  return [frame.pixels[index], frame.pixels[index + 1], frame.pixels[index + 2], frame.pixels[index + 3]] as const
}

function countColor(frame: RenderToBufferResult, color: readonly number[], left: number, top: number, right: number, bottom: number) {
  let count = 0
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const sample = pixel(frame, x, y)
      if (sample.every((value, channel) => value === (color[channel] ?? 255))) count++
    }
  }
  return count
}

function countTextInk(frame: RenderToBufferResult, left: number, top: number, right: number, bottom: number) {
  let count = 0
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const [red, green, blue] = pixel(frame, x, y)
      if (red > 170 && green > 170 && blue > 170) count++
    }
  }
  return count
}

function textInkRight(frame: RenderToBufferResult, left: number, top: number, right: number, bottom: number) {
  let edge = -1
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const [red, green, blue] = pixel(frame, x, y)
      if (red > 170 && green > 170 && blue > 170) edge = Math.max(edge, x)
    }
  }
  return edge
}

export function verify(frame: RenderToBufferResult) {
  assert.equal(frame.width, width)
  assert.equal(frame.height, height)
  assert.deepEqual(pixel(frame, 4, 4), [8, 11, 22, 255], "root surface missing")

  // The final panel must be mounted after the real tab callback. This region
  // is absent from the Overview tab, so an omitted tab interaction fails.
  assert.ok(countColor(frame, PANEL, 20, 142, 1100, 350) > 10_000, "Collections panel did not mount")

  // Styled List selection changes its real row surface from card to accent.
  assert.ok(countColor(frame, ACCENT, 35, 175, 300, 206) < 100, "list selection did not move off the first row")
  assert.ok(countColor(frame, ACCENT, 35, 206, 300, 237) > 2_000, "selected list row is not visible")
  assert.ok(countColor(frame, LIST_CARD, 30, 188, 300, 340) > 2_000, "unselected list rows are not visible")

  // Styled Table paints the selected second row and keeps neighboring rows.
  assert.ok(countColor(frame, ACCENT, 345, 195, 755, 219) < 100, "table selection did not move off the first row")
  assert.ok(countColor(frame, ACCENT, 345, 219, 755, 243) > 1_000, "selected table row is not visible")
  assert.ok(countColor(frame, LIST_CARD, 330, 188, 760, 340) > 1_000, "unselected table rows are not visible")

  // VirtualList must show the selected page-down item with its actual row
  // text/background, proving that the window moved rather than a marker flip.
  assert.equal(countColor(frame, VIRTUAL_SELECTED, 30, 410, 540, 558), 0, "virtualized selection did not page down")
  assert.ok(countColor(frame, VIRTUAL_SELECTED, 30, 558, 540, 585) > 250, "virtualized selected row is not visible")
  assert.ok(textInkRight(frame, 30, 558, 540, 585) >= 95, "virtualized selected item is not Worker 10")
  assert.ok(countColor(frame, VIRTUAL_ROW, 30, 410, 540, 600) > 500, "virtualized neighboring rows are not visible")

  // ScrollView retains the alternating row fills and row text after
  // programmatic scrolling. The first source row is clipped, while rows from
  // the moved window remain visible inside the viewport.
  assert.ok(countColor(frame, SCROLL_EVEN, 570, 410, 1070, 600) > 500, "even scrolled row fills are not visible")
  assert.ok(countColor(frame, SCROLL_ODD, 570, 410, 1070, 600) > 500, "odd scrolled row fills are not visible")
  assert.ok(countColor(frame, SCROLL_ODD, 570, 390, 1070, 412) > 1_000, "scrolled partial row is not visible at the clip edge")
  assert.ok(countTextInk(frame, 580, 390, 800, 412) > 0, "scrolled row text is not visible at the clip edge")
  assert.ok(countTextInk(frame, 580, 412, 800, 585) > 500, "scrolled row text is not visible")
  assert.equal(countColor(frame, SCROLL_EVEN, 570, 600, 1070, 645), 0, "scroll content escaped its viewport")
}
