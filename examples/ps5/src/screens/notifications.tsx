import {
  Box,
  For,
  Show,
  createEffect,
  createSignal,
} from "vexart"

import type { Download, GameId, Notification, Ps5OverlayProps, Ps5ScreenProps, ScreenId } from "../types"
import { Ps5Button, Ps5Panel, Ps5Text as Text, ps5Colors, ps5Scale, usePs5Viewport } from "../ui"

type NotificationTab = "notifications" | "downloads"

function activeEntry(props: Ps5OverlayProps) {
  return () => props.state().overlayStack.at(-1)
}

function go(props: Ps5OverlayProps, screen: ScreenId, gameId?: GameId) {
  props.actions.go(screen, gameId ? { gameId } : undefined)
}

function gameTitle(props: Ps5ScreenProps, gameId: GameId) {
  return props.state().catalog.find((game) => game.id === gameId)?.title ?? gameId
}

function statusLabel(status: Download["status"]) {
  if (status === "downloading") return "Descargando"
  if (status === "queued") return "En cola"
  if (status === "paused") return "Pausada"
  if (status === "complete") return "Completada"
  if (status === "cancelled") return "Cancelada"
  return "Error"
}

function notificationId(entry: ReturnType<typeof activeEntry>) {
  return entry()?.returnTo.entry.focusId?.startsWith("notification-") ? entry()!.returnTo.entry.focusId!.slice("notification-".length) : undefined
}

function downloadId(entry: ReturnType<typeof activeEntry>) {
  return entry()?.returnTo.entry.focusId?.startsWith("download-") ? entry()!.returnTo.entry.focusId!.slice("download-".length) : undefined
}

function NotificationDetail(props: Ps5OverlayProps) {
  const viewport = usePs5Viewport()
  const scale = (value: number) => ps5Scale(viewport, value)
  const entry = activeEntry(props)
  const notification = () => props.state().notifications.find((item) => item.id === notificationId(entry))
  const clear = () => {
    const item = notification()
    if (!item) return
    const previous = props.state().notifications
    const index = Math.max(0, previous.findIndex((candidate) => candidate.id === item.id))
    props.actions.dispatch({ type: "notification/clear", id: item.id })
    const remaining = props.state().notifications
    props.actions.closeOverlay()
    const next = remaining[index] ?? remaining[index - 1] ?? remaining[0]
    props.actions.setFocus(next ? `notification-${next.id}` : "notifications-tab-notifications")
  }
  const openTarget = () => {
    const target = notification()?.target
    if (target) go(props, target.screen, target.gameId)
  }
  return (
    <Show when={entry()?.id === "notification-detail"}>
      <Box width={viewport.width()} height={viewport.height()} alignX="center" alignY="center">
        <Ps5Panel width={scale(700)} padding={scale(28)} gap={scale(14)} direction="column" backgroundColor={ps5Colors.panel} borderColor="#ffffff38" borderWidth={1} cornerRadius={scale(20)}>
          <Show when={notification()} fallback={<Text color={ps5Colors.mutedText} fontSize={scale(16)}>La notificación ya no existe.</Text>}>
            <Text color={ps5Colors.text} fontSize={scale(27)} fontWeight={700}>{notification()!.title}</Text>
            <Text color={ps5Colors.mutedText} fontSize={scale(15)}>{notification()!.body}</Text>
            <Text color={ps5Colors.mutedText} fontSize={scale(13)}>{notification()!.read ? "Leída" : "Sin leer"}</Text>
            <Box direction="row" gap={scale(10)}>
              <Ps5Button id="notification-detail-read" layer="overlay" width="50%" height={scale(46)} label={notification()!.read ? "Marcar sin leer" : "Marcar leída"} onPress={() => { props.actions.setNotificationRead(notification()!.id, !notification()!.read); props.actions.setFocus("notification-detail-read") }} screen={props} />
              <Ps5Button id="notification-detail-clear" layer="overlay" width="50%" height={scale(46)} label="Borrar" onPress={clear} screen={props} />
            </Box>
            <Show when={notification()!.target}>
              <Ps5Button id="notification-detail-target" layer="overlay" width="100%" height={scale(46)} label="Abrir destino" onPress={openTarget} screen={props} />
            </Show>
          </Show>
          <Ps5Button id="notification-detail-back" layer="overlay" width="100%" height={scale(46)} label="Volver" onPress={props.actions.closeOverlay} screen={props} />
        </Ps5Panel>
      </Box>
    </Show>
  )
}

function DownloadDetail(props: Ps5OverlayProps) {
  const viewport = usePs5Viewport()
  const scale = (value: number) => ps5Scale(viewport, value)
  const entry = activeEntry(props)
  const download = () => props.state().downloads.find((item) => item.id === downloadId(entry))
  const retry = () => {
    const item = download()
    if (!item) return
    props.actions.startDownload(item.gameId)
    props.actions.setDownload(item.id, "downloading")
    props.actions.setFocus("download-detail-pause")
  }
  const toggle = () => {
    const item = download()
    if (!item) return
    if (item.status === "downloading") props.actions.setDownload(item.id, "paused")
    else if (item.status === "paused" || item.status === "queued") props.actions.setDownload(item.id, "downloading")
    props.actions.setFocus("download-detail-pause")
  }
  const cancel = () => {
    const item = download()
    if (!item) return
    props.actions.cancelDownload(item.id)
    props.actions.setFocus("download-detail-cancel")
  }
  const openTarget = () => {
    const item = download()
    if (item) go(props, "game-hub", item.gameId)
  }
  return (
    <Show when={entry()?.id === "download-detail"}>
      <Box width={viewport.width()} height={viewport.height()} alignX="center" alignY="center">
        <Ps5Panel width={scale(700)} padding={scale(28)} gap={scale(14)} direction="column" backgroundColor={ps5Colors.panel} borderColor="#ffffff38" borderWidth={1} cornerRadius={scale(20)}>
          <Show when={download()} fallback={<Text color={ps5Colors.mutedText} fontSize={scale(16)}>La descarga ya no existe.</Text>}>
            <Text color={ps5Colors.text} fontSize={scale(27)} fontWeight={700}>Descarga</Text>
            <Text color={ps5Colors.text} fontSize={scale(17)}>{gameTitle(props, download()!.gameId)}</Text>
            <Text color={ps5Colors.mutedText} fontSize={scale(14)}>{statusLabel(download()!.status)} · {Math.round(download()!.progress)}%</Text>
            <Box width="100%" height={scale(9)} backgroundColor="#ffffff24" cornerRadius={scale(5)}>
              <Box width={`${Math.max(0, Math.min(100, download()!.progress))}%`} height="100%" backgroundColor={ps5Colors.focus} cornerRadius={scale(5)} />
            </Box>
            <Box direction="row" gap={scale(10)}>
              <Show when={download()!.status !== "complete" && download()!.status !== "cancelled"}>
                <Ps5Button id="download-detail-pause" layer="overlay" width="50%" height={scale(46)} label={download()!.status === "downloading" ? "Pausar" : "Reanudar"} onPress={toggle} screen={props} />
                <Ps5Button id="download-detail-cancel" layer="overlay" width="50%" height={scale(46)} label="Cancelar" onPress={cancel} screen={props} />
              </Show>
            </Box>
            <Show when={download()!.status === "cancelled" || download()!.status === "error"}>
              <Ps5Button id="download-detail-retry" layer="overlay" width="100%" height={scale(46)} label="Reintentar" onPress={retry} screen={props} />
            </Show>
            <Ps5Button id="download-detail-target" layer="overlay" width="100%" height={scale(46)} label="Abrir juego" onPress={openTarget} screen={props} />
          </Show>
          <Ps5Button id="download-detail-back" layer="overlay" width="100%" height={scale(46)} label="Volver" onPress={props.actions.closeOverlay} screen={props} />
        </Ps5Panel>
      </Box>
    </Show>
  )
}

/** Detail branches owned by the notifications owner in the overlay table. */
export function NotificationsOverlay(props: Ps5OverlayProps) {
  const id = () => props.state().overlayStack.at(-1)?.id
  return (
    <Show when={id() === "notification-detail" || id() === "download-detail"}>
      <Show when={id() === "notification-detail"} fallback={<DownloadDetail {...props} />}>
        <NotificationDetail {...props} />
      </Show>
    </Show>
  )
}

/** Notifications and local download queue screen. */
export function NotificationsScreen(props: Ps5ScreenProps) {
  const viewport = usePs5Viewport()
  const scale = (value: number) => ps5Scale(viewport, value)
  const state = props.state
  const actions = props.actions
  const [tab, setTab] = createSignal<NotificationTab>("notifications")
  let focusedEntry = false

  const notificationRows = () => state().notifications
  const downloadRows = () => state().downloads
  const firstNotification = () => notificationRows().find((entry) => !entry.read) ?? notificationRows()[0]
  const firstDownload = () => downloadRows().find((entry) => entry.status === "downloading") ?? downloadRows()[0]
  const rows = () => tab() === "notifications" ? notificationRows().map((entry) => `notification-${entry.id}`) : downloadRows().map((entry) => `download-${entry.id}`)

  createEffect(() => {
    const current = state()
    if (current.screen !== "notifications" || focusedEntry) return
    focusedEntry = true
    const initial = tab() === "notifications" ? firstNotification() : firstDownload()
    actions.setFocus(current.focusMemory.notifications ?? (initial ? `${tab() === "notifications" ? "notification" : "download"}-${initial.id}` : `notifications-tab-${tab()}`))
    props.onReady?.()
  })

  const move = (index: number, delta: -1 | 1) => {
    const ids = rows()
    const next = Math.max(0, Math.min(ids.length - 1, index + delta))
    if (ids[next]) actions.setFocus(ids[next])
  }

  const chooseTab = (next: NotificationTab) => {
    setTab(next)
    const item = next === "notifications" ? firstNotification() : firstDownload()
    actions.setFocus(item ? `${next === "notifications" ? "notification" : "download"}-${item.id}` : `notifications-tab-${next}`)
  }

  const openNotification = (item: Notification) => {
    actions.setFocus(`notification-${item.id}`)
    actions.openOverlay("notification-detail")
  }

  const openDownload = (item: Download) => {
    actions.setFocus(`download-${item.id}`)
    actions.openOverlay("download-detail")
  }

  return (
    <Box width={viewport.width()} height={viewport.height()} backgroundColor={ps5Colors.background} alignX="center" alignY="center" viewportClip>
      <Ps5Panel width={scale(860)} height={scale(760)} padding={scale(28)} gap={scale(16)} direction="column" backgroundColor={ps5Colors.panel} borderColor="#ffffff38" borderWidth={1} cornerRadius={scale(20)}>
        <Box direction="row" alignX="space-between" alignY="center">
          <Box direction="column" gap={scale(4)}>
            <Text color={ps5Colors.text} fontSize={scale(28)} fontWeight={700}>Notificaciones</Text>
            <Text color={ps5Colors.mutedText} fontSize={scale(14)}>Estado local del sistema y descargas</Text>
          </Box>
          <Text color={ps5Colors.mutedText} fontSize={scale(13)}>Red: {state().settings.network}</Text>
        </Box>
        <Box direction="row" gap={scale(10)}>
          <Ps5Button id="notifications-tab-notifications" width="50%" height={scale(46)} label={`Notificaciones (${notificationRows().length})`} backgroundColor={tab() === "notifications" ? "#3a424d" : undefined} onPress={() => chooseTab("notifications")} onKeyDown={(event) => { if (event.key === "right") chooseTab("downloads") }} screen={props} />
          <Ps5Button id="notifications-tab-downloads" width="50%" height={scale(46)} label={`Descargas (${downloadRows().length})`} backgroundColor={tab() === "downloads" ? "#3a424d" : undefined} onPress={() => chooseTab("downloads")} onKeyDown={(event) => { if (event.key === "left") chooseTab("notifications") }} screen={props} />
        </Box>
        <Show when={tab() === "notifications"} fallback={
          <Box direction="column" gap={scale(8)} scrollY viewportClip>
            <Show when={downloadRows().length > 0} fallback={<Text color={ps5Colors.mutedText} fontSize={scale(16)}>No hay descargas locales.</Text>}>
              <For each={downloadRows()}>{(download, index) => (
                <Ps5Button id={`download-${download.id}`} width="100%" height={scale(58)} alignX="left" label={`${gameTitle(props, download.gameId)} · ${statusLabel(download.status)} · ${Math.round(download.progress)}%`} onPress={() => openDownload(download)} onKeyDown={(event) => { if (event.key === "up") move(index(), -1); if (event.key === "down") move(index(), 1) }} screen={props} />
              )}</For>
            </Show>
          </Box>
        }>
          <Box direction="column" gap={scale(8)} scrollY viewportClip>
            <Show when={notificationRows().length > 0} fallback={<Text color={ps5Colors.mutedText} fontSize={scale(16)}>No hay notificaciones locales.</Text>}>
              <For each={notificationRows()}>{(notification, index) => (
                <Ps5Button id={`notification-${notification.id}`} width="100%" height={scale(68)} alignX="left" label={`${notification.read ? "" : "● "}${notification.title} · ${notification.body}`} onPress={() => openNotification(notification)} onKeyDown={(event) => { if (event.key === "up") move(index(), -1); if (event.key === "down") move(index(), 1) }} screen={props} />
              )}</For>
              <Ps5Button id="notifications-clear-all" width="100%" height={scale(46)} label="Borrar todas" onPress={() => { actions.dispatch({ type: "notification/clear" }); actions.setFocus("notifications-back") }} screen={props} />
            </Show>
          </Box>
        </Show>
        <Ps5Button id="notifications-back" width="100%" height={scale(46)} label="Volver" onPress={actions.back} screen={props} />
      </Ps5Panel>
    </Box>
  )
}
