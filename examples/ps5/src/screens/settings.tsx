import {
  Box,
  For,
  Show,
  createEffect,
  createSignal,
} from "vexart"

import type { GameId, Ps5ScreenProps, SettingsState } from "../types"
import { Ps5Button, Ps5Panel, Ps5Text, ps5Colors, ps5Scale, usePs5Back, usePs5Viewport } from "../ui"

type SettingsCategory =
  | "system"
  | "screen-sound"
  | "accessibility"
  | "volume"
  | "network"
  | "storage"
  | "users"
  | "reset"

type CategoryInfo = {
  id: SettingsCategory
  label: string
  description: string
}

const categories: CategoryInfo[] = [
  { id: "system", label: "Sistema", description: "Preferencias locales del demo" },
  { id: "screen-sound", label: "Pantalla y sonido", description: "Brillo y representación" },
  { id: "accessibility", label: "Accesibilidad", description: "Movimiento, contraste y texto" },
  { id: "volume", label: "Volumen", description: "Indicador de salida simulado" },
  { id: "network", label: "Red", description: "Estado de conexión simulado" },
  { id: "storage", label: "Almacenamiento", description: "Juegos y descargas locales" },
  { id: "users", label: "Usuarios y cuentas", description: "Usuario activo del demo" },
  { id: "reset", label: "Restablecer ajustes", description: "Volver a los valores predeterminados" },
]

function isCategory(value: string | undefined): value is SettingsCategory {
  return categories.some((category) => category.id === value)
}

function categoryFromFocus(id: string | undefined) {
  if (!id) return undefined
  if (id.startsWith("settings-category-")) {
    const value = id.slice("settings-category-".length)
    return isCategory(value) ? value : undefined
  }
  if (id.startsWith("settings-system-")) return "system" as const
  if (id.startsWith("settings-screen-sound-")) return "screen-sound" as const
  if (id.startsWith("settings-accessibility-") || id === "settings-reduce-motion" || id === "settings-high-contrast" || id.startsWith("settings-text-")) return "accessibility" as const
  if (id.startsWith("settings-volume-")) return "volume" as const
  if (id.startsWith("settings-network-")) return "network" as const
  if (id.startsWith("settings-storage-")) return "storage" as const
  if (id.startsWith("settings-users-")) return "users" as const
  if (id.startsWith("settings-reset-")) return "reset" as const
  return undefined
}

function keyIs(event: { key: string }, ...keys: string[]) {
  return keys.includes(event.key)
}

function percent(value: number) {
  return `${Math.round(Math.max(0, Math.min(100, value)))}%`
}

function SettingMeter(props: { value: number; color: string; width: number }) {
  return (
    <Box width={props.width} height={6} backgroundColor="#ffffff22" cornerRadius={3}>
      <Box width={percent(props.value)} height="100%" backgroundColor={props.color} cornerRadius={3} />
    </Box>
  )
}

function StateLabel(props: { value: string; highContrast: boolean; size: number }) {
  return <Ps5Text color={props.highContrast ? "#ffffff" : ps5Colors.mutedText} fontSize={props.size}>{props.value}</Ps5Text>
}

export function SettingsScreen(props: Ps5ScreenProps) {
  const viewport = usePs5Viewport()
  const scale = (value: number) => ps5Scale(viewport, value)
  const state = props.state
  const actions = props.actions
  const [category, setCategory] = createSignal<SettingsCategory>("system")
  const [detailOpen, setDetailOpen] = createSignal(false)
  const [confirmReset, setConfirmReset] = createSignal(false)
  let entered = false

  const highContrast = () => state().settings.highContrast
  const panel = () => highContrast() ? "#181818" : ps5Colors.panelSoft
  const background = () => {
    if (highContrast()) return "#000000"
    const level = Math.round(4 + state().settings.brightness * 0.1)
    const hex = level.toString(16).padStart(2, "0")
    return `#${hex}${(level + 2).toString(16).padStart(2, "0")}${(level + 6).toString(16).padStart(2, "0")}`
  }
  const divider = () => highContrast() ? "#ffffff66" : ps5Colors.divider
  const muted = () => highContrast() ? "#e4e4e4" : ps5Colors.mutedText
  const font = (value: number) => scale(value)

  const firstControl = (id: SettingsCategory) => {
    if (id === "system") return "settings-system-user"
    if (id === "screen-sound") return "settings-screen-sound-brightness"
    if (id === "accessibility") return "settings-accessibility-reduce-motion"
    if (id === "volume") return "settings-volume-level"
    if (id === "network") return "settings-network-status"
    if (id === "storage") return "settings-storage-summary"
    if (id === "users") return `settings-users-${state().activeUserId ?? state().users[0]?.id ?? "guest"}`
    return "settings-reset-open"
  }

  const categoryId = (id: SettingsCategory) => `settings-category-${id}`
  const setCategoryFocus = (id: SettingsCategory) => {
    setCategory(id)
    setDetailOpen(false)
    setConfirmReset(false)
    actions.setFocus(categoryId(id))
  }
  const openCategory = (id: SettingsCategory) => {
    setCategory(id)
    setConfirmReset(false)
    setDetailOpen(true)
    actions.setFocus(firstControl(id))
  }
  const categoryFocus = (index: number, delta: -1 | 1) => {
    const next = Math.max(0, Math.min(categories.length - 1, index + delta))
    const target = categories[next]
    if (target) setCategoryFocus(target.id)
  }

  const controlIds = (id: SettingsCategory) => {
    if (id === "system") return ["settings-system-user"]
    if (id === "screen-sound") return ["settings-screen-sound-brightness"]
    if (id === "accessibility") return [
      "settings-accessibility-reduce-motion",
      "settings-accessibility-high-contrast",
      "settings-accessibility-text-small",
      "settings-accessibility-text-default",
      "settings-accessibility-text-large",
    ]
    if (id === "volume") return ["settings-volume-level"]
    if (id === "network") return ["settings-network-status"]
    if (id === "storage") {
      const downloads = state().downloads.filter((entry) => entry.status !== "complete" && entry.status !== "cancelled")
      const installed = state().storage.installedGameIds
      return ["settings-storage-summary", ...installed.map((gameId) => `settings-storage-uninstall-${gameId}`), ...downloads.map((entry) => `settings-storage-cancel-${entry.id}`)]
    }
    if (id === "users") return [...state().users.map((user) => `settings-users-${user.id}`), "settings-users-selection"]
    return confirmReset() ? ["settings-reset-confirm", "settings-reset-cancel"] : ["settings-reset-open"]
  }

  const moveControl = (delta: -1 | 1) => {
    const ids = controlIds(category())
    const current = state().focusedId
    const index = current ? ids.indexOf(current) : -1
    const next = Math.max(0, Math.min(ids.length - 1, index < 0 ? 0 : index + delta))
    const id = ids[next]
    if (id) actions.setFocus(id)
  }

  const resetSettings = () => {
    actions.dispatch({ type: "settings/reset" })
    setConfirmReset(false)
    actions.setFocus("settings-reset-open")
  }

  createEffect(() => {
    const current = state()
    if (current.screen !== "settings") {
      entered = false
      return
    }
    if (entered) return
    entered = true
    const remembered = current.focusedId ?? current.focusMemory.settings
    const rememberedCategory = categoryFromFocus(remembered) ?? "system"
    const rememberedControl = remembered === "settings-reduce-motion" ? "settings-accessibility-reduce-motion" : remembered
    const rememberedIsControl = !!rememberedControl && !rememberedControl.startsWith("settings-category-") && !!categoryFromFocus(rememberedControl)
    setCategory(rememberedCategory)
    setDetailOpen(rememberedIsControl)
    setConfirmReset(false)
    actions.setFocus(rememberedIsControl ? rememberedControl : categoryId(rememberedCategory))
    props.onReady?.()
  })

  usePs5Back(() => {
    if (confirmReset()) {
      setConfirmReset(false)
      actions.setFocus("settings-reset-open")
      return true
    }
    if (detailOpen()) {
      setDetailOpen(false)
      actions.setFocus(categoryId(category()))
      return true
    }
    return false
  })

  const toggle = (key: "reduceMotion" | "highContrast") => {
    actions.setSetting(key, !state().settings[key])
  }
  const moveValue = (key: "brightness" | "volume", delta: number) => {
    actions.setSetting(key, Math.max(0, Math.min(100, state().settings[key] + delta)))
  }
  const cycleNetwork = (delta: -1 | 1) => {
    const values: SettingsState["network"][] = ["connected", "limited", "offline-simulated"]
    const index = values.indexOf(state().settings.network)
    const next = Math.max(0, Math.min(values.length - 1, index + delta))
    const value = values[next]
    if (value) actions.setSetting("network", value)
  }
  const selectTextScale = (value: SettingsState["textScale"]) => actions.setSetting("textScale", value)
  const networkLabel = () => state().settings.network === "connected" ? "Conectada" : state().settings.network === "limited" ? "Limitada" : "Sin conexión (simulada)"
  const userName = () => state().users.find((user) => user.id === state().activeUserId)?.name ?? "Invitado"
  const installedGames = () => state().storage.installedGameIds.map((id) => state().catalog.find((entry) => entry.id === id)).filter((entry): entry is NonNullable<typeof entry> => !!entry)
  const activeDownloads = () => state().downloads.filter((entry) => entry.status !== "complete" && entry.status !== "cancelled")
  const gameTitle = (id: GameId) => state().catalog.find((entry) => entry.id === id)?.title ?? id
  const cancelDownload = (id: string) => {
    actions.cancelDownload(id)
    actions.setFocus("settings-storage-summary")
  }
  const uninstall = (id: GameId) => {
    actions.uninstallGame(id)
    actions.setFocus("settings-storage-summary")
  }

  const row = (id: string, label: string, value: string, onPress: () => void, onKeyDown?: (event: { key: string }) => void) => (
    <Ps5Button
      id={id}
      width="100%"
      height={scale(62)}
      padding={scale(15)}
      alignX="left"
      backgroundColor={highContrast() ? "#242424" : "#11161dcc"}
      borderColor={divider()}
      onPress={onPress}
      onKeyDown={onKeyDown}
      screen={props}
    >
      <Box width="100%" direction="row" alignY="center" gap={scale(12)}>
        <Ps5Text color={highContrast() ? "#ffffff" : ps5Colors.text} fontSize={font(16)}>{label}</Ps5Text>
        <Box flexGrow={1} />
        <StateLabel value={value} highContrast={highContrast()} size={font(14)} />
      </Box>
    </Ps5Button>
  )

  const renderDetails = () => {
    const current = category()
    const info = categories.find((entry) => entry.id === current) ?? categories[0]!
    const detailGap = scale(12)
    return (
      <Box width="100%" height="100%" direction="column" gap={scale(18)}>
        <Box direction="column" gap={scale(5)}>
          <Ps5Text color={highContrast() ? "#ffffff" : ps5Colors.text} fontSize={font(27)} fontWeight={700}>{info.label}</Ps5Text>
          <Ps5Text color={muted()} fontSize={font(14)}>{info.description}</Ps5Text>
        </Box>
        <Box width="100%" flexGrow={1} direction="column" gap={detailGap} scrollY viewportClip>
          <Show when={current === "system"}>
            {row("settings-system-user", "Usuario activo", userName(), () => openCategory("users"), (event) => {
              if (keyIs(event, "up", "down")) moveControl(event.key === "up" ? -1 : 1)
            })}
            <Ps5Panel width="100%" padding={scale(16)} gap={scale(5)} direction="column" backgroundColor={panel()} borderColor={divider()}>
              <Ps5Text color={ps5Colors.text} fontSize={font(15)} fontWeight={700}>Preferencias del sistema</Ps5Text>
              <Ps5Text color={muted()} fontSize={font(13)}>La configuración se conserva en el almacenamiento local del demo. No se modifica el sistema anfitrión.</Ps5Text>
            </Ps5Panel>
          </Show>

          <Show when={current === "screen-sound"}>
            {row("settings-screen-sound-brightness", "Brillo de la representación", percent(state().settings.brightness), () => moveValue("brightness", 5), (event) => {
              if (keyIs(event, "left")) moveValue("brightness", -5)
              if (keyIs(event, "right")) moveValue("brightness", 5)
              if (keyIs(event, "up", "down")) moveControl(event.key === "up" ? -1 : 1)
            })}
            <Box direction="row" alignY="center" gap={scale(14)}>
              <Ps5Text color={muted()} fontSize={font(13)}>Simulado · no cambia el monitor del host</Ps5Text>
              <SettingMeter value={state().settings.brightness} color="#7ea7ff" width={scale(220)} />
            </Box>
          </Show>

          <Show when={current === "accessibility"}>
            {row("settings-accessibility-reduce-motion", "Reducir movimiento", state().settings.reduceMotion ? "Activado" : "Desactivado", () => toggle("reduceMotion"), (event) => {
              if (keyIs(event, "enter", " ")) toggle("reduceMotion")
              if (keyIs(event, "up", "down")) moveControl(event.key === "up" ? -1 : 1)
            })}
            {row("settings-accessibility-high-contrast", "Contraste alto", state().settings.highContrast ? "Activado" : "Desactivado", () => toggle("highContrast"), (event) => {
              if (keyIs(event, "enter", " ")) toggle("highContrast")
              if (keyIs(event, "up", "down")) moveControl(event.key === "up" ? -1 : 1)
            })}
            <Ps5Text color={muted()} fontSize={font(13)}>Tamaño del texto</Ps5Text>
            <Box direction="row" gap={scale(10)}>
              {(["small", "default", "large"] as const).map((value) => (
                <Ps5Button
                  id={`settings-accessibility-text-${value}`}
                  width="33%"
                  height={scale(48)}
                  label={value === "small" ? "Pequeño" : value === "default" ? "Estándar" : "Grande"}
                  backgroundColor={state().settings.textScale === value ? "#394354" : undefined}
                  onPress={() => selectTextScale(value)}
                  onKeyDown={(event) => {
                    if (keyIs(event, "left", "right")) {
                      const values = ["small", "default", "large"] as const
                      const index = values.indexOf(value)
                      const next = values[Math.max(0, Math.min(values.length - 1, index + (event.key === "right" ? 1 : -1)))]
                      if (next) actions.setFocus(`settings-accessibility-text-${next}`)
                    }
                    if (keyIs(event, "up", "down")) moveControl(event.key === "up" ? -1 : 1)
                  }}
                  screen={props}
                />
              ))}
            </Box>
          </Show>

          <Show when={current === "volume"}>
            {row("settings-volume-level", "Volumen de salida", percent(state().settings.volume), () => moveValue("volume", 5), (event) => {
              if (keyIs(event, "left")) moveValue("volume", -5)
              if (keyIs(event, "right")) moveValue("volume", 5)
              if (keyIs(event, "up", "down")) moveControl(event.key === "up" ? -1 : 1)
            })}
            <Box direction="row" alignY="center" gap={scale(14)}>
              <Ps5Text color={muted()} fontSize={font(13)}>Salida simulada · no emite audio del host</Ps5Text>
              <SettingMeter value={state().settings.volume} color="#8bd4b0" width={scale(220)} />
            </Box>
          </Show>

          <Show when={current === "network"}>
            {row("settings-network-status", "Estado de red", networkLabel(), () => cycleNetwork(1), (event) => {
              if (keyIs(event, "left")) cycleNetwork(-1)
              if (keyIs(event, "right")) cycleNetwork(1)
              if (keyIs(event, "up", "down")) moveControl(event.key === "up" ? -1 : 1)
            })}
            <Ps5Text color={muted()} fontSize={font(13)}>Este estado solo representa conectividad local para la demo; no abre sockets.</Ps5Text>
          </Show>

          <Show when={current === "storage"}>
            <Ps5Panel width="100%" padding={scale(16)} gap={scale(10)} direction="column" backgroundColor={panel()} borderColor={divider()}>
              <Box width="100%" direction="row" alignY="center">
                <Ps5Text color={ps5Colors.text} fontSize={font(16)} fontWeight={700}>Almacenamiento de la consola</Ps5Text>
                <Box flexGrow={1} />
                <Ps5Text color={muted()} fontSize={font(14)}>{state().storage.usedGb.toFixed(1)} GB / {state().storage.capacityGb} GB</Ps5Text>
              </Box>
              <SettingMeter value={state().storage.capacityGb > 0 ? state().storage.usedGb / state().storage.capacityGb * 100 : 0} color="#8ea9ff" width={scale(520)} />
              <Ps5Text color={muted()} fontSize={font(13)}>Los cambios son locales y no borran archivos del host.</Ps5Text>
            </Ps5Panel>
            <Ps5Button id="settings-storage-summary" width="100%" height={scale(42)} padding={scale(8)} alignX="left" backgroundColor="#00000000" borderWidth={0} onPress={() => undefined} onKeyDown={(event) => {
              if (keyIs(event, "up", "down")) moveControl(event.key === "up" ? -1 : 1)
            }} screen={props}>
              <Ps5Text color={muted()} fontSize={font(15)}>Juegos instalados</Ps5Text>
            </Ps5Button>
            <Show when={installedGames().length > 0} fallback={<Ps5Text color={muted()} fontSize={font(14)}>No hay juegos instalados.</Ps5Text>}>
              <For each={installedGames()}>{(game) => (
                <Ps5Button
                  id={`settings-storage-uninstall-${game.id}`}
                  width="100%"
                  height={scale(58)}
                  padding={scale(14)}
                  alignX="left"
                  borderColor={divider()}
                  onPress={() => uninstall(game.id)}
                  onKeyDown={(event) => {
                    if (keyIs(event, "enter", " ")) uninstall(game.id)
                    if (keyIs(event, "up", "down")) moveControl(event.key === "up" ? -1 : 1)
                  }}
                  screen={props}
                >
                  <Box width="100%" direction="row" alignY="center">
                    <Ps5Text color={ps5Colors.text} fontSize={font(15)}>{game.title}</Ps5Text>
                    <Box flexGrow={1} />
                    <Ps5Text color={muted()} fontSize={font(13)}>{game.sizeGb} GB · Desinstalar</Ps5Text>
                  </Box>
                </Ps5Button>
              )}</For>
            </Show>
            <Show when={activeDownloads().length > 0}>
              <Ps5Text color={muted()} fontSize={font(15)}>Descargas activas</Ps5Text>
              <For each={activeDownloads()}>{(download) => (
                <Ps5Button
                  id={`settings-storage-cancel-${download.id}`}
                  width="100%"
                  height={scale(58)}
                  padding={scale(14)}
                  alignX="left"
                  borderColor={divider()}
                  onPress={() => cancelDownload(download.id)}
                  onKeyDown={(event) => {
                    if (keyIs(event, "enter", " ")) cancelDownload(download.id)
                    if (keyIs(event, "up", "down")) moveControl(event.key === "up" ? -1 : 1)
                  }}
                  screen={props}
                >
                  <Box width="100%" direction="row" alignY="center">
                    <Ps5Text color={ps5Colors.text} fontSize={font(15)}>{gameTitle(download.gameId)}</Ps5Text>
                    <Box flexGrow={1} />
                    <Ps5Text color={muted()} fontSize={font(13)}>{Math.round(download.progress)}% · Cancelar</Ps5Text>
                  </Box>
                </Ps5Button>
              )}</For>
            </Show>
          </Show>

          <Show when={current === "users"}>
            <Ps5Text color={muted()} fontSize={font(14)}>Selecciona el usuario local para continuar con sus preferencias.</Ps5Text>
            <For each={state().users}>{(user) => (
              <Ps5Button
                id={`settings-users-${user.id}`}
                width="100%"
                height={scale(58)}
                padding={scale(14)}
                alignX="left"
                backgroundColor={state().activeUserId === user.id ? "#394354" : undefined}
                onPress={() => actions.dispatch({ type: "user/select", userId: user.id })}
                onKeyDown={(event) => {
                  if (keyIs(event, "enter", " ")) actions.dispatch({ type: "user/select", userId: user.id })
                  if (keyIs(event, "up", "down")) moveControl(event.key === "up" ? -1 : 1)
                }}
                screen={props}
              >
                <Box width="100%" direction="row" alignY="center">
                  <Ps5Text color={ps5Colors.text} fontSize={font(16)}>{user.name}</Ps5Text>
                  <Box flexGrow={1} />
                  <Ps5Text color={muted()} fontSize={font(13)}>{state().activeUserId === user.id ? "Activo" : user.handle}</Ps5Text>
                </Box>
              </Ps5Button>
            )}</For>
            <Ps5Button id="settings-users-selection" width="100%" height={scale(48)} label="Volver a selección de usuario" onPress={() => actions.go("boot-users")} screen={props} />
          </Show>

          <Show when={current === "reset"}>
            <Ps5Text color={muted()} fontSize={font(14)}>Restablece brillo, volumen, red y preferencias de accesibilidad del demo. No cambia la configuración del ordenador.</Ps5Text>
            <Show when={!confirmReset()} fallback={
              <Box direction="column" gap={detailGap}>
                <Ps5Text color={ps5Colors.text} fontSize={font(16)} fontWeight={700}>¿Restablecer todos los ajustes?</Ps5Text>
                <Box direction="row" gap={scale(10)}>
                  <Ps5Button id="settings-reset-confirm" width="50%" height={scale(50)} label="Restablecer" backgroundColor="#55343a" onPress={resetSettings} screen={props} />
                  <Ps5Button id="settings-reset-cancel" width="50%" height={scale(50)} label="Cancelar" onPress={() => { setConfirmReset(false); actions.setFocus("settings-reset-open") }} screen={props} />
                </Box>
              </Box>
            }>
              <Ps5Button id="settings-reset-open" width="100%" height={scale(58)} label="Restablecer ajustes" onPress={() => { setConfirmReset(true); actions.setFocus("settings-reset-confirm") }} onKeyDown={(event) => {
                if (keyIs(event, "up", "down")) moveControl(event.key === "up" ? -1 : 1)
              }} screen={props} />
            </Show>
          </Show>
        </Box>
      </Box>
    )
  }

  return (
    <Box width={viewport.width()} height={viewport.height()} backgroundColor={background()} direction="column" viewportClip>
      <Box width="100%" height={scale(138)} paddingLeft={scale(80)} paddingRight={scale(80)} direction="row" alignY="center" gap={scale(20)}>
        <Box direction="column" gap={scale(4)}>
          <Ps5Text color={highContrast() ? "#ffffff" : ps5Colors.text} fontSize={font(34)} fontWeight={700}>Ajustes</Ps5Text>
          <Ps5Text color={muted()} fontSize={font(14)}>Personaliza tu experiencia local</Ps5Text>
        </Box>
        <Box flexGrow={1} />
        <Ps5Text color={muted()} fontSize={font(13)}>F1 Centro de control · F2 Opciones · Escape Volver</Ps5Text>
      </Box>
      <Box width="100%" flexGrow={1} paddingLeft={scale(80)} paddingRight={scale(80)} paddingBottom={scale(48)} direction="row" gap={scale(52)}>
        <Box width={scale(430)} height="100%" direction="column" gap={scale(5)} scrollY viewportClip>
          <Ps5Text color={muted()} fontSize={font(13)} fontWeight={700}>CONFIGURACIÓN</Ps5Text>
          <Box width="100%" height={scale(1)} backgroundColor={divider()} />
          <For each={categories}>{(entry, index) => (
            <Ps5Button
              id={categoryId(entry.id)}
              width="100%"
              height={scale(72)}
              padding={scale(16)}
              alignX="left"
              backgroundColor={category() === entry.id ? (highContrast() ? "#303030" : "#2a313c") : "#00000000"}
              borderColor={category() === entry.id ? ps5Colors.focus : "#ffffff00"}
              borderWidth={category() === entry.id ? 1 : 0}
              cornerRadius={scale(8)}
              onPress={() => openCategory(entry.id)}
              onKeyDown={(event) => {
                if (keyIs(event, "up", "ArrowUp")) categoryFocus(index(), -1)
                if (keyIs(event, "down", "ArrowDown")) categoryFocus(index(), 1)
                if (keyIs(event, "enter", " ")) openCategory(entry.id)
              }}
              screen={props}
            >
              <Box width="100%" direction="row" alignY="center" gap={scale(12)}>
                <Box width={scale(4)} height={scale(34)} backgroundColor={category() === entry.id ? ps5Colors.focus : "#ffffff00"} cornerRadius={scale(2)} />
                <Box flexGrow={1} direction="column" gap={scale(3)}>
                  <Ps5Text color={highContrast() ? "#ffffff" : ps5Colors.text} fontSize={font(19)} fontWeight={category() === entry.id ? 700 : 400}>{entry.label}</Ps5Text>
                  <Ps5Text color={muted()} fontSize={font(12)}>{entry.description}</Ps5Text>
                </Box>
              </Box>
            </Ps5Button>
          )}</For>
        </Box>
        <Box width={scale(1)} height="100%" backgroundColor={divider()} />
        <Box flexGrow={1} height="100%" paddingLeft={scale(24)} paddingTop={scale(10)} paddingRight={scale(10)}>
          <Show when={detailOpen()} fallback={
            <Box width="100%" height="100%" direction="column" gap={scale(24)}>
              <Box direction="column" gap={scale(7)}>
                <Ps5Text color={ps5Colors.text} fontSize={font(30)} fontWeight={700}>Personaliza tu PS5</Ps5Text>
                <Ps5Text color={muted()} fontSize={font(16)}>Selecciona una categoría para ver sus controles.</Ps5Text>
              </Box>
              <Box width="100%" height={scale(1)} backgroundColor={divider()} />
              <Box width={scale(620)} direction="column" gap={scale(16)}>
                <Box direction="row" alignY="center">
                  <Box direction="column" gap={scale(4)}>
                    <Ps5Text color={ps5Colors.text} fontSize={font(18)} fontWeight={700}>Ajuste rápido</Ps5Text>
                    <Ps5Text color={muted()} fontSize={font(13)}>Un acceso directo a la accesibilidad local.</Ps5Text>
                  </Box>
                  <Box flexGrow={1} />
                  <StateLabel value={state().settings.reduceMotion ? "Activado" : "Desactivado"} highContrast={highContrast()} size={font(14)} />
                </Box>
                <Ps5Button
                  id="settings-reduce-motion"
                  width="100%"
                  height={scale(58)}
                  padding={scale(18)}
                  alignX="left"
                  backgroundColor={highContrast() ? "#242424" : "#171c24b8"}
                  borderColor={divider()}
                  cornerRadius={scale(8)}
                  label={state().settings.reduceMotion ? "Reducir movimiento · Activado" : "Reducir movimiento · Desactivado"}
                  onPress={() => toggle("reduceMotion")}
                  screen={props}
                />
              </Box>
            </Box>
          }>
            {renderDetails()}
          </Show>
        </Box>
      </Box>
    </Box>
  )
}
