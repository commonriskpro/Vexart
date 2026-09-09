/**
 * Grid v1.x visual candidate — dashboard/form composition.
 *
 * This scene is intentionally reference-free: G-036 records rects and a
 * candidate render only. Golden PNGs remain an explicit later approval gate.
 */

export const width = 420
export const height = 320
export const sceneId = "scenes/grid-dashboard"

const columns = [120, { fr: 1 }] as const
const rows = [52, { fr: 1 }, 28] as const
const areas = [
  ["header", "header"],
  ["sidebar", "content"],
  ["footer", "footer"],
] as const
const autoFitColumns = [
  { repeat: { count: "auto-fit", tracks: [{ minmax: [96, { fr: 1 }] }] } },
] as const

const card = {
  backgroundColor: 0x171b26ff,
  borderColor: 0x30394dff,
  borderWidth: 1,
  cornerRadius: 8,
  padding: 10,
} as const

export function Scene() {
  return (
    <box
      width={width}
      height={height}
      layout="grid"
      gridTemplateColumns={columns}
      gridTemplateRows={rows}
      gridTemplateAreas={areas}
      gap={12}
      padding={16}
      backgroundColor={0x090d16ff}
      alignContent="stretch"
      justifyContent="stretch"
      justifyItems="stretch"
      alignItems="stretch"
    >
      <box
        gridArea="header"
        {...card}
        backgroundColor={0x111827ff}
        borderColor={0x3b82f6ff}
        debugName="Grid dashboard header"
      >
        <box direction="row" alignY="center" width="grow" height="grow">
          <box direction="column" width="grow" gap={3}>
            <text color={0xf8fafcff} fontSize={17}>Grid dashboard</text>
            <text color={0x93a4bfFF} fontSize={11}>v1.x beta · retained layout</text>
          </box>
          <box
            width={76}
            height={26}
            backgroundColor={0x123524ff}
            borderColor={0x2dd477ff}
            borderWidth={1}
            cornerRadius={6}
            justifyContent="center"
            alignItems="center"
          >
            <text color={0x8ef0b2ff} fontSize={11}>ONLINE</text>
          </box>
        </box>
      </box>

      <box gridArea="sidebar" {...card} layout="flex" direction="column" gap={8}>
        <text color={0xcbd5e1ff} fontSize={12}>Workspace</text>
        <box
          width="grow"
          height={30}
          backgroundColor={0x24314aff}
          borderColor={0x5b8defff}
          borderWidth={1}
          cornerRadius={6}
          paddingX={8}
          justifyContent="center"
          alignItems="center"
          focusable
          hoverStyle={{ backgroundColor: 0x2d436bff }}
          activeStyle={{ backgroundColor: 0x375a91ff }}
          focusStyle={{ borderColor: 0x93c5fdff }}
          onPress={() => {}}
        >
          <text color={0xe6efffff} fontSize={11}>Overview</text>
        </box>
        <box width="grow" height={30} borderWidth={1} borderColor={0x30394dff} cornerRadius={6} paddingX={8} justifyContent="center" alignItems="center">
          <text color={0x94a3b8ff} fontSize={11}>Deployments</text>
        </box>
        <box width="grow" height={30} borderWidth={1} borderColor={0x30394dff} cornerRadius={6} paddingX={8} justifyContent="center" alignItems="center">
          <text color={0x94a3b8ff} fontSize={11}>Activity</text>
        </box>
        <box width="grow" height="grow" />
        <text color={0x64748bff} fontSize={10}>3 collaborators</text>
      </box>

      <box
        gridArea="content"
        {...card}
        layout="grid"
        gridTemplateColumns={autoFitColumns}
        gridAutoRows={44}
        gridAutoFlow="row"
        gap={8}
        padding={10}
        backgroundColor={0x101522ff}
      >
        <box {...card} gridColumn={{ start: 1, end: 3 }} backgroundColor={0x1b263bff}>
          <box direction="row" alignY="center" width="grow" height="grow">
            <box direction="column" width="grow" gap={2}>
              <text color={0xe2e8f0ff} fontSize={12}>Requests</text>
              <text color={0x7dd3fcff} fontSize={18}>1,284</text>
            </box>
            <text color={0x4ade80ff} fontSize={11}>+12.4%</text>
          </box>
        </box>
        <box {...card} backgroundColor={0x1a2334ff}>
          <box direction="column" gap={2}>
            <text color={0x94a3b8ff} fontSize={10}>Latency</text>
            <text color={0xf8fafcff} fontSize={14}>31 ms</text>
          </box>
        </box>
        <box {...card} backgroundColor={0x1a2334ff}>
          <box direction="column" gap={2}>
            <text color={0x94a3b8ff} fontSize={10}>Errors</text>
            <text color={0xfca5a5ff} fontSize={14}>0.08%</text>
          </box>
        </box>
        <box {...card} gridColumn={{ start: 1, end: 3 }} backgroundColor={0x151d2dff}>
          <box direction="row" alignY="center" width="grow" height="grow" gap={8}>
            <text color={0x94a3b8ff} fontSize={10}>Environment</text>
            <box
              width="grow"
              height={24}
              backgroundColor={0x0d1422ff}
              borderColor={0x3b4b66ff}
              borderWidth={1}
              cornerRadius={5}
              paddingX={8}
              alignY="center"
              focusable
              hoverStyle={{ borderColor: 0x60a5faff }}
              focusStyle={{ borderColor: 0x93c5fdff }}
              onPress={() => {}}
            >
              <text color={0xe2e8f0ff} fontSize={10}>Production</text>
            </box>
            <box
              width={48}
              height={24}
              backgroundColor={0x1d4ed8ff}
              cornerRadius={5}
              alignX="center"
              alignY="center"
              focusable
              hoverStyle={{ backgroundColor: 0x2563ebff }}
              activeStyle={{ backgroundColor: 0x1e40afff }}
              onPress={() => {}}
            >
              <text color={0xf8fafcff} fontSize={10}>Apply</text>
            </box>
          </box>
        </box>
      </box>

      <box gridArea="footer" direction="row" alignSelf="center" alignItems="center" gap={10}>
        <text color={0x64748bff} fontSize={10}>Updated just now</text>
        <box width="grow" />
        <text color={0x60a5faff} fontSize={10}>Open inspector →</text>
      </box>
    </box>
  )
}
