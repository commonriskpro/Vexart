import { CLASS_NAME_UNKNOWN_BEHAVIOR, type ClassNameUnknownBehavior } from "../styles/class-name"

/** @public */
export type VexartAppConfigApp = {
  name?: string
  defaultRoute?: string
}

/** @public */
export type VexartAppConfigTheme = {
  preset?: "void" | string
}

/** @public */
export type VexartAppConfigStyles = {
  className?: boolean
  unknownClass?: ClassNameUnknownBehavior
}

/** @public */
export type VexartAppConfigTerminal = {
  minColumns?: number
  minRows?: number
}

/** @public */
export type VexartAppConfig = {
  app?: VexartAppConfigApp
  theme?: VexartAppConfigTheme
  styles?: VexartAppConfigStyles
  terminal?: VexartAppConfigTerminal
}

/** @public */
export function defineConfig(config: VexartAppConfig) {
  return config
}

/** @public */
export function mergeConfig(config: VexartAppConfig = {}): Required<VexartAppConfig> {
  return {
    app: {
      name: config.app?.name ?? "Vexart App",
      defaultRoute: config.app?.defaultRoute ?? "/",
    },
    theme: {
      preset: config.theme?.preset ?? "void",
    },
    styles: {
      className: config.styles?.className ?? true,
      unknownClass: config.styles?.unknownClass ?? CLASS_NAME_UNKNOWN_BEHAVIOR.WARN,
    },
    terminal: {
      minColumns: config.terminal?.minColumns ?? 80,
      minRows: config.terminal?.minRows ?? 24,
    },
  }
}
