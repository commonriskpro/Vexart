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
import { Ps5Button, Ps5Icon, Ps5Panel, Ps5Text, ps5Colors, ps5Scale, usePs5Back, usePs5Viewport } from "../ui"

type StoreTab = "games" | "media"
type StoreSort = "recent" | "name" | "size"

function imageAvailable(path?: string) {
  return !!path && existsSync(path)
}

function keyIs(event: { key: string }, ...keys: string[]) {
  return keys.includes(event.key)
}

function imageFor(entry: GameCatalogEntry, tab: StoreTab, index: number) {
  if (tab === "games") return entry.cover
  return index % 3 === 0 ? entry.hero : index % 3 === 1 ? entry.titleScreen : entry.cover
}

function detailId(focusId?: string) {
  if (!focusId?.startsWith("store-detail-")) return undefined
  return focusId.slice("store-detail-".length) as GameId
}

function Fallback(props: { entry: GameCatalogEntry; width: number; height: number }) {
  return (
    <Box width={props.width} height={props.height} backgroundColor={props.entry.accent} alignX="center" alignY="center" padding={12}>
      <Ps5Text color="#ffffffdd" fontSize={14} alignX="center">Arte no disponible · {props.entry.id}</Ps5Text>
    </Box>
  )
}

function Artwork(props: { entry: GameCatalogEntry; path: string; width: number; height: number }) {
  return (
    <Show when={imageAvailable(props.path)} fallback={<Fallback entry={props.entry} width={props.width} height={props.height} />}>
      <img src={props.path} width={props.width} height={props.height} objectFit="cover" />
    </Show>
  )
}

export function StoreMediaScreen(props: Ps5ScreenProps) {
  const viewport = usePs5Viewport()
  const scale = (value: number) => ps5Scale(viewport, value)
  const state = props.state
  const actions = props.actions
  const [tab, setTab] = createSignal<StoreTab>("games")
  const [wishlist, setWishlist] = createSignal<GameId[]>([])
  const scroll = createScrollHandle("ps5-store-results")
  let entered = false
  let previousDetailId: GameId | undefined

  usePs5Back(() => {
    if (!detail()) return false
    actions.back()
    return true
  })

  const query = () => state().library.query.trim().toLocaleLowerCase()
  const filter = () => state().library.filter
  const sort = () => state().library.sort as StoreSort
  const detail = () => {
    const id = detailId(state().navigation.at(-1)?.focusId)
    return id ? state().catalog.find((entry) => entry.id === id) : undefined
  }
  const genres = () => [...new Set(state().catalog.map((entry) => entry.genre))].sort((a, b) => a.localeCompare(b))
  const visible = () => {
    const current = state().catalog.filter((entry) => {
      if (filter() && entry.genre !== filter()) return false
      if (!query()) return true
      const text = `${entry.title} ${entry.subtitle} ${entry.genre}`.toLocaleLowerCase()
      return text.includes(query())
    })
    if (sort() === "name") return [...current].sort((a, b) => a.title.localeCompare(b.title))
    if (sort() === "size") return [...current].sort((a, b) => a.sizeGb - b.sizeGb)
    return current
  }
  const columns = () => Math.max(2, Math.min(6, Math.floor((viewport.width() - scale(120) + scale(16)) / (scale(268) + scale(16)))))
  const cardHeight = () => scale(286)
  const artworkHeight = () => scale(158)
  const rows = () => {
    const list = visible()
    const result: GameCatalogEntry[][] = []
    for (let index = 0; index < list.length; index += columns()) {
      result.push(list.slice(index, index + columns()))
    }
    return result
  }
  const download = (id: GameId) => state().downloads.find((entry) => entry.gameId === id)
  const isWishlisted = (id: GameId) => wishlist().includes(id)

  createEffect(() => {
    const focus = state().focusedId
    if (!focus?.startsWith("store-card-")) return
    const index = visible().findIndex((entry) => `store-card-${entry.id}` === focus)
    if (index < 0) return
    const row = Math.floor(index / columns())
    scroll.scrollIntoView(row * (cardHeight() + scale(16)), cardHeight())
  })

  createEffect(() => {
    const current = state()
    if (current.screen !== "store-media" || entered) return
    entered = true
    const marker = current.navigation.at(-1)?.focusId
    actions.setFocus(current.focusMemory["store-media"] ?? (marker?.startsWith("store-detail-") ? "store-detail-back" : marker) ?? "store-tab-games")
    props.onReady?.()
  })

  createEffect(() => {
    const current = state()
    if (current.screen !== "store-media" || !detail()) return
    if (current.focusedId?.startsWith("store-detail-")) actions.setFocus("store-detail-back")
  })

  createEffect(() => {
    const current = state()
    const id = detail()?.id
    if (!id && previousDetailId && current.screen === "store-media" && !current.focusedId) actions.setFocus(`store-card-${previousDetailId}`)
    previousDetailId = id
  })

  const openDetail = (entry: GameCatalogEntry) => {
    actions.go("store-media", { gameId: entry.id, focusId: `store-detail-${entry.id}` })
  }
  const changeTab = (next: StoreTab) => {
    setTab(next)
    const first = visible()[0]
    actions.setFocus(first ? `store-card-${first.id}` : `store-tab-${next}`)
  }
  const cycleFilter = () => {
    const options = ["", ...genres()]
    const index = Math.max(0, options.indexOf(filter()))
    actions.dispatch({ type: "library/set", filter: options[(index + 1) % options.length] ?? "" })
    const first = visible()[0]
    actions.setFocus(first ? `store-card-${first.id}` : "store-clear")
  }
  const cycleSort = () => {
    const options: StoreSort[] = ["recent", "name", "size"]
    const index = Math.max(0, options.indexOf(sort()))
    actions.dispatch({ type: "library/set", sort: options[(index + 1) % options.length] ?? "recent" })
    const first = visible()[0]
    actions.setFocus(first ? `store-card-${first.id}` : "store-clear")
  }
  const clearFilters = () => {
    actions.setTextField("library-query", "")
    actions.dispatch({ type: "library/set", filter: "", sort: "recent" })
    actions.setFocus("store-search")
  }
  const submitSearch = () => {
    const first = visible()[0]
    actions.setFocus(first ? `store-card-${first.id}` : "store-clear")
  }
  const searchKeyDown = (event: { key: string; char: string; mods: { ctrl: boolean; alt: boolean; meta: boolean } }) => {
    if (event.mods.ctrl || event.mods.meta || event.mods.alt) return
    if (keyIs(event, "backspace", "Backspace")) {
      actions.setTextField("library-query", state().library.query.slice(0, -1))
      return
    }
    if (keyIs(event, "enter", "Enter")) {
      submitSearch()
      return
    }
    if (event.char && event.char.length === 1) actions.setTextField("library-query", state().library.query + event.char)
  }
  const moveCard = (entry: GameCatalogEntry) => (event: { key: string }) => {
    const list = visible()
    const index = list.findIndex((item) => item.id === entry.id)
    if (index < 0) return
    const count = columns()
    if (keyIs(event, "left", "ArrowLeft")) actions.setFocus(`store-card-${list[Math.max(0, index - 1)]?.id ?? entry.id}`)
    if (keyIs(event, "right", "ArrowRight")) actions.setFocus(`store-card-${list[Math.min(list.length - 1, index + 1)]?.id ?? entry.id}`)
    if (keyIs(event, "up", "ArrowUp")) actions.setFocus(`store-card-${list[Math.max(0, index - count)]?.id ?? entry.id}`)
    if (keyIs(event, "down", "ArrowDown")) actions.setFocus(`store-card-${list[Math.min(list.length - 1, index + count)]?.id ?? entry.id}`)
  }
  const install = (entry: GameCatalogEntry) => {
    if (entry.installed) return
    actions.startDownload(entry.id)
    actions.setDownload(`download-${entry.id}`, "downloading")
  }
  const toggleWishlist = (entry: GameCatalogEntry) => {
    setWishlist((current) => current.includes(entry.id) ? current.filter((id) => id !== entry.id) : [...current, entry.id])
  }
  const tabKeyDown = (current: StoreTab) => (event: { key: string }) => {
    if (keyIs(event, "left", "ArrowLeft")) actions.setFocus(current === "media" ? "store-tab-games" : "store-tab-games")
    if (keyIs(event, "right", "ArrowRight")) actions.setFocus(current === "games" ? "store-tab-media" : "store-tab-media")
    if (keyIs(event, "down", "ArrowDown")) actions.setFocus("store-search")
  }

  const renderCard = (entry: GameCatalogEntry, index: number) => {
    const cardWidth = scale(252)
    const path = imageFor(entry, tab(), index)
    const pending = download(entry.id)
    return (
      <Ps5Button
        id={`store-card-${entry.id}`}
        width={cardWidth}
        height={cardHeight()}
        padding={0}
        backgroundColor="#0d1118e8"
        borderColor="#ffffff38"
        cornerRadius={scale(14)}
        onPress={() => openDetail(entry)}
        onKeyDown={moveCard(entry)}
        screen={props}
      >
        <Box width="100%" height="100%" direction="column">
          <Artwork entry={entry} path={path} width={cardWidth} height={artworkHeight()} />
          <Box width="100%" height={cardHeight() - artworkHeight()} padding={scale(10)} direction="column" gap={scale(3)}>
            <Ps5Text color={ps5Colors.text} fontSize={scale(15)} fontWeight={700}>{entry.title}</Ps5Text>
            <Ps5Text color={ps5Colors.mutedText} fontSize={scale(12)}>{entry.genre} · {entry.sizeGb} GB</Ps5Text>
            <Ps5Text color={entry.installed ? ps5Colors.success : ps5Colors.mutedText} fontSize={scale(11)}>
              {pending?.status === "downloading" ? `Descargando ${Math.round(pending.progress)}%` : entry.installed ? "Instalado" : "Disponible localmente"}
            </Ps5Text>
          </Box>
        </Box>
      </Ps5Button>
    )
  }

  const renderDetail = (entry: GameCatalogEntry) => {
    const pending = download(entry.id)
    return (
      <Box width={viewport.width()} height={viewport.height()} backgroundColor="#090c11f2" alignX="center" alignY="center">
        <Box width={viewport.width()} height={viewport.height()} floating="parent" backgroundColor={entry.accent} opacity={0.28} />
        <Box width={viewport.width()} height={viewport.height()} floating="parent" backgroundColor="#05070bc4" />
        <Ps5Panel width={Math.min(scale(1350), viewport.width() - scale(90))} height={Math.min(scale(760), viewport.height() - scale(132))} padding={scale(28)} gap={scale(24)} direction="column" backgroundColor="#0b0f16f5" borderColor="#ffffff3b" cornerRadius={scale(20)}>
          <Box width="100%" height={scale(42)} direction="row" alignY="center" gap={scale(16)}>
            <Ps5Button id="store-detail-back" width={scale(48)} height={scale(42)} backgroundColor="#00000000" borderWidth={0} onPress={actions.back} screen={props}>
              <Ps5Text color={ps5Colors.text} fontSize={scale(30)}>‹</Ps5Text>
            </Ps5Button>
            <Ps5Text color={ps5Colors.text} fontSize={scale(26)} fontWeight={700}>{tab() === "media" ? "Contenido multimedia" : "PlayStation Store"}</Ps5Text>
            <Box flexGrow={1} />
            <Ps5Text color={ps5Colors.mutedText} fontSize={scale(13)}>Ficha local · {entry.id}</Ps5Text>
          </Box>
          <Box width="100%" flexGrow={1} direction="row" gap={scale(28)}>
            <Box width={scale(480)} height="100%" backgroundColor={entry.accent} cornerRadius={scale(14)}>
              <Artwork entry={entry} path={tab() === "media" ? entry.hero : entry.cover} width={scale(480)} height={scale(390)} />
            </Box>
            <Box flexGrow={1} height="100%" direction="column" gap={scale(12)}>
              <Ps5Text color={ps5Colors.text} fontSize={scale(34)} fontWeight={700}>{entry.title}</Ps5Text>
              <Ps5Text color={ps5Colors.mutedText} fontSize={scale(16)}>{entry.subtitle}</Ps5Text>
              <Ps5Text color={ps5Colors.mutedText} fontSize={scale(14)}>{entry.genre} · {entry.sizeGb} GB</Ps5Text>
              <Ps5Text color={ps5Colors.text} fontSize={scale(16)}>{entry.description}</Ps5Text>
              <Box flexGrow={1} />
              <Box direction="row" gap={scale(10)}>
                <Ps5Button id="store-detail-install" width={scale(230)} height={scale(50)} label={pending?.status === "downloading" ? `Descargando ${Math.round(pending.progress)}%` : entry.installed ? "Instalado" : "Instalar en esta consola"} disabled={entry.installed || pending?.status === "downloading"} onPress={() => install(entry)} screen={props} />
                <Ps5Button id="store-detail-wishlist" width={scale(210)} height={scale(50)} label={isWishlisted(entry.id) ? "En lista temporal" : "Añadir a lista"} onPress={() => toggleWishlist(entry)} screen={props} />
              </Box>
              <Box direction="row" gap={scale(10)}>
                <Ps5Button id="store-detail-library" width={scale(230)} height={scale(48)} label="Abrir biblioteca" onPress={() => actions.go("library", { gameId: entry.id })} screen={props} />
                <Ps5Button id="store-detail-gallery" width={scale(210)} height={scale(48)} label="Abrir galería" onPress={() => actions.go("gallery", { gameId: entry.id })} screen={props} />
              </Box>
              <Box direction="row" gap={scale(10)}>
                <Ps5Button id="store-detail-buy" width={scale(230)} height={scale(42)} label="Comprar · No disponible" disabled onPress={() => undefined} screen={props} />
                <Ps5Button id="store-detail-trailer" width={scale(210)} height={scale(42)} label="Tráiler · No disponible" disabled onPress={() => undefined} screen={props} />
              </Box>
              <Ps5Text color={ps5Colors.mutedText} fontSize={scale(12)}>Las compras, PSN, streaming y reproducción no están disponibles en esta demo local.</Ps5Text>
            </Box>
          </Box>
        </Ps5Panel>
      </Box>
    )
  }

  return (
    <Box width={viewport.width()} height={viewport.height()} backgroundColor={ps5Colors.background} viewportClip>
      <Show when={detail()} fallback={
        <Box width="100%" height="100%" direction="column">
          <Box width="100%" height={scale(112)} padding={scale(22)} direction="column" gap={scale(14)} backgroundColor="#0b0e14f4">
            <Box width="100%" height={scale(40)} direction="row" alignY="center" gap={scale(30)}>
              <Ps5Button id="store-tab-games" width={scale(118)} height={scale(40)} backgroundColor="#00000000" borderWidth={0} onPress={() => changeTab("games")} onKeyDown={tabKeyDown("games")} screen={props}>
                <Ps5Text color={tab() === "games" ? ps5Colors.text : ps5Colors.mutedText} fontSize={scale(23)} fontWeight={tab() === "games" ? 700 : 400}>Juegos</Ps5Text>
              </Ps5Button>
              <Ps5Button id="store-tab-media" width={scale(280)} height={scale(40)} backgroundColor="#00000000" borderWidth={0} onPress={() => changeTab("media")} onKeyDown={tabKeyDown("media")} screen={props}>
                <Ps5Text color={tab() === "media" ? ps5Colors.text : ps5Colors.mutedText} fontSize={scale(23)} fontWeight={tab() === "media" ? 700 : 400}>Contenido multimedia</Ps5Text>
              </Ps5Button>
              <Box flexGrow={1} />
              <Ps5Text color={ps5Colors.mutedText} fontSize={scale(13)}>Catálogo local · {state().catalog.length} títulos</Ps5Text>
              <Ps5Icon name="game-controller" size={scale(25)} opacity={0.9} />
            </Box>
            <Box width="100%" height={scale(42)} direction="row" gap={scale(10)}>
              <Ps5Button id="store-search" width={scale(370)} height={scale(42)} alignX="left" label={query() ? `Buscar: ${state().library.query}` : "Buscar en el catálogo local"} backgroundColor="#202631" onPress={submitSearch} onKeyDown={searchKeyDown} screen={props} />
              <Ps5Button id="store-filter" width={scale(210)} height={scale(42)} label={filter() ? `Género: ${filter()}` : "Todos los géneros"} onPress={cycleFilter} screen={props} />
              <Ps5Button id="store-sort" width={scale(180)} height={scale(42)} label={sort() === "name" ? "Orden: nombre" : sort() === "size" ? "Orden: tamaño" : "Orden: reciente"} onPress={cycleSort} screen={props} />
              <Show when={query() || filter()}>
                <Ps5Button id="store-clear" width={scale(138)} height={scale(42)} label="Limpiar" onPress={clearFilters} screen={props} />
              </Show>
            </Box>
          </Box>
          <Box width="100%" flexGrow={1} padding={scale(22)} scrollY scrollId="ps5-store-results" viewportClip>
            <Show when={visible().length > 0} fallback={
              <Box width="100%" height={scale(360)} alignX="center" alignY="center" direction="column" gap={scale(16)}>
                <Ps5Text color={ps5Colors.text} fontSize={scale(28)} fontWeight={700}>No hay resultados</Ps5Text>
                <Ps5Text color={ps5Colors.mutedText} fontSize={scale(15)}>Prueba otra consulta o limpia los filtros del catálogo local.</Ps5Text>
                <Ps5Button id="store-clear" width={scale(220)} height={scale(48)} label="Limpiar filtros" onPress={clearFilters} screen={props} />
              </Box>
            }>
              <Box direction="column" gap={scale(16)}>
                <For each={rows()}>{(row, rowIndex) => (
                  <Box direction="row" gap={scale(16)}>
                    <For each={row}>{(entry, index) => renderCard(entry, rowIndex() * columns() + index())}</For>
                  </Box>
                )}</For>
              </Box>
            </Show>
          </Box>
          <Box width="100%" height={scale(66)} floating="parent" floatOffset={{ x: 0, y: viewport.height() - scale(66) }} backgroundColor={ps5Colors.scrim} direction="row" alignX="center" alignY="center" gap={scale(22)}>
            <Ps5Text color={ps5Colors.mutedText} fontSize={scale(13)}>Enter abrir ficha · F1 Centro de control · F2 Opciones · Escape Volver</Ps5Text>
            <Ps5Text color={ps5Colors.mutedText} fontSize={scale(13)}>Compras y reproducción: no disponibles</Ps5Text>
          </Box>
        </Box>
      }>{(entry) => renderDetail(entry())}</Show>
    </Box>
  )
}
