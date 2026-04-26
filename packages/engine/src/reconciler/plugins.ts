/**
 * Plugin slot system — extensibility for Vexart applications.
 *
 * Plugins can register components to render in named "slots" throughout the UI.
 * The host app declares slots, and plugins fill them.
 *
 * Architecture:
 *   - SlotRegistry: global Map<slotName, Component[]>
 *   - createSlot(name): creates a SolidJS component that renders whatever is registered
 *   - TgePlugin: { name, setup(api) } — plugin interface
 *   - TgePluginApi: exposes registry + terminal to plugins
 *
 * Usage (host app):
 *   const registry = createSlotRegistry()
 *   const StatusBarSlot = createSlot("statusbar", registry)
 *
 *   // In JSX:
 *   <box>
 *     <StatusBarSlot />  {/* renders whatever plugins registered for "statusbar" *\/ }
 *   </box>
 *
 * Usage (plugin):
 *   const myPlugin: TgePlugin = {
 *     name: "git-status",
 *     setup(api) {
 *       api.slots.register("statusbar", () => <text color="#98c379">main</text>)
 *     }
 *   }
 *
 *   // Pass to mount:
 *   mount(App, terminal, { plugins: [myPlugin] })
 */

import { createSignal } from "solid-js"
import type { JSX } from "solid-js"
import type { Terminal } from "../terminal/index"

// ── Types ──

/** A renderable component factory */
/** @public */
export type SlotComponent = () => JSX.Element

/** Plugin API exposed to plugins during setup.
 *  Base API includes slots + terminal. Apps extend with custom context
 *  (theme, app state, etc.) by passing a richer object to setup(). */
/** @public */
export type TgePluginApi<Context = {}> = {
  /** Register/unregister components in named slots */
  slots: SlotRegistry
  /** Access to the terminal */
  terminal: Terminal
} & Context

/** Plugin interface.
 *  @template Context — extra context the host app provides (theme, api, etc.) */
/** @public */
export type TgePlugin<Context = {}> = {
  /** Plugin name (for debugging) */
  name: string
  /** Setup function — called once during mount. Return cleanup function if needed. */
  setup: (api: TgePluginApi<Context>) => void | (() => void)
}

// ── Slot Registry ──

/** @public */
export type SlotRegistry = {
  /** Register a component in a named slot. Returns an unregister function. */
  register: (slotName: string, component: SlotComponent) => () => void
  /** Get all components registered for a slot. */
  getSlot: (slotName: string) => SlotComponent[]
  /** Check if a slot has any registered components. */
  hasSlot: (slotName: string) => boolean
  /** Clear all slots. */
  clear: () => void
  /** Reactive version counter — increments on any registration change. */
  version: () => number
}

/** Create a new slot registry. */
/** @public */
export function createSlotRegistry(): SlotRegistry {
  const slots = new Map<string, SlotComponent[]>()
  const [version, setVersion] = createSignal(0)

  return {
    register(slotName: string, component: SlotComponent): () => void {
      const list = slots.get(slotName) ?? []
      list.push(component)
      slots.set(slotName, list)
      setVersion((v) => v + 1)

      // Return unregister function
      return () => {
        const current = slots.get(slotName)
        if (!current) return
        const idx = current.indexOf(component)
        if (idx >= 0) {
          current.splice(idx, 1)
          setVersion((v) => v + 1)
        }
      }
    },

    getSlot(slotName: string): SlotComponent[] {
      // Read version to establish reactive dependency
      version()
      return slots.get(slotName) ?? []
    },

    hasSlot(slotName: string): boolean {
      version()
      return (slots.get(slotName)?.length ?? 0) > 0
    },

    clear() {
      slots.clear()
      setVersion((v) => v + 1)
    },

    version,
  }
}

/** @public */
export function createSlot(
  slotName: string,
  registry: SlotRegistry,
): () => JSX.Element | null {
  return () => {
    const components = registry.getSlot(slotName)
    if (components.length === 0) return null
    // Call each component function directly — SolidJS handles arrays
    return components.map((fn) => fn()) as unknown as JSX.Element
  }
}
