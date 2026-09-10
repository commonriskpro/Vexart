import { existsSync } from "node:fs"
import { resolve } from "node:path"
import type { JSX } from "solid-js"
import {
  Box,
  For,
  Show,
  createEffect,
  createSignal,
} from "vexart"

import type { GameCatalogEntry, Ps5ScreenProps } from "../types"
import { Ps5Button, Ps5Icon, Ps5Panel, ps5Colors, Ps5Text, ps5Scale, usePs5Back, usePs5Viewport } from "../ui"

function imageAvailable(path?: string) {
  return !!path && existsSync(path)
}

function keyIs(event: { key: string }, ...keys: string[]) {
  return keys.includes(event.key)
}

const mockAssets = {
  activity: resolve(import.meta.dir, "../../assets/mock/activity-horseback-sunset.png"),
  trophies: resolve(import.meta.dir, "../../assets/mock/trophies-silver-gold-bronze-dark.png"),
  gallery: resolve(import.meta.dir, "../../assets/mock/news-mountain-island.png"),
  ghostLockup: resolve(import.meta.dir, "../../assets/mock/ghost-lockup.png"),
} as const

function HeroLayer(props: { game: GameCatalogEntry; width: number; height: number }) {
  return (
    <Box width={props.width} height={props.height} backgroundColor={props.game.accent} floating="parent" zIndex={0}>
      <Show when={imageAvailable(props.game.hero)} fallback={
        <Box width="100%" height="100%" alignX="center" alignY="center" backgroundColor={props.game.accent}>
          <Ps5Text color="#ffffffcc" fontSize={28}>Arte no disponible · {props.game.id}</Ps5Text>
        </Box>
      }>
        <img src={props.game.hero} width={props.width} height={props.height} objectFit="cover" />
      </Show>
    </Box>
  )
}

function FocusedCard(props: {
  screen: Ps5ScreenProps
  id: string
  title: string
  body: string
  width: number
  height: number
  padding: number
  gap: number
  radius: number
  image?: string
  onPress: () => void
  onKeyDown: (event: { key: string }) => void
  children?: JSX.Element
}) {
  return (
    <Ps5Button id={props.id} width={props.width} height={props.height} padding={0} backgroundColor="#070b12d8" borderColor="#ffffff55" borderWidth={1} cornerRadius={props.radius} onPress={props.onPress} onKeyDown={props.onKeyDown} screen={props.screen}>
      <Box width="100%" height="100%" backgroundColor="#10151d" cornerRadius={props.radius}>
        <Show when={props.image && imageAvailable(props.image)} fallback={<Box width="100%" height="100%" backgroundColor="#10151d" cornerRadius={props.radius} />}>
          <img src={props.image!} width="100%" height="100%" objectFit="cover" cornerRadius={props.radius} />
        </Show>
        <Box
          width="100%"
          height="100%"
          floating="parent"
          zIndex={1}
          cornerRadius={props.radius}
          gradient={{ type: "linear", from: "#03060a10", to: "#03060ae8", angle: 90 }}
        />
        <Box
          width="100%"
          height="100%"
          floating="parent"
          zIndex={2}
          padding={props.padding}
          direction="column"
          alignY="bottom"
          gap={props.gap}
        >
          <Show when={props.children}>{props.children}</Show>
          <Ps5Text color={ps5Colors.text} fontSize={22} fontWeight={700}>{props.title}</Ps5Text>
          <Ps5Text color="#ffffffdd" fontSize={15}>{props.body}</Ps5Text>
        </Box>
      </Box>
    </Ps5Button>
  )
}

export function GameHubScreen(props: Ps5ScreenProps) {
  const viewport = usePs5Viewport()
  const scale = (value: number) => ps5Scale(viewport, value)
  const state = props.state
  const actions = props.actions
  const [activityDetail, setActivityDetail] = createSignal<string>()
  let focusedEntry = false

  const closeActivity = () => {
    setActivityDetail(undefined)
    setTimeout(() => actions.setFocus("hub-card-0"), 0)
  }

  usePs5Back(() => {
    if (!activityDetail()) return false
    closeActivity()
    return true
  })

  const game = () => state().catalog.find((entry) => entry.id === state().selectedGameId)
  const download = () => {
    const selected = game()
    return selected ? state().downloads.find((entry) => entry.gameId === selected.id) : undefined
  }

  createEffect(() => {
    const current = state()
    const selected = game()
    if (current.screen !== "game-hub" || focusedEntry) return
    focusedEntry = true
    const target = current.focusMemory["game-hub"] ?? (selected?.installed ? "hub-play" : "hub-download")
    queueMicrotask(() => {
      if (state().screen !== "game-hub") return
      actions.setFocus(target)
      props.onReady?.()
    })
  })

  const launchOrDownload = () => {
    const selected = game()
    if (!selected) return
    if (selected.installed) {
      actions.startGame(selected.id)
      return
    }
    actions.startDownload(selected.id)
    actions.dispatch({ type: "download/set", id: `download-${selected.id}`, status: "downloading" })
  }
  const moveCard = (index: number) => (event: { key: string }) => {
    if (keyIs(event, "left", "ArrowLeft")) actions.setFocus(index <= 0 ? (game()?.installed ? "hub-play" : "hub-download") : `hub-card-${index - 1}`)
    if (keyIs(event, "right", "ArrowRight")) actions.setFocus(index >= 2 ? "hub-options" : `hub-card-${index + 1}`)
    if (keyIs(event, "up", "ArrowUp")) actions.setFocus(game()?.installed ? "hub-play" : "hub-download")
  }

  const current = () => game()
  const selected = () => current()
  const brandingLogo = () => {
    const entry = selected()
    if (!entry) return undefined
    if (entry.id === "ghost-of-tsushima" && imageAvailable(mockAssets.ghostLockup)) return mockAssets.ghostLockup
    return entry.logo
  }

  return (
    <Box width={viewport.width()} height={viewport.height()} backgroundColor={selected()?.accent ?? ps5Colors.background} viewportClip>
      <Show when={selected()} fallback={
        <Box width={viewport.width()} height={viewport.height()} alignX="center" alignY="center" direction="column" gap={scale(18)} backgroundColor={ps5Colors.background}>
          <Ps5Text color={ps5Colors.text} fontSize={scale(30)} fontWeight={700}>No se pudo cargar el hub</Ps5Text>
          <Ps5Text color={ps5Colors.mutedText} fontSize={scale(16)}>El juego seleccionado ya no está en el catálogo local.</Ps5Text>
          <Ps5Button id="hub-retry" width={scale(210)} height={scale(52)} label="Reintentar" onPress={() => actions.go("game-hub")} screen={props} />
          <Ps5Button id="hub-back" width={scale(210)} height={scale(52)} label="Volver" onPress={actions.back} screen={props} />
        </Box>
      }>
        <HeroLayer game={selected()!} width={viewport.width()} height={viewport.height()} />
        <Box width={viewport.width()} height={viewport.height()} backgroundColor="#04060966" floating="parent" zIndex={1} />
        <Box width={viewport.width()} height={viewport.height()} floating="parent" zIndex={2}>
          <Box width={viewport.width()} height={scale(42)} floating="parent" floatOffset={{ x: scale(80), y: scale(42) }} direction="row" alignY="center" gap={scale(20)}>
            <Ps5Button id="hub-back" width={scale(44)} height={scale(42)} backgroundColor="#00000000" borderWidth={0} onPress={actions.back} screen={props}>
              <Ps5Text color={ps5Colors.text} fontSize={scale(28)}>‹</Ps5Text>
            </Ps5Button>
            <Ps5Text color={ps5Colors.text} fontSize={scale(24)} fontWeight={700}>Centro del juego</Ps5Text>
            <Box flexGrow={1} />
            <Ps5Button id="hub-options" width={scale(62)} height={scale(42)} backgroundColor="#00000000" borderWidth={0} onPress={() => actions.openOverlay("options")} screen={props}>
              <Ps5Text color={ps5Colors.text} fontSize={scale(22)}>···</Ps5Text>
            </Ps5Button>
          </Box>

          <Box width={scale(620)} height={scale(210)} floating="parent" floatOffset={{ x: scale(125), y: scale(350) }}>
          <Ps5Panel width="100%" height="100%" padding={0} gap={scale(10)} direction="column" backgroundColor="#07090a00" borderWidth={0}>
            <Box width="100%" height={scale(30)} direction="row" alignY="center" gap={scale(16)}>
              <Ps5Text color={ps5Colors.text} fontSize={scale(19)} fontWeight={700}>{selected()!.title}</Ps5Text>
              <Ps5Text color={ps5Colors.mutedText} fontSize={scale(14)}>{selected()!.subtitle}</Ps5Text>
            </Box>
            <Show when={brandingLogo() && imageAvailable(brandingLogo())} fallback={
              <Ps5Text color={ps5Colors.text} fontSize={scale(42)} fontWeight={700}>{selected()!.title}</Ps5Text>
            }>
              <img src={brandingLogo()!} width={scale(460)} height={scale(100)} objectFit="contain" />
            </Show>
            <Ps5Text color={ps5Colors.mutedText} fontSize={scale(14)}>{selected()!.genre} · {selected()!.description}</Ps5Text>
          </Ps5Panel>
          </Box>

          <Box width={scale(243)} height={scale(59)} floating="parent" floatOffset={{ x: scale(125), y: scale(557) }}>
            <Ps5Button id={selected()!.installed ? "hub-play" : "hub-download"} width="100%" height="100%" backgroundColor="#f4f4f4" borderColor="#ffffff" cornerRadius={scale(29)} onPress={launchOrDownload} screen={props}>
              <Ps5Text color="#101214" fontSize={scale(19)} fontWeight={700}>{download()?.status === "downloading" ? `Descargando ${Math.round(download()!.progress)}%` : selected()!.installed ? "Jugar" : "Descargar"}</Ps5Text>
            </Ps5Button>
          </Box>

          <Box width={scale(1680)} height={scale(225)} floating="parent" floatOffset={{ x: scale(117), y: scale(663) }} direction="row" gap={scale(16)}>
            <FocusedCard screen={props} padding={scale(20)} gap={scale(8)} radius={scale(16)} id="hub-card-0" width={scale(540)} height={scale(225)} image={selected()!.id === "ghost-of-tsushima" ? mockAssets.activity : selected()!.hero} title={selected()!.activities[0]?.title ?? "Continuar actividad"} body={selected()!.activities[0]?.description ?? "Retoma tu última actividad."} onPress={() => { setActivityDetail(selected()!.activities[0]?.id ?? "activity"); setTimeout(() => actions.setFocus("hub-activity-close"), 0) }} onKeyDown={moveCard(0)}>
              <Ps5Text color={selected()!.accent} fontSize={scale(15)}>{selected()!.activities[0]?.progress ?? 0}% completado</Ps5Text>
            </FocusedCard>
            <FocusedCard screen={props} padding={scale(20)} gap={scale(8)} radius={scale(16)} id="hub-card-1" width={scale(540)} height={scale(225)} image={selected()!.id === "ghost-of-tsushima" ? mockAssets.trophies : selected()!.hero} title="Trofeos" body="Abre el perfil para revisar los trofeos del juego." onPress={() => actions.go("profile", { gameId: selected()!.id })} onKeyDown={moveCard(1)}>
              <Ps5Text color={ps5Colors.text} fontSize={scale(15)}>{selected()!.trophies.filter((entry) => entry.earned).length} conseguidos · {selected()!.trophies.length} totales</Ps5Text>
            </FocusedCard>
            <FocusedCard screen={props} padding={scale(20)} gap={scale(8)} radius={scale(16)} image={selected()!.id === "ghost-of-tsushima" ? mockAssets.gallery : selected()!.hero} id="hub-card-2" width={scale(540)} height={scale(225)} title="Galería" body="Explora capturas y contenido local de este juego." onPress={() => actions.go("gallery", { gameId: selected()!.id })} onKeyDown={moveCard(2)}>
              <Ps5Icon name="squares-four" size={scale(28)} opacity={0.9} />
            </FocusedCard>
          </Box>

          <Box width={viewport.width()} height={scale(148)} floating="parent" floatOffset={{ x: 0, y: scale(932) }} backgroundColor={ps5Colors.scrim} zIndex={3} alignX="center" alignY="center">
            <Ps5Text color={ps5Colors.mutedText} fontSize={scale(14)}>F1 Centro de control · F2 Opciones · Escape Volver</Ps5Text>
          </Box>

          <Show when={activityDetail()}>
            <Box width={scale(780)} height={scale(300)} floating="parent" floatOffset={{ x: scale(250), y: scale(270) }} zIndex={5}>
              <Ps5Panel width="100%" height="100%" padding={scale(24)} gap={scale(14)} direction="column" backgroundColor="#111720f5" borderColor="#ffffff70" cornerRadius={scale(18)}>
                <Ps5Text color={ps5Colors.text} fontSize={scale(24)} fontWeight={700}>{selected()!.activities.find((entry) => entry.id === activityDetail())?.title ?? "Actividad"}</Ps5Text>
                <Ps5Text color={ps5Colors.mutedText} fontSize={scale(16)}>{selected()!.activities.find((entry) => entry.id === activityDetail())?.description ?? "Retoma esta actividad local."}</Ps5Text>
                <Ps5Text color={ps5Colors.text} fontSize={scale(15)}>Progreso: {selected()!.activities.find((entry) => entry.id === activityDetail())?.progress ?? 0}%</Ps5Text>
                <Box flexGrow={1} />
                <Ps5Button id="hub-activity-close" width={scale(170)} height={scale(46)} label="Cerrar" onPress={closeActivity} screen={props} />
              </Ps5Panel>
            </Box>
          </Show>
        </Box>
      </Show>
    </Box>
  )
}
