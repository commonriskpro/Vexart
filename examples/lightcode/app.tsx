import { Page, RouteOutlet, RouterProvider, createAppRouter, type AppRouteDefinition } from "@vexart/app"
import { createLightcodeOsWindowManager, LIGHTCODE_OS_WINDOW_STATE, type LightcodeOsWindowInput } from "./window-manager"
import { LightcodeOsDesktop } from "./desktop"
import { LightcodeWindowContent } from "./panels"
import { lightcodeTheme } from "./theme"

export interface LightcodeOsAppProps {
  width: number
  height: number
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function windows(width: number, height: number): LightcodeOsWindowInput[] {
  const editorW = clamp(Math.round(width * 0.39), 420, 590)
  const editorH = clamp(Math.round(height * 0.42), 300, 430)
  const diffW = clamp(Math.round(width * 0.28), 330, 460)
  const toolW = clamp(Math.round(width * 0.24), 300, 380)
  const agentW = clamp(Math.round(width * 0.25), 320, 410)

  return [
    {
      id: "memory",
      title: "Memory",
      subtitle: "references / tokens",
      kind: "memory",
      rect: { x: 48, y: Math.round(height * 0.62), width: toolW, height: 220 },
      minWidth: 280,
      minHeight: 180,
    },
    {
      id: "diff",
      title: "Diff / Changes",
      subtitle: "LightEngine.zig",
      kind: "diff",
      rect: { x: Math.round(width * 0.70), y: 82, width: diffW, height: 260 },
      minWidth: 310,
      minHeight: 210,
    },
    {
      id: "agent",
      title: "Agent / Running",
      subtitle: "compute task",
      kind: "agent",
      rect: { x: Math.round(width * 0.72), y: Math.round(height * 0.68), width: agentW, height: 210 },
      minWidth: 300,
      minHeight: 180,
    },
    {
      id: "editor",
      title: "Compute Shader Pipeline",
      subtitle: "v_engine.zig",
      kind: "editor",
      rect: { x: Math.round(width * 0.50), y: Math.round(height * 0.30), width: editorW, height: editorH },
      minWidth: 390,
      minHeight: 270,
    },
    {
      id: "runner",
      title: "Runner",
      subtitle: "pipeline preview",
      kind: "runner",
      rect: { x: Math.round(width * 0.45), y: Math.round(height * 0.73), width: 230, height: 170 },
      minWidth: 210,
      minHeight: 150,
      state: LIGHTCODE_OS_WINDOW_STATE.MINIMIZED,
    },
  ]
}

export function createLightcodeOsManager(width: number, height: number) {
  return createLightcodeOsWindowManager({
    desktop: { width, height, topbarHeight: 56, dockHeight: 56 },
    windows: windows(width, height),
  })
}

export function LightcodeOsApp(props: LightcodeOsAppProps) {
  const manager = createLightcodeOsManager(props.width, props.height)
  const DesktopRoute = () => (
    <LightcodeOsDesktop
      width={props.width}
      height={props.height}
      manager={manager}
      renderWindow={(window) => <LightcodeWindowContent window={window} />}
    />
  )
  const routes: AppRouteDefinition[] = [
    { path: "/", component: DesktopRoute },
    { path: "/window/[id]", component: DesktopRoute },
  ]
  const router = createAppRouter(routes, "/", { restoreFocus: false })

  return (
    <RouterProvider router={router}>
      <Page width={props.width} height={props.height} backgroundColor={lightcodeTheme.color.void}>
        <RouteOutlet />
      </Page>
    </RouterProvider>
  )
}
