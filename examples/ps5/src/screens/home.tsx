import { existsSync } from "node:fs"
import { resolve } from "node:path"
import {
  Box,
  For,
  Show,
  createEffect,
  createSignal,
  createTransition,
} from "vexart"

import type { GameCatalogEntry, GameId, HomeTile, Ps5ScreenProps } from "../types"
import { Ps5Avatar, Ps5Button, Ps5Icon, Ps5Panel, ps5Colors, ps5Motion, Ps5Text, ps5Scale, usePs5Viewport } from "../ui"

function imageAvailable(path?: string) {
  return !!path && existsSync(path)
}

function keyIs(event: { key: string }, ...keys: string[]) {
  return keys.includes(event.key)
}

const mockAssets = {
  activity: resolve(import.meta.dir, "../../assets/mock/activity-horseback-sunset.png"),
  trophies: resolve(import.meta.dir, "../../assets/mock/trophies-silver-gold-bronze-dark.png"),
  news: resolve(import.meta.dir, "../../assets/mock/news-mountain-island.png"),
  ghostLockup: resolve(import.meta.dir, "../../assets/mock/ghost-lockup.png"),
} as const

function HeroLayer(props: { game: GameCatalogEntry; width: number; height: number; opacity?: number }) {
  return (
    <Box width={props.width} height={props.height} backgroundColor={props.game.accent} floating="parent" zIndex={0}>
      <Show when={imageAvailable(props.game.hero)} fallback={
        <Box width="100%" height="100%" alignX="center" alignY="center" backgroundColor={props.game.accent} opacity={props.opacity ?? 1}>
          <Ps5Text color="#ffffffcc" fontSize={28}>Arte no disponible · {props.game.id}</Ps5Text>
        </Box>
      }>
        <img src={props.game.hero} width={props.width} height={props.height} objectFit="cover" opacity={props.opacity ?? 1} />
      </Show>
    </Box>
  )
}

function HeroFadeLayer(props: { game: GameCatalogEntry; width: number; height: number; reduceMotion: boolean }) {
  const [opacity, setOpacity] = createTransition(0, { duration: ps5Motion.background })
  createEffect(() => setOpacity(1))
  return <HeroLayer game={props.game} width={props.width} height={props.height} opacity={props.reduceMotion ? 1 : opacity()} />
}

function Cover(props: { tile: HomeTile; game?: GameCatalogEntry; width: number; height: number }) {
  if (props.tile.kind === "utility") {
    return (
      <Box width="100%" height="100%" direction="column" alignX="center" alignY="center" gap={8} backgroundColor="#0a0e14e8" cornerRadius={Math.round(Math.min(props.width, props.height) * 0.08)}>
        <Show when={props.tile.id === "store"} fallback={
          <Ps5Icon
            name="library-grid-controller-reference"
            width={Math.round(props.width * 0.34)}
            height={Math.round(props.width * 0.34)}
            opacity={0.98}
          />
        }>
          <Ps5Icon
            name="store-bag-reference"
            width={Math.round(props.width * 0.39)}
            height={Math.round(props.width * 0.48)}
            opacity={0.98}
          />
        </Show>
        <Ps5Text color={ps5Colors.text} fontSize={Math.max(11, Math.round(props.width * 0.1))} alignX="center">
          {props.tile.id === "store" ? "PlayStation Store" : "Biblioteca de juegos"}
        </Ps5Text>
      </Box>
    )
  }
  return (
    <Box width="100%" height="100%" backgroundColor={props.game?.accent ?? ps5Colors.panel}>
      <Show when={props.game && imageAvailable(props.game.cover)} fallback={
        <Box width="100%" height="100%" alignX="center" alignY="center">
          <Ps5Text color={ps5Colors.text} fontSize={12} alignX="center">{props.game?.title ?? props.tile.id}</Ps5Text>
        </Box>
      }>
        <img
          src={props.game!.cover}
          width={props.width}
          height={props.height}
          objectFit="cover"
          cornerRadius={Math.round(Math.min(props.width, props.height) * 0.08)}
        />
      </Show>
    </Box>
  )
}

const trophyKinds = ["platinum", "gold", "silver", "bronze"] as const
const trophyIcons = ["trophy-platinum", "trophy-gold", "trophy-silver", "trophy-bronze"] as const

type ActivityCardProps = {
  id: string
  width: number
  height: number
  radius: number
  title: () => string
  description: () => string
  image: () => string | undefined
  accent: () => string
  onPress: () => void
  onKeyDown: (event: { key: string }) => void
  screen: Ps5ScreenProps
  progress?: () => number
  trophyCounts?: () => number[]
}

function ActivityCard(props: ActivityCardProps) {
  const image = () => props.image()
  const precomposed = () => image() === mockAssets.activity || image() === mockAssets.trophies || image() === mockAssets.news
  return (
    <Ps5Button
      id={props.id}
      width={props.width}
      height={props.height}
      padding={0}
      backgroundColor="#080b10cc"
      borderColor={props.id === "home-card-0" ? "#ffffff" : "#ffffff55"}
      borderWidth={props.id === "home-card-0" ? 2 : 1}
      cornerRadius={props.radius}
      onPress={props.onPress}
      screen={props.screen}
      onKeyDown={props.onKeyDown}
    >
      <Box width="100%" height="100%" backgroundColor={props.accent()} cornerRadius={props.radius}>
        <Show when={image() && imageAvailable(image())} fallback={<Box width="100%" height="100%" backgroundColor={props.accent()} />}>
          <img src={image()!} width="100%" height="100%" objectFit="cover" cornerRadius={props.radius} />
        </Show>
        <Show when={!precomposed()}>
          <Box
            width="100%"
            height="100%"
            floating="parent"
            floatOffset={{ x: 0, y: 0 }}
            zIndex={1}
            cornerRadius={props.radius}
            gradient={{ type: "linear", from: "#02040608", to: "#020406eb", angle: 90 }}
          />
        </Show>
        <Box
          width="100%"
          height={props.trophyCounts ? props.height - Math.round(props.height * 0.16) : "100%"}
          floating="parent"
          floatOffset={{ x: 0, y: 0 }}
          zIndex={2}
          padding={Math.round(props.width * 0.037)}
          direction="column"
          alignY="bottom"
          gap={Math.round(props.width * 0.01)}
        >
          <Ps5Text color={ps5Colors.text} fontSize={Math.round(props.width * 24 / 540)} fontWeight={700}>{props.title()}</Ps5Text>
          <Show when={props.description()}>
            <Ps5Text color={ps5Colors.text} fontSize={Math.round(props.width * 21 / 540)}>{props.description()}</Ps5Text>
          </Show>
        </Box>
        <Show when={props.progress?.() !== undefined}>
          <Box
            width={Math.round(props.width * 0.28)}
            height={Math.round(props.height * 0.16)}
            floating="parent"
            floatOffset={{ x: Math.round(props.width * 0.67), y: Math.round(props.height * 0.71) }}
            zIndex={2}
            direction="column"
            alignX="right"
            gap={Math.max(2, Math.round(props.width * 0.008))}
          >
            <Ps5Text color={ps5Colors.text} fontSize={Math.round(props.width * 21 / 540)} fontWeight={700} alignX="right">{Math.round(props.progress?.() ?? 0)} %</Ps5Text>
            <Box width="100%" height={Math.max(2, Math.round(props.height * 0.012))} backgroundColor="#ffffff66" cornerRadius={2}>
              <Box width={`${Math.max(0, Math.min(100, props.progress?.() ?? 0))}%`} height="100%" backgroundColor={ps5Colors.text} cornerRadius={2} />
            </Box>
          </Box>
        </Show>
        <Show when={props.trophyCounts?.() !== undefined}>
          <Box
            width={Math.round(props.width * 0.62)}
            height={Math.round(props.height * 0.16)}
            floating="parent"
            floatOffset={{ x: Math.round(props.width * 0.037), y: Math.round(props.height * 0.80) }}
            zIndex={2}
            direction="row"
            alignY="center"
            gap={Math.round(props.width * 0.035)}
          >
            <For each={trophyKinds}>{(_kind, index) => (
              <Box direction="row" alignY="center" gap={Math.max(4, Math.round(props.width * 0.012))}>
                <Ps5Icon name={trophyIcons[index()]} size={Math.round(props.width * 0.042)} opacity={0.96} />
                <Ps5Text color={ps5Colors.text} fontSize={Math.round(props.width * 21 / 540)}>{props.trophyCounts?.()[index()] ?? 0}</Ps5Text>
              </Box>
            )}</For>
          </Box>
        </Show>
      </Box>
    </Ps5Button>
  )
}

export function HomeScreen(props: Ps5ScreenProps) {
  const viewport = usePs5Viewport()
  const scale = (value: number) => ps5Scale(viewport, value)
  const state = props.state
  const actions = props.actions
  const [heroFrom, setHeroFrom] = createSignal<GameId | undefined>(undefined)
  const [heroTo, setHeroTo] = createSignal<GameId | undefined>(undefined)
  const [rowOffset, setRowOffset] = createTransition(0, { duration: ps5Motion.carousel })
  let focusedEntry = false

  const game = () => {
    const current = state()
    return current.catalog.find((entry) => entry.id === current.selectedGameId) ?? current.catalog[0]
  }
  const index = () => state().homeIndex
  const tiles = () => state().homeTiles
  const normalTile = () => scale(130)
  const selectedTile = () => scale(172)
  const gap = () => scale(14)
  const gameRailViewport = () => scale(748)
  const gameIndex = () => {
    const current = index()
    return current > 0 && current < tiles().length - 1 ? current - 1 : -1
  }
  const gameCount = () => Math.max(0, tiles().filter((tile) => tile.kind === "game").length)
  const railWidth = () => {
    const active = gameIndex() >= 0 ? selectedTile() : normalTile()
    return gameCount() * normalTile() + (gameCount() - 1) * gap() + active - normalTile()
  }
  const targetOffset = () => {
    const max = Math.max(0, railWidth() - gameRailViewport())
    const target = gameIndex() < 0
      ? (index() === tiles().length - 1 ? max : 0)
      : gameIndex() * (normalTile() + gap()) - (gameRailViewport() - selectedTile()) / 2
    return Math.min(max, Math.max(0, target))
  }
  const displayedOffset = () => state().settings.reduceMotion ? targetOffset() : rowOffset()
  const heroCurrent = () => state().catalog.find((entry) => entry.id === heroTo()) ?? game()
  const heroPrevious = () => state().catalog.find((entry) => entry.id === heroFrom()) ?? game()

  createEffect(() => {
    const selected = game()
    if (!selected) return
    if (heroTo() === undefined) {
      setHeroFrom(selected.id)
      setHeroTo(selected.id)
      return
    }
    if (heroTo() === selected.id) return
    setHeroFrom(heroTo())
    setHeroTo(selected.id)
  })

  createEffect(() => {
    setRowOffset(targetOffset())
  })

  createEffect(() => {
    const current = state()
    if (current.screen !== "home" || focusedEntry) return
    focusedEntry = true
    // Home opens on the selected game tile; the remembered control is restored
    // when returning from a secondary screen/overlay.
    const target = current.focusMemory.home ?? `home-tile-${current.selectedGameId ?? current.homeTiles[0]?.id ?? "store"}`
    queueMicrotask(() => {
      if (state().screen !== "home") return
      actions.setFocus(target)
      props.onReady?.()
    })
  })

  const moveTo = (next: number) => {
    const current = state().homeIndex
    const delta = next > current ? 1 : -1
    for (let cursor = current; cursor !== next; cursor += delta) actions.moveHome(delta)
  }
  const tileKeyDown = (_tileIndex: number) => (event: { key: string }) => {
    if (keyIs(event, "left", "ArrowLeft")) actions.moveHome(-1)
    if (keyIs(event, "right", "ArrowRight")) actions.moveHome(1)
    if (keyIs(event, "home", "Home")) moveTo(0)
    if (keyIs(event, "end", "End")) moveTo(state().homeTiles.length - 1)
  }
  const cardKeyDown = (cardIndex: number) => (event: { key: string }) => {
    if (keyIs(event, "left", "ArrowLeft")) actions.setFocus(cardIndex <= 0 ? "home-play" : `home-card-${cardIndex - 1}`)
    if (keyIs(event, "right", "ArrowRight")) actions.setFocus(cardIndex >= 2 ? "home-options" : `home-card-${cardIndex + 1}`)
    if (keyIs(event, "up", "ArrowUp")) actions.setFocus("home-play")
    if (keyIs(event, "down", "ArrowDown")) actions.setFocus("home-options")
  }

  const selectTile = (tile: HomeTile) => actions.selectHomeTile(tile.id)
  const launchOrDownload = () => {
    const selected = game()
    if (!selected) return
    if (selected.installed) {
      actions.startGame(selected.id)
      return
    }
    actions.startDownload(selected.id)
    actions.dispatch({ type: "download/set", id: `download-${selected.id}`, status: "downloading" })
  }
  const user = () => state().users.find((entry) => entry.id === state().activeUserId)
  const rowHeight = () => selectedTile() + scale(20)
  const download = () => {
    const selectedGame = game()
    return selectedGame ? state().downloads.find((entry) => entry.gameId === selectedGame.id) : undefined
  }
  const trophyCounts = () => trophyKinds.map((kind) => game()?.trophies.filter((entry) => entry.type === kind && entry.earned).length ?? 0)

  return (
    <Box width={viewport.width()} height={viewport.height()} backgroundColor={game()?.accent ?? ps5Colors.background} viewportClip>
      <HeroLayer game={heroPrevious()!} width={viewport.width()} height={viewport.height()} opacity={1} />
      <Show when={heroCurrent()} keyed>{(entry) => <HeroFadeLayer game={entry} width={viewport.width()} height={viewport.height()} reduceMotion={state().settings.reduceMotion} />}</Show>
      <Box width={viewport.width()} height={viewport.height()} floating="parent" zIndex={1} gradient={{ type: "linear", from: "#000000aa", to: "#00000000", angle: 0 }} />
      <Box width={viewport.width()} height={viewport.height()} floating="parent" zIndex={2}>
        <Box width={scale(130)} height={scale(42)} floating="parent" floatOffset={{ x: scale(80), y: scale(42) }}>
          <Ps5Button id="home-tab-games" width="100%" height="100%" alignX="left" backgroundColor="#00000000" borderWidth={0} onPress={() => actions.go("home")} screen={props}>
            <Ps5Text color={ps5Colors.text} fontSize={scale(36)} fontWeight={700}>Juegos</Ps5Text>
          </Ps5Button>
        </Box>
        <Box width={scale(380)} height={scale(42)} floating="parent" floatOffset={{ x: scale(269), y: scale(42) }}>
          <Ps5Button id="home-tab-media" width="100%" height="100%" alignX="left" backgroundColor="#00000000" borderWidth={0} onPress={() => actions.go("store-media")} screen={props}>
            <Ps5Text color={ps5Colors.mutedText} fontSize={scale(34)}>Contenido multimedia</Ps5Text>
          </Ps5Button>
        </Box>
        <Box width={scale(44)} height={scale(42)} floating="parent" floatOffset={{ x: scale(1480), y: scale(42) }}>
          <Ps5Button id="home-search" width="100%" height="100%" backgroundColor="#00000000" borderWidth={0} onPress={() => actions.go("library")} screen={props}>
            <Ps5Icon name="magnifying-glass" size={scale(32)} />
          </Ps5Button>
        </Box>
        <Box width={scale(44)} height={scale(42)} floating="parent" floatOffset={{ x: scale(1575), y: scale(42) }}>
          <Ps5Button id="home-settings" width="100%" height="100%" backgroundColor="#00000000" borderWidth={0} onPress={() => actions.go("settings")} screen={props}>
            <Ps5Icon name="gear-fill" size={scale(32)} />
          </Ps5Button>
        </Box>
        <Box width={scale(52)} height={scale(42)} floating="parent" floatOffset={{ x: scale(1672), y: scale(42) }}>
          <Ps5Button id="home-profile" width="100%" height="100%" backgroundColor="#00000000" borderWidth={0} onPress={() => actions.go("profile")} screen={props}>
            <Ps5Avatar src={user()?.avatar} name={user()?.name ?? "?"} accent={user()?.accent} size={scale(52)} status />
          </Ps5Button>
        </Box>
        <Box width={scale(120)} height={scale(42)} floating="parent" floatOffset={{ x: scale(1758), y: scale(42) }} alignY="center">
          <Ps5Text color={ps5Colors.text} fontSize={scale(32)}>21:08</Ps5Text>
        </Box>

        <Box width={normalTile()} height={rowHeight()} floating="parent" floatOffset={{ x: scale(45), y: scale(122) }}>
          <For each={tiles().filter((tile) => tile.kind === "utility" && tile.id === "store")}>{(tile) => (
            <Ps5Button
              id={`home-tile-${tile.id}`}
              width={normalTile()}
              height={normalTile()}
              padding={0}
              backgroundColor="#090c11"
              borderColor={index() === 0 ? ps5Colors.focus : "#ffffff24"}
              borderWidth={index() === 0 ? 2 : 1}
              cornerRadius={scale(14)}
              onPress={() => selectTile(tile)}
              screen={props}
              onKeyDown={tileKeyDown(0)}
            >
              <Cover tile={tile} width={normalTile()} height={normalTile()} />
            </Ps5Button>
          )}</For>
        </Box>
        <Box width={gameRailViewport()} height={rowHeight()} floating="parent" floatOffset={{ x: scale(189), y: scale(111) }} scrollX layer viewportClip>
          <Box width={railWidth()} height={rowHeight()} direction="row" gap={gap()} transform={{ translateX: -displayedOffset(), translateY: scale(11) }}>
            <For each={tiles().filter((tile) => tile.kind === "game")}>{(tile, gameTileIndex) => {
              const tileGame = () => tile.kind === "game" ? state().catalog.find((entry) => entry.id === tile.id) : undefined
              const active = () => gameTileIndex() === gameIndex()
              const width = () => active() ? selectedTile() : normalTile()
              const height = () => active() ? selectedTile() : normalTile()
              return (
                <Box width={width()} height={height()} transform={{ translateY: active() ? -scale(11) : 0 }}>
                  <Ps5Button
                    id={`home-tile-${tile.id}`}
                    width="100%"
                    height="100%"
                    padding={0}
                    backgroundColor={active() ? "#06080d" : (tileGame()?.accent ?? "#090c11")}
                    borderColor={active() ? ps5Colors.focus : "#ffffff24"}
                    borderWidth={active() ? scale(2) : 1}
                    cornerRadius={active() ? scale(18) : scale(14)}
                    onPress={() => selectTile(tile)}
                    screen={props}
                    onKeyDown={tileKeyDown(gameTileIndex() + 1)}
                  >
                    <Box
                      width="100%"
                      height="100%"
                      padding={active() ? scale(3) : 0}
                      backgroundColor="#00000000"
                      cornerRadius={active() ? scale(15) : scale(14)}
                    >
                      <Box
                        width="100%"
                        height="100%"
                        borderColor={active() ? ps5Colors.focus : "#00000000"}
                        borderWidth={active() ? 1 : 0}
                        cornerRadius={active() ? scale(13) : scale(14)}
                        viewportClip
                      >
                        <Cover tile={tile} game={tileGame()} width={width()} height={height()} />
                      </Box>
                    </Box>
                  </Ps5Button>
                </Box>
              )
            }}</For>
          </Box>
        </Box>
        <Box width={normalTile()} height={rowHeight()} floating="parent" floatOffset={{ x: scale(951), y: scale(122) }}>
          <For each={tiles().filter((tile) => tile.kind === "utility" && tile.id === "library")}>{(tile) => (
            <Ps5Button
              id={`home-tile-${tile.id}`}
              width={normalTile()}
              height={normalTile()}
              padding={0}
              backgroundColor="#090c11"
              borderColor={index() === tiles().length - 1 ? ps5Colors.focus : "#ffffff24"}
              borderWidth={index() === tiles().length - 1 ? 2 : 1}
              cornerRadius={scale(14)}
              onPress={() => selectTile(tile)}
              screen={props}
              onKeyDown={tileKeyDown(tiles().length - 1)}
            >
              <Cover tile={tile} width={normalTile()} height={normalTile()} />
            </Ps5Button>
          )}</For>
        </Box>

        <Box width={scale(620)} height={scale(26)} floating="parent" floatOffset={{ x: scale(373), y: scale(267) }} direction="row" alignY="center" gap={scale(12)}>
          <Box width={scale(43)} height={scale(24)} backgroundColor="#f5f5f5" cornerRadius={scale(3)} alignX="center" alignY="center">
            <Ps5Text color="#101214" fontSize={scale(12)} fontWeight={700}>PS5</Ps5Text>
          </Box>
          <Ps5Text color={ps5Colors.text} fontSize={scale(18)}>{game()?.title ?? "Juego"}</Ps5Text>
          <Ps5Text color={ps5Colors.mutedText} fontSize={scale(14)}>{game()?.subtitle?.toUpperCase() ?? ""}</Ps5Text>
        </Box>

        <Box width={scale(473)} height={scale(168)} floating="parent" floatOffset={{ x: scale(124), y: scale(347) }}>
          <Show when={game()?.id === "ghost-of-tsushima" && imageAvailable(mockAssets.ghostLockup)} fallback={
            <Show when={game()?.logo && imageAvailable(game()?.logo)} fallback={
            <Ps5Text color={ps5Colors.text} fontSize={scale(38)} fontWeight={700}>{game()?.title ?? "Juego"}</Ps5Text>
            }>
              <img src={game()!.logo!} width={scale(460)} height={scale(138)} objectFit="contain" />
            </Show>
          }>
            <img src={mockAssets.ghostLockup} width={scale(473)} height={scale(168)} objectFit="contain" />
          </Show>
        </Box>
        <Show when={!(game()?.id === "ghost-of-tsushima" && imageAvailable(mockAssets.ghostLockup))}>
          <Box width={scale(287)} height={scale(28)} floating="parent" floatOffset={{ x: scale(223), y: scale(483) }} backgroundColor="#c3a46c" cornerRadius={scale(4)} alignX="center" alignY="center">
            <Ps5Text color="#4b3820" fontSize={scale(12)} fontWeight={700}>DIRECTOR’S CUT</Ps5Text>
          </Box>
        </Show>

        <Box width={scale(243)} height={scale(59)} floating="parent" floatOffset={{ x: scale(125), y: scale(557) }}>
          <Ps5Button id="home-play" width="100%" height="100%" backgroundColor="#f4f4f4" borderColor="#ffffff" childrenColor="#101214" cornerRadius={scale(29)} onPress={launchOrDownload} screen={props}>
            <Ps5Text color="#101214" fontSize={scale(19)} fontWeight={700}>{download()?.status === "downloading" ? `Descargando ${Math.round(download()!.progress)}%` : game()?.installed ? "Jugar" : "Descargar"}</Ps5Text>
          </Ps5Button>
        </Box>
        <Box width={scale(59)} height={scale(59)} floating="parent" floatOffset={{ x: scale(389), y: scale(557) }}>
          <Ps5Button id="home-options" width="100%" height="100%" backgroundColor="#1c2027cc" borderColor="#ffffff32" cornerRadius={scale(29)} onPress={() => actions.openOverlay("options")} screen={props}>
            <Ps5Text color={ps5Colors.text} fontSize={scale(24)}>···</Ps5Text>
          </Ps5Button>
        </Box>

        <Box width={scale(1680)} height={scale(225)} floating="parent" floatOffset={{ x: scale(117), y: scale(663) }} direction="row" gap={scale(16)}>
          <ActivityCard
            id="home-card-0"
            width={scale(540)}
            height={scale(225)}
            radius={scale(16)}
            title={() => game()?.activities[0]?.title ?? "Continuar actividad"}
            description={() => game()?.activities[0]?.description ?? "Retoma tu última actividad."}
            image={() => imageAvailable(mockAssets.activity) ? mockAssets.activity : game()?.hero}
            accent={() => game()?.accent ?? ps5Colors.panel}
            progress={() => game()?.activities[0]?.progress ?? 0}
            onPress={() => actions.go("game-hub", { gameId: game()?.id })}
            screen={props}
            onKeyDown={cardKeyDown(0)}
          />
          <ActivityCard
            id="home-card-1"
            width={scale(540)}
            height={scale(225)}
            radius={scale(16)}
            title={() => "Trofeos"}
            description={() => ""}
            image={() => imageAvailable(mockAssets.trophies) ? mockAssets.trophies : game()?.titleScreen}
            accent={() => game()?.accent ?? ps5Colors.panel}
            trophyCounts={trophyCounts}
            onPress={() => actions.go("profile", { gameId: game()?.id })}
            screen={props}
            onKeyDown={cardKeyDown(1)}
          />
          <ActivityCard
            id="home-card-2"
            width={scale(540)}
            height={scale(225)}
            radius={scale(16)}
            title={() => "Noticias oficiales"}
            description={() => "Un nuevo horizonte te espera"}
            image={() => imageAvailable(mockAssets.news) ? mockAssets.news : game()?.hero}
            accent={() => game()?.accent ?? ps5Colors.panel}
            onPress={() => actions.go("gallery", { gameId: game()?.id })}
            screen={props}
            onKeyDown={cardKeyDown(2)}
          />
        </Box>

        <Box width={viewport.width()} height={scale(148)} floating="parent" floatOffset={{ x: 0, y: scale(932) }} backgroundColor={ps5Colors.scrim} zIndex={3} />
      </Box>
    </Box>
  )
}
