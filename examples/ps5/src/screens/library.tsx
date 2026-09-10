import { existsSync } from "node:fs"
import {
  Box,
  For,
  Input,
  Show,
  createEffect,
  createMemo,
  createSignal,
  createScrollHandle,
} from "vexart"

import type { GameCatalogEntry, GameId, GameList, Ps5ScreenProps } from "../types"
import { Ps5Button, Ps5Icon, Ps5Panel, ps5Colors, Ps5Text, ps5Scale, usePs5Back, usePs5Viewport } from "../ui"

function imageAvailable(path?: string) {
  return !!path && existsSync(path)
}

function keyIs(event: { key: string }, ...keys: string[]) {
  return keys.includes(event.key)
}

function chunks<T>(items: T[], size: number) {
  const rows: T[][] = []
  for (let index = 0; index < items.length; index += size) rows.push(items.slice(index, index + size))
  return rows
}

function sortGames(games: GameCatalogEntry[], sort: "recent" | "name" | "size", recent: GameId[]) {
  const recentIndex = new Map(recent.map((id, index) => [id, index]))
  return [...games].sort((a, b) => {
    if (sort === "name") return a.title.localeCompare(b.title)
    if (sort === "size") return b.sizeGb - a.sizeGb
    return (recentIndex.get(a.id) ?? 999) - (recentIndex.get(b.id) ?? 999)
  })
}

function GameCover(props: { game: GameCatalogEntry; width: number; height: number }) {
  const radius = Math.max(8, Math.round(Math.min(props.width, props.height) * 0.04))
  return (
    <Box width="100%" height="100%" backgroundColor={props.game.accent} cornerRadius={radius}>
      <Show when={imageAvailable(props.game.cover)} fallback={
        <Box width="100%" height="100%" alignX="center" alignY="center">
          <Ps5Text color={ps5Colors.text} fontSize={12} alignX="center">{props.game.title}</Ps5Text>
        </Box>
      }>
        <img src={props.game.cover} width={props.width} height={props.height} objectFit="cover" cornerRadius={radius} />
      </Show>
    </Box>
  )
}

export function LibraryScreen(props: Ps5ScreenProps) {
  const viewport = usePs5Viewport()
  const scale = (value: number) => ps5Scale(viewport, value)
  const state = props.state
  const actions = props.actions
  const [filterOpen, setFilterOpen] = createSignal(false)
  const [listDetail, setListDetail] = createSignal<string>()
  const [restoreListId, setRestoreListId] = createSignal<string>()
  const scroll = createScrollHandle("library-results")
  let focusedEntry = false

  const tabs = [
    { id: "all" as const, label: "Tu colección" },
    { id: "installed" as const, label: "Instalados" },
    { id: "lists" as const, label: "Listas" },
  ]
  let gamesKey = ""
  let gamesValue: GameCatalogEntry[] = []
  const games = createMemo(() => {
    const current = state()
    const query = current.library.query.trim().toLocaleLowerCase()
    const filter = current.library.filter
    if (current.library.tab === "lists") {
      if (gamesKey !== "lists") {
        gamesKey = "lists"
        gamesValue = []
      }
      return gamesValue
    }
    // Focus and download updates replace the store state object. Keep the
    // result reference stable for those updates so keyed rows/buttons do not
    // churn their focus registrations while the user traverses the grid.
    const catalogKey = current.catalog.map((game) => `${game.id}:${game.installed ? 1 : 0}:${game.progress}`).join(",")
    const key = `${current.library.tab}|${query}|${filter}|${current.library.sort}|${current.recentGameIds.join(",")}|${catalogKey}`
    if (key === gamesKey) return gamesValue
    gamesKey = key
    gamesValue = sortGames(current.catalog.filter((game) => {
      if (current.library.tab === "installed" && !game.installed) return false
      if (filter === "installed" && !game.installed) return false
      if (filter && filter !== "all" && filter !== "installed" && game.genre !== filter) return false
      if (!query) return true
      return `${game.title} ${game.subtitle} ${game.genre}`.toLocaleLowerCase().includes(query)
    }), current.library.sort, current.recentGameIds)
    return gamesValue
  })
  const rows = createMemo(() => chunks(games(), 5))
  const genres = createMemo(() => [...new Set(state().catalog.map((game) => game.genre))])
  const gridGap = () => scale(16)
  const cardWidth = () => Math.max(scale(150), Math.floor((viewport.width() - scale(90) - gridGap() * 4) / 5))
  const coverSize = () => cardWidth()
  // The cover is the visual anchor. Keep captions light and outside the art so
  // the grid reads like a console library rather than a dashboard of panels.
  const captionHeight = () => scale(66)
  const cardHeight = () => coverSize() + captionHeight()
  const rowHeight = () => cardHeight() + scale(16)
  const selectedResult = () => {
    const selected = state().selectedGameId
    return games().find((game) => game.id === selected) ?? games()[0]
  }
  const firstFocus = () => state().library.tab === "lists" ? `library-list-${state().library.lists[0]?.id ?? "empty"}` : games()[0] ? `library-game-${games()[0]!.id}` : "library-clear"
  const ensureGameVisible = (index: number) => {
    if (index < 0) return
    scroll.scrollIntoView(Math.floor(index / 5) * rowHeight(), cardHeight())
  }

  createEffect(() => {
    const current = state()
    if (current.screen !== "library" || focusedEntry) return
    focusedEntry = true
    const remembered = current.focusMemory.library
    const validGame = remembered?.startsWith("library-game-") && games().some((game) => `library-game-${game.id}` === remembered)
    const validList = remembered?.startsWith("library-list-") && current.library.lists.some((list) => `library-list-${list.id}` === remembered)
    const next = validGame || validList ? remembered! : firstFocus()
    queueMicrotask(() => {
      if (state().screen !== "library") return
      actions.setFocus(next)
      if (next.startsWith("library-game-")) ensureGameVisible(games().findIndex((game) => `library-game-${game.id}` === next))
      props.onReady?.()
    })
  })

  const setTab = (tab: "all" | "installed" | "lists") => actions.dispatch({ type: "library/set", tab })
  const moveTab = (index: number) => (event: { key: string }) => {
    if (keyIs(event, "left", "ArrowLeft")) {
      const tab = tabs[Math.max(0, index - 1)]!
      setTab(tab.id)
      actions.setFocus(`library-tab-${tab.id}`)
    }
    if (keyIs(event, "right", "ArrowRight")) {
      const tab = tabs[Math.min(tabs.length - 1, index + 1)]!
      setTab(tab.id)
      actions.setFocus(`library-tab-${tab.id}`)
    }
  }
  const download = (game: GameCatalogEntry | undefined) => {
    if (!game || game.installed) return
    actions.startDownload(game.id)
    actions.dispatch({ type: "download/set", id: `download-${game.id}`, status: "downloading" })
  }
  const activateGame = (game: GameCatalogEntry) => actions.selectHomeTile(game.id)
  const moveGame = (index: number) => (event: { key: string }) => {
    const all = games()
    if (all.length === 0) return
    const focus = (next: number) => {
      actions.setFocus(`library-game-${all[next]!.id}`)
      ensureGameVisible(next)
    }
    if (keyIs(event, "left", "ArrowLeft")) focus(Math.max(0, index - 1))
    if (keyIs(event, "right", "ArrowRight")) focus(Math.min(all.length - 1, index + 1))
    if (keyIs(event, "up", "ArrowUp", "pageup", "PageUp")) focus(Math.max(0, index - 5))
    if (keyIs(event, "down", "ArrowDown", "pagedown", "PageDown")) focus(Math.min(all.length - 1, index + 5))
    if (keyIs(event, "home", "Home")) focus(0)
    if (keyIs(event, "end", "End")) focus(all.length - 1)
  }
  const clearFilters = () => {
    actions.dispatch({ type: "library/query", value: "" })
    actions.dispatch({ type: "library/set", filter: "all" })
  }
  const listGames = (list: GameList) => list.gameIds.map((id) => state().catalog.find((game) => game.id === id)).filter((game): game is GameCatalogEntry => !!game)
  const openList = (id: string) => {
    setListDetail(id)
  }
  const closeList = () => {
    const id = listDetail()
    if (id) setRestoreListId(id)
    setListDetail(undefined)
  }

  createEffect(() => {
    const id = restoreListId()
    if (!id || listDetail()) return
    setRestoreListId(undefined)
    queueMicrotask(() => {
      if (state().screen === "library" && !listDetail()) actions.setFocus(`library-list-${id}`)
    })
  })

  usePs5Back(() => {
    if (filterOpen()) {
      setFilterOpen(false)
      return true
    }
    if (listDetail()) {
      closeList()
      return true
    }
    return false
  })

  return (
    <Box width={viewport.width()} height={viewport.height()} backgroundColor={ps5Colors.background} viewportClip>
      <Box width={viewport.width()} height={viewport.height()} direction="column" padding={scale(45)} gap={scale(18)}>
        <Box width="100%" height={scale(48)} direction="row" alignY="center" gap={scale(18)}>
          <Ps5Button id="library-back" width={scale(44)} height={scale(42)} backgroundColor="#00000000" borderWidth={0} onPress={actions.back} screen={props}>
            <Ps5Text color={ps5Colors.text} fontSize={scale(28)}>‹</Ps5Text>
          </Ps5Button>
          <Ps5Text color={ps5Colors.text} fontSize={scale(30)} fontWeight={700}>Biblioteca</Ps5Text>
          <Box flexGrow={1} />
          <Box width={scale(400)} height={scale(42)}>
            <Input
              value={state().library.query}
              onChange={(value) => actions.setTextField("library-query", value)}
              onSubmit={() => actions.setFocus(firstFocus())}
              placeholder="Buscar juegos"
              focusId="library-query"
              width="100%"
              height={scale(42)}
              renderInput={(context) => (
                <Box onPress={context.inputProps.onPress} width="100%" height="100%" paddingX={scale(14)} alignY="center" backgroundColor="#161b22dd" borderColor={context.focused ? ps5Colors.focus : ps5Colors.divider} borderWidth={1} cornerRadius={scale(21)}>
                  <Ps5Text color={context.showPlaceholder ? ps5Colors.mutedText : ps5Colors.text} fontSize={scale(15)}>{context.displayText || "Buscar juegos"}</Ps5Text>
                </Box>
              )}
            />
          </Box>
          <Ps5Button id="library-filter" width={scale(48)} height={scale(42)} backgroundColor="#161b22cc" onPress={() => setFilterOpen((open) => !open)} screen={props}>
            <Ps5Icon name="magnifying-glass" size={scale(20)} />
          </Ps5Button>
          <Ps5Button id="library-sort" width={scale(120)} height={scale(42)} label={`Orden: ${state().library.sort}`} onPress={() => actions.dispatch({ type: "library/set", sort: state().library.sort === "recent" ? "name" : state().library.sort === "name" ? "size" : "recent" })} screen={props} />
        </Box>

        <Box width="100%" height={scale(48)} direction="row" gap={scale(12)}>
          <For each={tabs}>{(tab) => (
            <Ps5Button id={`library-tab-${tab.id}`} width={scale(180)} height={scale(44)} backgroundColor={state().library.tab === tab.id ? "#f4f4f4" : "#161b22cc"} borderColor={state().library.tab === tab.id ? ps5Colors.focus : ps5Colors.divider} onPress={() => setTab(tab.id)} onKeyDown={moveTab(tabs.indexOf(tab))} screen={props}>
              <Ps5Text color={state().library.tab === tab.id ? "#101214" : ps5Colors.text} fontSize={scale(16)} fontWeight={state().library.tab === tab.id ? 700 : 400}>{tab.label}</Ps5Text>
            </Ps5Button>
          )}</For>
          <Show when={state().library.filter && state().library.filter !== "all"}>
            <Ps5Text color={ps5Colors.mutedText} fontSize={scale(14)}>Filtro: {state().library.filter}</Ps5Text>
          </Show>
        </Box>

        <Show when={filterOpen()}>
          <Ps5Panel width={scale(620)} padding={scale(16)} gap={scale(10)} direction="row" backgroundColor="#111720f4" borderColor="#ffffff38" cornerRadius={scale(14)} zIndex={6}>
            <Ps5Button id="library-filter-all" width={scale(90)} height={scale(38)} label="Todos" onPress={() => { actions.dispatch({ type: "library/set", filter: "all" }); setFilterOpen(false) }} screen={props} />
            <Ps5Button id="library-filter-installed" width={scale(100)} height={scale(38)} label="Instalados" onPress={() => { actions.dispatch({ type: "library/set", filter: "installed" }); setFilterOpen(false) }} screen={props} />
            <For each={genres()}>{(genre, index) => (
              <Ps5Button id={`library-filter-genre-${index()}`} width={scale(120)} height={scale(38)} label={genre} onPress={() => { actions.dispatch({ type: "library/set", filter: genre }); setFilterOpen(false) }} screen={props} />
            )}</For>
          </Ps5Panel>
        </Show>

        <Box width="100%" height={Math.max(scale(320), viewport.height() - scale(245))} scrollY scrollId="library-results" viewportClip>
          <Show when={state().library.tab !== "lists"} fallback={
            <Show when={listDetail()} keyed fallback={
              <Show when={state().library.lists.length > 0} fallback={
                <Box width="100%" height={scale(300)} alignX="center" alignY="center" direction="column" gap={scale(14)}>
                  <Ps5Text color={ps5Colors.text} fontSize={scale(24)} fontWeight={700}>Sin listas</Ps5Text>
                  <Ps5Text color={ps5Colors.mutedText} fontSize={scale(15)}>Añade juegos a una lista local desde Opciones.</Ps5Text>
                  <Ps5Button id="library-clear" width={scale(190)} height={scale(44)} label="Volver" onPress={actions.back} screen={props} />
                </Box>
              }>
                <Box direction="column" gap={scale(16)}>
                  <Ps5Text color={ps5Colors.text} fontSize={scale(19)} fontWeight={700}>Tus listas</Ps5Text>
                  <For each={state().library.lists}>{(list) => {
                    const entries = () => listGames(list)
                    return (
                      <Ps5Button id={`library-list-${list.id}`} width="100%" height={scale(118)} padding={scale(14)} alignX="left" onPress={() => openList(list.id)} screen={props}>
                        <Box width="100%" height="100%" direction="row" gap={scale(14)} alignY="center">
                          <Box width={scale(86)} height={scale(86)} backgroundColor="#202731" cornerRadius={10} alignX="center" alignY="center"><Ps5Text color={ps5Colors.text} fontSize={scale(22)}>{entries().length}</Ps5Text></Box>
                          <Box direction="column" gap={scale(6)}><Ps5Text color={ps5Colors.text} fontSize={scale(18)} fontWeight={700}>{list.name}</Ps5Text><Ps5Text color={ps5Colors.mutedText} fontSize={scale(14)}>{entries().length} juegos</Ps5Text></Box>
                        </Box>
                      </Ps5Button>
                    )
                  }}</For>
                </Box>
              </Show>
            }>{(listId) => {
              const list = () => state().library.lists.find((entry) => entry.id === listId)
              const entries = () => list() ? listGames(list()!) : []
              return (
                <Ps5Panel width="100%" padding={scale(20)} gap={scale(14)} direction="column" backgroundColor="#111720ee" borderColor="#ffffff38" cornerRadius={scale(16)}>
                  <Ps5Text color={ps5Colors.text} fontSize={scale(22)} fontWeight={700}>{list()?.name ?? "Lista"}</Ps5Text>
                  <Ps5Text color={ps5Colors.mutedText} fontSize={scale(14)}>{entries().length} juegos · Escape para cerrar</Ps5Text>
                  <For each={entries()}>{(entry) => (
                    <Ps5Button id={`library-list-game-${entry.id}`} width="100%" height={scale(52)} alignX="left" label={entry.title} onPress={() => activateGame(entry)} screen={props} />
                  )}</For>
                  <Ps5Button id="library-list-close" width={scale(180)} height={scale(44)} label="Cerrar" onPress={closeList} screen={props} />
                </Ps5Panel>
              )
            }}</Show>
          }>
            <Show when={games().length > 0} fallback={
              <Box width="100%" height={scale(300)} alignX="center" alignY="center" direction="column" gap={scale(14)}>
                <Ps5Text color={ps5Colors.text} fontSize={scale(24)} fontWeight={700}>Sin resultados</Ps5Text>
                <Ps5Text color={ps5Colors.mutedText} fontSize={scale(15)}>Prueba otra búsqueda o limpia los filtros.</Ps5Text>
                <Ps5Button id="library-clear" width={scale(220)} height={scale(44)} label="Limpiar filtros" onPress={clearFilters} screen={props} />
              </Box>
            }>
              <Box direction="column" gap={scale(16)}>
                <Show when={selectedResult()}>
                  <Box width="100%" height={scale(44)} direction="row" alignY="center" gap={scale(12)}>
                    <Ps5Text color={ps5Colors.mutedText} fontSize={scale(14)}>Resultados: {games().length} · {selectedResult()!.title}</Ps5Text>
                    <Box flexGrow={1} />
                    <Show when={!selectedResult()!.installed}>
                      <Ps5Button id="library-download" width={scale(150)} height={scale(40)} label="Descargar" onPress={() => download(selectedResult())} screen={props} />
                    </Show>
                  </Box>
                </Show>
                <For each={rows()}>{(row) => (
                  <Box width="100%" height={rowHeight()} direction="row" gap={gridGap()}>
                    <For each={row}>{(entry) => {
                      const position = () => games().findIndex((game) => game.id === entry.id)
                      const downloadEntry = () => state().downloads.find((download) => download.gameId === entry.id)
                      return (
                        <Ps5Button id={`library-game-${entry.id}`} width={cardWidth()} height={cardHeight()} padding={0} alignY="top" backgroundColor="#00000000" borderColor="#ffffff00" cornerRadius={scale(14)} onPress={() => activateGame(entry)} onKeyDown={moveGame(position())} screen={props}>
                          <Box width="100%" height="100%" direction="column" gap={scale(8)}>
                            <Box width={coverSize()} height={coverSize()}>
                              <GameCover game={entry} width={coverSize()} height={coverSize()} />
                            </Box>
                            <Box width="100%" height={captionHeight()} direction="column" gap={scale(3)} paddingX={scale(2)}>
                              <Ps5Text color={ps5Colors.text} fontSize={scale(14)} fontWeight={600}>{entry.title}</Ps5Text>
                              <Ps5Text color={entry.installed ? ps5Colors.success : ps5Colors.mutedText} fontSize={scale(12)}>{downloadEntry()?.status === "downloading" ? `Descargando ${Math.round(downloadEntry()!.progress)}%` : entry.installed ? "Instalado" : "No instalado"}</Ps5Text>
                            </Box>
                          </Box>
                        </Ps5Button>
                      )
                    }}</For>
                  </Box>
                )}</For>
              </Box>
            </Show>
          </Show>
        </Box>
      </Box>
    </Box>
  )
}
