/**
 * layout scene — Column with rows, tests alignment.
 */

export const width = 400
export const height = 300

export function Scene() {
  return (
    <box
      width={width}
      height={height}
      backgroundColor={0x141414ff}
      direction="column"
      gap={8}
      padding={16}
    >
      {/* Header row */}
      <box
        width="100%"
        height={40}
        backgroundColor={0x262626ff}
        cornerRadius={6}
        direction="row"
        alignX="space-between"
        alignY="center"
        paddingX={12}
      >
        <text color={0xfafafaff} fontSize={14}>Title</text>
        <text color={0xa3a3a3ff} fontSize={12}>v1.0</text>
      </box>

      {/* Content area */}
      <box
        width="100%"
        height="grow"
        backgroundColor={0x1c1c1cff}
        cornerRadius={6}
        padding={12}
        direction="column"
        gap={6}
      >
        <box width="100%" height={20} backgroundColor={0x333333ff} cornerRadius={4} />
        <box width="80%" height={20} backgroundColor={0x2d2d2dff} cornerRadius={4} />
        <box width="90%" height={20} backgroundColor={0x333333ff} cornerRadius={4} />
      </box>

      {/* Footer row */}
      <box
        width="100%"
        height={32}
        direction="row"
        gap={8}
        alignY="center"
      >
        <box width={60} height={28} backgroundColor={0xe5e5e5ff} cornerRadius={6} />
        <box width={60} height={28} backgroundColor={0x333333ff} cornerRadius={6} />
      </box>
    </box>
  )
}
