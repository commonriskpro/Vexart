/**
 * colors scene — Row of colored boxes.
 */

export const width = 400
export const height = 200

const SWATCHES = [
  0xe5e5e5ff,
  0x4eaed0ff,
  0xa78bfaff,
  0x22c55eff,
  0xf59e0bff,
  0xdc2626ff,
]

export function Scene() {
  return (
    <box
      width={width}
      height={height}
      backgroundColor={0x141414ff}
      direction="column"
      alignX="center"
      alignY="center"
      gap={8}
    >
      <box direction="row" gap={8}>
        {SWATCHES.map((color) => (
          <box
            width={48}
            height={48}
            backgroundColor={color}
            cornerRadius={8}
          />
        ))}
      </box>
    </box>
  )
}
