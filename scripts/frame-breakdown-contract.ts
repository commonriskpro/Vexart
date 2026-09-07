import type { TGENode, TransformConfig } from "../packages/engine/src/ffi/node"

export const FRAME_BREAKDOWN_REPORT_VERSION = 4
export const DEFAULT_FRAME_BREAKDOWN_REPORT_PATH = "/tmp/vexart-frame-breakdown-report.json"
export const MEASUREMENT_SCOPE = "internal-frame-timing"
export const TRANSPORT_OBSERVATION = "requested-mode"
export const FULL_FRAME_PRESENTATION_PATH = "full-frame"

export const SCENARIO = {
  DASHBOARD_1080P: "dashboard-1080p",
  DIRTY_REGION: "dirty-region",
  COMPOSITOR_ONLY: "compositor-only",
  NOOP_RETAINED: "noop-retained",
} as const

export type ScenarioName = (typeof SCENARIO)[keyof typeof SCENARIO]
export type TransmissionMode = "direct" | "file" | "shm"

export interface FrameBreakdownOptions {
  frames: number
  warmup: number
  output: string
  transport: TransmissionMode
  nativePresentation: boolean
  scenarioFilter: string | null
}

export function parseFrameBreakdownOptions(
  args: string[],
  defaults: Partial<FrameBreakdownOptions> = {},
): FrameBreakdownOptions {
  let frames = defaults.frames ?? 300
  let warmup = defaults.warmup ?? 5
  let output = defaults.output ?? DEFAULT_FRAME_BREAKDOWN_REPORT_PATH
  let transport = defaults.transport ?? "shm"
  let nativePresentation = defaults.nativePresentation ?? true
  let scenarioFilter = defaults.scenarioFilter ?? null

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === "--frames") frames = Number(args[++i] ?? frames)
    else if (arg.startsWith("--frames=")) frames = Number(arg.slice("--frames=".length))
    else if (arg === "--warmup") warmup = Number(args[++i] ?? warmup)
    else if (arg.startsWith("--warmup=")) warmup = Number(arg.slice("--warmup=".length))
    else if (arg === "--output") output = args[++i] ?? output
    else if (arg.startsWith("--output=")) output = arg.slice("--output=".length)
    else if (arg === "--transport") {
      const value = args[++i]
      if (value === "direct" || value === "file" || value === "shm") transport = value
    } else if (arg.startsWith("--transport=")) {
      const value = arg.slice("--transport=".length)
      if (value === "direct" || value === "file" || value === "shm") transport = value
    } else if (arg === "--native-presentation") {
      nativePresentation = true
    } else if (arg === "--no-native-presentation") {
      nativePresentation = false
    } else if (arg.startsWith("--native-presentation=")) {
      const value = arg.slice("--native-presentation=".length)
      nativePresentation = value === "1" || value === "true" || value === "yes"
    } else if (arg === "--scenarios") {
      scenarioFilter = args[++i] ?? null
    } else if (arg.startsWith("--scenarios=")) {
      scenarioFilter = arg.slice("--scenarios=".length)
    }
  }

  return {
    frames: Number.isFinite(frames) && frames > 0 ? Math.floor(frames) : 300,
    warmup: Number.isFinite(warmup) && warmup >= 0 ? Math.floor(warmup) : 5,
    output,
    transport,
    nativePresentation,
    scenarioFilter,
  }
}

export function compositorTransformForFrame(frameIndex: number): TransformConfig {
  return { translateX: frameIndex % 2 === 0 ? -8 : 8 }
}

type SetProperty = (node: TGENode, name: string, value: unknown) => unknown

export function applyCompositorTransform(
  target: TGENode,
  setProperty: SetProperty,
  frameIndex: number,
): TransformConfig {
  const transform = compositorTransformForFrame(frameIndex)
  setProperty(target, "transform", transform)
  return transform
}

export function compositorTransformValue(target: TGENode): number | null {
  const transform = target.props.transform
  if (typeof transform !== "object" || transform === null) return null
  const translateX = (transform as { translateX?: unknown }).translateX
  return typeof translateX === "number" && Number.isFinite(translateX) ? translateX : null
}

export function hasChangingCompositorTransforms(values: number[]): boolean {
  return values.length >= 2 && values.some((value, index) => index > 0 && value !== values[index - 1])
}
