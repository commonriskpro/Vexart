import {
  Box,
  Dialog,
  DialogOverlay,
  Show,
  createEffect,
} from "vexart"

import type { Ps5OverlayProps } from "../types"
import { Ps5Button, Ps5Panel, Ps5Text, ps5Colors, ps5Scale, usePs5Viewport } from "../ui"

export function PowerOverlay(props: Ps5OverlayProps) {
  const viewport = usePs5Viewport()
  const state = props.state
  const actions = props.actions
  const scale = (value: number) => ps5Scale(viewport, value)
  const topOverlay = () => state().overlayStack[state().overlayStack.length - 1]?.id
  const simulation = () => state().powerMode

  let focusTarget: string | undefined
  createEffect(() => {
    const target = simulation() === "rest" ? "power-wake" : simulation() === "off-simulated" ? "power-relaunch" : simulation() === "on" ? "power-cancel" : undefined
    if (!target || target === focusTarget) return
    focusTarget = target
    actions.setFocus(target)
  })

  const complete = (mode: "rest" | "restarting" | "off-simulated") => {
    // The confirmation buttons themselves own focus, but a simulated power
    // transition must preserve the opener's focus for wake/relaunch restore.
    const opener = props.returnContext?.entry.focusId
    if (opener) actions.setFocus(opener)
    actions.dispatch({ type: "power/complete", mode })
  }

  let pendingClose: { mode: ReturnType<typeof simulation>; overlay: ReturnType<typeof topOverlay>; epoch: number } | undefined
  const close = () => {
    const mode = simulation()
    if (mode !== "on" && mode !== "rest") return
    const request = { mode, overlay: topOverlay(), epoch: state().transitionEpoch }
    if (pendingClose?.mode === request.mode && pendingClose.overlay === request.overlay && pendingClose.epoch === request.epoch) return
    pendingClose = request
    queueMicrotask(() => {
      if (pendingClose !== request) return
      pendingClose = undefined
      if (state().transitionEpoch !== request.epoch || simulation() !== request.mode || topOverlay() !== request.overlay) return
      if (request.mode === "on") actions.cancelPower()
      else actions.wakePower()
    })
  }

  return (
    <Dialog onClose={close}>
      <DialogOverlay backgroundColor={ps5Colors.scrim} onClick={() => { if (simulation() === "on") close() }} />
      <Box width={viewport.width()} height={viewport.height()} alignX="center" alignY="center">
      <Show when={simulation() === "rest"} fallback={
        <Show when={simulation() === "off-simulated"} fallback={
          <Show when={simulation() === "restarting"} fallback={
            <Ps5Panel width={scale(620)} padding={scale(34)} gap={scale(18)} direction="column" backgroundColor="#090c11f5" borderColor="#ffffff35" borderWidth={1} cornerRadius={scale(20)}>
              <Ps5Text color={ps5Colors.text} fontSize={scale(30)} fontWeight={700}>Alimentación</Ps5Text>
              <Ps5Text color={ps5Colors.mutedText} fontSize={scale(16)}>Esta acción solo cambia el estado local de la demo.</Ps5Text>
              <Ps5Button layer="overlay" id="power-cancel" width="100%" height={scale(52)} label="Cancelar" onPress={actions.cancelPower} screen={props} />
              <Ps5Button layer="overlay" id="power-rest" width="100%" height={scale(52)} label="Modo reposo" onPress={() => complete("rest")} screen={props} />
              <Ps5Button layer="overlay" id="power-restart" width="100%" height={scale(52)} label="Reiniciar demo" onPress={() => complete("restarting")} screen={props} />
              <Ps5Button layer="overlay" id="power-off" width="100%" height={scale(52)} label="Apagar demo" onPress={() => complete("off-simulated")} screen={props} />
            </Ps5Panel>
          }>
            <Ps5Panel width={scale(620)} padding={scale(40)} gap={scale(18)} direction="column" alignX="center" backgroundColor="#090c11f5" cornerRadius={scale(20)}>
              <Ps5Text color={ps5Colors.text} fontSize={scale(30)} fontWeight={700}>Reiniciando demo…</Ps5Text>
              <Ps5Text color={ps5Colors.mutedText} fontSize={scale(16)}>No se reinicia el proceso anfitrión.</Ps5Text>
              <Ps5Panel width="100%" height={scale(8)} padding={0} backgroundColor="#222831" borderWidth={0} cornerRadius={scale(4)}>
                <Box width="45%" height="100%" backgroundColor={ps5Colors.focus} cornerRadius={scale(4)} />
              </Ps5Panel>
            </Ps5Panel>
          </Show>
        }>
          <Ps5Panel width={scale(620)} padding={scale(40)} gap={scale(18)} direction="column" alignX="center" backgroundColor="#090c11f5" cornerRadius={scale(20)}>
            <Ps5Text color={ps5Colors.text} fontSize={scale(30)} fontWeight={700}>Demo apagada</Ps5Text>
            <Ps5Text color={ps5Colors.mutedText} fontSize={scale(16)}>El ordenador anfitrión sigue intacto.</Ps5Text>
            <Ps5Button layer="overlay" id="power-relaunch" width="100%" height={scale(52)} label="Relanzar demo" onPress={actions.relaunchDemo} screen={props} />
          </Ps5Panel>
        </Show>
      }>
        <Ps5Panel width={scale(620)} padding={scale(40)} gap={scale(18)} direction="column" alignX="center" backgroundColor="#090c11f5" cornerRadius={scale(20)}>
          <Ps5Text color={ps5Colors.text} fontSize={scale(30)} fontWeight={700}>Modo reposo simulado</Ps5Text>
          <Ps5Text color={ps5Colors.mutedText} fontSize={scale(16)}>La aplicación permanece abierta; no se toca el hardware.</Ps5Text>
          <Ps5Button layer="overlay" id="power-wake" width="100%" height={scale(52)} label="Despertar / reanudar" onPress={actions.wakePower} screen={props} />
          <Ps5Button layer="overlay" id="power-cancel-rest" width="100%" height={scale(52)} label="Volver a la demo" onPress={actions.wakePower} screen={props} />
        </Ps5Panel>
      </Show>
      <Show when={topOverlay() === "power-confirm"}>
        <Ps5Text color={ps5Colors.mutedText} fontSize={scale(11)} floating="parent" floatOffset={{ x: scale(28), y: scale(20) }}>Power overlay · simulación local</Ps5Text>
      </Show>
      </Box>
    </Dialog>
  )
}
