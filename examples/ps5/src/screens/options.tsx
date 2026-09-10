import {
  Box,
  For,
  Show,
  createEffect,
} from "vexart"

import type { ControlCardId, GameId, Ps5OverlayProps, ScreenId } from "../types"
import { Ps5Button, Ps5Panel, Ps5Text as Text, ps5Colors, ps5Scale, usePs5Viewport } from "../ui"

const canonicalOrder: ControlCardId[] = [
  "home", "switcher", "notifications", "game-base", "music",
  "sound", "microphone", "accessories", "profile", "power",
]

const labels: Record<ControlCardId, string> = {
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

function activeOverlay(props: Ps5OverlayProps) {
  return () => props.state().overlayStack.at(-1)
}

function closeAll(props: Ps5OverlayProps) {
  while (props.state().overlayStack.length > 0) props.actions.closeOverlay()
}

function go(props: Ps5OverlayProps, screen: ScreenId, gameId?: GameId) {
  props.actions.go(screen, gameId ? { gameId } : undefined)
}

function isControlOptions(props: Ps5OverlayProps) {
  const entry = activeOverlay(props)()
  return entry?.returnTo.parentOverlayId === "control-center"
    || entry?.returnTo.entry.focusId?.startsWith("control-") === true
}

function isSwitcherOptions(props: Ps5OverlayProps) {
  return activeOverlay(props)()?.returnTo.parentOverlayId === "switcher"
}

function detailFocus(props: Ps5OverlayProps) {
  return activeOverlay(props)()?.returnTo.entry.focusId
}

/**
 * Options is deliberately a content-only overlay. The host owns Dialog, Escape,
 * focus scope, and the F2 binding; this view only dispatches local actions.
 */
export function OptionsOverlay(props: Ps5OverlayProps) {
  const viewport = usePs5Viewport()
  const scale = (value: number) => ps5Scale(viewport, value)
  const top = activeOverlay(props)
  let entered = false

  const selectedGame = () => {
    const id = props.state().selectedGameId
    return id ? props.state().catalog.find((game) => game.id === id) : undefined
  }
  const controlIds = () => props.state().controlCenter.order
  const selectedControl = () => props.state().controlCenter.selectedCard
  const controlMode = () => isControlOptions(props)
  const switcherMode = () => isSwitcherOptions(props)
  const notificationDetailMode = () => activeOverlay(props)()?.returnTo.parentOverlayId === "notification-detail"
  const downloadDetailMode = () => activeOverlay(props)()?.returnTo.parentOverlayId === "download-detail"

  createEffect(() => {
    if (top()?.id !== "options") {
      entered = false
      return
    }
    const state = props.state()
    if (entered && state.focusedId) return
    entered = true
    if (controlMode()) props.actions.setFocus(`options-control-${selectedControl()}`)
    else if (switcherMode()) props.actions.setFocus("options-switcher-resume")
    else if (notificationDetailMode()) props.actions.setFocus("options-notification-read")
    else if (downloadDetailMode()) props.actions.setFocus("options-download-pause")
    else if (state.screen === "profile") props.actions.setFocus("options-profile-change-user")
    else if (state.screen === "game-base") props.actions.setFocus("options-gamebase-messages")
    else if (state.screen === "notifications") props.actions.setFocus("options-notifications-clear")
    else if (state.screen === "settings") props.actions.setFocus("options-settings-reset")
    else if (selectedGame()) props.actions.setFocus("options-add-to-list")
    else props.actions.setFocus("options-close")
  })

  const toggleControl = (id: ControlCardId) => {
    props.actions.dispatch({ type: "control/select", id })
    props.actions.setControlVisibility(id, !props.state().controlCenter.visibility[id])
    props.actions.setFocus(`options-control-${id}`)
  }

  const moveControl = (delta: -1 | 1) => {
    const order = [...props.state().controlCenter.order]
    const index = order.indexOf(selectedControl())
    const next = Math.max(0, Math.min(order.length - 1, index + delta))
    if (index < 0 || next === index) return
    const [id] = order.splice(index, 1)
    if (!id) return
    order.splice(next, 0, id)
    props.actions.setControlOrder(order)
    props.actions.setFocus(`options-control-${id}`)
  }

  const restoreControlOrder = () => {
    props.actions.setControlOrder([...canonicalOrder])
    props.actions.setFocus(`options-control-${selectedControl()}`)
  }

  const showAllControls = () => {
    canonicalOrder.forEach((id) => props.actions.setControlVisibility(id, true))
    props.actions.setFocus(`options-control-${selectedControl()}`)
  }

  const toggleFavorite = () => {
    const game = selectedGame()
    if (!game) return
    const existing = props.state().library.lists.find((list) => list.id === "ps5-favorites")
    const included = existing?.gameIds.includes(game.id) === true
    if (included) {
      const gameIds = existing!.gameIds.filter((id) => id !== game.id)
      if (gameIds.length === 0) props.actions.dispatch({ type: "library/list-remove", id: existing!.id })
      else props.actions.dispatch({ type: "library/list-upsert", list: { ...existing!, gameIds } })
      props.actions.setFocus("options-add-to-list")
      return
    }
    props.actions.dispatch({
      type: "library/list-upsert",
      list: {
        id: "ps5-favorites",
        name: existing?.name ?? "Favoritos",
        gameIds: [...(existing?.gameIds ?? []).filter((id) => id !== game.id), game.id],
      },
    })
    props.actions.setFocus("options-add-to-list")
  }

  const openHub = () => {
    const game = selectedGame()
    if (game) go(props, "game-hub", game.id)
  }

  const launch = () => {
    const game = selectedGame()
    if (game?.installed) {
      closeAll(props)
      props.actions.startGame(game.id)
    }
  }

  const leaveFirstParty = () => {
    const party = props.state().gameBase.parties[0]
    if (party) props.actions.dispatch({ type: "gamebase/party-leave", partyId: party.id })
  }

  const closeSwitcherGame = () => {
    if (!props.state().gameSession.gameId) return
    closeAll(props)
    props.actions.dispatch({ type: "game/close" })
  }

  const detailNotification = () => {
    const id = detailFocus(props)
    return id?.startsWith("notification-") ? props.state().notifications.find((item) => item.id === id.slice("notification-".length)) : undefined
  }
  const detailDownload = () => {
    const id = detailFocus(props)
    return id?.startsWith("download-") ? props.state().downloads.find((item) => item.id === id.slice("download-".length)) : undefined
  }
  const toggleDetailDownload = () => {
    const download = detailDownload()
    if (!download) return
    if (download.status === "downloading") props.actions.setDownload(download.id, "paused")
    else if (download.status === "paused" || download.status === "queued") props.actions.setDownload(download.id, "downloading")
    props.actions.closeOverlay()
  }

  const moveControlFocus = (index: number, delta: -1 | 1) => {
    const ids = controlIds()
    const next = Math.max(0, Math.min(ids.length - 1, index + delta))
    const id = ids[next]
    if (id) {
      props.actions.dispatch({ type: "control/select", id })
      props.actions.setFocus(`options-control-${id}`)
    }
  }

  return (
    <Show when={top()?.id === "options"}>
      <Box width={viewport.width()} height={viewport.height()} alignX="center" alignY="center">
        <Ps5Panel width={scale(760)} padding={scale(28)} gap={scale(14)} direction="column" backgroundColor={ps5Colors.panel} borderColor="#ffffff38" borderWidth={1} cornerRadius={scale(20)}>
          <Text color={ps5Colors.text} fontSize={scale(28)} fontWeight={700}>Opciones</Text>
          <Show when={controlMode()} fallback={
            <Box direction="column" gap={scale(12)}>
              <Show when={notificationDetailMode()}>
                <Text color={ps5Colors.mutedText} fontSize={scale(14)}>Acciones de la notificación.</Text>
                <Ps5Button id="options-notification-read" layer="overlay" width="100%" height={scale(48)} label={detailNotification()?.read ? "Marcar sin leer" : "Marcar leída"} disabled={!detailNotification()} onPress={() => { const item = detailNotification(); if (item) props.actions.setNotificationRead(item.id, !item.read); props.actions.closeOverlay() }} screen={props} />
                <Ps5Button id="options-notification-clear" layer="overlay" width="100%" height={scale(48)} label="Borrar notificación" disabled={!detailNotification()} onPress={() => {
                  const item = detailNotification()
                  if (!item) return
                  const previous = props.state().notifications
                  const index = Math.max(0, previous.findIndex((candidate) => candidate.id === item.id))
                  props.actions.dispatch({ type: "notification/clear", id: item.id })
                  const remaining = props.state().notifications
                  closeAll(props)
                  const next = remaining[index] ?? remaining[index - 1] ?? remaining[0]
                  props.actions.setFocus(next ? `notification-${next.id}` : "notifications-tab-notifications")
                }} screen={props} />
              </Show>
              <Show when={downloadDetailMode()}>
                <Text color={ps5Colors.mutedText} fontSize={scale(14)}>Acciones de la descarga.</Text>
                <Ps5Button id="options-download-pause" layer="overlay" width="100%" height={scale(48)} label={detailDownload()?.status === "downloading" ? "Pausar" : "Reanudar"} disabled={!detailDownload() || detailDownload()!.status === "complete" || detailDownload()!.status === "cancelled"} onPress={toggleDetailDownload} screen={props} />
                <Ps5Button id="options-download-cancel" layer="overlay" width="100%" height={scale(48)} label="Cancelar descarga" disabled={!detailDownload() || detailDownload()!.status === "complete" || detailDownload()!.status === "cancelled"} onPress={() => { const item = detailDownload(); if (item) props.actions.cancelDownload(item.id); closeAll(props) }} screen={props} />
              </Show>
              <Show when={switcherMode()}>
                <Text color={ps5Colors.mutedText} fontSize={scale(14)}>Acciones del juego seleccionado.</Text>
                <Ps5Button id="options-switcher-resume" layer="overlay" width="100%" height={scale(48)} label="Reanudar" disabled={!selectedGame()} onPress={() => { if (selectedGame()) props.actions.resumeRecentGame(selectedGame()!.id) }} screen={props} />
                <Ps5Button id="options-switcher-hub" layer="overlay" width="100%" height={scale(48)} label="Abrir hub" disabled={!selectedGame()} onPress={openHub} screen={props} />
                <Show when={props.state().gameSession.gameId}>
                  <Ps5Button id="options-switcher-close" layer="overlay" width="100%" height={scale(48)} label="Cerrar juego" onPress={closeSwitcherGame} screen={props} />
                </Show>
              </Show>
              <Show when={props.state().screen === "profile"}>
                <Text color={ps5Colors.mutedText} fontSize={scale(14)}>Acciones de perfil local.</Text>
                <Ps5Button id="options-profile-change-user" layer="overlay" width="100%" height={scale(48)} label="Cambiar usuario" onPress={() => go(props, "boot-users")} screen={props} />
                <Ps5Button id="options-profile-clear-trophy" layer="overlay" width="100%" height={scale(48)} label="Quitar selección de trofeo" onPress={() => props.actions.dispatch({ type: "profile/trophy" })} screen={props} />
              </Show>
              <Show when={props.state().screen === "game-base"}>
                <Text color={ps5Colors.mutedText} fontSize={scale(14)}>Acciones de Game Base local.</Text>
                <Ps5Button id="options-gamebase-messages" layer="overlay" width="100%" height={scale(48)} label="Abrir mensajes" onPress={() => { props.actions.dispatch({ type: "gamebase/tab", tab: "messages" }); props.actions.go("game-base") }} screen={props} />
                <Ps5Button id="options-gamebase-clear-messages" layer="overlay" width="100%" height={scale(48)} label="Limpiar mensajes locales" onPress={() => props.actions.dispatch({ type: "gamebase/messages-clear" })} screen={props} />
                <Show when={props.state().gameBase.parties.length > 0}>
                  <Ps5Button id="options-gamebase-leave-party" layer="overlay" width="100%" height={scale(48)} label="Abandonar primer grupo" onPress={leaveFirstParty} screen={props} />
                </Show>
              </Show>
              <Show when={props.state().screen === "notifications"}>
                <Text color={ps5Colors.mutedText} fontSize={scale(14)}>Acciones de notificaciones locales.</Text>
                <Ps5Button id="options-notifications-clear" layer="overlay" width="100%" height={scale(48)} label="Borrar todas las notificaciones" onPress={() => { props.actions.dispatch({ type: "notification/clear" }); props.actions.closeOverlay(); props.actions.setFocus("notifications-tab-notifications") }} screen={props} />
              </Show>
              <Show when={props.state().screen === "settings"}>
                <Text color={ps5Colors.mutedText} fontSize={scale(14)}>Acciones de ajustes locales.</Text>
                <Ps5Button id="options-settings-reset" layer="overlay" width="100%" height={scale(48)} label="Restaurar ajustes" onPress={() => props.actions.dispatch({ type: "settings/reset" })} screen={props} />
              </Show>
              <Show when={selectedGame() && props.state().screen !== "profile" && props.state().screen !== "game-base" && props.state().screen !== "notifications" && props.state().screen !== "settings" && !switcherMode() && !notificationDetailMode() && !downloadDetailMode()}>
                <Text color={ps5Colors.mutedText} fontSize={scale(14)}>Acciones locales para {selectedGame()!.title}.</Text>
                <Ps5Button id="options-add-to-list" layer="overlay" width="100%" height={scale(48)} label={props.state().library.lists.some((list) => list.id === "ps5-favorites" && list.gameIds.includes(selectedGame()!.id)) ? "Quitar de Favoritos" : "Añadir a lista Favoritos"} onPress={toggleFavorite} screen={props} />
                <Show when={selectedGame()!.installed}>
                  <Ps5Button id="options-launch" layer="overlay" width="100%" height={scale(48)} label="Lanzar juego" onPress={launch} screen={props} />
                </Show>
                <Ps5Button id="options-open-hub" layer="overlay" width="100%" height={scale(48)} label="Abrir centro del juego" onPress={openHub} screen={props} />
                <Show when={props.state().library.lists.some((list) => list.id === "ps5-favorites" && list.gameIds.includes(selectedGame()!.id))}>
                  <Text color={ps5Colors.success} fontSize={scale(13)}>Este juego ya está en Favoritos.</Text>
                </Show>
              </Show>
              <Show when={!selectedGame() && props.state().screen !== "profile" && props.state().screen !== "game-base" && props.state().screen !== "notifications" && props.state().screen !== "settings" && !switcherMode() && !notificationDetailMode() && !downloadDetailMode()}>
                <Text color={ps5Colors.mutedText} fontSize={scale(15)}>No hay un juego seleccionado para modificar.</Text>
              </Show>
              <Ps5Button id="options-close" layer="overlay" width="100%" height={scale(48)} label="Volver" onPress={props.actions.closeOverlay} screen={props} />
            </Box>
          }>
            <Text color={ps5Colors.mutedText} fontSize={scale(14)}>Personaliza el orden y la visibilidad del Centro de control.</Text>
            <Box direction="column" gap={scale(8)} scrollY viewportClip>
              <For each={controlIds()}>{(id, index) => (
                <Ps5Button
                  id={`options-control-${id}`}
                  layer="overlay"
                  width="100%"
                  height={scale(46)}
                  alignX="left"
                  label={`${labels[id]} · ${props.state().controlCenter.visibility[id] ? "visible" : "oculto"}`}
                  backgroundColor={props.state().controlCenter.selectedCard === id ? "#343b46" : undefined}
                  onPress={() => toggleControl(id)}
                  onKeyDown={(event) => {
                    if (event.key === "up") moveControlFocus(index(), -1)
                    if (event.key === "down") moveControlFocus(index(), 1)
                  }}
                  screen={props}
                />
              )}</For>
            </Box>
            <Box direction="row" gap={scale(10)}>
              <Ps5Button id="options-control-up" layer="overlay" width="50%" height={scale(46)} label="Subir seleccionado" onPress={() => moveControl(-1)} screen={props} />
              <Ps5Button id="options-control-down" layer="overlay" width="50%" height={scale(46)} label="Bajar seleccionado" onPress={() => moveControl(1)} screen={props} />
            </Box>
            <Box direction="row" gap={scale(10)}>
              <Ps5Button id="options-control-reset" layer="overlay" width="50%" height={scale(46)} label="Restaurar orden" onPress={restoreControlOrder} screen={props} />
              <Ps5Button id="options-control-show-all" layer="overlay" width="50%" height={scale(46)} label="Mostrar todos" onPress={showAllControls} screen={props} />
            </Box>
            <Ps5Button id="options-close" layer="overlay" width="100%" height={scale(48)} label="Volver" onPress={props.actions.closeOverlay} screen={props} />
          </Show>
        </Ps5Panel>
      </Box>
    </Show>
  )
}
