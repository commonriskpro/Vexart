import {
  Box,
  For,
  Show,
  createEffect,
} from "vexart"
import type { JSX } from "solid-js"
import { resolve } from "node:path"

import type {
  ControlCardId,
  Ps5OverlayProps,
  ScreenId,
} from "../types"
import {
  Ps5Avatar,
  Ps5Button,
  Ps5Icon,
  Ps5Panel,
  Ps5Text as Text,
  ps5Colors,
  ps5Scale,
  usePs5Viewport,
} from "../ui"

const cardLabels: Record<ControlCardId, string> = {
  home: "Inicio",
  switcher: "Selector",
  notifications: "Notificaciones",
  "game-base": "Game Base",
  music: "Música",
  sound: "Sonido",
  microphone: "Micrófono",
  accessories: "Accesorios",
  profile: "Perfil",
  power: "Alimentación",
}

/**
 * The approved mock uses filled control-center glyphs. Keep these local to
 * this screen so the regular icon assets used by the rest of the demo keep
 * their existing appearance.
 */
const mockIconNames = {
  home: "house-fill",
  switcher: "folders-fill",
  notifications: "bell-fill",
  "game-base": "users-three-fill",
  music: "music-notes-fill",
  sound: "speaker-high-fill",
  microphone: "microphone-fill",
  accessories: "game-controller-fill",
} as const

const mockIconPaths = Object.fromEntries(
  Object.entries(mockIconNames).map(([id, name]) => [id, resolve(import.meta.dir, `../../assets/icons/mock/${name}.svg`)]),
) as Record<keyof typeof mockIconNames, string>

const branchIds = ["control-music", "control-sound", "control-microphone", "control-accessories"] as const

type BranchId = typeof branchIds[number]

function topOverlay(props: Ps5OverlayProps) {
  return () => props.state().overlayStack.at(-1)?.id
}

function closeAll(props: Ps5OverlayProps) {
  while (props.state().overlayStack.length > 0) props.actions.closeOverlay()
}

function go(props: Ps5OverlayProps, screen: ScreenId) {
  props.actions.go(screen)
}

function goHome(props: Ps5OverlayProps) {
  closeAll(props)
  props.actions.go("home")
}

function scaleFor(viewport: ReturnType<typeof usePs5Viewport>) {
  return (value: number) => ps5Scale(viewport, value)
}

function focusBranch(props: Ps5OverlayProps, id: BranchId, initial: string) {
  const active = topOverlay(props)
  let entered = false
  createEffect(() => {
    if (active() !== id) {
      entered = false
      return
    }
    if (entered && props.state().focusedId) return
    entered = true
    props.actions.setFocus(props.state().focusedId ?? initial)
  })
}

function branchFrame(viewport: ReturnType<typeof usePs5Viewport>, title: string, subtitle: string, children: JSX.Element) {
  const scale = scaleFor(viewport)
  return (
    <Box width={viewport.width()} height={viewport.height()} alignX="center" alignY="bottom">
      <Ps5Panel width={scale(760)} padding={scale(28)} gap={scale(16)} direction="column" backgroundColor={ps5Colors.panel} borderColor="#ffffff38" borderWidth={1} cornerRadius={scale(20)}>
        <Text color={ps5Colors.text} fontSize={scale(27)} fontWeight={700}>{title}</Text>
        <Text color={ps5Colors.mutedText} fontSize={scale(14)}>{subtitle}</Text>
        {children}
      </Ps5Panel>
    </Box>
  )
}

/** Local simulation branch for the Music control. */
function MusicPanel(props: Ps5OverlayProps) {
  const viewport = usePs5Viewport()
  const scale = scaleFor(viewport)
  focusBranch(props, "control-music", "music-play")
  const tracks = [
    { id: "menu-theme", label: "Tema del menú" },
    { id: "game-theme", label: "Tema del juego" },
    { id: "ambient", label: "Ambientación PS5" },
  ]
  const press = (id: string, run: () => void) => () => {
    props.actions.setFocus(id)
    run()
  }
  const selected = () => props.state().music.selectedTrackId
  const moveTrack = (delta: -1 | 1) => {
    const index = tracks.findIndex((track) => track.id === selected())
    const next = Math.max(0, Math.min(tracks.length - 1, index < 0 ? 0 : index + delta))
    const track = tracks[next]
    if (!track) return
    props.actions.dispatch({ type: "control/music", action: "select", trackId: track.id })
    props.actions.setFocus(`music-track-${track.id}`)
  }
  const cycleTrack = (delta: -1 | 1) => {
    const index = tracks.findIndex((track) => track.id === selected())
    const next = Math.max(0, Math.min(tracks.length - 1, index < 0 ? 0 : index + delta))
    const track = tracks[next]
    if (!track) return
    props.actions.dispatch({ type: "control/music", action: delta > 0 ? "next" : "previous" })
  }
  return branchFrame(viewport, "Música", "Controles simulados; no se reproduce audio del sistema.", (
      <Box direction="column" gap={scale(12)}>
        <For each={tracks}>{(track, index) => (
          <Ps5Button
            id={`music-track-${track.id}`}
            layer="overlay"
            width="100%"
            height={scale(48)}
            alignX="left"
            label={`${track.label}${selected() === track.id ? " · seleccionada" : ""}`}
            onPress={press(`music-track-${track.id}`, () => props.actions.dispatch({ type: "control/music", action: "select", trackId: track.id }))}
            onKeyDown={(event) => {
              if (event.key === "left") moveTrack(-1)
              if (event.key === "right") moveTrack(1)
            }}
            screen={props}
          />
        )}</For>
        <Box direction="row" gap={scale(10)}>
          <Ps5Button id="music-previous" layer="overlay" width={scale(150)} height={scale(46)} label="Anterior" onPress={press("music-previous", () => cycleTrack(-1))} screen={props} />
          <Ps5Button id="music-play" layer="overlay" width={scale(150)} height={scale(46)} label={props.state().music.playing ? "Pausar" : "Reproducir"} onPress={press("music-play", () => props.actions.dispatch({ type: "control/music", action: props.state().music.playing ? "pause" : "play" }))} screen={props} />
          <Ps5Button id="music-next" layer="overlay" width={scale(150)} height={scale(46)} label="Siguiente" onPress={press("music-next", () => cycleTrack(1))} screen={props} />
        </Box>
        <Box direction="row" gap={scale(10)} alignY="center">
          <Text color={ps5Colors.mutedText} fontSize={scale(14)}>Volumen de salida {props.state().sound.volume}%</Text>
          <Ps5Button id="music-volume-down" layer="overlay" width={scale(46)} height={scale(42)} label="−" onPress={press("music-volume-down", () => props.actions.dispatch({ type: "control/sound", action: "volume", value: Math.max(0, props.state().sound.volume - 10) }))} screen={props} />
          <Ps5Button id="music-volume-up" layer="overlay" width={scale(46)} height={scale(42)} label="+" onPress={press("music-volume-up", () => props.actions.dispatch({ type: "control/sound", action: "volume", value: Math.min(100, props.state().sound.volume + 10) }))} screen={props} />
        </Box>
        <Ps5Button id="music-back" layer="overlay" width="100%" height={scale(46)} label="Volver al Centro de control" onPress={props.actions.closeOverlay} screen={props} />
      </Box>
    ))
}

/** Local simulation branch for the Sound control. */
function SoundPanel(props: Ps5OverlayProps) {
  const viewport = usePs5Viewport()
  const scale = scaleFor(viewport)
  focusBranch(props, "control-sound", "sound-mute")
  const press = (id: string, run: () => void) => () => {
    props.actions.setFocus(id)
    run()
  }
  return branchFrame(viewport, "Sonido", "Salida y volumen simulados; no se cambia el audio del host.", (
      <Box direction="column" gap={scale(14)}>
        <Ps5Button id="sound-mute" layer="overlay" width="100%" height={scale(50)} label={props.state().sound.muted ? "Activar sonido" : "Silenciar"} onPress={press("sound-mute", () => props.actions.dispatch({ type: "control/sound", action: "mute" }))} screen={props} />
        <Box direction="row" gap={scale(10)} alignY="center">
          <Text color={ps5Colors.mutedText} fontSize={scale(14)}>Volumen {props.state().sound.volume}%</Text>
          <Ps5Button id="sound-volume-down" layer="overlay" width={scale(46)} height={scale(42)} label="−" onPress={press("sound-volume-down", () => props.actions.dispatch({ type: "control/sound", action: "volume", value: Math.max(0, props.state().sound.volume - 10) }))} screen={props} />
          <Ps5Button id="sound-volume-up" layer="overlay" width={scale(46)} height={scale(42)} label="+" onPress={press("sound-volume-up", () => props.actions.dispatch({ type: "control/sound", action: "volume", value: Math.min(100, props.state().sound.volume + 10) }))} screen={props} />
        </Box>
        <Box direction="row" gap={scale(10)}>
          <Ps5Button id="sound-output-tv" layer="overlay" width="50%" height={scale(48)} label="TV simulada" backgroundColor={props.state().sound.output === "tv-simulated" ? "#414852" : undefined} onPress={press("sound-output-tv", () => props.actions.dispatch({ type: "control/sound", action: "output", output: "tv-simulated" }))} screen={props} />
          <Ps5Button id="sound-output-headset" layer="overlay" width="50%" height={scale(48)} label="Auriculares simulados" backgroundColor={props.state().sound.output === "headset-simulated" ? "#414852" : undefined} onPress={press("sound-output-headset", () => props.actions.dispatch({ type: "control/sound", action: "output", output: "headset-simulated" }))} screen={props} />
        </Box>
        <Ps5Button id="sound-back" layer="overlay" width="100%" height={scale(46)} label="Volver al Centro de control" onPress={props.actions.closeOverlay} screen={props} />
      </Box>
    ))
}

/** Local simulation branch for the Microphone control. */
function MicrophonePanel(props: Ps5OverlayProps) {
  const viewport = usePs5Viewport()
  const scale = scaleFor(viewport)
  focusBranch(props, "control-microphone", "microphone-mute")
  const press = (id: string, run: () => void) => () => {
    props.actions.setFocus(id)
    run()
  }
  return branchFrame(viewport, "Micrófono", "Estado visual simulado; no se accede al micrófono.", (
      <Box direction="column" gap={scale(14)}>
        <Ps5Button id="microphone-mute" layer="overlay" width="100%" height={scale(50)} label={props.state().microphone.muted ? "Activar micrófono" : "Silenciar micrófono"} onPress={press("microphone-mute", () => props.actions.dispatch({ type: "control/microphone", action: "mute" }))} screen={props} />
        <Box direction="row" gap={scale(10)} alignY="center">
          <Text color={ps5Colors.mutedText} fontSize={scale(14)}>Nivel visual {props.state().microphone.level}%</Text>
          <Ps5Button id="microphone-level-down" layer="overlay" width={scale(46)} height={scale(42)} label="−" onPress={press("microphone-level-down", () => props.actions.dispatch({ type: "control/microphone", action: "level", value: Math.max(0, props.state().microphone.level - 10) }))} screen={props} />
          <Ps5Button id="microphone-level-up" layer="overlay" width={scale(46)} height={scale(42)} label="+" onPress={press("microphone-level-up", () => props.actions.dispatch({ type: "control/microphone", action: "level", value: Math.min(100, props.state().microphone.level + 10) }))} screen={props} />
        </Box>
        <Ps5Button id="microphone-back" layer="overlay" width="100%" height={scale(46)} label="Volver al Centro de control" onPress={props.actions.closeOverlay} screen={props} />
      </Box>
    ))
}

/** Local simulation branch for the Accessories control. */
function AccessoriesPanel(props: Ps5OverlayProps) {
  const viewport = usePs5Viewport()
  const scale = scaleFor(viewport)
  focusBranch(props, "control-accessories", "accessories-toggle")
  const press = (id: string, run: () => void) => () => {
    props.actions.setFocus(id)
    run()
  }
  const accessories = () => props.state().accessories
  return branchFrame(viewport, "Accesorios", "Conexión y batería simuladas; no se consulta hardware.", (
      <Box direction="column" gap={scale(14)}>
        <Box direction="row" gap={scale(16)} alignY="center">
          <Ps5Icon name="game-controller" size={scale(36)} />
          <Box direction="column" gap={scale(4)}>
            <Text color={ps5Colors.text} fontSize={scale(17)}>{accessories().deviceName}</Text>
            <Text color={ps5Colors.mutedText} fontSize={scale(14)}>{accessories().connected ? "Conectado" : "Desconectado"} · Batería {accessories().battery}%</Text>
          </Box>
        </Box>
        <Ps5Button id="accessories-toggle" layer="overlay" width="100%" height={scale(50)} label={accessories().connected ? "Desconectar" : "Conectar"} onPress={press("accessories-toggle", () => props.actions.dispatch({ type: "control/accessories", action: accessories().connected ? "disconnect" : "connect" }))} screen={props} />
        <Ps5Button id="accessories-back" layer="overlay" width="100%" height={scale(46)} label="Volver al Centro de control" onPress={props.actions.closeOverlay} screen={props} />
      </Box>
    ))
}

function ControlCard(props: {
  id: ControlCardId
  index: number
  total: number
  onPress: () => void
  onMove: (delta: -1 | 1) => void
  screen: Ps5OverlayProps
}) {
  const viewport = usePs5Viewport()
  const scale = scaleFor(viewport)
  const active = () => props.screen.state().controlCenter.selectedCard === props.id
  const icon = props.id === "profile"
    ? <Ps5Avatar name={props.screen.state().users.find((user) => user.id === props.screen.state().activeUserId)?.name ?? "Perfil"} src={props.screen.state().users.find((user) => user.id === props.screen.state().activeUserId)?.avatar} size={scale(50)} status />
    : props.id === "power"
      ? <Ps5Icon name="power" size={scale(41)} />
      : <img src={mockIconPaths[props.id]} width={scale(41)} height={scale(41)} />
  return (
    <Ps5Button
      id={`control-${props.id}`}
      layer="overlay"
      width={scale(96)}
      height={scale(96)}
      padding={0}
      onPress={props.onPress}
      onKeyDown={(event) => {
        if (event.key === "left") props.onMove(-1)
        if (event.key === "right") props.onMove(1)
      }}
      screen={props.screen}
      backgroundColor="#00000000"
      borderColor="#00000000"
      borderWidth={0}
      cornerRadius={0}
      focusRing={false}
      focusGlow={false}
    >
      <Box direction="column" gap={scale(7)} alignX="center" alignY="center">
        <Box width={scale(56)} height={scale(56)} alignX="center" alignY="center" backgroundColor={active() ? "#00000001" : undefined} glow={active() ? { radius: scale(10), color: "#4387ff", intensity: 72 } : undefined}>
          {icon}
          <Show when={props.id === "game-base"}>
            <Box
              width={scale(12)}
              height={scale(12)}
              floating="parent"
              floatOffset={{ x: scale(43), y: scale(3) }}
              backgroundColor={ps5Colors.success}
              borderColor="#091017"
              borderWidth={scale(2)}
              cornerRadius={scale(6)}
            />
          </Show>
          <Show when={props.id === "accessories"}>
            <Box
              width={scale(22)}
              height={scale(11)}
              floating="parent"
              floatOffset={{ x: scale(40), y: scale(43) }}
              borderColor="#ffffffcc"
              borderWidth={scale(1)}
              cornerRadius={scale(2)}
            >
              <Box width="68%" height="100%" backgroundColor={ps5Colors.success} cornerRadius={scale(1)} />
              <Box width={scale(3)} height={scale(5)} floating="parent" floatOffset={{ x: scale(22), y: scale(3) }} backgroundColor="#ffffffcc" cornerRadius={scale(1)} />
            </Box>
          </Show>
        </Box>
        <Show when={active()}>
          <Text color={ps5Colors.text} fontSize={scale(21)} alignX="center">{cardLabels[props.id]}</Text>
        </Show>
      </Box>
    </Ps5Button>
  )
}

function CenterRow(props: Ps5OverlayProps) {
  const viewport = usePs5Viewport()
  const scale = scaleFor(viewport)
  const active = topOverlay(props)
  let entered = false
  createEffect(() => {
    if (active() !== "control-center") {
      entered = false
      return
    }
    const state = props.state()
    const ids = state.controlCenter.order.filter((id) => state.controlCenter.visibility[id])
    const current = state.focusedId?.startsWith("control-") ? state.focusedId.slice("control-".length) as ControlCardId : undefined
    const selected = ids.includes(state.controlCenter.selectedCard) ? state.controlCenter.selectedCard : ids[0]
    if (ids.length === 0) return
    if (!entered || !current || !ids.includes(current)) {
      entered = true
      props.actions.dispatch({ type: "control/select", id: selected! })
      props.actions.setFocus(`control-${selected}`)
    }
  })

  const controls = () => {
    const state = props.state()
    return state.controlCenter.order.filter((id) => state.controlCenter.visibility[id])
  }
  const move = (index: number, delta: -1 | 1) => {
    const ids = controls()
    const next = Math.max(0, Math.min(ids.length - 1, index + delta))
    const id = ids[next]
    if (!id) return
    props.actions.dispatch({ type: "control/select", id })
    props.actions.setFocus(`control-${id}`)
  }
  const activate = (id: ControlCardId) => {
    props.actions.dispatch({ type: "control/select", id })
    switch (id) {
      case "home": goHome(props); break
      case "switcher": props.actions.openOverlay("switcher"); break
      case "notifications": go(props, "notifications"); break
      case "game-base": go(props, "game-base"); break
      case "music": props.actions.openOverlay("control-music"); break
      case "sound": props.actions.openOverlay("control-sound"); break
      case "microphone": props.actions.openOverlay("control-microphone"); break
      case "accessories": props.actions.openOverlay("control-accessories"); break
      case "profile": go(props, "profile"); break
      case "power": props.actions.requestPower("rest"); break
    }
  }

  return (
    <Box width={viewport.width()} height={scale(148)} floating="root" floatOffset={{ x: 0, y: viewport.height() - scale(148) }} backgroundColor="#070a0ff2" alignX="center" alignY="center" direction="row" paddingX={scale(42)}>
      <Box width="100%" height={scale(104)} direction="row" gap={scale(55)} alignX="center" alignY="center" scrollX viewportClip>
        <For each={controls()}>{(id, index) => (
          <ControlCard id={id} index={index()} total={controls().length} onMove={(delta) => move(index(), delta)} onPress={() => activate(id)} screen={props} />
        )}</For>
        <Show when={controls().length === 0}>
          <Text color={ps5Colors.mutedText} fontSize={scale(16)}>Usa F2 para recuperar los controles</Text>
        </Show>
      </Box>
    </Box>
  )
}

/** PS5 Control Center and its local Music/Sound/Microphone/Accessories branches. */
export function ControlCenterOverlay(props: Ps5OverlayProps) {
  const active = topOverlay(props)
  return (
    <Show when={active() === "control-center"} fallback={
      <Show when={active() === "control-music"} fallback={
        <Show when={active() === "control-sound"} fallback={
          <Show when={active() === "control-microphone"} fallback={
            <Show when={active() === "control-accessories"}>
              <AccessoriesPanel {...props} />
            </Show>
          }>
            <MicrophonePanel {...props} />
          </Show>
        }>
          <SoundPanel {...props} />
        </Show>
      }>
        <MusicPanel {...props} />
      </Show>
    }>
      <CenterRow {...props} />
    </Show>
  )
}
