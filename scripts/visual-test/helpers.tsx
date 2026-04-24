export const SCENE_WIDTH = 420
export const SCENE_HEIGHT = 320

export function SceneFrame(props: { title: string; subtitle?: string; children?: any }) {
  return (
    <box
      width={SCENE_WIDTH}
      height={SCENE_HEIGHT}
      backgroundColor={0x09090bff}
      direction="column"
      gap={12}
      padding={16}
    >
      <box direction="column" gap={4}>
        <text color={0xf8fafcff} fontSize={18}>{props.title}</text>
        {props.subtitle ? <text color={0x94a3b8ff} fontSize={12}>{props.subtitle}</text> : null}
      </box>
      {props.children}
    </box>
  )
}

export function Panel(props: { title?: string; width?: number | string; height?: number | string; children?: any }) {
  return (
    <box
      width={props.width ?? "grow"}
      height={props.height ?? "fit"}
      direction="column"
      gap={8}
      padding={12}
      backgroundColor={0x18181bff}
      borderColor={0x27272aff}
      borderWidth={1}
      cornerRadius={10}
    >
      {props.title ? <text color={0xe4e4e7ff} fontSize={13}>{props.title}</text> : null}
      {props.children}
    </box>
  )
}

export function Swatch(props: { color: number; label: string }) {
  return (
    <box direction="column" gap={6} width={72}>
      <box width={72} height={48} backgroundColor={props.color} cornerRadius={8} />
      <text color={0xa1a1aaff} fontSize={11}>{props.label}</text>
    </box>
  )
}

export const sampleSelectOptions = [
  { value: "alpha", label: "Alpha" },
  { value: "beta", label: "Beta" },
  { value: "gamma", label: "Gamma" },
]

export const sampleRadioOptions = [
  { value: "preview", label: "Preview" },
  { value: "stable", label: "Stable" },
  { value: "canary", label: "Canary" },
]

export const sampleTabs = [
  { label: "Overview", content: () => <text color={0xe4e4e7ff}>Overview content</text> },
  { label: "Metrics", content: () => <text color={0xe4e4e7ff}>Metrics content</text> },
  { label: "Logs", content: () => <text color={0xe4e4e7ff}>Logs content</text> },
]

export const sampleListItems = ["Workspace", "Pipelines", "Alerts", "Deployments", "Settings"]

export const sampleTableColumns = [
  { key: "name", header: "Name" },
  { key: "status", header: "Status" },
  { key: "latency", header: "Latency" },
]

export const sampleTableData = [
  { name: "API", status: "Healthy", latency: "31ms" },
  { name: "Queue", status: "Degraded", latency: "82ms" },
  { name: "Cache", status: "Healthy", latency: "12ms" },
]
