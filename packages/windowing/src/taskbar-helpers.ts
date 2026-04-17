import { WINDOW_STATUS, type WindowDescriptor } from "./types"

export const TASKBAR_ACTION = {
  RESTORE: "restore",
  FOCUS: "focus",
  MINIMIZE: "minimize",
} as const

export type TaskbarAction = (typeof TASKBAR_ACTION)[keyof typeof TASKBAR_ACTION]

export function listTaskbarWindows(windows: WindowDescriptor[]): WindowDescriptor[] {
  return windows.filter((window) => window.status !== undefined)
}

export function getTaskbarAction(window: WindowDescriptor): TaskbarAction {
  if (window.status === WINDOW_STATUS.MINIMIZED) return TASKBAR_ACTION.RESTORE
  if (window.focused) return TASKBAR_ACTION.MINIMIZE
  return TASKBAR_ACTION.FOCUS
}
