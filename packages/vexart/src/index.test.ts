import { expect, test } from "bun:test"
import * as vexart from "./index"

test("vexart public unified API surface", () => {
  // Primitives
  expect("Box" in vexart).toBe(false)
  expect("Text" in vexart).toBe(false)

  // App framework
  expect(typeof vexart.createApp).toBe("function")
  expect(typeof vexart.mountApp).toBe("function")
  expect(typeof vexart.useRouter).toBe("function")

  // Styled components
  expect(typeof vexart.VoidButton).toBe("function")
  expect(typeof vexart.VoidCard).toBe("function")
  expect(typeof vexart.colors).toBe("object")

  // Headless primitives
  expect(typeof vexart.Button).toBe("function")
  expect(typeof vexart.Input).toBe("function")
  expect(typeof vexart.useTextEditor).toBe("function")
  expect(typeof vexart.createTextEditor).toBe("function")
  expect(typeof vexart.ToggleSwitch).toBe("function")
  expect(typeof vexart.DropdownMenu).toBe("function")
  expect(typeof vexart.DropdownMenuTrigger).toBe("function")
  expect(typeof vexart.DropdownMenuContent).toBe("function")
  expect(typeof vexart.DropdownMenuItem).toBe("function")
  expect(typeof vexart.DropdownMenuSeparator).toBe("function")
  expect(typeof vexart.DropdownMenuLabel).toBe("function")

  // Engine hooks
  expect(typeof vexart.useFocus).toBe("function")
  expect(typeof vexart.useTerminalDimensions).toBe("function")
  expect(typeof vexart.onInput).toBe("function")

  // SolidJS reactivity
  expect(typeof vexart.createSignal).toBe("function")
  expect(typeof vexart.createEffect).toBe("function")
})
