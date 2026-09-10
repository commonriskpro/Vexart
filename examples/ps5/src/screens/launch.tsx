import { existsSync } from "node:fs"
import {
  Box,
  Show,
  createEffect,
} from "vexart"

import type { GameCatalogEntry, GamePhase, Ps5ScreenProps } from "../types"
import { Ps5Button, ps5Colors, Ps5Text, ps5Scale, usePs5Viewport } from "../ui"

function imageAvailable(path?: string) {
  return !!path && existsSync(path)
}

function phaseLabel(phase: GamePhase) {
  if (phase === "launching") return "Preparando lanzamiento"
  if (phase === "loading") return "Cargando simulación"
  if (phase === "title") return "Título simulado"
  if (phase === "suspended") return "Juego simulado en pausa"
  if (phase === "closed") return "Juego cerrado"
  return "Sesión local"
}

function SceneLayer(props: { game: GameCatalogEntry; width: number; height: number }) {
  const source = imageAvailable(props.game.titleScreen) ? props.game.titleScreen : props.game.hero
  return (
    <Box width={props.width} height={props.height} backgroundColor={props.game.accent} floating="parent" zIndex={0}>
      <Show when={imageAvailable(source)} fallback={
        <Box width="100%" height="100%" alignX="center" alignY="center" backgroundColor={props.game.accent}>
          <Ps5Text color="#ffffffcc" fontSize={28}>Arte no disponible · {props.game.id}</Ps5Text>
        </Box>
      }>
        <img src={source} width={props.width} height={props.height} objectFit="cover" />
      </Show>
    </Box>
  )
}

function GameBrand(props: { game: GameCatalogEntry; width: number; height: number; color: string }) {
  return (
    <Show when={imageAvailable(props.game.logo)} fallback={
      <Ps5Text color={props.color} fontSize={Math.round(props.height * 0.32)} fontWeight={700}>{props.game.title}</Ps5Text>
    }>
      <img src={props.game.logo!} width={props.width} height={props.height} objectFit="contain" />
    </Show>
  )
}

export function LaunchScreen(props: Ps5ScreenProps) {
  const viewport = usePs5Viewport()
  const scale = (value: number) => ps5Scale(viewport, value)
  const state = props.state
  const actions = props.actions
  let focusedEntry = false

  const session = () => state().gameSession
  const game = () => {
    const id = session().gameId ?? state().selectedGameId
    return state().catalog.find((entry) => entry.id === id)
  }
  const phase = () => session().phase
  const loading = () => phase() === "launching" || phase() === "loading"
  const title = () => phase() === "title" || phase() === "suspended"

  let previousPhase: GamePhase | undefined
  createEffect(() => {
    const current = state()
    if (current.screen !== "launch") {
      focusedEntry = false
      previousPhase = undefined
      return
    }
    const enteredTitle = (previousPhase === "launching" || previousPhase === "loading") && title()
    if (enteredTitle && (current.focusedId === undefined || current.focusedId === "launch-cancel")) {
      // The loading action is replaced by the title CTA. Keep an explicit
      // alternate focus (back/close) intact, but never leave native focus on
      // the removed launch-cancel node.
      actions.setFocus("launch-continue")
    }
    previousPhase = current.gameSession.phase
    if (focusedEntry) return
    focusedEntry = true
    const target = current.focusMemory.launch ?? (loading() ? "launch-cancel" : "launch-continue")
    queueMicrotask(() => {
      if (state().screen !== "launch") return
      actions.setFocus(target)
      props.onReady?.()
    })
  })

  const continueTitle = () => {
    const selected = game()
    if (!selected) return
    actions.dispatch({ type: "game/advance", phase: "suspended", progress: 100 })
  }

  return (
    <Box width={viewport.width()} height={viewport.height()} backgroundColor={game()?.accent ?? ps5Colors.background} viewportClip>
      <Show when={game()} fallback={
        <Box width={viewport.width()} height={viewport.height()} alignX="center" alignY="center" direction="column" gap={scale(18)} backgroundColor={ps5Colors.background}>
          <Ps5Text color={ps5Colors.text} fontSize={scale(30)} fontWeight={700}>No se pudo cargar el lanzamiento</Ps5Text>
          <Ps5Text color={ps5Colors.mutedText} fontSize={scale(16)}>No hay un juego local asociado a esta sesión.</Ps5Text>
          <Ps5Button id="launch-cancel" width={scale(210)} height={scale(52)} label="Volver al hub" onPress={actions.cancelGameLaunch} screen={props} />
        </Box>
      }>
        <SceneLayer game={game()!} width={viewport.width()} height={viewport.height()} />
        <Box width={viewport.width()} height={viewport.height()} backgroundColor="#04060958" floating="parent" zIndex={1} />
        <Box width={viewport.width()} height={viewport.height()} floating="parent" zIndex={1} gradient={{ type: "linear", from: "#040609c8", to: "#04060908", angle: 0 }} />
        <Box width={viewport.width()} height={viewport.height()} floating="parent" zIndex={2}>
          <Box width={viewport.width()} height={scale(42)} floating="parent" floatOffset={{ x: scale(80), y: scale(42) }} direction="row" alignY="center" gap={scale(18)}>
            <Ps5Button id="launch-back" width={scale(44)} height={scale(42)} backgroundColor="#00000000" borderWidth={0} onPress={actions.cancelGameLaunch} screen={props}>
              <Ps5Text color={ps5Colors.text} fontSize={scale(28)}>‹</Ps5Text>
            </Ps5Button>
            <Box direction="column" gap={scale(2)}>
              <Ps5Text color={ps5Colors.text} fontSize={scale(23)} fontWeight={700}>{game()!.title}</Ps5Text>
              <Ps5Text color={ps5Colors.mutedText} fontSize={scale(13)}>Lanzamiento local</Ps5Text>
            </Box>
          </Box>

          <Box width={scale(650)} height={scale(210)} floating="parent" floatOffset={{ x: scale(125), y: scale(270) }} direction="column" gap={scale(16)}>
            <Box width={scale(560)} height={scale(150)}>
              <GameBrand game={game()!} width={scale(520)} height={scale(146)} color={ps5Colors.text} />
            </Box>
            <Box direction="column" gap={scale(10)}>
              <Ps5Text color={ps5Colors.text} fontSize={scale(21)} fontWeight={700}>{phaseLabel(phase())}</Ps5Text>
              <Box width={scale(520)} height={scale(6)} backgroundColor="#ffffff42" cornerRadius={scale(3)}>
                <Box width={`${Math.max(0, Math.min(100, session().progress))}%`} height="100%" backgroundColor={game()!.accent} cornerRadius={scale(3)} />
              </Box>
              <Box width={scale(520)} direction="row" alignY="center">
                <Ps5Text color={ps5Colors.text} fontSize={scale(14)}>{Math.round(session().progress)}%</Ps5Text>
                <Box flexGrow={1} />
                <Ps5Text color={ps5Colors.mutedText} fontSize={scale(13)}>{title() ? "Sesión preparada" : "Iniciando experiencia"}</Ps5Text>
              </Box>
            </Box>
          </Box>

          <Show when={loading()} fallback={
            <Box width={scale(243)} height={scale(59)} floating="parent" floatOffset={{ x: scale(125), y: scale(570) }}>
              <Ps5Button id="launch-continue" width="100%" height="100%" backgroundColor="#f4f4f4" borderColor="#ffffff" cornerRadius={scale(29)} onPress={continueTitle} screen={props}>
                <Ps5Text color="#101214" fontSize={scale(19)} fontWeight={700}>{title() ? "Continuar simulación" : "Continuar"}</Ps5Text>
              </Ps5Button>
            </Box>
          }>
            <Box width={scale(243)} height={scale(59)} floating="parent" floatOffset={{ x: scale(125), y: scale(570) }}>
              <Ps5Button id="launch-cancel" width="100%" height="100%" backgroundColor="#f4f4f4" borderColor="#ffffff" cornerRadius={scale(29)} onPress={actions.cancelGameLaunch} screen={props}>
                <Ps5Text color="#101214" fontSize={scale(19)} fontWeight={700}>Cancelar</Ps5Text>
              </Ps5Button>
            </Box>
          </Show>
          <Box width={scale(205)} height={scale(59)} floating="parent" floatOffset={{ x: scale(385), y: scale(570) }}>
            <Ps5Button id="launch-close" width="100%" height="100%" backgroundColor="#1c2027cc" borderColor="#ffffff32" cornerRadius={scale(29)} onPress={() => actions.dispatch({ type: "game/close" })} screen={props}>
              <Ps5Text color={ps5Colors.text} fontSize={scale(16)}>Cerrar juego</Ps5Text>
            </Ps5Button>
          </Box>

          <Box width={viewport.width()} height={scale(72)} floating="parent" floatOffset={{ x: 0, y: viewport.height() - scale(72) }} backgroundColor="#07090db8" zIndex={3} alignX="center" alignY="center">
            <Ps5Text color={ps5Colors.mutedText} fontSize={scale(13)}>F1 Centro de control · Escape Cancelar · F2 Opciones</Ps5Text>
          </Box>
        </Box>
      </Show>
    </Box>
  )
}
