import {
  Box,
  For,
  Show,
  createEffect,
  createSignal,
} from "vexart"

import type { Ps5ScreenProps } from "../types"
import { Ps5Avatar, Ps5Button, Ps5Panel, Ps5Text, ps5Colors, ps5Scale, usePs5Back, usePs5Viewport } from "../ui"

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase()
}

export function BootUsersScreen(props: Ps5ScreenProps) {
  const viewport = usePs5Viewport()
  const scale = () => viewport.scale()
  const state = props.state
  const actions = props.actions
  const [optionsOpen, setOptionsOpen] = createSignal(false)
  const [optionsUserId, setOptionsUserId] = createSignal<string>()

  let focusedEntry = false
  createEffect(() => {
    const current = state()
    if (current.boot.status !== "ready" || focusedEntry) return
    focusedEntry = true
    actions.setFocus(current.focusMemory["boot-users"] ?? `boot-user-${current.users[0]?.id ?? "continue"}`)
    props.onReady?.()
  })

  usePs5Back(() => {
    if (!optionsOpen()) return false
    setOptionsOpen(false)
    actions.setFocus(`boot-user-${optionsUserId() ?? state().users[0]?.id ?? "continue"}`)
    return true
  })

  const chooseUser = (userId: string) => {
    actions.dispatch({ type: "user/select", userId })
  }

  const moveUser = (index: number, delta: -1 | 1) => {
    const next = Math.max(0, Math.min(state().users.length - 1, index + delta))
    const user = state().users[next]
    if (user) actions.setFocus(`boot-user-${user.id}`)
  }

  const openOptions = () => {
    const focused = state().focusedId
    const id = focused?.startsWith("boot-user-") ? focused.slice("boot-user-".length) : state().users[0]?.id
    setOptionsUserId(id)
    setOptionsOpen(true)
    actions.setFocus("boot-user-options-select")
  }

  return (
    <Box width={viewport.width()} height={viewport.height()} backgroundColor={ps5Colors.background} alignX="center" alignY="center" direction="column">
      <Show when={state().boot.status !== "ready"} fallback={
        <Box width={viewport.width()} height={viewport.height()} alignX="center" alignY="center" direction="column" gap={ps5Scale(viewport, 28)}>
          <Ps5Text color={ps5Colors.text} fontSize={ps5Scale(viewport, 52)} fontWeight={700}>PS5</Ps5Text>
          <Ps5Text color={ps5Colors.mutedText} fontSize={ps5Scale(viewport, 20)}>Selecciona un usuario</Ps5Text>
          <Show when={!optionsOpen()} fallback={
            <Ps5Panel width={ps5Scale(viewport, 520)} padding={ps5Scale(viewport, 24)} gap={ps5Scale(viewport, 14)} direction="column" backgroundColor="#10151cf5" borderColor="#ffffff38" cornerRadius={ps5Scale(viewport, 18)}>
              <Ps5Text color={ps5Colors.text} fontSize={ps5Scale(viewport, 24)} fontWeight={700}>Opciones de usuario</Ps5Text>
              <Ps5Text color={ps5Colors.mutedText} fontSize={ps5Scale(viewport, 15)}>Revisa la sesión local antes de continuar.</Ps5Text>
              <Ps5Button id="boot-user-options-select" width="100%" height={ps5Scale(viewport, 48)} label={`Continuar como ${state().users.find((user) => user.id === optionsUserId())?.name ?? "Invitado"}`} onPress={() => optionsUserId() && chooseUser(optionsUserId()!)} screen={props} />
              <Ps5Button id="boot-user-options-close" width="100%" height={ps5Scale(viewport, 48)} label="Volver a usuarios" onPress={() => { setOptionsOpen(false); actions.setFocus(`boot-user-${optionsUserId() ?? state().users[0]?.id ?? "continue"}`) }} screen={props} />
            </Ps5Panel>
          }>
            <Box direction="row" gap={ps5Scale(viewport, 26)} alignY="center" padding={ps5Scale(viewport, 28)}>
              <For each={state().users}>{(user, index) => (
                <Ps5Button
                  id={`boot-user-${user.id}`}
                  width={ps5Scale(viewport, 176)}
                  height={ps5Scale(viewport, 192)}
                  padding={ps5Scale(viewport, 14)}
                  backgroundColor="#12171d"
                  borderColor={user.accent}
                  cornerRadius={ps5Scale(viewport, 18)}
                  onPress={() => chooseUser(user.id)}
                  screen={props}
                  onKeyDown={(event) => {
                    if (event.key === "left") moveUser(index(), -1)
                    if (event.key === "right") moveUser(index(), 1)
                    if (event.key === "f2") openOptions()
                  }}
                >
                  <Box direction="column" alignX="center" alignY="center" gap={ps5Scale(viewport, 12)}>
                    <Ps5Avatar src={user.avatar} name={initials(user.name)} accent={user.accent} size={ps5Scale(viewport, 102)} />
                    <Ps5Text color={ps5Colors.text} fontSize={ps5Scale(viewport, 18)}>{user.name}</Ps5Text>
                    <Ps5Text color={ps5Colors.mutedText} fontSize={ps5Scale(viewport, 13)}>{user.handle}</Ps5Text>
                  </Box>
                </Ps5Button>
              )}</For>
            </Box>
          </Show>
          <Ps5Text color={ps5Colors.mutedText} fontSize={ps5Scale(viewport, 14)}>Enter / Space para continuar · Escape para volver</Ps5Text>
        </Box>
      }>
        <Box width={viewport.width()} height={viewport.height()} alignX="center" alignY="center" direction="column" gap={ps5Scale(viewport, 22)}>
          <Ps5Text color={ps5Colors.text} fontSize={ps5Scale(viewport, 64)} fontWeight={700}>PS5</Ps5Text>
          <Ps5Text color={ps5Colors.mutedText} fontSize={ps5Scale(viewport, 19)}>Iniciando experiencia local…</Ps5Text>
          <Ps5Panel width={ps5Scale(viewport, 360)} height={ps5Scale(viewport, 8)} backgroundColor="#1c222a" borderWidth={0} cornerRadius={ps5Scale(viewport, 4)}>
            <Box width="60%" height="100%" backgroundColor={ps5Colors.focus} cornerRadius={ps5Scale(viewport, 4)} />
          </Ps5Panel>
        </Box>
      </Show>
    </Box>
  )
}
