/**
 * hello scene — Box with centered text.
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
      alignX="center"
      alignY="center"
      gap={12}
    >
      <box
        backgroundColor={0x262626ff}
        cornerRadius={8}
        padding={16}
      >
        <text color={0xfafafaff} fontSize={16}>
          Hello from TGE
        </text>
      </box>
      <text color={0xa3a3a3ff} fontSize={12}>
        Visual test
      </text>
    </box>
  )
}
