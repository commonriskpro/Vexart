import {
  Box,
  For,
  Show,
  createEffect,
} from "vexart"

import type { GameId, Ps5OverlayProps, ScreenId } from "../types"
import { Ps5Button, Ps5Panel, Ps5Text as Text, ps5Colors, ps5Scale, usePs5Viewport } from "../ui"

function topOverlay(props: Ps5OverlayProps) {
  return () => props.state().overlayStack.at(-1)?.id
}

function closeAll(props: Ps5OverlayProps) {
  while (props.state().overlayStack.length > 0) props.actions.closeOverlay()
}

function go(props: Ps5OverlayProps, screen: ScreenId, gameId?: GameId) {
  props.actions.go(screen, gameId ? { gameId } : undefined)
}

function goHome(props: Ps5OverlayProps) {
  closeAll(props)
  props.actions.go("home")
}

/** Recent-game selector. It owns one simulated session and never starts a parallel session. */
export function SwitcherOverlay(props: Ps5OverlayProps) {
  const viewport = usePs5Viewport()
  const scale = (value: number) => ps5Scale(viewport, value)
  const active = topOverlay(props)
  let entered = false

  const recent = () => props.state().recentGameIds
  const selectedId = () => {
    const state = props.state()
    const candidate = state.gameSession.gameId ?? state.selectedGameId
    return candidate && recent().includes(candidate) ? candidate : recent()[0]
  }
  const selectedGame = () => props.state().catalog.find((game) => game.id === selectedId())

  createEffect(() => {
    if (active() !== "switcher") {
      entered = false
      return
    }
    const id = selectedId()
    const focus = props.state().focusedId
    const valid = id && focus === `switcher-game-${id}`
    if (!entered || (!valid && focus !== "switcher-resume" && focus !== "switcher-hub" && focus !== "switcher-close" && focus !== "switcher-home" && focus !== "switcher-back")) {
      entered = true
      props.actions.setFocus(id ? `switcher-game-${id}` : "switcher-back")
    }
  })

  const move = (index: number, delta: -1 | 1) => {
    const ids = recent()
    const next = Math.max(0, Math.min(ids.length - 1, index + delta))
    const id = ids[next]
    if (!id) return
    props.actions.selectRecentGame(id)
    props.actions.setFocus(`switcher-game-${id}`)
  }

  const select = (id: string) => {
    props.actions.selectRecentGame(id as GameId)
    props.actions.setFocus(`switcher-game-${id}`)
  }

  const resume = () => {
    const id = selectedId()
    if (id) props.actions.resumeRecentGame(id)
  }

  const openHub = () => {
    const id = selectedId()
    if (id) go(props, "game-hub", id)
  }

  const closeGame = () => {
    if (!props.state().gameSession.gameId) return
    closeAll(props)
    props.actions.dispatch({ type: "game/close" })
  }

  return (
    <Show when={active() === "switcher"}>
      <Box width={viewport.width()} height={viewport.height()} alignX="center" alignY="bottom">
        <Ps5Panel width="92%" padding={scale(28)} gap={scale(16)} direction="column" backgroundColor={ps5Colors.panel} borderColor="#ffffff38" borderWidth={1} cornerRadius={scale(20)}>
          <Box direction="row" alignX="space-between" alignY="center">
            <Box direction="column" gap={scale(5)}>
              <Text color={ps5Colors.text} fontSize={scale(28)} fontWeight={700}>Selector</Text>
              <Text color={ps5Colors.mutedText} fontSize={scale(14)}>Juegos recientes · una única sesión simulada</Text>
            </Box>
            <Show when={selectedGame()}>
              <Text color={ps5Colors.mutedText} fontSize={scale(13)}>Sesión: {props.state().gameSession.phase}</Text>
            </Show>
          </Box>

          <Show when={recent().length > 0} fallback={
            <Box direction="column" gap={scale(16)} alignX="center" padding={scale(18)}>
              <Text color={ps5Colors.mutedText} fontSize={scale(17)}>No hay juegos recientes</Text>
              <Ps5Button id="switcher-back" layer="overlay" width={scale(240)} height={scale(48)} label="Volver" onPress={props.actions.closeOverlay} screen={props} />
            </Box>
          }>
            <Box width="100%" direction="row" gap={scale(16)} scrollX viewportClip>
              <For each={recent()}>{(id, index) => {
                const game = () => props.state().catalog.find((entry) => entry.id === id)
                return (
                  <Ps5Button
                    id={`switcher-game-${id}`}
                    layer="overlay"
                    width={scale(164)}
                    height={scale(205)}
                    padding={scale(8)}
                    onPress={() => select(id)}
                    onKeyDown={(event) => {
                      if (event.key === "left") move(index(), -1)
                      if (event.key === "right") move(index(), 1)
                    }}
                    screen={props}
                  >
                    <Box direction="column" gap={scale(8)} alignX="center">
                      <Show when={game()} fallback={<Box width={scale(120)} height={scale(132)} backgroundColor="#303640" cornerRadius={scale(10)} />}>
                        <img src={game()!.cover} width={scale(120)} height={scale(132)} objectFit="cover" cornerRadius={scale(10)} />
                      </Show>
                      <Text color={ps5Colors.text} fontSize={scale(13)} alignX="center">{game()?.title ?? id}</Text>
                    </Box>
                  </Ps5Button>
                )
              }}</For>
            </Box>

            <Show when={selectedGame()}>
              <Ps5Panel width="100%" padding={scale(14)} gap={scale(8)} direction="column" backgroundColor="#11161dcc" borderColor="#ffffff1c" cornerRadius={scale(12)}>
                <Text color={ps5Colors.text} fontSize={scale(17)} fontWeight={700}>{selectedGame()!.title}</Text>
                <Text color={ps5Colors.mutedText} fontSize={scale(13)}>{selectedGame()!.subtitle}</Text>
                <Text color={ps5Colors.mutedText} fontSize={scale(13)}>Progreso de la sesión: {Math.round(props.state().gameSession.progress)}%</Text>
              </Ps5Panel>
            </Show>

            <Box direction="row" gap={scale(10)}>
              <Ps5Button id="switcher-resume" layer="overlay" width={scale(190)} height={scale(48)} label="Reanudar" onPress={resume} disabled={!selectedId()} screen={props} />
              <Ps5Button id="switcher-hub" layer="overlay" width={scale(190)} height={scale(48)} label="Abrir hub" onPress={openHub} disabled={!selectedId()} screen={props} />
              <Show when={props.state().gameSession.gameId}>
                <Ps5Button id="switcher-close" layer="overlay" width={scale(190)} height={scale(48)} label="Cerrar juego" onPress={closeGame} screen={props} />
              </Show>
              <Ps5Button id="switcher-home" layer="overlay" width={scale(150)} height={scale(48)} label="Inicio" onPress={() => goHome(props)} screen={props} />
            </Box>
            <Text color={ps5Colors.mutedText} fontSize={scale(12)}>← / → para elegir · Enter para seleccionar · F2 para opciones</Text>
          </Show>
        </Ps5Panel>
      </Box>
    </Show>
  )
}
