import type { JSX } from "solid-js"
import { createTerminal, mount } from "@vexart/engine"

/** @public */
export type MountAppOptions = {
  terminal?: import("@vexart/engine").Terminal
  mount?: import("@vexart/engine").MountOptions
}

/** @public */
export async function mountApp(component: () => JSX.Element, options: MountAppOptions = {}): Promise<import("@vexart/engine").MountHandle> {
  const terminal = options.terminal ?? await createTerminal()
  return mount(component, terminal, options.mount)
}
