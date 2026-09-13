import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js"
import { focusedId, onInput, setFocus } from "@vexart/engine"
import { Label, Icon, Button, SearchField, Pane, DemoFooter, ui } from "./shared"

type ServiceState = "Running" | "Stopped"
type LogLevel = "INFO" | "WARN" | "ERROR"

type LogLine = {
  time: string
  level: LogLevel
  message: string
  detail?: string
}

type Service = {
  id: string
  name: string
  port?: string
  command: string
  state: ServiceState
  cpu: number
  memory: number
  cpuHistory: number[]
  memoryHistory: number[]
  logs: LogLine[]
}

const colors = {
  background: "#0b0d0d",
  surface: "#111313",
  surfaceRaised: "#1e2020",
  selected: "#353737",
  border: "#303333",
  grid: "#2b3030",
  text: "#f1f2f2",
  muted: "#aeb3b5",
  dim: "#81878a",
  mint: "#7cdda4",
  amber: "#e8b632",
  red: "#ff7474",
  ink: "#101313",
}

const services: Service[] = [
  {
    id: "api",
    name: "api",
    port: ":3000",
    command: "bun server.ts",
    state: "Running",
    cpu: 12.4,
    memory: 184,
    cpuHistory: [12, 13, 20, 16, 14, 19, 15, 25, 28, 25, 31, 22, 30, 21, 19, 20, 27, 48, 66, 45, 18, 35, 16, 14, 20, 14, 18, 22, 31, 14, 13, 19, 15, 22, 16, 20, 14, 26, 20, 16, 31, 30, 26, 27, 16, 15, 27, 25, 24, 12.4],
    memoryHistory: [126, 128, 126, 130, 127, 128, 130, 129, 131, 132, 130, 132, 134, 133, 137, 138, 142, 146, 150, 149, 151, 154, 153, 155, 157, 160, 159, 164, 163, 166, 168, 169, 171, 174, 173, 176, 179, 178, 181, 180, 182, 184, 181, 184, 183, 185, 183, 185, 184, 184],
    logs: [
      { time: "13:08:21", level: "INFO", message: "Server listening on :3000" },
      { time: "13:08:24", level: "INFO", message: "GET /health 200 2ms" },
      { time: "13:08:28", level: "INFO", message: "GET /api/images 200 18ms" },
      { time: "13:08:30", level: "WARN", message: "Slow query 142ms", detail: "SELECT * FROM generations WHERE user_id = ?" },
      { time: "13:08:31", level: "INFO", message: "Cache refreshed (128 items)" },
      { time: "13:08:36", level: "INFO", message: "POST /api/images 201 312ms" },
      { time: "13:08:41", level: "INFO", message: "GET /api/projects 200 14ms" },
      { time: "13:08:45", level: "INFO", message: "GET /health 200 1ms" },
      { time: "13:08:52", level: "INFO", message: "GET /api/images/123 200 26ms" },
      { time: "13:08:57", level: "INFO", message: "Background task completed", detail: "(generate thumbnails)" },
      { time: "13:09:01", level: "INFO", message: "GET /api/users 200 11ms" },
      { time: "13:09:08", level: "INFO", message: "POST /api/images 201 298ms" },
      { time: "13:09:12", level: "INFO", message: "Cache refreshed (130 items)" },
      { time: "13:09:18", level: "INFO", message: "GET /health 200 2ms" },
    ],
  },
  {
    id: "web",
    name: "web",
    port: ":5173",
    command: "vite dev",
    state: "Running",
    cpu: 8.1,
    memory: 232,
    cpuHistory: [14, 13, 16, 12, 15, 18, 22, 20, 14, 17, 15, 23, 25, 19, 21, 23, 20, 18, 15, 19, 16, 22, 25, 20, 19, 15, 20, 17, 22, 24, 18, 15, 19, 17, 15, 20, 18, 15, 12, 14, 15, 13, 15, 14, 16, 13, 12, 10, 9, 8.1],
    memoryHistory: [214, 215, 216, 217, 218, 220, 221, 220, 222, 223, 224, 225, 226, 225, 228, 229, 230, 229, 231, 232, 233, 232, 234, 235, 234, 235, 236, 237, 236, 238, 239, 238, 240, 239, 240, 241, 240, 242, 241, 243, 242, 241, 242, 241, 242, 241, 240, 238, 235, 232],
    logs: [
      { time: "13:08:22", level: "INFO", message: "Vite dev server ready" },
      { time: "13:08:30", level: "INFO", message: "GET / 200 8ms" },
      { time: "13:08:34", level: "INFO", message: "hmr update /src/App.tsx" },
      { time: "13:08:47", level: "INFO", message: "GET /assets/logo.svg 200 4ms" },
      { time: "13:08:53", level: "INFO", message: "hmr update /src/routes.ts" },
      { time: "13:09:03", level: "WARN", message: "Slow module transform 108ms" },
      { time: "13:09:11", level: "INFO", message: "GET /dashboard 200 11ms" },
    ],
  },
  {
    id: "worker",
    name: "worker",
    command: "bun worker.ts",
    state: "Running",
    cpu: 24.8,
    memory: 318,
    cpuHistory: [22, 24, 21, 28, 31, 26, 24, 33, 29, 24, 26, 30, 27, 32, 29, 34, 28, 27, 30, 25, 26, 28, 34, 31, 29, 35, 32, 31, 29, 27, 28, 30, 32, 29, 31, 27, 24, 26, 28, 29, 31, 30, 32, 28, 27, 29, 26, 25, 26, 24.8],
    memoryHistory: [303, 303, 304, 305, 306, 307, 308, 310, 309, 311, 312, 311, 313, 314, 315, 316, 317, 318, 319, 320, 319, 321, 322, 323, 322, 323, 324, 323, 322, 321, 322, 321, 320, 321, 320, 321, 322, 321, 320, 319, 320, 319, 318, 319, 318, 319, 318, 317, 318, 318],
    logs: [
      { time: "13:08:19", level: "INFO", message: "Worker started (concurrency: 4)" },
      { time: "13:08:23", level: "INFO", message: "Processed job_8f12 in 183ms" },
      { time: "13:08:26", level: "INFO", message: "Processed job_8f13 in 204ms" },
      { time: "13:08:39", level: "WARN", message: "Queue depth reached 80%" },
      { time: "13:08:44", level: "INFO", message: "Processed job_8f14 in 121ms" },
      { time: "13:09:04", level: "INFO", message: "Processed job_8f15 in 164ms" },
    ],
  },
  {
    id: "postgres",
    name: "postgres",
    port: ":5432",
    command: "postgres 16",
    state: "Running",
    cpu: 6.3,
    memory: 412,
    cpuHistory: [8, 8, 9, 7, 8, 10, 8, 9, 7, 8, 7, 6, 8, 7, 8, 9, 7, 7, 8, 6, 7, 8, 6, 7, 8, 7, 6, 7, 6, 8, 7, 7, 6, 7, 6, 7, 6, 7, 6, 6, 7, 7, 6, 7, 6, 7, 6, 6, 6, 6.3],
    memoryHistory: [405, 406, 406, 407, 408, 408, 409, 410, 410, 411, 410, 411, 412, 412, 413, 413, 414, 413, 414, 413, 414, 413, 414, 414, 413, 414, 413, 414, 413, 414, 413, 414, 413, 414, 413, 414, 413, 414, 413, 414, 413, 414, 413, 414, 413, 414, 413, 413, 412, 412],
    logs: [
      { time: "13:08:20", level: "INFO", message: "database system is ready" },
      { time: "13:08:27", level: "INFO", message: "checkpoint complete" },
      { time: "13:08:33", level: "INFO", message: "connection authorized: user=app" },
      { time: "13:08:58", level: "INFO", message: "automatic vacuum started" },
      { time: "13:09:10", level: "INFO", message: "automatic vacuum complete" },
    ],
  },
  {
    id: "redis",
    name: "redis",
    port: ":6379",
    command: "redis 7",
    state: "Running",
    cpu: 3.2,
    memory: 96,
    cpuHistory: [4, 5, 4, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 3, 4, 4, 3, 3, 4, 3, 4, 3, 3, 4, 3, 3, 4, 3, 3, 4, 3, 3, 4, 3, 3, 4, 3, 3, 4, 3, 3, 4, 3, 3, 4, 3, 3, 4, 3, 3, 3.2],
    memoryHistory: [92, 92, 93, 93, 93, 94, 94, 94, 95, 95, 95, 95, 96, 95, 95, 96, 96, 96, 96, 97, 97, 97, 96, 97, 97, 97, 96, 96, 97, 96, 96, 97, 97, 96, 96, 96, 97, 96, 96, 96, 96, 97, 97, 96, 96, 97, 96, 96, 96, 96],
    logs: [
      { time: "13:08:25", level: "INFO", message: "Ready to accept connections" },
      { time: "13:08:32", level: "INFO", message: "SET session:123 200" },
      { time: "13:08:46", level: "INFO", message: "GET session:123 2ms" },
      { time: "13:08:55", level: "INFO", message: "Cache refreshed (130 items)" },
      { time: "13:09:16", level: "INFO", message: "GET session:123 1ms" },
    ],
  },
  {
    id: "mailer",
    name: "mailer",
    command: "bun mailer.ts",
    state: "Stopped",
    cpu: 0,
    memory: 0,
    cpuHistory: Array.from({ length: 50 }, () => 0),
    memoryHistory: Array.from({ length: 50 }, () => 0),
    logs: [
      { time: "12:44:07", level: "INFO", message: "Mailer stopped by user" },
      { time: "12:43:52", level: "INFO", message: "Processed 24 messages" },
      { time: "12:42:31", level: "WARN", message: "SMTP connection closed" },
    ],
  },
]

const serviceIndex = (id: string) => services.findIndex((service) => service.id === id)

function chartDraw(
  history: number[],
  max: number,
  color: number,
  width: number,
  height: number,
) {
  return (ctx: import("@vexart/engine").CanvasContext) => {
    const baseline = height - 1
    for (let row = 0; row <= 2; row++) {
      const y = Math.round((height - 1) * row / 2)
      ctx.line(0, y, width, y, { color: 0x2b3030aa, width: 1 })
    }
    for (let column = 0; column <= 4; column++) {
      const x = Math.round(width * column / 4)
      ctx.line(x, 0, x, height, { color: 0x2b3030aa, width: 1 })
    }
    const points = history.map((value, index) => ({
      x: index * width / Math.max(1, history.length - 1),
      y: baseline - Math.max(0, Math.min(1, value / max)) * (height - 2),
    }))
    // Canvas display lists currently expose rectangles rather than arbitrary
    // paths. Overlapping opaque strips form one continuous shaded area (no
    // alpha seams), while the separate anti-aliased line preserves the data.
    const areaFill = 0x13251cff
    for (let index = 0; index < points.length - 1; index++) {
      const point = points[index]!
      const next = points[index + 1]!
      const top = Math.min(point.y, next.y)
      const x = Math.floor(point.x)
      const end = Math.ceil(next.x) + 1
      ctx.rect(x, top, Math.max(1, end - x), baseline - top, { fill: areaFill, strokeWidth: 0, radius: 0 })
    }
    for (let index = 0; index < points.length - 1; index++) {
      const point = points[index]!
      const next = points[index + 1]!
      ctx.line(point.x, point.y, next.x, next.y, { color, width: 2 })
    }
  }
}

function serviceRow(service: Service, y: number, selected: () => boolean, onPress: () => void) {
  return (
    <Button
      x={9}
      y={y}
      width={367}
      height={selected() ? 99 : 95}
      id={`service-${service.id}`}
      active={selected()}
      border={false}
      onPress={onPress}
      align="left"
    >
      <Show when={selected()}>
        <Pane x={0} y={0} width={4} height={99} fill={colors.mint} radius={2} />
      </Show>
      <Pane x={19} y={22} width={16} height={16} fill={service.state === "Running" ? colors.mint : colors.red} radius={8} />
      <Label x={51} y={14} size={19} weight={500} color={colors.text}>{service.name}</Label>
      <Show when={service.port}><Label x={51} y={40} size={15} mono color={colors.text}>{service.port}</Label></Show>
      <Label x={51} y={service.port ? 66 : 40} size={15} mono color={colors.muted}>{service.command}</Label>
      <Label x={280} y={21} size={15} color={service.state === "Running" ? colors.mint : colors.muted}>{service.state}</Label>
    </Button>
  )
}

export type MissionControlAppProps = { width?: number; height?: number; live?: boolean }

function PlotCanvas(props: { history: number[]; max: number; color: number; cacheKey: string; width: number; height: number }) {
  return <canvas width={props.width} height={props.height} drawCacheKey={`${props.cacheKey}-${props.width}-${props.height}`} onDraw={chartDraw(props.history, props.max, props.color, props.width, props.height)} />
}

export function MissionControlApp(props: MissionControlAppProps) {
  const width = () => props.width ?? 1536
  const height = () => props.height ?? 1024
  const [selectedId, setSelectedId] = createSignal("api")
  const [paused, setPaused] = createSignal(false)
  const [tick, setTick] = createSignal(0)
  const [filter, setFilter] = createSignal("")
  const [level, setLevel] = createSignal<"All levels" | LogLevel>("All levels")
  const [selectedLog, setSelectedLog] = createSignal(8)
  const [streamLogs, setStreamLogs] = createSignal<Record<string, LogLine[]>>(
    Object.fromEntries(services.map((service) => [service.id, service.logs.map((log) => ({ ...log }))])),
  )

  const selected = createMemo(() => services[serviceIndex(selectedId())] ?? services[0]!)
  const cpuSample = (service: Service, step: number) => {
    if (service.state === "Stopped") return 0
    if (step === 0) return service.cpu
    const base = service.cpuHistory.at(-1) ?? service.cpu
    return Number(Math.max(0, base + Math.sin(step * 0.8 + serviceIndex(service.id)) * 0.8).toFixed(1))
  }
  const memorySample = (service: Service, step: number) => {
    if (service.state === "Stopped") return 0
    if (step === 0) return service.memory
    const base = service.memoryHistory.at(-1) ?? service.memory
    return Math.round(base + Math.sin(step * 0.4 + serviceIndex(service.id)) * 2)
  }
  const liveCpu = createMemo(() => cpuSample(selected(), tick()))
  const liveMemory = createMemo(() => memorySample(selected(), tick()))
  const cpuHistory = createMemo(() => {
    const service = selected()
    const history = service.cpuHistory.slice()
    for (let step = 1; step <= tick(); step++) {
      history.shift()
      history.push(cpuSample(service, step))
    }
    return history
  })
  const memoryHistory = createMemo(() => {
    const service = selected()
    const history = service.memoryHistory.slice()
    for (let step = 1; step <= tick(); step++) {
      history.shift()
      history.push(memorySample(service, step))
    }
    return history
  })
  const visibleLogs = createMemo(() => {
    const query = filter().trim().toLowerCase()
    const selectedLevel = level()
    return (streamLogs()[selected().id] ?? selected().logs)
      .map((log, index) => ({ log, index }))
      .filter(({ log }) => selectedLevel === "All levels" || log.level === selectedLevel)
      .filter(({ log }) => !query || `${log.time} ${log.level} ${log.message} ${log.detail ?? ""}`.toLowerCase().includes(query))
  })

  onMount(() => {
    if (props.live === false) return
    const interval = setInterval(() => {
      if (!paused()) {
        const nextTick = tick() + 1
        setTick(nextTick)
        setStreamLogs((previous) => {
          const next = { ...previous }
          services.filter((service) => service.state === "Running").forEach((service) => {
            const second = 20 + (nextTick * 7 + serviceIndex(service.id) * 11) % 40
            const message = service.id === "api"
              ? `GET /health 200 ${2 + (nextTick % 4)}ms`
              : service.id === "web"
                ? `hmr update /src/App.tsx`
                : service.id === "worker"
                  ? `Processed job_${(0x8f15 + nextTick).toString(16)} in ${120 + (nextTick % 90)}ms`
                  : service.id === "postgres"
                    ? "connection authorized: user=app"
                    : `GET session:${123 + nextTick} ${1 + (nextTick % 3)}ms`
            const log: LogLine = {
              time: `13:09:${String(second).padStart(2, "0")}`,
              level: nextTick % 7 === 0 ? "WARN" : "INFO",
              message,
            }
            next[service.id] = [...(previous[service.id] ?? []), log]
          })
          return next
        })
      }
    }, 900)
    onCleanup(() => clearInterval(interval))
  })

  const stopInput = onInput((event) => {
    if (event.type !== "key") return
    const focus = focusedId() ?? ""
    if (event.key === "/" && focus !== "mission-filter") {
      setFocus("mission-filter")
      queueMicrotask(() => {
        if (filter() === "/") setFilter("")
      })
      return
    }
    if (event.key === "escape") {
      setFilter("")
      setFocus(`service-${selectedId()}`)
      return
    }
    if (event.key === " " && focus !== "mission-filter" && focus !== "mission-pause") {
      setPaused((value) => !value)
      return
    }
    if (event.key === "up" || event.key === "down") {
      if (focus.startsWith("service-")) {
        const next = Math.max(0, Math.min(services.length - 1, serviceIndex(selectedId()) + (event.key === "up" ? -1 : 1)))
        setSelectedId(services[next]!.id)
        setSelectedLog(8)
        setFocus(`service-${services[next]!.id}`)
      } else if (focus.startsWith("log-line-")) {
        const next = Math.max(0, Math.min(Math.max(0, visibleLogs().length - 1), selectedLog() + (event.key === "up" ? -1 : 1)))
        setSelectedLog(next)
      }
    }
  })
  onCleanup(stopInput)

  const contentWidth = () => width() - 385
  const bodyHeight = () => height() - 46 - 44
  const chartWidth = () => Math.round(453 * (width() / 1536))
  const divX = () => Math.round(contentWidth() * (563 / 1151))
  const memColX = () => divX() + 34
  const memChartX = () => divX() + 94

  const pauseBtnX = () => contentWidth() - 260
  const searchBtnX = () => contentWidth() - 68
  const searchIconX = () => contentWidth() - 56

  const logsFilterX = () => contentWidth() - 320
  const logsLevelX = () => contentWidth() - 442
  const caretX = () => contentWidth() - 361
  const logsDividerWidth = () => contentWidth() - 53
  const logsTableWidth = () => contentWidth() - 33
  const logsTableHeight = () => Math.max(200, bodyHeight() - 424)

  return (
    <box width={width()} height={height()} direction="column" backgroundColor={colors.background}>
      {/* Top Header Bar */}
      <box width="100%" height={46} borderColor={colors.border} borderBottom={1} direction="row" alignY="center" alignX="space-between" paddingX={24} backgroundColor={colors.background}>
        <box direction="row" alignY="center" gap={16}>
          <text color={colors.text} fontSize={20} fontWeight={600} fontFamily={ui.sans}>Mission Control</text>
          <text color={colors.muted} fontSize={16} fontFamily={ui.mono}>~/projects/vexart</text>
        </box>
        <box width={134} height={29} alignX="center" alignY="center" backgroundColor="#1f2020" borderColor="#3e4040" borderWidth={1} cornerRadius={6}>
          <text color={colors.muted} fontSize={12} fontFamily={ui.mono}>SIMULATED DATA</text>
        </box>
      </box>

      {/* Main Body */}
      <box width="100%" height="grow" direction="row">
        {/* Services Sidebar */}
        <box width={385} height="100%" backgroundColor={colors.surface} borderColor={colors.border} borderRight={1}>
          <Label x={23} y={22} size={21} weight={600} color={colors.text}>Services</Label>
          <For each={services}>{(service, index) => serviceRow(service, [59, 161, 258, 360, 457, 555][index()]!, () => selectedId() === service.id, () => {
            setSelectedId(service.id)
            setSelectedLog(8)
          })}</For>
          <Pane x={9} y={258} width={366} height={1} fill={colors.border} />
          <Pane x={9} y={349} width={366} height={1} fill={colors.border} />
          <Pane x={9} y={451} width={366} height={1} fill={colors.border} />
          <Pane x={9} y={554} width={366} height={1} fill={colors.border} />
          <Label x={23} y={Math.max(680, bodyHeight() - 38)} size={15} mono color={colors.muted}>5 running · 1 stopped</Label>
        </box>

        {/* Content Pane */}
        <box width="grow" height="100%" backgroundColor={colors.background}>
          <Label x={29} y={25} size={28} weight={600} color={colors.text}>{selected().name}</Label>
          <Pane x={96} y={32} width={13} height={13} fill={selected().state === "Running" ? colors.mint : colors.red} radius={7} />
          <Label x={120} y={27} size={16} color={selected().state === "Running" ? colors.mint : colors.muted}>{selected().state}</Label>
          <Label x={29} y={61} size={16} mono color={colors.muted}>{selected().command}{selected().port ? ` · localhost${selected().port}` : ""}</Label>
          <Button x={pauseBtnX()} y={23} width={175} height={39} id="mission-pause" label={paused() ? "Resume stream" : "Pause stream"} icon={paused() ? "play" : "pause"} onPress={() => setPaused((value) => !value)} border />
          <Button x={searchBtnX()} y={23} width={44} height={39} id="mission-search" onPress={() => setFocus("mission-filter")} border />
          <Icon name="magnifying-glass" x={searchIconX()} y={32} size={22} />

          <Label x={29} y={105} size={16} mono color={colors.text}>CPU</Label>
          <Label x={29} y={128} size={31} weight={600} color={colors.text}>{`${liveCpu().toFixed(1)}%`}</Label>
          <Label x={memColX()} y={105} size={16} mono color={colors.text}>MEMORY</Label>
          <Label x={memColX()} y={128} size={31} weight={600} color={colors.text}>{`${liveMemory()} MB`}</Label>
          <Pane x={divX()} y={100} width={1} height={226} fill={colors.border} />

          <Pane x={79} y={178} width={chartWidth()} height={117}>
            <PlotCanvas history={cpuHistory()} max={100} color={0x7cdda4ff} cacheKey={`cpu-${selectedId()}-${tick()}`} width={chartWidth()} height={117} />
          </Pane>
          <Pane x={memChartX()} y={178} width={chartWidth()} height={117}>
            <PlotCanvas history={memoryHistory()} max={512} color={0x7cdda4ff} cacheKey={`memory-${selectedId()}-${tick()}`} width={chartWidth()} height={117} />
          </Pane>
          <Label x={29} y={178} size={14} mono color={colors.muted}>100%</Label>
          <Label x={38} y={237} size={14} mono color={colors.muted}>50%</Label>
          <Label x={45} y={294} size={14} mono color={colors.muted}>0%</Label>
          <Label x={memColX()} y={178} size={14} mono color={colors.muted}>512 MB</Label>
          <Label x={memColX()} y={237} size={14} mono color={colors.muted}>256 MB</Label>
          <Label x={memColX() + 9} y={294} size={14} mono color={colors.muted}>0 MB</Label>
          <Label x={79} y={316} size={14} mono color={colors.muted}>60s</Label>
          <Label x={188} y={316} size={14} mono color={colors.muted}>45s</Label>
          <Label x={303} y={316} size={14} mono color={colors.muted}>30s</Label>
          <Label x={417} y={316} size={14} mono color={colors.muted}>15s</Label>
          <Label x={508} y={316} size={14} mono color={colors.muted}>now</Label>
          <Label x={memChartX()} y={316} size={14} mono color={colors.muted}>60s</Label>
          <Label x={memChartX() + 109} y={316} size={14} mono color={colors.muted}>45s</Label>
          <Label x={memChartX() + 224} y={316} size={14} mono color={colors.muted}>30s</Label>
          <Label x={memChartX() + 338} y={316} size={14} mono color={colors.muted}>15s</Label>
          <Label x={memChartX() + 429} y={316} size={14} mono color={colors.muted}>now</Label>

          <Pane x={29} y={349} width={logsDividerWidth()} height={1} fill={colors.border} />
          <Label x={29} y={364} size={22} weight={600} color={colors.text}>Logs</Label>
          <Button x={logsLevelX()} y={363} width={106} height={36} id="mission-level" label={level()} size={14} onPress={() => setLevel((value) => value === "All levels" ? "INFO" : value === "INFO" ? "WARN" : value === "WARN" ? "ERROR" : "All levels")} border />
          <Icon name="caret-down" x={caretX()} y={373} size={16} />
          <SearchField x={logsFilterX()} y={363} width={296} height={36} id="mission-filter" value={filter()} onChange={setFilter} placeholder="Filter logs..." />
          <Pane x={9} y={412} width={logsTableWidth()} height={1} fill={colors.border} />
          <Pane x={9} y={424} width={logsTableWidth()} height={logsTableHeight()}>
            <For each={visibleLogs()}>{(entry, index) => {
              const isSelected = () => selectedLog() === index()
              return <Button x={0} y={index() * 26} width={logsTableWidth()} height={26} id={`log-line-${entry.index}`} active={isSelected()} border={false} onPress={() => setSelectedLog(index())} align="left">
                <Label x={20} y={2} size={16} mono color={colors.muted}>{entry.log.time}</Label>
                <Label x={141} y={2} size={16} mono color={entry.log.level === "WARN" ? colors.amber : entry.log.level === "ERROR" ? colors.red : colors.mint}>{entry.log.level}</Label>
                <Label x={222} y={2} size={16} mono color={entry.log.level === "WARN" ? colors.amber : colors.text}>{entry.log.message}</Label>
                <Show when={entry.log.detail}><Label x={entry.log.message.length * 9 + 250} y={2} size={16} mono color={colors.muted}>{entry.log.detail}</Label></Show>
              </Button>
            }}</For>
          </Pane>
        </box>
      </box>

      {/* Footer */}
      <DemoFooter hints={[
        { keys: "↑↓", label: "Select service" },
        { keys: "/", label: "Filter logs" },
        { keys: "Space", label: "Pause" },
        { keys: "Esc", label: "Back" },
      ]} />
    </box>
  )
}

export default MissionControlApp
