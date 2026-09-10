import { existsSync } from "node:fs"
import {
  Box,
  For,
  Show,
  createScrollHandle,
  createEffect,
  createSignal,
} from "vexart"

import type { GameCatalogEntry, GameId, Ps5ScreenProps } from "../types"
import { Ps5Button, Ps5Text, ps5Colors, ps5Scale, usePs5Back, usePs5Viewport } from "../ui"

type GalleryFilter = "all" | "current"
type MediaKind = "cover" | "hero" | "titleScreen"
type GalleryItem = {
  id: string
  gameId: GameId
  kind: MediaKind
  title: string
  path: string
  entry: GameCatalogEntry
}

function keyIs(event: { key: string }, ...keys: string[]) {
  return keys.includes(event.key)
}

function markerId(focusId?: string) {
  if (!focusId?.startsWith("gallery-viewer-")) return undefined
  return focusId.slice("gallery-viewer-".length)
}

function sourceMarkerId(focusId?: string) {
  if (!focusId?.startsWith("gallery-thumb-")) return undefined
  return focusId.slice("gallery-thumb-".length)
}

function imageAvailable(path: string) {
  return !!path && existsSync(path)
}

function MissingArtwork(props: { item: GalleryItem; width: number; height: number }) {
  return (
    <Box width={props.width} height={props.height} backgroundColor={props.item.entry.accent} alignX="center" alignY="center" padding={scaleFallback(props.width)}>
      <Ps5Text color="#ffffffdd" fontSize={13} alignX="center">Arte no disponible · {props.item.gameId}</Ps5Text>
    </Box>
  )
}

function scaleFallback(width: number) {
  return Math.max(8, Math.round(width * 0.04))
}

function Artwork(props: { item: GalleryItem; width: number; height: number; fit?: "cover" | "contain" }) {
  return (
    <Show when={imageAvailable(props.item.path)} fallback={<MissingArtwork item={props.item} width={props.width} height={props.height} />}>
      <img src={props.item.path} width={props.width} height={props.height} objectFit={props.fit ?? "cover"} />
    </Show>
  )
}

export function GalleryScreen(props: Ps5ScreenProps) {
  const viewport = usePs5Viewport()
  const scale = (value: number) => ps5Scale(viewport, value)
  const state = props.state
  const actions = props.actions
  const [filter, setFilter] = createSignal<GalleryFilter>("all")
  const [viewerIndex, setViewerIndex] = createSignal(0)
  const scroll = createScrollHandle("ps5-gallery-results")
  let entered = false
  let previousViewerId: string | undefined
  let previousRouteViewerId: string | undefined

  usePs5Back(() => {
    if (!viewer()) return false
    actions.back()
    return true
  })

  const currentGame = () => {
    const entry = state().navigation.at(-1)
    const gameId = entry?.gameId ?? state().selectedGameId
    return gameId ? state().catalog.find((item) => item.id === gameId) : undefined
  }
  const collection = () => {
    const catalog = filter() === "current" ? (currentGame() ? [currentGame()!] : []) : state().catalog
    return catalog.flatMap((entry) => [
      { id: `${entry.id}:cover`, gameId: entry.id, kind: "cover" as const, title: `${entry.title} · portada`, path: entry.cover, entry },
      { id: `${entry.id}:hero`, gameId: entry.id, kind: "hero" as const, title: `${entry.title} · hero`, path: entry.hero, entry },
      { id: `${entry.id}:titleScreen`, gameId: entry.id, kind: "titleScreen" as const, title: `${entry.title} · pantalla de título`, path: entry.titleScreen, entry },
    ])
  }
  const routeViewerId = () => markerId(state().navigation.at(-1)?.focusId)
  const activeViewerId = () => state().focusedId === "gallery-viewer-canvas"
    ? collection()[viewerIndex()]?.id ?? routeViewerId()
    : markerId(state().focusedId) ?? routeViewerId()
  const routeThumbId = () => sourceMarkerId(state().navigation.at(-1)?.focusId)
  const viewer = () => {
    const id = activeViewerId()
    if (!id) return undefined
    const list = collection()
    const index = list.findIndex((item) => item.id === id)
    return list[index >= 0 ? index : viewerIndex()] ?? list[0]
  }
  const columns = () => Math.max(3, Math.min(6, Math.floor((viewport.width() - scale(120) + scale(16)) / (scale(270) + scale(16)))))
  const cardHeight = () => scale(278)
  const artworkHeight = () => scale(154)
  const rows = () => {
    const list = collection()
    const result: GalleryItem[][] = []
    for (let index = 0; index < list.length; index += columns()) result.push(list.slice(index, index + columns()))
    return result
  }

  createEffect(() => {
    const focus = state().focusedId
    if (!focus?.startsWith("gallery-thumb-")) return
    const id = sourceMarkerId(focus)
    const index = id ? collection().findIndex((entry) => entry.id === id) : -1
    if (index < 0) return
    const row = Math.floor(index / columns())
    scroll.scrollIntoView(row * (cardHeight() + scale(16)), cardHeight())
  })

  createEffect(() => {
    const current = state()
    if (current.screen !== "gallery" || entered) return
    entered = true
    const marker = current.navigation.at(-1)?.focusId
    const source = routeThumbId()
    if (routeViewerId()) {
      const index = collection().findIndex((item) => item.id === routeViewerId())
      setViewerIndex(Math.max(0, index))
      actions.setFocus("gallery-viewer-canvas")
    } else {
      const gameId = current.navigation.at(-1)?.gameId ?? current.selectedGameId
      const origin = source ?? (gameId ? `${gameId}:cover` : undefined)
      actions.setFocus(origin ? `gallery-thumb-${origin}` : current.focusMemory.gallery ?? marker ?? "gallery-tab-all")
    }
    props.onReady?.()
  })

  createEffect(() => {
    const current = state()
    const id = routeViewerId()
    if (current.screen === "gallery" && id && id !== previousRouteViewerId) {
      const index = collection().findIndex((item) => item.id === id)
      setViewerIndex(Math.max(0, index))
      actions.setFocus("gallery-viewer-canvas")
    }
    previousRouteViewerId = id
  })

  createEffect(() => {
    const current = state()
    const id = viewer()?.id
    if (!id && previousViewerId && current.screen === "gallery" && !current.focusedId) actions.setFocus(`gallery-thumb-${previousViewerId}`)
    previousViewerId = id
  })

  const openViewer = (item: GalleryItem) => {
    const index = collection().findIndex((entry) => entry.id === item.id)
    setViewerIndex(Math.max(0, index))
    actions.go("gallery", { gameId: item.gameId, focusId: `gallery-viewer-${item.id}` })
  }
  const selectFilter = (next: GalleryFilter) => {
    setFilter(next)
    const first = collection()[0]
    actions.setFocus(first ? `gallery-thumb-${first.id}` : `gallery-tab-${next}`)
  }
  const tabKeyDown = (current: GalleryFilter) => (event: { key: string }) => {
    if (keyIs(event, "left", "ArrowLeft")) actions.setFocus("gallery-tab-all")
    if (keyIs(event, "right", "ArrowRight")) actions.setFocus("gallery-tab-current")
    if (keyIs(event, "down", "ArrowDown")) actions.setFocus(`gallery-thumb-${collection()[0]?.id ?? ""}`)
  }
  const moveThumbnail = (item: GalleryItem) => (event: { key: string }) => {
    const list = collection()
    const index = list.findIndex((entry) => entry.id === item.id)
    if (index < 0) return
    if (keyIs(event, "left", "ArrowLeft")) actions.setFocus(`gallery-thumb-${list[Math.max(0, index - 1)]?.id ?? item.id}`)
    if (keyIs(event, "right", "ArrowRight")) actions.setFocus(`gallery-thumb-${list[Math.min(list.length - 1, index + 1)]?.id ?? item.id}`)
    if (keyIs(event, "up", "ArrowUp")) actions.setFocus(`gallery-thumb-${list[Math.max(0, index - columns())]?.id ?? item.id}`)
    if (keyIs(event, "down", "ArrowDown")) actions.setFocus(`gallery-thumb-${list[Math.min(list.length - 1, index + columns())]?.id ?? item.id}`)
  }
  const moveViewer = (delta: -1 | 1) => {
    const list = collection()
    if (list.length === 0) return
    const next = (viewerIndex() + delta + list.length) % list.length
    setViewerIndex(next)
    actions.setFocus("gallery-viewer-canvas")
  }

  const renderThumbnail = (item: GalleryItem, index: number) => (
    <Ps5Button
      id={`gallery-thumb-${item.id}`}
      width={scale(254)}
      height={cardHeight()}
      padding={0}
      backgroundColor="#0c1118e8"
      borderColor="#ffffff38"
      cornerRadius={scale(14)}
      onPress={() => openViewer(item)}
      onKeyDown={moveThumbnail(item)}
      screen={props}
    >
      <Box width="100%" height="100%" direction="column">
        <Artwork item={item} width={scale(254)} height={artworkHeight()} />
        <Box width="100%" height={cardHeight() - artworkHeight()} padding={scale(9)} direction="column" gap={scale(2)}>
          <Ps5Text color={ps5Colors.text} fontSize={scale(13)} fontWeight={700}>{item.entry.title}</Ps5Text>
          <Ps5Text color={ps5Colors.mutedText} fontSize={scale(11)}>{item.kind === "titleScreen" ? "Pantalla de título" : item.kind === "hero" ? "Imagen hero" : "Portada"}</Ps5Text>
        </Box>
      </Box>
    </Ps5Button>
  )

  const renderViewer = (item: GalleryItem) => (
    <Box width={viewport.width()} height={viewport.height()} backgroundColor="#05070beF" direction="column">
      <Box width="100%" height={scale(76)} padding={scale(20)} direction="row" alignY="center" gap={scale(16)} backgroundColor="#0b0f16f5">
        <Ps5Button id="gallery-viewer-back" width={scale(46)} height={scale(40)} backgroundColor="#00000000" borderWidth={0} label="‹" onPress={actions.back} screen={props} />
        <Ps5Text color={ps5Colors.text} fontSize={scale(21)} fontWeight={700}>{item.entry.title}</Ps5Text>
        <Ps5Text color={ps5Colors.mutedText} fontSize={scale(14)}>{item.title}</Ps5Text>
        <Box flexGrow={1} />
        <Ps5Text color={ps5Colors.mutedText} fontSize={scale(14)}>{viewerIndex() + 1} / {collection().length}</Ps5Text>
      </Box>
      <Box width="100%" flexGrow={1} alignX="center" alignY="center" padding={scale(44)}>
        <Ps5Button id="gallery-viewer-canvas" width={Math.min(scale(1410), viewport.width() - scale(120))} height={Math.min(scale(740), viewport.height() - scale(230))} padding={0} backgroundColor={item.entry.accent} borderColor="#ffffff24" cornerRadius={scale(12)} onPress={() => undefined} onKeyDown={(event) => {
          if (keyIs(event, "left", "ArrowLeft")) moveViewer(-1)
          if (keyIs(event, "right", "ArrowRight")) moveViewer(1)
        }} screen={props}>
          <Artwork item={item} width={Math.min(scale(1410), viewport.width() - scale(120))} height={Math.min(scale(740), viewport.height() - scale(230))} fit="contain" />
        </Ps5Button>
      </Box>
      <Box width="100%" height={scale(80)} padding={scale(14)} direction="row" alignX="center" alignY="center" gap={scale(12)} backgroundColor="#0b0f16f5">
        <Ps5Button id="gallery-viewer-previous" width={scale(164)} height={scale(46)} label="Anterior" onPress={() => moveViewer(-1)} screen={props} />
        <Ps5Button id="gallery-viewer-next" width={scale(164)} height={scale(46)} label="Siguiente" onPress={() => moveViewer(1)} screen={props} />
        <Ps5Text color={ps5Colors.mutedText} fontSize={scale(12)}>←/→ recorrer · Escape cerrar viewer · F1 Centro de control</Ps5Text>
      </Box>
    </Box>
  )

  return (
    <Box width={viewport.width()} height={viewport.height()} backgroundColor={ps5Colors.background} viewportClip>
      <Show when={viewer()} fallback={
        <Box width="100%" height="100%" direction="column">
          <Box width="100%" height={scale(112)} padding={scale(24)} direction="row" alignY="center" gap={scale(14)} backgroundColor="#0b0e14f4">
            <Ps5Button id="gallery-tab-all" width={scale(124)} height={scale(44)} backgroundColor="#00000000" borderWidth={0} onPress={() => selectFilter("all")} onKeyDown={tabKeyDown("all")} screen={props}>
              <Ps5Text color={filter() === "all" ? ps5Colors.text : ps5Colors.mutedText} fontSize={scale(22)} fontWeight={filter() === "all" ? 700 : 400}>Todos</Ps5Text>
            </Ps5Button>
            <Ps5Button id="gallery-tab-current" width={scale(220)} height={scale(44)} backgroundColor="#00000000" borderWidth={0} onPress={() => selectFilter("current")} onKeyDown={tabKeyDown("current")} screen={props}>
              <Ps5Text color={filter() === "current" ? ps5Colors.text : ps5Colors.mutedText} fontSize={scale(22)} fontWeight={filter() === "current" ? 700 : 400}>{currentGame() ? `Juego actual · ${currentGame()!.title}` : "Juego actual"}</Ps5Text>
            </Ps5Button>
            <Box flexGrow={1} />
            <Ps5Text color={ps5Colors.text} fontSize={scale(25)} fontWeight={700}>Galería</Ps5Text>
            <Ps5Text color={ps5Colors.mutedText} fontSize={scale(13)}>Contenido local · sin capturas ni vídeo</Ps5Text>
          </Box>
          <Box width="100%" flexGrow={1} padding={scale(24)} scrollY viewportClip>
            <Show when={collection().length > 0} fallback={
              <Box width="100%" height={scale(360)} alignX="center" alignY="center" direction="column" gap={scale(16)}>
                <Ps5Text color={ps5Colors.text} fontSize={scale(28)} fontWeight={700}>Galería vacía</Ps5Text>
                <Ps5Text color={ps5Colors.mutedText} fontSize={scale(15)}>No hay contenido local para este filtro.</Ps5Text>
                <Ps5Button id="gallery-retry" width={scale(210)} height={scale(48)} label="Reintentar" onPress={() => selectFilter("all")} screen={props} />
                <Ps5Button id="gallery-back" width={scale(210)} height={scale(48)} label="Volver" onPress={actions.back} screen={props} />
              </Box>
            }>
              <Box direction="column" gap={scale(16)}>
                <For each={rows()}>{(row) => (
                  <Box direction="row" gap={scale(16)}>
                    <For each={row}>{(item, index) => renderThumbnail(item, index())}</For>
                  </Box>
                )}</For>
              </Box>
            </Show>
          </Box>
          <Box width="100%" height={scale(64)} floating="parent" floatOffset={{ x: 0, y: viewport.height() - scale(64) }} backgroundColor={ps5Colors.scrim} alignX="center" alignY="center">
            <Ps5Text color={ps5Colors.mutedText} fontSize={scale(13)}>Enter abrir · ←/→ navegar en viewer · F2 Opciones · Escape Volver · F1 Centro de control</Ps5Text>
          </Box>
        </Box>
      }>{(item) => renderViewer(item())}</Show>
    </Box>
  )
}
