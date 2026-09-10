import {
  Box,
  Dialog,
  DialogOverlay,
  Show,
  createEffect,
  createSignal,
  onCleanup,
  onInput,
  focusedId,
  setFocus as setNativeFocus,
  useAppTerminal,
  useTerminalDimensions,
} from "vexart"

import { createPs5Store } from "./store"
import type { OverlayId, Ps5ScreenProps, Ps5Store, ScreenId } from "./types"
import { BootUsersScreen } from "./screens/boot"
import { PowerOverlay } from "./screens/power"
import { ControlCenterOverlay } from "./screens/control-center"
import { SwitcherOverlay } from "./screens/switcher"
import { HomeScreen } from "./screens/home"
import { GameHubScreen } from "./screens/game-hub"
import { LaunchScreen } from "./screens/launch"
import { LibraryScreen } from "./screens/library"
import { NotificationsOverlay, NotificationsScreen } from "./screens/notifications"
import { ProfileScreen } from "./screens/profile"
import { StoreMediaScreen } from "./screens/store-media"
import { SettingsScreen } from "./screens/settings"
import { GameBaseScreen } from "./screens/game-base"
import { GalleryScreen } from "./screens/gallery"
import { OptionsOverlay } from "./screens/options"
import { createDefaultSeed as createCatalogSeed } from "./catalog"
import { Ps5BackProvider, Ps5Button, Ps5InputLayerProvider, Ps5Panel, Ps5SettingsProvider, Ps5Text, Ps5ViewportProvider, ps5Colors, ps5Scale, usePs5Viewport } from "./ui"

export type Ps5AppProps = {
  store?: Ps5Store
  width?: number
  height?: number
}

const screenLabels: Partial<Record<ScreenId, string>> = {
  home: "Inicio",
  "game-hub": "Centro del juego",
  launch: "Lanzamiento",
  library: "Biblioteca",
  "control-center": "Centro de control",
  switcher: "Selector de juegos",
  settings: "Ajustes",
  profile: "Perfil",
  notifications: "Notificaciones",
  "game-base": "Game Base",
  "store-media": "Store y multimedia",
  gallery: "Galería",
}

function UnknownScreen(props: Ps5ScreenProps) {
  const viewport = usePs5Viewport()
  const scale = (value: number) => ps5Scale(viewport, value)
  const label = () => screenLabels[props.state().screen] ?? "Esta área"
  const focusId = () => props.state().focusedId ?? "in-progress-back"
  return (
    <Box width={viewport.width()} height={viewport.height()} backgroundColor={ps5Colors.background} alignX="center" alignY="center">
      <Ps5Panel width={scale(640)} padding={scale(38)} gap={scale(16)} direction="column" alignX="center" backgroundColor="#10151cf0" borderColor="#ffffff32" cornerRadius={scale(20)}>
        <Ps5Text color={ps5Colors.text} fontSize={scale(30)} fontWeight={700}>{label()}</Ps5Text>
        <Ps5Text color={ps5Colors.mutedText} fontSize={scale(16)} alignX="center">No hay un renderer registrado para esta ruta.</Ps5Text>
        <Show when={focusId()} keyed>{(id) => <Ps5Button id={id} width="100%" height={scale(52)} label="Volver" onPress={props.actions.back} screen={props} />}</Show>
      </Ps5Panel>
    </Box>
  )
}

function OverlayRouteScreen(props: Ps5ScreenProps & { label: string; owner: string }) {
  const viewport = usePs5Viewport()
  const scale = (value: number) => ps5Scale(viewport, value)
  return (
    <Box width={viewport.width()} height={viewport.height()} backgroundColor={ps5Colors.background} alignX="center" alignY="center">
      <Ps5Panel width={scale(640)} padding={scale(38)} gap={scale(16)} direction="column" alignX="center" backgroundColor="#10151cf0" borderColor="#ffffff32" cornerRadius={scale(20)}>
        <Ps5Text color={ps5Colors.text} fontSize={scale(30)} fontWeight={700}>{props.label}</Ps5Text>
        <Ps5Text color={ps5Colors.mutedText} fontSize={scale(16)} alignX="center">{props.owner} se presenta como una capa sobre la pantalla actual.</Ps5Text>
        <Ps5Button id={`route-${props.state().screen}-back`} width="100%" height={scale(52)} label="Volver" onPress={props.actions.back} screen={props} />
      </Ps5Panel>
    </Box>
  )
}

function ScreenHost(props: { store: Ps5Store }) {
  const current = () => props.store.state()
  const screenProps = (): Ps5ScreenProps => ({ state: props.store.state, actions: props.store.actions })
  const [renderedScreen, setRenderedScreen] = createSignal<ScreenId>(current().screen)
  let screenUpdateQueued = false
  createEffect(() => {
    const screen = current().screen
    if (renderedScreen() === screen || screenUpdateQueued) return
    screenUpdateQueued = true
    queueMicrotask(() => {
      screenUpdateQueued = false
      const next = current().screen
      if (renderedScreen() !== next) {
        setRenderedScreen(next)
      }
    })
  })
  const [baseReady, setBaseReady] = createSignal(true)
  let readyScreen = renderedScreen()
  createEffect(() => {
    const screen = renderedScreen()
    if (screen === readyScreen) return
    readyScreen = screen
    setBaseReady(false)
    queueMicrotask(() => {
      if (renderedScreen() === screen) {
        setBaseReady(true)
      }
    })
  })
  const topOverlay = () => current().overlayStack[current().overlayStack.length - 1]
  const overlayReady = () => baseReady() && renderedScreen() === current().screen
  const needsPowerScreen = () => current().powerMode !== "on" || current().screen === "power"
  const controlOverlay = () => {
    const id = current().overlayStack.at(-1)?.id
    return id === "control-center" || id === "control-music" || id === "control-sound" || id === "control-microphone" || id === "control-accessories"
  }
  const powerConfirmation = () => topOverlay()?.id === "power-confirm"
  const notificationDetail = () => topOverlay()?.id === "notification-detail" || topOverlay()?.id === "download-detail"
  let pendingClose: { id: OverlayId; epoch: number } | undefined
  const scheduleClose = () => {
    const entry = topOverlay()
    if (!entry) return
    const request = { id: entry.id, epoch: current().transitionEpoch }
    if (pendingClose?.id === request.id && pendingClose.epoch === request.epoch) return
    pendingClose = request
    queueMicrotask(() => {
      if (pendingClose !== request) return
      pendingClose = undefined
      const latest = topOverlay()
      if (!latest || latest.id !== request.id || current().transitionEpoch !== request.epoch) return
      props.store.actions.closeOverlay()
    })
  }

  const BaseScreen = () => {
    return (
      <Show when={renderedScreen() === "boot-users"} fallback={
        <Show when={renderedScreen() === "home"} fallback={
          <Show when={renderedScreen() === "game-hub"} fallback={
            <Show when={renderedScreen() === "launch"} fallback={
              <Show when={renderedScreen() === "library"} fallback={
                <Show when={renderedScreen() === "notifications"} fallback={
                  <Show when={renderedScreen() === "profile"} fallback={
                    <Show when={renderedScreen() === "store-media"} fallback={
                      <Show when={renderedScreen() === "settings"} fallback={
                        <Show when={renderedScreen() === "game-base"} fallback={
                        <Show when={renderedScreen() === "gallery"} fallback={
                          <Show when={renderedScreen() === "control-center"} fallback={
                              <Show when={renderedScreen() === "switcher"} fallback={<UnknownScreen {...screenProps()} />}>
                                <OverlayRouteScreen {...screenProps()} label="Selector de juegos" owner="El Selector" />
                              </Show>
                            }>
                              <OverlayRouteScreen {...screenProps()} label="Centro de control" owner="El Centro de control" />
                            </Show>
                        }>
                          <GalleryScreen {...screenProps()} />
                        </Show>
                        }>
                          <GameBaseScreen {...screenProps()} />
                        </Show>
                      }>
                        <SettingsScreen {...screenProps()} />
                      </Show>
                    }>
                      <StoreMediaScreen {...screenProps()} />
                    </Show>
                  }>
                    <ProfileScreen {...screenProps()} />
                  </Show>
                }>
                  <NotificationsScreen {...screenProps()} />
                </Show>
              }>
                <LibraryScreen {...screenProps()} />
              </Show>
            }>
              <LaunchScreen {...screenProps()} />
            </Show>
          }>
            <GameHubScreen {...screenProps()} />
          </Show>
        }>
          <HomeScreen {...screenProps()} />
        </Show>
      }>
        <BootUsersScreen {...screenProps()} />
      </Show>
    )
  }

  createEffect(() => {
    const id = current().focusedId
    if (id) setNativeFocus(id)
  })

  return (
    <>
      <Show when={overlayReady() && powerConfirmation()}>
        <PowerOverlay {...screenProps()} returnContext={topOverlay()?.returnTo} />
      </Show>
      <Show when={overlayReady() && controlOverlay()}>
        <Dialog onClose={scheduleClose}>
          <Show when={topOverlay()?.id !== "switcher"}>
            {/* Control Center is a bottom shelf, not a full modal blackout. Keep
                the hit target while leaving the full-bleed hero un-dimmed. */}
            <DialogOverlay backgroundColor="#00000000" onClick={scheduleClose} />
          </Show>
          <ControlCenterOverlay {...screenProps()} returnContext={topOverlay()?.returnTo} />
        </Dialog>
      </Show>
      <Show when={overlayReady() && topOverlay()?.id === "switcher"}>
        <Dialog onClose={scheduleClose}>
          <DialogOverlay backgroundColor={ps5Colors.scrim} onClick={scheduleClose} />
          <SwitcherOverlay {...screenProps()} returnContext={topOverlay()?.returnTo} />
        </Dialog>
      </Show>
      <Show when={overlayReady() && topOverlay()?.id === "options"}>
        <Dialog onClose={scheduleClose}>
          <DialogOverlay backgroundColor={ps5Colors.scrim} onClick={scheduleClose} />
          <OptionsOverlay {...screenProps()} returnContext={topOverlay()?.returnTo} />
        </Dialog>
      </Show>
      <Show when={overlayReady() && notificationDetail()}>
        <Dialog onClose={scheduleClose}>
          <DialogOverlay backgroundColor={ps5Colors.scrim} onClick={scheduleClose} />
          <NotificationsOverlay {...screenProps()} returnContext={topOverlay()?.returnTo} />
        </Dialog>
      </Show>
      {/* Keep overlay branches before the base route in the reactive tree.
          When a Control Center action navigates to a screen, Solid disposes
          the old Dialog scope before registering the new screen's controls;
          otherwise those controls can be orphaned in the stale scope. */}
      <Show when={needsPowerScreen()} fallback={
        <BaseScreen />
      }>
        <PowerOverlay {...screenProps()} returnContext={topOverlay()?.returnTo} />
      </Show>
    </>
  )
}

function Timers(props: { store: Ps5Store }) {
  const timers = new Map<string, { timer: ReturnType<typeof setTimeout>; epoch: number }>()
  const clear = (key: string) => {
    const entry = timers.get(key)
    if (entry === undefined) return
    clearTimeout(entry.timer)
    timers.delete(key)
  }
  const schedule = (key: string, delay: number, epoch: number, run: () => void) => {
    const existing = timers.get(key)
    if (existing?.epoch === epoch) return
    if (existing) clear(key)
    timers.set(key, { epoch, timer: setTimeout(() => {
      timers.delete(key)
      if (props.store.state().transitionEpoch !== epoch) return
      run()
    }, delay) })
  }

  createEffect(() => {
    const state = props.store.state()
    const epoch = state.transitionEpoch

    if (state.boot.status === "loading") {
      schedule("boot", 480, epoch, () => props.store.actions.dispatch({ type: "boot/finish" }))
    } else clear("boot")

    if (state.powerMode === "restarting") {
      schedule("power-restart", 700, epoch, () => props.store.actions.dispatch({ type: "power/complete", mode: "restarting" }))
    } else clear("power-restart")

    for (const download of state.downloads) {
      const key = `download:${download.id}`
      if (download.status !== "downloading") {
        clear(key)
        continue
      }
      schedule(key, 240, epoch, () => {
        const progress = Math.min(100, download.progress + 8)
        if (progress >= 100) props.store.actions.completeDownload(download.id)
        else props.store.actions.dispatch({ type: "download/progress", id: download.id, progress })
      })
    }

    const session = state.gameSession
    if (session.phase === "launching" || session.phase === "loading") {
      schedule("game-launch", 300, epoch, () => {
        const progress = Math.min(100, session.progress + 20)
        props.store.actions.dispatch({ type: "game/advance", phase: progress >= 100 ? "title" : "loading", progress })
      })
    } else clear("game-launch")
  })

  onCleanup(() => {
    for (const entry of timers.values()) clearTimeout(entry.timer)
    timers.clear()
  })
  return null
}

function Ps5BrightnessLayer(props: { store: Ps5Store; width: () => number; height: () => number }) {
  // The seed's normal brightness is 80. Only values below that baseline should
  // darken the scene; otherwise a fresh Home render is unintentionally dimmed.
  const opacity = () => Math.max(0, Math.min(1, (80 - props.store.state().settings.brightness) / 100))
  return (
    <Show when={opacity() > 0}>
      {/* This overlay has no focus or pointer handler, so hit-testing passes
          through to the active screen while brightness remains a real visual
          response rather than a fake viewport scale. */}
      <Box width={props.width()} height={props.height()} floating="parent" zIndex={999} backgroundColor="#000000" opacity={opacity()} />
    </Show>
  )
}

export function Ps5App(props: Ps5AppProps = {}) {
  const ownStore = props.store ? undefined : createPs5Store(createCatalogSeed())
  const store = props.store ?? ownStore!

  const explicitSize = props.width !== undefined && props.height !== undefined
  const dimensions = explicitSize ? undefined : useTerminalDimensions(useAppTerminal())
  const width = explicitSize ? () => props.width! : () => Math.max(1, dimensions!.width())
  const height = explicitSize ? () => props.height! : () => Math.max(1, dimensions!.height())
  let backHandler: (() => boolean) | undefined
  let pendingBack: { screen: ScreenId; epoch: number } | undefined
  const registerBack = (handler: () => boolean) => {
    backHandler = handler
    return () => {
      if (backHandler === handler) backHandler = undefined
    }
  }
  const scheduleBack = () => {
    const state = store.state()
    const request = { screen: state.screen, epoch: state.transitionEpoch }
    if (pendingBack?.screen === request.screen && pendingBack.epoch === request.epoch) return
    pendingBack = request
    queueMicrotask(() => {
      if (pendingBack !== request) return
      pendingBack = undefined
      const latest = store.state()
      if (latest.overlayStack.length > 0 || latest.screen !== request.screen || latest.transitionEpoch !== request.epoch) return
      store.actions.back()
    })
  }

  const stopInput = onInput((event) => {
    if (event.type !== "key") return
    const state = store.state()
    if (event.key === "tab") {
      // Focus navigation is dispatched by the engine subscriber after this
      // host subscriber. Mirror the resulting native id back to the shared
      // store in a microtask, so overlay return contexts remain exact.
      queueMicrotask(() => {
        const id = focusedId()
        if (id && id !== store.state().focusedId) store.actions.setFocus(id)
      })
      return
    }
    if (event.key === "f1") {
      if (!state.boot.userSelected || state.screen === "boot-users" || state.powerMode !== "on") return
      const top = state.overlayStack.at(-1)?.id
      if (top === "control-center") store.actions.closeOverlay()
      else if (top === "control-music" || top === "control-sound" || top === "control-microphone" || top === "control-accessories") {
        // Branches are entered from Control Center. F1 is the host-level
        // toggle, so close the branch and its parent without touching any
        // unrelated overlay that may have been opened by a screen.
        store.actions.closeOverlay()
        if (store.state().overlayStack.at(-1)?.id === "control-center") store.actions.closeOverlay()
      } else if (top === "switcher") {
        // Switcher is a child route with its own documented F1 return to the
        // still-mounted Control Center; a second F1 closes the center.
        store.actions.closeOverlay()
      } else if (state.overlayStack.length === 0) store.actions.openOverlay("control-center")
      return
    }
    if (event.key === "f2") {
      if (!state.boot.userSelected || state.screen === "boot-users" || state.powerMode !== "on" || state.overlayStack.at(-1)?.id === "power-confirm") return
      if (state.overlayStack.at(-1)?.id !== "options") store.actions.openOverlay("options")
      return
    }
    if (event.key !== "escape") return
    // The root owns Escape exactly once. Screen controls do not register it.
    // Dialog-backed overlays own Escape; do not also pop them in this dispatch.
    if (state.overlayStack.length > 0) return
    if (backHandler?.()) return
    if (state.screen === "launch" && (state.gameSession.phase === "launching" || state.gameSession.phase === "loading")) {
      store.actions.cancelGameLaunch()
      return
    }
    if (state.powerMode === "on") scheduleBack()
  })
  onCleanup(stopInput)

  return (
    <Ps5ViewportProvider width={width} height={height}>
      <Ps5BackProvider register={registerBack}>
        <Ps5SettingsProvider settings={() => store.state().settings}>
          <Ps5InputLayerProvider activeLayer={() => store.state().overlayStack.length > 0 || store.state().powerMode !== "on" ? "overlay" : "base"}>
            <Box width={width()} height={height()} backgroundColor={ps5Colors.background}>
              <Timers store={store} />
              <ScreenHost store={store} />
              <Ps5BrightnessLayer store={store} width={width} height={height} />
            </Box>
          </Ps5InputLayerProvider>
        </Ps5SettingsProvider>
      </Ps5BackProvider>
    </Ps5ViewportProvider>
  )
}
