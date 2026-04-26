import { createContext, useContext } from "solid-js"
import type { Terminal } from "@vexart/engine"

const TerminalContext = createContext<Terminal>()

/** @public */
export function useAppTerminal(): Terminal {
  const terminal = useContext(TerminalContext)
  if (!terminal) throw new Error("[vexart] useAppTerminal() must be used inside createApp()")
  return terminal
}

export { TerminalContext }
