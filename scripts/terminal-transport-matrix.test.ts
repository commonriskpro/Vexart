import { expect, test } from "bun:test"
import { canCreateRenderLoop } from "./terminal-transport-matrix"

test("render-loop capability decision matches direct and tmux presentation routes", () => {
  const cases = [
    {
      name: "direct Kitty graphics",
      caps: { tmux: false, kittyGraphics: true, kittyPlaceholder: false },
      expected: true,
    },
    {
      name: "tmux Kitty placeholder",
      caps: { tmux: true, kittyGraphics: false, kittyPlaceholder: true },
      expected: true,
    },
    {
      name: "tmux without placeholder",
      caps: { tmux: true, kittyGraphics: false, kittyPlaceholder: false },
      expected: false,
    },
    {
      name: "terminal without graphics",
      caps: { tmux: false, kittyGraphics: false, kittyPlaceholder: false },
      expected: false,
    },
  ] as const

  for (const scenario of cases) expect(canCreateRenderLoop(scenario.caps), scenario.name).toBe(scenario.expected)
})
