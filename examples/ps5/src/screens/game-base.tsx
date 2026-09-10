import {
  Box,
  For,
  Show,
  createEffect,
  createSignal,
} from "vexart"

import type { Ps5ScreenProps } from "../types"
import { Ps5Button, Ps5Panel, Ps5Text as Text, ps5Colors, ps5Scale, usePs5Back, usePs5Viewport } from "../ui"

type GameBaseTab = "friends" | "parties" | "messages"

/** Local Game Base. It never calls network, microphone, or voice APIs. */
export function GameBaseScreen(props: Ps5ScreenProps) {
  const viewport = usePs5Viewport()
  const scale = (value: number) => ps5Scale(viewport, value)
  const state = props.state
  const actions = props.actions
  const [draft, setDraft] = createSignal("")
  const [selectedThreadId, setSelectedThreadId] = createSignal<string>()
  const [selectedFriendId, setSelectedFriendId] = createSignal<string>()
  const [selectedPartyId, setSelectedPartyId] = createSignal<string>()
  let focusedEntry = false

  const threads = () => state().gameBase.threads
  const parties = () => state().gameBase.parties
  const selectedThread = () => threads().find((thread) => thread.id === selectedThreadId())
  const selectedFriend = () => state().users.find((user) => user.id === selectedFriendId())
  const selectedParty = () => parties().find((party) => party.id === selectedPartyId())
  const tab = () => state().gameBase.tab

  usePs5Back(() => {
    if (selectedFriendId()) {
      setSelectedFriendId(undefined)
      return true
    }
    if (selectedPartyId()) {
      setSelectedPartyId(undefined)
      return true
    }
    return false
  })

  createEffect(() => {
    const current = state()
    if (current.screen !== "game-base") return
    const thread = selectedThread() ?? threads()[0]
    if (thread && !selectedThreadId()) setSelectedThreadId(thread.id)
    if (focusedEntry) return
    focusedEntry = true
    actions.setFocus(current.focusMemory["game-base"] ?? `gamebase-tab-${tab()}`)
    props.onReady?.()
  })

  const chooseTab = (next: GameBaseTab) => {
    actions.dispatch({ type: "gamebase/tab", tab: next })
    if (next === "messages") {
      const thread = selectedThread() ?? threads()[0]
      if (thread) {
        setSelectedThreadId(thread.id)
        actions.setFocus(`gamebase-thread-${thread.id}`)
        return
      }
    }
    actions.setFocus(`gamebase-tab-${next}`)
  }

  const createParty = () => {
    const id = `local-party-${parties().length + 1}`
    actions.dispatch({ type: "gamebase/party", party: { id, memberIds: state().users.map((user) => user.id), title: `Grupo local ${parties().length + 1}` } })
    actions.dispatch({ type: "gamebase/tab", tab: "parties" })
    actions.setFocus(`gamebase-party-${id}`)
  }

  const sendMessage = () => {
    const threadId = selectedThreadId() ?? "local-thread-main"
    const body = draft().trim()
    if (!body) return
    actions.dispatch({ type: "gamebase/message", threadId, body })
    setDraft("")
    actions.setFocus("gamebase-message-send")
  }

  const handleComposerKey = (event: { key: string; char: string }) => {
    if (event.key === "backspace") {
      setDraft(draft().slice(0, -1))
      return
    }
    if (event.char && event.char.length === 1) setDraft(`${draft()}${event.char}`)
  }

  const openGame = () => {
    const id = state().selectedGameId
    if (id) actions.go("game-hub", { gameId: id })
  }
  const moveTab = (delta: -1 | 1) => {
    const tabs: GameBaseTab[] = ["friends", "parties", "messages"]
    const current = tabs.indexOf(tab())
    const next = Math.max(0, Math.min(tabs.length - 1, current + delta))
    const nextTab = tabs[next]
    if (nextTab) chooseTab(nextTab)
  }
  const moveThread = (index: number, delta: -1 | 1) => {
    const list = threads()
    const next = Math.max(0, Math.min(list.length - 1, index + delta))
    const thread = list[next]
    if (!thread) return
    setSelectedThreadId(thread.id)
    actions.setFocus(`gamebase-thread-${thread.id}`)
  }
  const startConversation = () => {
    setSelectedThreadId(selectedThreadId() ?? "local-thread-main")
    actions.dispatch({ type: "gamebase/tab", tab: "messages" })
    actions.setFocus("gamebase-message-input")
  }
  const clearMessages = () => {
    const id = selectedThreadId()
    actions.dispatch({ type: "gamebase/messages-clear", ...(id ? { threadId: id } : {}) })
    actions.setFocus("gamebase-message-input")
  }

  return (
    <Box width={viewport.width()} height={viewport.height()} backgroundColor={ps5Colors.background} alignX="center" alignY="center" viewportClip>
      <Ps5Panel width={scale(1080)} height={scale(760)} padding={scale(26)} gap={scale(14)} direction="column" backgroundColor={ps5Colors.panel} borderColor="#ffffff38" borderWidth={1} cornerRadius={scale(20)}>
        <Box direction="row" alignX="space-between" alignY="center">
          <Box direction="column" gap={scale(4)}>
            <Text color={ps5Colors.text} fontSize={scale(28)} fontWeight={700}>Game Base</Text>
            <Text color={ps5Colors.mutedText} fontSize={scale(14)}>Amigos y conversaciones locales</Text>
          </Box>
          <Text color={ps5Colors.mutedText} fontSize={scale(13)}>Red: {state().settings.network}</Text>
        </Box>
        <Box direction="row" gap={scale(10)}>
          <Ps5Button id="gamebase-tab-friends" width="33%" height={scale(46)} label="Amigos" backgroundColor={tab() === "friends" ? "#3a424d" : undefined} onPress={() => chooseTab("friends")} onKeyDown={(event) => { if (event.key === "left") moveTab(-1); if (event.key === "right") moveTab(1) }} screen={props} />
          <Ps5Button id="gamebase-tab-parties" width="33%" height={scale(46)} label="Grupos" backgroundColor={tab() === "parties" ? "#3a424d" : undefined} onPress={() => chooseTab("parties")} onKeyDown={(event) => { if (event.key === "left") moveTab(-1); if (event.key === "right") moveTab(1) }} screen={props} />
          <Ps5Button id="gamebase-tab-messages" width="33%" height={scale(46)} label="Mensajes" backgroundColor={tab() === "messages" ? "#3a424d" : undefined} onPress={() => chooseTab("messages")} onKeyDown={(event) => { if (event.key === "left") moveTab(-1); if (event.key === "right") moveTab(1) }} screen={props} />
        </Box>

        <Show when={tab() === "friends"} fallback={
          <Show when={tab() === "parties"} fallback={
            <Box width="100%" direction="row" gap={scale(14)} flexGrow={1}>
              <Ps5Panel width={scale(370)} height="100%" padding={scale(12)} gap={scale(8)} direction="column" backgroundColor="#11161dcc" borderColor="#ffffff1c" cornerRadius={scale(12)}>
                <Text color={ps5Colors.text} fontSize={scale(17)} fontWeight={700}>Conversaciones</Text>
                <Ps5Button id="gamebase-new-message" width="100%" height={scale(46)} label="Nueva conversación" onPress={startConversation} screen={props} />
                <Show when={threads().length > 0} fallback={<Text color={ps5Colors.mutedText} fontSize={scale(14)}>No hay conversaciones locales.</Text>}>
                  <For each={threads()}>{(thread, index) => (
                    <Ps5Button id={`gamebase-thread-${thread.id}`} width="100%" height={scale(48)} alignX="left" label={`Conversación ${thread.participantIds.length} personas`} backgroundColor={selectedThreadId() === thread.id ? "#343b46" : undefined} onPress={() => { setSelectedThreadId(thread.id); actions.setFocus(`gamebase-thread-${thread.id}`) }} onKeyDown={(event) => { if (event.key === "up") moveThread(index(), -1); if (event.key === "down") moveThread(index(), 1) }} screen={props} />
                  )}</For>
                </Show>
              </Ps5Panel>
              <Ps5Panel width="grow" height="100%" padding={scale(12)} gap={scale(10)} direction="column" backgroundColor="#11161dcc" borderColor="#ffffff1c" cornerRadius={scale(12)}>
                <Box direction="column" gap={scale(6)} flexGrow={1} scrollY viewportClip>
                  <Show when={selectedThread()} fallback={<Text color={ps5Colors.mutedText} fontSize={scale(14)}>Nueva conversación local.</Text>}>
                    <For each={selectedThread()!.messages}>{(message) => <Text color={ps5Colors.text} fontSize={scale(14)}>{message.body}</Text>}</For>
                  </Show>
                </Box>
                <Ps5Button id="gamebase-message-input" width="100%" height={scale(48)} alignX="left" label={draft() || "Escribe un mensaje local…"} onPress={sendMessage} onKeyDown={handleComposerKey} screen={props} />
                <Ps5Button id="gamebase-message-send" width="100%" height={scale(46)} label="Enviar mensaje" disabled={!draft().trim()} onPress={sendMessage} screen={props} />
                <Ps5Button id="gamebase-messages-clear" width="100%" height={scale(42)} label="Limpiar conversación" disabled={!selectedThread()} onPress={clearMessages} screen={props} />
              </Ps5Panel>
            </Box>
          }>
            <Box width="100%" direction="row" gap={scale(14)} flexGrow={1}>
              <Ps5Panel width="100%" height="100%" padding={scale(16)} gap={scale(10)} direction="column" backgroundColor="#11161dcc" borderColor="#ffffff1c" cornerRadius={scale(12)}>
                <Text color={ps5Colors.text} fontSize={scale(18)} fontWeight={700}>Grupos locales</Text>
                <Ps5Button id="gamebase-create-party" width={scale(250)} height={scale(46)} label="Crear grupo local" onPress={createParty} screen={props} />
                <Show when={parties().length > 0} fallback={<Text color={ps5Colors.mutedText} fontSize={scale(14)}>No hay grupos creados.</Text>}>
                  <For each={parties()}>{(party) => <Ps5Button id={`gamebase-party-${party.id}`} width="100%" height={scale(48)} alignX="left" label={`${party.title} · ${party.memberIds.length} miembros`} backgroundColor={selectedPartyId() === party.id ? "#343b46" : undefined} onPress={() => { setSelectedPartyId(party.id); actions.setFocus(`gamebase-party-${party.id}`) }} screen={props} />}</For>
                </Show>
                <Show when={selectedParty()}>
                  <Ps5Panel width="100%" padding={scale(12)} gap={scale(6)} direction="column" backgroundColor="#151a20cc" borderColor="#ffffff1c" cornerRadius={scale(10)}>
                    <Text color={ps5Colors.text} fontSize={scale(15)}>{selectedParty()!.title}</Text>
                    <Text color={ps5Colors.mutedText} fontSize={scale(13)}>{selectedParty()!.memberIds.length} miembros locales</Text>
                    <Ps5Button id="gamebase-party-leave" width="100%" height={scale(42)} label="Abandonar grupo" onPress={() => { actions.dispatch({ type: "gamebase/party-leave", partyId: selectedParty()!.id }); setSelectedPartyId(undefined) }} screen={props} />
                  </Ps5Panel>
                </Show>
              </Ps5Panel>
            </Box>
          </Show>
        }>
          <Box width="100%" direction="row" gap={scale(14)} flexGrow={1}>
            <Ps5Panel width="100%" height="100%" padding={scale(12)} gap={scale(8)} direction="column" backgroundColor="#11161dcc" borderColor="#ffffff1c" cornerRadius={scale(12)}>
              <Text color={ps5Colors.text} fontSize={scale(17)} fontWeight={700}>Amigos locales</Text>
              <For each={state().users}>{(user) => <Ps5Button id={`gamebase-friend-${user.id}`} width="100%" height={scale(52)} alignX="left" label={`${user.name} ${user.handle}`} backgroundColor={selectedFriendId() === user.id ? "#343b46" : undefined} onPress={() => { setSelectedFriendId(user.id); actions.setFocus(`gamebase-friend-${user.id}`) }} screen={props} />}</For>
              <Show when={selectedFriend()} fallback={<Text color={ps5Colors.mutedText} fontSize={scale(13)}>Selecciona un amigo para ver su perfil local.</Text>}>
                <Ps5Panel width="100%" padding={scale(12)} gap={scale(6)} direction="column" backgroundColor="#151a20cc" borderColor="#ffffff1c" cornerRadius={scale(10)}>
                  <Text color={ps5Colors.text} fontSize={scale(15)}>{selectedFriend()!.name}</Text>
                  <Text color={ps5Colors.mutedText} fontSize={scale(13)}>{selectedFriend()!.handle}</Text>
                  <Ps5Button id="gamebase-friend-profile" width="100%" height={scale(42)} label="Abrir perfil local" onPress={() => { actions.dispatch({ type: "user/select", userId: selectedFriend()!.id }); actions.go("profile") }} screen={props} />
                </Ps5Panel>
              </Show>
              <Text color={ps5Colors.mutedText} fontSize={scale(13)}>Las invitaciones y presencia son simuladas.</Text>
            </Ps5Panel>
          </Box>
        </Show>

        <Box direction="row" gap={scale(10)}>
          <Ps5Button id="gamebase-open-game" width="50%" height={scale(46)} label="Abrir juego" disabled={!state().selectedGameId} onPress={openGame} screen={props} />
          <Box width="50%" height={scale(46)} alignX="center" alignY="center"><Text color={ps5Colors.mutedText} fontSize={scale(13)}>Chat de voz no disponible</Text></Box>
        </Box>
        <Ps5Button id="gamebase-back" width="100%" height={scale(46)} label="Volver" onPress={actions.back} screen={props} />
      </Ps5Panel>
    </Box>
  )
}
