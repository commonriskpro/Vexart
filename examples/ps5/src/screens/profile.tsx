import { existsSync } from "node:fs"
import {
  Box,
  For,
  Show,
  createEffect,
  createSignal,
} from "vexart"

import type { Ps5ScreenProps, Trophy } from "../types"
import { Ps5Avatar, Ps5Button, Ps5Panel, Ps5Text as Text, ps5Colors, ps5Scale, usePs5Back, usePs5Viewport } from "../ui"

function imageAvailable(path?: string) {
  return !!path && existsSync(path)
}

function trophyLabel(type: Trophy["type"]) {
  if (type === "platinum") return "Platino"
  if (type === "gold") return "Oro"
  if (type === "silver") return "Plata"
  return "Bronce"
}

/** Local profile and trophy view owned by the Control Center flow. */
export function ProfileScreen(props: Ps5ScreenProps) {
  const viewport = usePs5Viewport()
  const scale = (value: number) => ps5Scale(viewport, value)
  const state = props.state
  const actions = props.actions
  const [trophyFilter, setTrophyFilter] = createSignal<"all" | "earned" | "pending">("all")
  const [trophySort, setTrophySort] = createSignal<"catalog" | "type" | "earned">("catalog")
  let focusedEntry = false

  const user = () => state().users.find((entry) => entry.id === state().activeUserId) ?? state().users[0]
  const game = () => state().catalog.find((entry) => entry.id === state().selectedGameId)
  const trophies = () => game()?.trophies ?? []
  const visibleTrophies = () => {
    const filtered = trophies().filter((entry) => trophyFilter() === "all" || (trophyFilter() === "earned" ? entry.earned : !entry.earned))
    if (trophySort() === "catalog") return filtered
    const typeOrder: Record<Trophy["type"], number> = { platinum: 0, gold: 1, silver: 2, bronze: 3 }
    return [...filtered].sort((left, right) => trophySort() === "type" ? typeOrder[left.type] - typeOrder[right.type] : Number(right.earned) - Number(left.earned))
  }
  const selectedTrophy = () => trophies().find((entry) => entry.name === state().profile.selectedTrophy)

  usePs5Back(() => {
    if (!selectedTrophy()) return false
    actions.dispatch({ type: "profile/trophy" })
    actions.setFocus(`profile-trophy-${visibleTrophies()[0]?.name ?? "empty"}`)
    return true
  })

  createEffect(() => {
    const current = state()
    if (current.screen !== "profile" || focusedEntry) return
    focusedEntry = true
    const fallback = current.profile.tab === "trophies" ? `profile-trophy-${visibleTrophies()[0]?.name ?? "empty"}` : "profile-tab-overview"
    actions.setFocus(current.focusMemory.profile ?? fallback)
    props.onReady?.()
  })

  const changeTab = (tab: "overview" | "trophies") => {
    actions.dispatch({ type: "profile/tab", tab })
    actions.setFocus(tab === "overview" ? "profile-tab-overview" : `profile-trophy-${visibleTrophies()[0]?.name ?? "empty"}`)
  }

  const selectTrophy = (trophy: Trophy) => {
    actions.dispatch({ type: "profile/trophy", id: trophy.name })
    actions.setFocus(`profile-trophy-${trophy.name}`)
  }

  const openGame = () => {
    const id = state().selectedGameId
    if (id) actions.go("game-hub", { gameId: id })
  }

  return (
    <Box width={viewport.width()} height={viewport.height()} backgroundColor={game()?.accent ?? ps5Colors.background} viewportClip>
      <Show when={game() && imageAvailable(game()!.hero)}>
        <Box width={viewport.width()} height={viewport.height()} floating="parent" zIndex={0}>
          <img src={game()!.hero} width={viewport.width()} height={viewport.height()} objectFit="cover" opacity={0.42} />
        </Box>
      </Show>
      <Box width={viewport.width()} height={viewport.height()} backgroundColor="#05070bcc" floating="parent" zIndex={1} alignX="center" alignY="center">
        <Ps5Panel width={scale(720)} padding={scale(28)} gap={scale(16)} direction="column" backgroundColor="#090c11ed" borderColor="#ffffff38" borderWidth={1} cornerRadius={scale(20)}>
          <Box direction="row" gap={scale(16)} alignY="center">
            <Ps5Avatar src={user()?.avatar} name={user()?.name ?? "Perfil"} accent={user()?.accent} size={scale(76)} />
            <Box direction="column" gap={scale(4)}>
              <Text color={ps5Colors.text} fontSize={scale(26)} fontWeight={700}>{user()?.name ?? "Perfil"}</Text>
              <Text color={ps5Colors.mutedText} fontSize={scale(14)}>{user()?.handle ?? "@guest"}</Text>
              <Text color={ps5Colors.mutedText} fontSize={scale(12)}>Juego actual: {game()?.title ?? "Ninguno"}</Text>
            </Box>
          </Box>

          <Box direction="row" gap={scale(10)}>
            <Ps5Button id="profile-tab-overview" width="50%" height={scale(46)} label="Resumen" backgroundColor={state().profile.tab === "overview" ? "#3a424d" : undefined} onPress={() => changeTab("overview")} onKeyDown={(event) => { if (event.key === "right") changeTab("trophies") }} screen={props} />
            <Ps5Button id="profile-tab-trophies" width="50%" height={scale(46)} label="Trofeos" backgroundColor={state().profile.tab === "trophies" ? "#3a424d" : undefined} onPress={() => changeTab("trophies")} onKeyDown={(event) => { if (event.key === "left") changeTab("overview") }} screen={props} />
          </Box>

          <Show when={state().profile.tab === "overview"} fallback={
            <Box direction="column" gap={scale(10)}>
              <Text color={ps5Colors.text} fontSize={scale(18)} fontWeight={700}>Trofeos · {game()?.title ?? "juego actual"}</Text>
              <Box direction="row" gap={scale(8)}>
                <Ps5Button id="profile-trophy-filter" width="50%" height={scale(42)} label={`Filtro: ${trophyFilter() === "all" ? "Todos" : trophyFilter() === "earned" ? "Conseguidos" : "Pendientes"}`} onPress={() => { setTrophyFilter(trophyFilter() === "all" ? "earned" : trophyFilter() === "earned" ? "pending" : "all"); actions.setFocus("profile-trophy-filter") }} screen={props} />
                <Ps5Button id="profile-trophy-sort" width="50%" height={scale(42)} label={`Orden: ${trophySort() === "catalog" ? "Catálogo" : trophySort() === "type" ? "Tipo" : "Estado"}`} onPress={() => { setTrophySort(trophySort() === "catalog" ? "type" : trophySort() === "type" ? "earned" : "catalog"); actions.setFocus("profile-trophy-sort") }} screen={props} />
              </Box>
              <Show when={visibleTrophies().length > 0} fallback={<Text color={ps5Colors.mutedText} fontSize={scale(15)}>No hay trofeos para este filtro.</Text>}>
                <Box direction="column" gap={scale(7)} scrollY viewportClip>
                  <For each={visibleTrophies()}>{(trophy) => (
                    <Ps5Button id={`profile-trophy-${trophy.name}`} width="100%" height={scale(45)} alignX="left" label={`${trophy.earned ? "✓" : "○"} ${trophyLabel(trophy.type)} · ${trophy.name}`} onPress={() => selectTrophy(trophy)} screen={props} />
                  )}</For>
                </Box>
                <Show when={selectedTrophy()}>
                  <Ps5Panel width="100%" padding={scale(12)} gap={scale(5)} direction="column" backgroundColor="#151a20cc" borderColor="#ffffff1c" cornerRadius={scale(10)}>
                    <Text color={ps5Colors.text} fontSize={scale(14)} fontWeight={700}>{selectedTrophy()!.name}</Text>
                    <Text color={ps5Colors.mutedText} fontSize={scale(13)}>{selectedTrophy()!.earned ? "Conseguido" : "Pendiente"} · {trophyLabel(selectedTrophy()!.type)}</Text>
                  </Ps5Panel>
                </Show>
              </Show>
              <Ps5Button id="profile-open-game" width="100%" height={scale(45)} label="Abrir juego" disabled={!game()} onPress={openGame} screen={props} />
            </Box>
          }>
            <Box direction="column" gap={scale(12)}>
              <Text color={ps5Colors.text} fontSize={scale(18)} fontWeight={700}>Resumen del perfil</Text>
              <Text color={ps5Colors.mutedText} fontSize={scale(14)}>Trofeos conseguidos: {trophies().filter((entry) => entry.earned).length} / {trophies().length}</Text>
              <Text color={ps5Colors.mutedText} fontSize={scale(14)}>Sesión: {state().gameSession.phase}</Text>
              <Show when={game()}>
                <Ps5Button id="profile-open-game" width="100%" height={scale(46)} label={`Abrir ${game()!.title}`} onPress={openGame} screen={props} />
              </Show>
            </Box>
          </Show>

          <Box direction="row" gap={scale(10)}>
            <Ps5Button id="profile-change-user" width="50%" height={scale(46)} label="Cambiar usuario" onPress={() => actions.go("boot-users")} screen={props} />
            <Ps5Button id="profile-back" width="50%" height={scale(46)} label="Volver" onPress={actions.back} screen={props} />
          </Box>
          <Show when={state().users.length > 1}>
            <Box direction="row" gap={scale(8)} scrollX viewportClip>
              <For each={state().users}>{(entry) => (
                <Ps5Button id={`profile-user-${entry.id}`} width={scale(145)} height={scale(46)} label={entry.id === state().activeUserId ? `${entry.name} · activo` : entry.name} onPress={() => { actions.dispatch({ type: "user/select", userId: entry.id }); actions.go("profile") }} screen={props} />
              )}</For>
            </Box>
          </Show>
        </Ps5Panel>
      </Box>
    </Box>
  )
}
